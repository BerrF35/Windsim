# WindSim

WindSim is a browser-native aerodynamics project with two distinct surfaces:

- `sandbox.html`: the working reduced-order 3D wind sandbox
- `cfd.html`: the Phase A CFD laboratory shell for the future WebGPU solver stack

The launcher at `index.html` routes between them.

## Source Of Truth

The current CFD roadmap lives in [docs/CFD_MASTER_BLUEPRINT.md](./docs/CFD_MASTER_BLUEPRINT.md).

That blueprint is the active plan for the CFD side of the repo. The core rule is simple: the UI must not imply solved physics that the code does not actually compute.

## Current State

### Sandbox

The sandbox is the mature part of the project. It currently provides:

- reduced-order rigid-body aerodynamics with drag, lift, Magnus force, rotation, contact, and telemetry
- experiment workflows such as mounted mode, playback, sweeps, saved comparisons, and flow-probe slices
- a modular split across `js/windsim-app.js`, `js/windsim-physics.js`, `js/windsim-ui.js`, `js/windsim-scene.js`, `js/windsim-workflows.js`, `js/windsim-textures.js`, and `js/windsim-models.js`
- multiple solver registrations through `js/windsim-solvers.js`

### CFD Lab

The CFD surface is not a finished solver yet.

What is real today:

- WebGPU capability detection and hardware-tier routing
- a strict Phase A workflow shell for geometry, domain, boundary, and solver setup
- a Three.js viewport and domain visualization for the CFD surface
- a dedicated blueprint and project direction for the full solver stack

What is not real yet:

- a production LBM D3Q19 kernel running inside `cfd.html`
- validated drag, lift, pressure, or streamline outputs from the CFD surface
- full geometry import, voxelization, observability logging, and post-processing from the blueprint

## Experimental Solver Work

`js/windsim-cfd.js` contains an experimental 2D grid-based solver path for the sandbox side. It is transitional work, not the final CFD lab backend, and it does not yet replace the full reduced-order pipeline with a true coupled 3D solver.

## Repo Layout

- `index.html`
  Launcher that routes to the sandbox or the CFD lab.
- `sandbox.html`
  Working reduced-order simulator surface.
- `cfd.html`
  Phase A CFD shell.
- `css/windsim-entry.css`
  Entry and landing system styling for the sandbox experience.
- `css/cfd-entry.css`
  CFD lab styling.
- `js/windsim-*.js`
  Sandbox modules.
- `js/cfd-engine.js`
  CFD shell engine, hardware detection, viewport setup, and workflow gating.
- `js/windsim-cfd.js`
  Experimental sandbox-side grid solver work.
- `docs/CFD_MASTER_BLUEPRINT.md`
  Active CFD implementation blueprint.
- `docs/CHANGELOG.md`
  High-level change history.

## Honesty Rules

- The sandbox can use reduced-order and heuristic models, but it must label them honestly.
- The CFD lab must not show fake solved outputs.
- If a feature is not wired to real computation yet, it should stay locked, blank, or explicitly marked as shell-only.
