# WindSim Dual-Mode Architecture & True CFD Blueprint

This document outlines the architectural strategy to transform WindSim from a purely dynamic physics sandbox into a dual-mode platform. This ensures we do not destroy the work built so far, but instead offer a dedicated "Professional CFD Lab" that mimics the capabilities, mathematics, and exact workflow of industry giants like SimScale.

## Phase 1: The Entryway Bifurcation

Currently, navigating to `index.html` throws the user directly into the active wind tunnel with a selected object. 

To achieve the SimScale workflow, we must split the App State at load time. We will introduce a cinematic landing page with two distinct paths. Data layers will be strictly separated so `windsim-physics.js` does not bleed into the static CFD mode.

### Mode A: The Aerodynamic Sandbox (Current System)
**Concept**: "The Bouncy Thing"
* **Focus**: Real-time trajectory, rigid-body mechanics, Magnus effect spinning, ground bounce coefficients.
* **Physics Engine**: `windsim-physics.js` (Euler semi-implicit integration).
* **Solvers**: Parametric reduced-order math, 2D Grid Eulerian CPU slice.
* **Target Audience**: Educational demonstrations, trajectory trajectory estimation.

### Mode B: Professional CFD CAE Lab (New System)
**Concept**: "SimScale Replica"
* **Focus**: Static Computer-Aided Engineering (CAE), pressure fields, dense streamlines, aerodynamic stress.
* **Physics Engine**: None. The object is permanently bolted to the grid. 
* **Solvers**: LBM (Lattice Boltzmann Method) running on WebGPU.
* **Target Audience**: Aerospace/Automotive conceptual testing.

---

## Phase 2: The WebGPU CFD Laboratory (The Mathematics)

SimScale relies on 64+ core cloud servers running OpenFOAM or Pacefish® (LBM). To bring this raw power into a browser without external paywalls, **we must move the computation entirely to the local graphics card (GPU) using WebGPU WGSL Compute Shaders.**

### The Mathematics: Lattice Boltzmann Method (LBM D3Q19)
We will abandon standard Navier-Stokes for a 3D LBM approach. LBM solves the Boltzmann equation for particle distribution, which intrinsically resolves to Navier-Stokes macroscopic flow but is vastly parallelizable across GPU shaders.

1. **The Grid (D3Q19)**: We will use a 3D cubic lattice where every cell tracks 19 discrete velocity distribution probabilities ($f_0$ through $f_{18}$).
2. **The Algorithm**: Every frame, the WebGPU Compute Shader executes:
   * **Collision (BGK Operator)**: Relaxes particle distributions toward local equilibrium.
   * **Streaming**: Particles "hop" to adjacent lattice cells based on their directional vector.
   * **Bounce-Back Boundary**: If a particle hits a solid CAD voxel, its vector is inverted to enforce the no-slip condition on the surface.

### WGSL Compute Shader Implementation (The BGK Operator)

To achieve true performance, our GPU memory buffer must use a **Structure of Arrays (SoA)** to ensure memory-coalesced rapid read/write. Here is the literal mathematical blueprint for the shader we will inject into Three.js:

```wgsl
// Shared WGSL constants for the D3Q19 Model
const Q: u32 = 19u;
const TAU: f32 = 0.6; // Fluid Relaxation time
const OMEGA: f32 = 1.0 / TAU;

// Lattice weights (w_i) required to calculate equilibrium state
const w = array<f32, 19>(
    1.0/3.0,
    1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0,
    1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
    1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0
);

// Lattice directional vectors (c_i)
const cx = array<i32, 19>(0, 1,-1, 0, 0, 0, 0, 1, 1,-1,-1, 1, 1,-1,-1, 0, 0, 0, 0);
const cy = array<i32, 19>(0, 0, 0, 1,-1, 0, 0, 1,-1, 1,-1, 0, 0, 0, 0, 1, 1,-1,-1);
const cz = array<i32, 19>(0, 0, 0, 0, 0, 1,-1, 0, 0, 0, 0, 1,-1, 1,-1, 1,-1, 1,-1);

// GPU Buffer Bindings
@group(0) @binding(0) var<storage, read> f_in : array<f32>; // Pre-collision PDFs
@group(0) @binding(1) var<storage, read_write> f_out : array<f32>; // Post-collision PDFs

@compute @workgroup_size(8, 8, 8) // Dispatch 3D chunks to the GPU
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let dims = vec3<u32>(128u, 128u, 128u); // Our massive local wind tunnel grid
    if (any(gid >= dims)) { return; }

    let index = (gid.z * dims.y * dims.x + gid.y * dims.x + gid.x) * Q;

    // STEP 1: Compute Macroscopic Density (rho) and Velocity (u)
    var rho: f32 = 0.0;
    var ux: f32 = 0.0; var uy: f32 = 0.0; var uz: f32 = 0.0;

    for (var i: u32 = 0u; i < Q; i++) {
        let f = f_in[index + i];
        rho += f;
        ux += f * f32(cx[i]);
        uy += f * f32(cy[i]);
        uz += f * f32(cz[i]);
    }
    ux /= rho; uy /= rho; uz /= rho;

    // STEP 2: Collision Operator (BGK: f_post = f + omega * (f_eq - f))
    let u_sq = ux*ux + uy*uy + uz*uz;
    for (var i: u32 = 0u; i < Q; i++) {
        let cu = f32(cx[i])*ux + f32(cy[i])*uy + f32(cz[i])*uz;
        
        // Mathematical Equilibrium distribution function for D3Q19
        let f_eq = w[i] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u_sq);
        
        // Execute Relaxation
        f_out[index + i] = f_in[index + i] - OMEGA * (f_in[index + i] - f_eq);
    }
}
```

### The GPU Ping-Pong Architecture
JavaScript cannot orchestrate `f_out` feedback to `f_in` at 60 FPS without crashing the browser. Therefore:
* **The API**: We transition the Three.js pipeline to `THREE.WebGPURenderer`.
* **Ping-Ponging**: Because cell $N$ needs data from cell $N-1$, we allocate two identical massive `GPUBuffer` objects (`Buffer_A`, `Buffer_B`). The compute shader reads from A and writes to B in Frame 1, and swaps roles in Frame 2 seamlessly.

### Front-End Workflow Emulation (The Pre/Post Processor)
To mimic the SimScale UX:

1. **Upload & Mesh Selection**: The user selects or drops a `.glb` mesh. We run a GPU Voxelization shader to convert the continuous 3D mesh into boolean cell blockages within the LBM grid.
2. **Boundary Conditions**: The user inputs global velocity (Inlet). This is injected mathematically at the `-Z` edge of the GPU Buffer.
3. **Execution**: The user clicks "Run Solver". We dispatch `pass.compute()` on the WebGPU pipeline. 

---

## Phase 3: Post-Processing & Visualization

SimScale’s most impressive features are its visualizations. Since the exact pressure and velocity fields are already sitting inside the GPU's memory from the LBM step, visualizing them is extremely fast.

* **Surface Pressure Mapping**: A custom mesh material that reads the local macroscopic density ($\rho$) from the LBM grid and maps it to a blue-to-red color gradient overlaid directly onto the `.glb` model.
* **Wind Streamlines**: We will bypass CPU particle arrays entirely. We will inject millions of vertices inside a WebGPU Compute Shader. These vertices will read their local velocity from the LBM grid and march forward to draw stunning, real-time streamline trails.
* **Slice Cut-Planes**: Utilizing standard WebGL discarding, users can drag a UI slider to push a 2D plane through the 3D domain, coloring pixels by vorticity or velocity magnitude on that specific plane.

---

## Execution Checklist for Production

- `[ ]` **Refactor Core**: Move all UI binding logic inside `windsim-app.js` to support unmounting and remounting based on the active Mode selection.
- `[ ]` **Entryway UI**: Build the HTML/CSS splash screen separating the Sandbox and CFD Lab routes.
- `[ ]` **WebGPU Initialization**: Upgrade the ThreeJS instantiation to detect `navigator.gpu`. Fall back to WebGL 2.0 2D slices if WebGPU is unsupported.
- `[ ]` **LBM WGSL Shaders**: Write the D3Q19 collision, streaming, and macroscopic density/velocity calculation compute shaders.
- `[ ]` **CAD Voxelizer**: Implement a ray-casting or raster-based method to map an imported `.glb` into solid obstacles inside the LBM GPU buffer.
- `[ ]` **Telemetry Extraction**: Write a GPU readback function (running once a second, to avoid stalling the pipeline) to pull the total Drag and Lift surface forces down to Javascript to list on the UI graph.
