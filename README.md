# WindSim

WindSim is a browser-native aerodynamics project with two distinct surfaces:

- `sandbox.html`: the working reduced-order 3D wind sandbox
- `cfd.html`: the Phase D CFD laboratory workbench with a deterministic LBM solver stack and post-processing visualization

The launcher at `index.html` routes between them.

## Current State

### Sandbox

The sandbox is the mature part of the project. It currently provides:

- reduced-order rigid-body aerodynamics with drag, lift, Magnus force, rotation, contact, and telemetry
- experiment workflows such as mounted mode, playback, sweeps, saved comparisons, and flow-probe slices
- a modular split across `js/windsim-app.js`, `js/windsim-physics.js`, `js/windsim-ui.js`, `js/windsim-scene.js`, `js/windsim-workflows.js`, `js/windsim-textures.js`, and `js/windsim-models.js`
- multiple solver registrations through `js/windsim-solvers.js`

### CFD Lab

The CFD surface is currently in Phase D (Post-Processing & Visualization).

What is real today:

- WebGPU capability detection and hardware-tier routing
- A complete workflow guiding you through geometry, domain, boundary, solver setup, execution, and inspection
- A Three.js viewport rendering domain boundary, voxelized mesh geometry, slices, and streamlines
- A deterministic D3Q19 Lattice Boltzmann Method (LBM) solver core running on the CPU
- Drag, lift, and side force calculations with dynamic calibration and capability advising
- Session persistence (state saving and recovery) via IndexedDB
- Live post-processing visualization (pressure/velocity slice maps, streamline seeding, color mapping)

What is not real yet:

- Full WebGPU-based solver computing layer (currently using CPU reference kernel; WebGPU is used for visualization only)

## Experimental Solver Work

`js/windsim-cfd.js` contains an experimental 2D grid-based solver path for the sandbox side. It is transitional work, not the final CFD lab backend, and it does not yet replace the full reduced-order pipeline with a true coupled 3D solver.

## Repo Layout

- `index.html`
  Launcher that routes to the sandbox or the CFD lab.
- `sandbox.html`
  Working reduced-order simulator surface.
- `cfd.html`
  Phase D CFD workbench.
- `css/windsim-entry.css`
  Entry and landing system styling for the sandbox experience.
- `css/cfd-entry.css`
  CFD lab styling.
- `js/windsim-*.js`
  Sandbox modules.
- `js/cfd-*.js`
  CFD workbench modules (geometry, coefficients, solver, observability, post-processing, regime, and engine).
- `js/windsim-cfd.js`
  Experimental sandbox-side grid solver work.
- `docs/CHANGELOG.md`
  High-level change history.
