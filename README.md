# WindSim

See [PROJECT_MASTER_PLAN.md](./PROJECT_MASTER_PLAN.md) for the long-term execution plan and the non-negotiable truthfulness rules.

## What This Repo Is

WindSim is a browser-based 3D aerodynamic sandbox. The current build is a reduced-order simulator with live visualization, experiment controls, and telemetry. It is meant to make motion and airflow assumptions inspectable in real time.

It is not a CFD solver today.

## Current State

What is already working in the repo:

- **NEW**: 2D Maker-and-Cell (MAC) Eulerian Grid CPU solver seamlessly replacing ambient wind when activated
- **NEW**: Full `THREE.GLTFLoader` importing for external meshes like `.glb` bounding-box autoscaling
- **NEW**: PBR lighting models rendered with `THREE.RGBELoader` running Studio HDR environment maps
- modular browser app split across `index.html`, `windsim-entry.css`, `windsim-entry.js`, `windsim-data.js`, `windsim-physics.js`, `windsim-solvers.js`, `windsim-cfd.js`, `windsim-ui.js`, `windsim-workflows.js`, `windsim-textures.js`, `windsim-models.js`, `windsim-scene.js`, and `windsim-app.js`
- object library with object-specific dimensions, mass assumptions, aero tuning, and contact behavior
- configurable wind speed, heading, elevation, turbulence, gusts, altitude, chamber size, and launch state
- reduced-order rigid-body motion with drag, lift, Magnus force, rotation, ground contact, wall contact, and telemetry
- mounted wind-tunnel mode, playback scrubbing, saved sweeps, run comparison, and flow-probe slices
- cinematic first-load landing flow with mode routing, recent-run restore, saved entry preferences, and seamless handoff into the live simulator
- CSV telemetry export and a small validation suite

What is still true about the codebase:

- The 2D CFD grid solver provides high-end fluid slices but operates only horizontally. Full 3D Navier-Stokes projection is currently bottlenecked by Javascript single-thread CPU limits.
- several models are heuristic or tuned for reduced-order behavior rather than derived from a solved flow field
- validation coverage is useful but still limited

## Repo Layout

- `index.html`
  Browser shell, import map, simulator mount points, and script loading.
- `windsim-entry.css`
  Landing / entry visual system, transition styling, and responsive entry layout.
- `windsim-entry.js`
  React-based landing flow, motion system, mode routing, persisted entry preferences, and simulator handoff.
- `windsim-data.js`
  Static definitions: objects, surfaces, presets, validation cases, solver metadata.
- `windsim-physics.js`
  Reduced-order physics, wind sampling, contact handling, telemetry generation.
- `windsim-solvers.js`
  Solver registry and solver-facing app contract.
- `windsim-ui.js`
  DOM controls, panels, graph drawing, layout resizing, and UI synchronization.
- `windsim-workflows.js`
  Playback capture, timeline scrubbing, mounted sweep workflows, and saved experiment comparison.
- `windsim-textures.js`
  Canvas-based texture generation for surfaces and objects, color utilities, and seeded RNG.
- `windsim-models.js`
  3D object visual construction, shape-to-mesh mapping, and material profiles.
- `windsim-scene.js`
  Rendering infrastructure, camera, lighting, particles, force arrows, trails, flow probes, and per-frame scene sync.
- `windsim-app.js`
  App bootstrap, scenario orchestration, input handling, and frame loop.

## What The Project Is Not Yet

- not a chamber-wide pressure solver
- not a two-way coupled CFD system
- not a multi-solver research platform yet

## Development Direction

Phase 1 (stabilize the reduced-order baseline) is complete. The current priority is solidifying the solver abstraction layer (Phase 2) and expanding research workflows (Phase 3). That means:

- formalising the solver interface so a second backend can plug in
- extending the plot set (Cl, Cm as separate channels)
- continuing to harden validation and truthfulness labeling

The new entry flow is part of that same direction: it improves first-load UX and routing without pretending the simulator underneath is more complete than it is.
