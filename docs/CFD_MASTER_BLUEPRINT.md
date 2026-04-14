# WindSim CFD Laboratory — Master Blueprint

> **Goal**: Build an open, browser-native CFD laboratory inspired by SimScale's capabilities — but free, local, and without paywalls. The physics solver runs entirely on the user's GPU via WebGPU compute shaders using the Lattice Boltzmann Method (LBM D3Q19).

---

## Status

| Item | State |
|---|---|
| Aerodynamic Sandbox | ✅ Complete — live at `index.html` |
| Landing page (dual-mode router) | ✅ Complete — `landing.html` |
| CFD Lab UI shell | 🔲 Not started |
| WebGPU LBM solver | 🔲 Not started |
| Mesh import + voxelization | 🔲 Not started |
| Post-processing visualization | 🔲 Not started |

---

## Architecture Overview

```
landing.html
  ├── index.html        → Aerodynamic Sandbox (existing)
  └── cfd.html          → CFD Laboratory (new)
        ├── cfd-ui.js         UI shell, panels, controls
        ├── cfd-engine.js     WebGPU init, pipeline, ping-pong
        ├── cfd-lbm.wgsl      D3Q19 collision + streaming kernel
        ├── cfd-voxelizer.js  Mesh → solid mask conversion
        ├── cfd-postproc.js   Pressure maps, streamlines, slices
        └── cfd-entry.css     Lab-specific styles
```

The CFD Lab is a **completely separate page** from the sandbox. They share nothing except the landing page router and visual branding. This prevents any risk of breaking the sandbox.

---

## Phase A — Lab UI Shell & WebGPU Boot

**Goal**: Create the CFD Lab page with a professional SimScale-style interface and verify WebGPU is available.

### Deliverables

1. **`cfd.html`** — standalone page with Three.js viewport, sidebar panels, and top toolbar
2. **`cfd-entry.css`** — dark aerospace theme matching the sandbox aesthetic
3. **`cfd-engine.js`** — WebGPU adapter/device initialization with graceful fallback messaging
4. **UI layout** (SimScale-inspired):
   - Left sidebar: project tree, mesh list, boundary conditions, solver settings
   - Center: 3D viewport (Three.js WebGPURenderer)
   - Bottom: status bar with solver iteration count, residuals, timing
   - Right: results panel (forces, coefficients, field statistics)
5. **Built-in mesh library**: sphere, cube, cylinder, airfoil (NACA 0012), Ahmed body (simplified)
   - Generated procedurally via Three.js geometry, no file upload needed yet
6. **WebGPU capability detection** with clear user feedback if unsupported

### Acceptance

- Page loads and renders the 3D viewport with a default object
- Sidebar panels are functional (expand/collapse, sliders, dropdowns)
- WebGPU device obtained or graceful error shown
- Landing page links to this page

---

## Phase B — LBM D3Q19 Solver on WebGPU

**Goal**: Implement the core fluid solver as a WebGPU compute shader.

### The Math

The Lattice Boltzmann Method solves the Boltzmann transport equation on a discrete lattice. For 3D incompressible flow, the D3Q19 model uses 19 velocity directions per cell.

#### Grid sizing

| Resolution | Cells | Floats (×19) | Buffer Size | Notes |
|---|---|---|---|---|
| 64³ | 262,144 | 4,980,736 | ~19 MB | Fast preview |
| 128×64×64 | 524,288 | 9,961,472 | ~40 MB | Default |
| 128³ | 2,097,152 | 39,845,888 | ~159 MB | High fidelity |

#### Kernel outline (WGSL)

```wgsl
struct LBMConfig {
    dims: vec3<u32>,
    pad0: u32,
    tau: f32,
    omega: f32,      // 1/tau
    inlet_ux: f32,
    inlet_uy: f32,
};

@group(0) @binding(0) var<uniform> config: LBMConfig;
@group(0) @binding(1) var<storage, read> f_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> f_out: array<f32>;
@group(0) @binding(3) var<storage, read> solid: array<u32>;
@group(0) @binding(4) var<storage, read_write> macro: array<f32>; // rho, ux, uy, uz per cell

const Q: u32 = 19u;

// D3Q19 directions and weights (compiled into the shader)

@compute @workgroup_size(8, 8, 4)
fn collide_stream(@builtin(global_invocation_id) gid: vec3<u32>) {
    // 1. Bounds check
    // 2. Pull streaming: read f from neighbor cells
    // 3. Solid bounce-back: if solid, reflect populations
    // 4. Compute macroscopic rho, ux, uy, uz
    // 5. Zou-He velocity inlet at x=0 boundary
    // 6. BGK collision: f_out = f - omega * (f - f_eq)
    // 7. Write macroscopic quantities to macro buffer
}
```

### Deliverables

1. **`cfd-lbm.wgsl`** — complete D3Q19 collision+streaming kernel
2. **`cfd-engine.js`** — pipeline setup, buffer allocation, ping-pong dispatch
3. **Boundary conditions**:
   - Zou-He velocity inlet (left face)
   - Extrapolation outlet (right face)
   - Bounce-back on solid cells and domain walls
4. **Uniform buffer** for runtime parameters (τ, inlet velocity, grid dims)
5. **Macroscopic readback** — pull ρ, u from GPU once per ~10 frames for UI display
6. **Iteration counter** with configurable steps-per-frame

### Acceptance

- Empty domain (no solid): flow develops a uniform velocity field matching the inlet
- Parabolic Poiseuille profile develops in a channel (top+bottom walls solid)
- Conservation: total mass (Σρ) stays stable within 0.1% over 1000 iterations

---

## Phase C — Mesh Voxelization & Object Pipeline

**Goal**: Convert 3D meshes into a boolean solid mask for the LBM grid.

### Method

1. User selects a mesh (built-in library or `.glb`/`.stl` upload)
2. Three.js positions the mesh centered in the domain
3. **Slice-based voxelization**:
   - Orthographic camera renders the mesh slice-by-slice along one axis
   - Each slice is 1 voxel thick
   - White pixels = solid, black = fluid
   - Read pixels → write into `solid: array<u32>` GPU buffer
4. Alternative: **ray-casting voxelizer** in JS (more accurate for concave shapes)

### Deliverables

1. **`cfd-voxelizer.js`** — mesh-to-voxel pipeline
2. **Built-in mesh library** (procedural Three.js geometries):
   - Sphere, Cube, Cylinder, Airfoil (extruded NACA 0012), Simplified car body
3. **GLB/STL import** via `<input type="file">` + `GLTFLoader` / custom STL parser
4. **Mesh positioning controls**: translate, rotate, scale within the domain
5. **Voxel preview mode**: optional wireframe overlay showing the solid mask

### Acceptance

- Sphere voxelizes cleanly at 64³ and 128³
- Flow around a sphere shows expected wake deficit behind the object
- Imported `.glb` mesh voxelizes and produces a reasonable solid mask
- Cd for sphere at Re ~100 is approximately 1.0–1.2 (LBM validation)

---

## Phase D — Post-Processing Visualization

**Goal**: Render the solved flow fields directly from GPU buffers, SimScale-style.

### Deliverables

1. **Surface pressure mapping**
   - Fragment shader reads local ρ from macro buffer
   - Maps pressure (ρ - ρ₀) to a blue→white→red diverging colormap
   - Applied as a second material pass on the mesh surface

2. **Velocity magnitude heatmap**
   - Same technique but maps |u| to a viridis/jet/coolwarm colormap
   - Switchable between pressure and velocity modes

3. **Cut-plane slices**
   - User drags a slider to position a 2D plane through the 3D domain
   - Plane pixels read from the macro buffer and color by velocity/pressure/vorticity
   - Supports XY, XZ, YZ orientations

4. **Dense streamlines** (SimScale's signature feature)
   - Particle advection compute shader
   - Seeds particles at the inlet face
   - Each frame: read local velocity from macro buffer, advect position += u * dt
   - Render as GL_LINES or instanced cylinders with opacity trail decay
   - Target: 10,000+ simultaneous streamline particles

5. **Vorticity visualization**
   - Compute ω = ∇ × u from the macro buffer (central differences)
   - Render as colored volume slices or isosurfaces

6. **Force integration**
   - Sum momentum exchange at solid boundary cells
   - Extract drag force (Fx), lift force (Fy), side force (Fz)
   - Display Cd, Cl coefficients using reference area and inlet velocity
   - Update in real-time as solver iterates toward convergence

### Acceptance

- Pressure colormap on a sphere shows high-pressure stagnation point and low-pressure wake
- Streamlines flow around objects and show wake recirculation
- Cut-plane slider moves smoothly and shows velocity gradient
- Cd readout for a sphere at known Re matches literature within ±20%

---

## Phase E — Professional UX Polish

**Goal**: Bring the CFD Lab to a polished, SimScale-competitive experience.

### Deliverables

1. **Solver control panel**:
   - Start / Pause / Reset buttons
   - Iteration count, residual convergence plot
   - τ (viscosity), inlet velocity, grid resolution controls
   - Auto-stop when residuals converge below threshold

2. **Results dashboard**:
   - Force coefficients (Cd, Cl, Cs) with convergence history graph
   - Field statistics (max velocity, min/max pressure, mass conservation error)
   - Export: CSV of force history, screenshot of viewport

3. **Viewport controls**:
   - Orbit, pan, zoom (matching sandbox controls)
   - Visualization mode switcher: wireframe / solid / pressure / velocity / streamlines
   - Colormap legend with min/max range controls
   - Background: dark gradient matching the sandbox aesthetic

4. **Project workflow**:
   - Select geometry → Set boundary conditions → Run solver → Inspect results
   - Clear step indicators in the sidebar (like SimScale's project tree)

5. **Responsive layout** and dark theme consistency with the sandbox

### Acceptance

- A new user can go from opening the page to seeing flow around a sphere in under 30 seconds
- The interface feels professional and self-explanatory
- All controls work without console errors
- Performance: ≥30 FPS viewport rendering while solver runs in background

---

## Key Design Decisions

### Why LBM over Navier-Stokes (FVM/FDM)?

| Factor | LBM | Traditional NS |
|---|---|---|
| GPU parallelism | Embarrassingly parallel — each cell is independent | Complex sparse linear systems |
| Memory pattern | Regular grid, coalesced reads | Unstructured mesh, random access |
| Boundary handling | Simple bounce-back | Complex cell-face interpolation |
| Implementation complexity | ~200 lines of WGSL | Thousands of lines (FVM) |
| Accuracy for low Re | Excellent | Also excellent |
| Browser feasibility | ✅ Perfect for WebGPU | ❌ Impractical without WASM + manual solver |

### Why separate page, not mode-switch?

- Zero risk of breaking the sandbox
- Simpler state management (no shared globals)
- Each page can load only what it needs
- The landing page acts as the router

### WebGPU fallback strategy

If `navigator.gpu` is unavailable:
1. Show a clear message explaining WebGPU requirements
2. Link to browser compatibility info (Chrome 113+, Edge 113+, Firefox Nightly)
3. Offer a static demo mode with pre-computed results
4. Do NOT attempt a WebGL2 LBM fallback (too slow to be useful, would mislead users)

---

## SimScale Features We're Matching (Free)

| SimScale Feature | Our Implementation | Status |
|---|---|---|
| Cloud CFD solver | Local GPU LBM via WebGPU | Phase B |
| Mesh import (STEP, STL) | GLB/STL import + built-in library | Phase C |
| Surface pressure maps | Fragment shader from LBM buffer | Phase D |
| Dense streamlines | GPU particle advection | Phase D |
| Cut-plane visualization | Slice shader from macro buffer | Phase D |
| Force coefficients (Cd, Cl) | Momentum exchange integration | Phase D |
| Convergence monitoring | Residual tracking + auto-stop | Phase E |
| Parametric sweeps | Batch inlet velocity / angle runs | Future |
| Transient simulation | LBM is inherently transient | Phase B |
| k-ω SST turbulence | Smagorinsky SGS model (simpler but effective) | Phase B |

---

## What We're NOT Building (Scope Control)

- No cloud compute — everything runs locally on the user's GPU
- No multi-physics (no FEA, no thermal coupling in v1)
- No adaptive mesh refinement (uniform grid only)
- No rotating reference frames (no turbomachinery in v1)
- No multiphase flow in v1
- No AI/ML surrogate models in v1

These are explicitly deferred to keep the first release focused and shippable.
