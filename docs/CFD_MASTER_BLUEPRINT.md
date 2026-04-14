# WindSim Platform — Master Architecture Blueprint

> **Goal**: Develop a robust, browser-native simulation platform with strictly validated physics modes. The product leverages local WebGPU compute layers to deliver zero-latency engineering analysis. Initial scope is constrained to single-phase, incompressible, uniform-grid isothermal flow.

---

## 1. Product Positioning & Scope

WindSim is not a research demo; it is a serious engineering platform. 
* **Honesty in Limitations:** The initial release (`v1.0`) is explicitly limited to single-phase, incompressible flows on uniform grids. We do not support multiphase, thermal coupling, or unstructured meshes yet.
* **Accuracy over Visuals:** The platform's success is defined by numerical accuracy, repeatability across sessions, and stability under abuse. If results drift, the build is suspect.

---

## 2. Platform Architecture & Solver Abstraction

Instead of hard-wiring the system to a single physics kernel, the platform relies on a strict **Solver Contract Interface**.

```text
landing.html
  ├── index.html        → Sandbox (Legacy/Stable)
  └── cfd.html          → CFD Platform (New)
        ├── cfd-ui.js         Strict sequence UI shell (State Machine)
        ├── cfd-contract.js   Abstract Solver Interface
        ├── cfd-engine.js     WebGPU init and multi-tier hardware routing
        ├── kernels/
        │   └── lbm_d3q19/    First numerical kernel implementation (WGSL)
        ├── cfd-geometry.js   Strict sanitization & CPU-first voxelization
        └── cfd-observability.js Runtime diagnostics, logging, and recovery
```

### The Standardized Solver Contract
To maintain architectural discipline, any underlying numerical method (LBM, FVM Navier-Stokes) must strictly implement this JS/TS interface shape:

```javascript
interface ISolverKernel {
  // 1. Initialization
  init(domainSize: Vector3, resolution: Vector3, config: SolverConfig): void;
  // 2. Boundary conditions
  setBoundaryConditions(bcArray: BoundaryCondition[]): void;
  // 3. Execution mapping
  step(numSubSteps: number): { status: string, iterations: number, computeTimeMs: number };
  // 4. Observability & Data export
  getDiagnostics(): { massConservation: number, maxVelocity: number, maxResidual: number };
  getFieldBuffers(): { mass: Float32Array, momentum: Float32Array, pressure: Float32Array };
  // 5. State recovery
  pause(): void;
  resume(): void;
  reset(): void;
}
```

---

## 3. Implementation Phases & Hard Release Gating

The build is structured into sequential phases. **No phase is complete until it passes validation, logs correctly, recovers correctly, and runs within memory/time limits without warnings.**

### Phase A — UI Shell & Three-Tier Hardware Control
**Goal**: Build the UI shell and enforce exact hardware routing thresholds.
* **Three-Tier Performance Fallbacks:**
  1. *Full Mode:* Triggers if `maxComputeInvocationsPerWorkgroup >= 256` and max storage buffer binding size >= 256MB.
  2. *Reduced-Resolution Mode:* Triggers if above WebGPU limits are unmet or frame budgets exceed 33ms (30fps). Caps resolution at a maximum of $64^3$ grid cells.
  3. *Static Demo Mode:* Triggers instantly if `navigator.gpu` is undefined, context fails, or the driver crashes during init. Prevents blank screens.
* **Strict UI Workflow (State Machine):** Unlocking controls out-of-order is blocked by design. The interface forces a linear user journey: 
  `Import Geometry` → `Define Domain` (Unlock BCs) → `Apply BCs` (Unlock Solver) → `Set Solver Properties` (Unlock Run) → `Run` → `Inspect/Export`.

### Phase B — Geometry Handling & Voxelization
**Goal**: Robust mesh ingestion and sanitization rules.
* **Acceptance Rules:** The pipeline throws warnings for non-manifold edges, open boundaries, or suspect normals. It **strictly rejects** meshes with zero volume or missing indices.
* **CPU Reference Voxelization:** The mesh-to-grid mapping *must* be solved using a perfectly accurate CPU-based reference method first. GPU voxelization is permitted only as an optimization later, and its output must binary-match the CPU reference mask. Correctness precedes speed.

### Phase C — Solver Core, Observability & Recovery
**Goal**: Implement the LBM D3Q19 kernel enveloped in strict state controls.
* **Observability Schema:** Every run generates a local JSON log trace containing: `Timestamp`, `Run ID`, `Solver Configuration`, `Hardware Meta`, `Iteration Timings`, and `Residual History`.
* **State & Recovery Rules:** 
  - *Pause/Restart:* Engine stops, state is perfectly retained.
  - *Reload:* If the user refreshes, the Run ID and the last exported JSON log stay persistent.
  - *Divergence Safety:* If mass conservation drift exceeds 5% or residuals explode to NaN, the engine **halts automatically**. The UI flashes a divergence error, forward stepping is locked, but the corrupted field state and trace log are preserved for debugging. The user is never allowed to continue running garbage data.

### Phase D — Post-Processing Visualization
**Goal**: Render validated field data.
* Deliverables: Surface pressure maps, streamline advection, cut-plane slicing. Slices, surfaces, and forces must numerically match the underlying solver `FieldBuffers` perfectly.

---

## 4. Numerical Validation Pack

Results must be stable across devices and sessions. Every solver kernel update must be continuously validated against this fixed baseline pack automatically. **Rule: If a test fails this tolerance, the build fails.**

| Benchmark Case | Grid / Run Metric | Target Output Metric | Acceptable Error Band |
|---|---|---|---|
| **Channel Flow (Poiseuille)** | 128x32x32 <br> Max 5,000 steps | Velocity Profile across cross-section vs. analytical parabola. | **< 1.0%** deviation |
| **Lid-Driven Cavity** | 128x128x128 <br> Max 15,000 steps | Central primary vortex coordinates (X, Y). | **< 0.5%** coordinate drift from Ghia et al. reference |
| **Sphere Drag ($C_d$)** | $Re = 100$ <br> 128x64x64 grid | Force-integrated Drag Coefficient ($C_d$). | **± 5.0%** vs. established literature |
| **Mesh-Free Symmetry** | No mesh, centered inlet <br> Max 1,000 steps | Density & Velocity field symmetry map across origin planes (XY, XZ, YZ). | **0.0%** deviation (binary exact match) |
