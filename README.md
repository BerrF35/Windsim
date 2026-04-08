# WindSim

See [PROJECT_MASTER_PLAN.md](./PROJECT_MASTER_PLAN.md) for the long-term execution plan and the non-negotiable truthfulness rules.

## What This Repo Is

WindSim is a browser-based 3D aerodynamic sandbox. The current build is a reduced-order simulator with live visualization, experiment controls, and telemetry. It is meant to make motion and airflow assumptions inspectable in real time.

It is not a CFD solver today.

## Current State

What is already working in the repo:

- modular browser app split across `index.html`, `windsim-data.js`, `windsim-physics.js`, `windsim-solvers.js`, `windsim-ui.js`, `windsim-workflows.js`, and `windsim-app.js`
- object library with object-specific dimensions, mass assumptions, aero tuning, and contact behavior
- configurable wind speed, heading, elevation, turbulence, gusts, altitude, chamber size, and launch state
- reduced-order rigid-body motion with drag, lift, Magnus force, rotation, ground contact, wall contact, and telemetry
- mounted wind-tunnel mode, playback scrubbing, saved sweeps, run comparison, and flow-probe slices
- CSV telemetry export and a small validation suite

What is still true about the codebase:

- `windsim-app.js` is still too large and owns too many responsibilities
- `windsim-solvers.js` currently wraps one real solver path, not multiple mature backends
- several models are heuristic or tuned for reduced-order behavior rather than derived from a solved flow field
- validation coverage is useful but still limited

## Repo Layout

- `index.html`
  Browser shell and script loading.
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
- `windsim-app.js`
  Main app bootstrap, rendering, scene updates, scene sync, and frame loop.

## What The Project Is Not Yet

- not a chamber-wide pressure solver
- not a two-way coupled CFD system
- not a multi-solver research platform yet
- not fully decomposed internally, even though the repo is modular at file level

## Development Direction

The current priority is to make the reduced-order baseline more honest and easier to maintain before adding more headline features. That means:

- reducing documentation overstatement
- removing dead legacy structure
- splitting `windsim-app.js` into cleaner ownership boundaries
- closing truthfulness gaps in labeling and deterministic behavior
- expanding validation before deeper solver work
