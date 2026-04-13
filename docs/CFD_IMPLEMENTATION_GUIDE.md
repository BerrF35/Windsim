# OFF-SITE CFD ENGINEERING LIBRARY (FOR NEXT AI AGENT)

**ATTENTION NEXT AI AGENT:** 
You have been summoned to convert this repository into a professional 3D CFD simulator imitating "SimScale", operating entirely natively within the browser locally. The current repository contains a functioning real-time physics sandbox that tracks ballistic flying objects. **Do not destroy the sandbox.** Your task is to build a dual-mode router dividing the Sandbox from the **Professional CFD Lab**.

This entire computational leap hinges on moving from JavaScript CPU single-threading to **WebGPU Massively Parallel Compute Shaders** utilizing the **Lattice Boltzmann Method (LBM D3Q19)**. 

Proceed strictly according to this library. 

---

## VOLUME 1: THE ARCHITECTURAL BIFURCATION

Before writing CFD logic, intercept the user at load time. You will modify `index.html` and `windsim-app.js` to create an entryway.

### 1.1 Implementation Requirements for the Router
*   Create an overlay `div` with absolute positioning, z-index `9999`, spanning `100vw` and `100vh`.
*   Establish two cards:
    *   **Card A: Aerodynamic Sandbox.** Clicking this destroys the overlay and resumes the standard `app.start()` physics loop.
    *   **Card B: Professional CFD CAE.** Clicking this triggers `app.setSolver('cfd_webgpu')`. 
*   **Crucial State Changes for Mode B:**
    *   Halt the `P.integrate()` calls in `windsim-physics.js` immediately. The object must be bolted.
    *   Disable rotation (`omega`), ground bounce, and gravity.
    *   Strip the UI of "Launch Parameters" and replace the right-hand panel with "Solver Parameters" (Resolution, Iterations, Dynamic Viscosity).

---

## VOLUME 2: WEBGPU INFRASTRUCTURE SETUP

WebGPU requires specific asynchronous initialization. You cannot just use `THREE.WebGLRenderer`.

### 2.1 The Adapter and Device Boot Sequence
Add this block before bootstrapping the `THREE.Scene`:

```javascript
async function initWebGPU() {
    if (!navigator.gpu) {
        throw new Error("WebGPU is not supported on this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No appropriate GPU adapter found.");
    
    // Request limits allowing max buffer sizes for the CFD grid
    const device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
            maxComputeInvocationsPerWorkgroup: 256,
        }
    });
    return device;
}
```

---

## VOLUME 3: LATTICE BOLTZMANN MATHEMATICS (D3Q19)

We use the D3Q19 model: a 3D grid, each cell possessing 19 velocity populations. To optimize VRAM, use the **Structure of Arrays (SoA)** format.

### 3.1 VRAM Allocation Constants
If the chamber size is $X=128$, $Y=64$, $Z=64$.
Total Cells = $524,288$
Total Floats (19 directions) = $9,961,472$ Floats.
Total Buffer Size = $\sim 39.8$ Megabytes.
You must allocate two of these buffers (`bufferIn` and `bufferOut`) to handle the memory ping-ponging necessary for the LBM Streaming step.

### 3.2 Constants to push to the WGSL Uniform Buffer
```javascript
const lbmConstants = new Float32Array([
    128.0, 64.0, 64.0, 0.0,  // Grid Dimensions (x,y,z, padding)
    0.6, 1.0/0.6, 0.0, 0.0,  // Tau, Omega, padding, padding
    // Inject Lattice Weights (w)
    1.0/3.0, 
    1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0,
    1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
    1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0
]);
```

---

## VOLUME 4: THE MASTER WGSL CFD SHADERS

This is the exact compute shader that acts as the physics solver.

### 4.1 The Collision and Streaming Kernel (Merged Pull-Step)
For optimal performance, LBM "Pulls" stream data from neighbors and Collides it immediately in register memory.

```wgsl
struct Constants {
    dims: vec3<u32>,
    tau: f32,
    omega: f32,
};

@group(0) @binding(0) var<uniform> config: Constants;
@group(0) @binding(1) var<storage, read> f_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> f_out: array<f32>;
@group(0) @binding(3) var<storage, read> solid_mask: array<u32>; // Voxelized CAD mesh bounding mask

const Q: u32 = 19u;
// Directions: center, 6 faces, 12 edges
var<private> cx: array<i32, 19> = array<i32, 19>(0, 1,-1, 0, 0, 0, 0, 1, 1,-1,-1, 1, 1,-1,-1, 0, 0, 0, 0);
var<private> cy: array<i32, 19> = array<i32, 19>(0, 0, 0, 1,-1, 0, 0, 1,-1, 1,-1, 0, 0, 0, 0, 1, 1,-1,-1);
var<private> cz: array<i32, 19> = array<i32, 19>(0, 0, 0, 0, 0, 1,-1, 0, 0, 0, 0, 1,-1, 1,-1, 1,-1, 1,-1);
var<private> w: array<f32, 19> = array<f32, 19>(...); // Implement Vol 3.2 weights here
var<private> reverse_dir: array<u32, 19> = array<u32, 19>(0, 2, 1, 4, 3, 6, 5, 10, 11, 8, 9, 14, 15, 12, 13, 18, 19, 16, 17); // For bounce-back

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= config.dims.x || gid.y >= config.dims.y || gid.z >= config.dims.z) { return; }
    
    let index1D = gid.z * config.dims.y * config.dims.x + gid.y * config.dims.x + gid.x;
    
    // PULL STREAMING: Read from neighbors
    var f_local: array<f32, 19>;
    for (var i: u32 = 0u; i < Q; i++) {
        let nx = i32(gid.x) - cx[i];
        let ny = i32(gid.y) - cy[i];
        let nz = i32(gid.z) - cz[i];
        
        // Handle Map Boundaries (Inlet / Outlet)
        if (nx < 0 || ny < 0 || nz < 0 || nx >= i32(config.dims.x) || ny >= i32(config.dims.y) || nz >= i32(config.dims.z)) {
            // Apply Zou-He Velocity Inlet boundary condition here if nx < 0
            f_local[i] = w[i]; // Fallback dummy
            continue;
        }
        
        let neighbor_idx = u32(nz) * config.dims.y * config.dims.x + u32(ny) * config.dims.x + u32(nx);
        f_local[i] = f_in[neighbor_idx * Q + i];
    }
    
    // SOLID BOUNDARY BOUNCE-BACK CHECK
    if (solid_mask[index1D] == 1u) {
        for (var i: u32 = 0u; i < Q; i++) {
            let rev = reverse_dir[i];
            f_out[index1D * Q + rev] = f_local[i];
        }
        return; // Skip collision
    }
    
    // MACROSCOPIC MOMENTS
    var rho: f32 = 0.0;
    var ux: f32 = 0.0; var uy: f32 = 0.0; var uz: f32 = 0.0;
    for (var i: u32 = 0u; i < Q; i++) {
        rho += f_local[i];
        ux += f_local[i] * f32(cx[i]);
        uy += f_local[i] * f32(cy[i]);
        uz += f_local[i] * f32(cz[i]);
    }
    ux /= rho; uy /= rho; uz /= rho;
    let u_sq = ux*ux + uy*uy + uz*uz;
    
    // BGK COLLISION
    for (var i: u32 = 0u; i < Q; i++) {
        let cu = f32(cx[i])*ux + f32(cy[i])*uy + f32(cz[i])*uz;
        let feq = w[i] * rho * (1.0 + 3.0*cu + 4.5*cu*cu - 1.5*u_sq);
        f_out[index1D * Q + i] = f_local[i] - config.omega * (f_local[i] - feq);
    }
}
```

---

## VOLUME 5: CAD MESH VOXELIZATION (PRE-PROCESSING)

You cannot run fluid around a boundary surface (like `.glb` cars) unless the LBM grid knows it is there.
1. The user uploads `model.glb`.
2. Generate an orthographic camera in Three.js pointed down the Z-axis.
3. Slice the camera's near/far planes precisely 1 voxel thick.
4. Render the mesh with a flat white material over a black background into a `WebGLRenderTarget`.
5. Read the pixels (`readRenderTargetPixels`). If a pixel is white, it means the solid mesh occupies that space.
6. Push that binary data into the WebGPU `solid_mask: array<u32>` buffer binding required in the Volume 4 shader.

---

## VOLUME 6: POST-PROCESSING VISUALS

Do not extract the massive Grid data back to JavaScript every frame. It will stall the CPU. Instead, render visuals via WebGPU directly using the raw `f_out` buffer.

### 6.1 Pressure / Velocity Mapping
Inject a fragment shader onto the `.glb` mesh material.
Provide the WGSL `f_out` computational buffer to the fragment shader. 
Use the mesh's `worldPosition` to calculate its specific 3D floating-point location inside the LBM grid. 
Do a 3D trilinear interpolation lookup of `.rgb` derived from the velocity magnitude, mapping to a color ramp (0m/s = Blue, 40m/s = Yellow/Red).

### 6.2 Dense Streamlines
To achieve the SimScale effect of thousands of flow lines traversing the car:
1. Create a massive flat grid of `InstancedMesh` spheres or short cylinders near the Inlet boundary.
2. Build an Advection Compute Shader.
3. Bind the particle positions `array<vec3<f32>>` and the LBM `f_out` fluid buffer.
4. The advection WGSL shader reads the particle position, looks up the local vector $\vec{u}$ inside the fluid grid, and adds $\vec{u} \times dt$ to the position buffer.
5. Three.js naturally draws the instantly moved GPU particles. Apply a basic `trail` opacity decay.

---

## FINAL COMMANDMENTS
This framework entirely replaces our simple Javascript `.map` files in `windsim-cfd.js`. This is high-end, compiled VRAM parallel compute. You must configure the Ping-Pong WebGPU render pipeline immaculately. 
Remember to fall back to WebGL2 using 3D Textures / FBOs if the user's browser lacks `navigator.gpu`.
