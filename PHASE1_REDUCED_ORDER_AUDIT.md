# Phase 1 Reduced-Order Physics Audit

This document captures the current state of the WindSim physics / telemetry pipeline before deeper architectural work begins.

It exists to answer one question clearly:

What is the current simulator actually doing today?

## 1. Current Solver Character

WindSim currently runs a reduced-order rigid-body aerodynamic solver.

What it does:

- samples an analytic wind field at the body position
- computes relative wind
- derives aerodynamic coefficients from object type, orientation, and Reynolds number
- assembles drag, lift, Magnus, gravity, and selected contact effects
- integrates translational and rotational state forward in time
- records telemetry and reduced validation metrics

What it does not do:

- solve a chamber-wide pressure field
- solve Navier-Stokes on a grid
- perform two-way object / fluid coupling
- compute true wakes, vortices, or boundary layers from a field solver

## 2. Current Execution Chain

The present reduced-order loop in `windsim-physics.js` is structurally coherent:

1. `makeConfigFromPreset(...)`
   Builds simulation config from a preset or scenario payload.

2. `resolveObjectDef(...)`
   Produces the active object definition, including scale-sensitive box-like variants.

3. `createBody(...)`
   Creates body state, including pose, velocity, spin, metrics, force buckets, and torque buckets.

4. `sampleWindAt(...)`
   Returns a local analytic wind vector using the configured field mode:
   - `uniform`
   - `shear`
   - `vortex`
   - `gustfront`
   - `tunnel`
   - `wake`

5. `aerodynamicCoefficients(...)`
   Converts orientation, Reynolds number, and object aero model into coefficient values.

6. `aerodynamicStep(...)`
   Assembles forces and torques, advances linear and angular state, then applies wall and ground contact.

7. `recordTelemetry(...)`
   Captures physics outputs, dimensions, density, coefficients, spin, and energy terms.

8. `updateValidation(...)`
   Evaluates reduced validation cases against expected ranges.

9. `step(...)`
   Runs the solver with substeps, trail updates, telemetry recording, and validation updates.

## 3. Current Strengths

The current baseline is stronger than a toy project in several ways:

- object-specific inertia assumptions already exist
- orientation-aware projected area is already in the force path
- Reynolds-aware coefficient logic is already present
- center-of-pressure style aero torque offsets already exist
- Magnus force is already modeled for relevant objects
- ground behavior is object and surface aware
- floor, wall, and ceiling collisions are already implemented
- altitude changes already affect density
- telemetry values are sourced from active simulation state rather than placeholder UI numbers
- validation cases already exist for multiple representative objects

## 4. Current Numerical Behavior

The present integrator behavior is:

- simulation time scaled by `simRate`
- fixed substepping using `D.SUB`
- velocity update before position update

This means the current translational integrator is effectively semi-implicit Euler with fixed substeps, not RK4.

That is acceptable for the current reduced-order baseline as long as it is labeled honestly and kept numerically stable.

## 5. Current Data Truthfulness

The current telemetry path is mostly sound:

- the physics layer owns metric generation
- the UI reads metric values rather than inventing them
- the graph reads force history populated by the physics layer
- current export includes dimensions and energy values from active state

This is a good baseline to preserve.

## 6. Concrete Gaps Already Visible

These are specific implementation gaps visible in the current codebase.

### A. Reserved but not yet meaningful side-force channel

The body schema includes `forces.side` and `metrics.side`, and the net-force assembly includes that channel.

Current state:
- the channel is initialized
- it is reset each aero step
- it is included in totals
- it is never actually populated with a modeled side force

Interpretation:
- this is a reserved pathway, not a completed feature

Required action:
- either implement a real side-force model where appropriate or keep the channel explicitly documented as unused in the current baseline

### B. Reserved wall-force / wall-torque channels

The body schema includes `forces.wall` and `torques.wall`, and net assembly includes them.

Current state:
- `torques.wall` is reset every aero step
- `forces.wall` is carried in the state shape
- wall contact currently mutates velocity directly in `applyWallContact(...)`
- there is no developed wall-force model in the active reduced-order loop

Interpretation:
- chamber contact is impulse-like and state-mutating today, not expressed as a physically modeled continuous wall force

Required action:
- keep this explicit in documentation
- decide later whether wall interactions stay impulse-based or move into a more formal contact model

### C. Field visualization is analytic, not solver-driven

Particles and field-response visuals read from `sampleWindAt(...)`, which is an analytic local field function, not a solved fluid grid.

Required action:
- continue labeling these as reduced-order flow cues
- do not present them as CFD streamlines or solved vector fields

### D. Validation coverage is narrow

The current validation suite focuses on:

- golf drag crisis behavior
- frisbee glide
- shuttlecock stability
- brick settling

That is a useful start, but it does not yet cover:

- chamber collision regressions
- resizable box/brick geometry regressions
- scenario import/export regressions
- UI / physics synchronization regressions

### E. Solver boundary is not yet formalized

Right now the app architecture is modular, but the solver itself is still a concrete implementation directly consumed by the app.

Required action:
- extract a formal solver contract before starting any CFD-path implementation

### F. Legacy inline archive still exists in `index.html`

The modular app is now the active path, but `index.html` still contains a large disabled inline JavaScript archive from the pre-modular build.

Interpretation:
- it is not active runtime logic
- it is still repo noise and a maintenance trap

Required action:
- remove the legacy inline archive after a final dependency check confirms nothing still references it

### G. Repeatability is only partially closed

The app already exposes a simulation seed and the reduced-order wind field uses seeded analytic functions.

Current state:
- scenarios and presets already carry `seed`
- wind field turbulence / gust structure is seeded in `windsim-physics.js`
- some renderer-side visuals still use `Math.random()` directly, especially particles
- saved sweep IDs also still use `Math.random()`

Interpretation:
- deterministic research workflow is partly implemented, but full repeatability is not yet guaranteed across all layers

Required action:
- audit remaining random paths
- move visual randomness that affects interpretation onto deterministic seeded streams where appropriate
- keep purely cosmetic nondeterminism clearly separate if it remains

### H. Boundary-layer realism is still simplified

The app already has a `shear` wind mode, but that is not the same as a near-ground logarithmic wind profile / no-slip style boundary-layer model.

Required action:
- treat logarithmic wind profile as a separate realism feature, not as already solved by the current shear mode

### I. Research comparison UX is still mostly single-viewport

The app now supports sweep comparison and saved run comparison, but there is no active dual-sim split-screen view yet.

Required action:
- keep dual-sim / side-by-side comparison as a dedicated future workflow item rather than assuming current sweep tools fully cover it

### J. Workspace resizing exists, detachment does not

Panels and strips are resizable today, but they are not yet freely draggable or detachable into separate windows.

Required action:
- distinguish completed resize behavior from future draggable / detachable lab-workspace behavior

## 7. Immediate Engineering Priorities

The next physics-facing priorities should be:

1. preserve and extend validation coverage
2. formalize solver outputs and ownership boundaries
3. label reduced-order outputs explicitly where needed
4. prepare the app for dual solver modes without breaking the current sandbox

## 8. Phase 1 Deliverables Derived From This Audit

The first implementation tasks should be:

1. add regression discipline around the current preset and validation set
2. add solver metadata / classification so outputs can be labeled honestly
3. define a `SandboxSolver` boundary from the existing physics implementation
4. decide the intended fate of reserved `side` and `wall` channels
5. expand validation beyond the current four object-specific checks
6. remove the legacy inline archive from `index.html`
7. close the remaining repeatability gaps
8. strengthen reduced-order labeling for particles and probe-style field views

## 9. Bottom Line

The current WindSim solver is not fake, but it is reduced-order.

That is an acceptable starting point as long as:

- it is described honestly
- its metrics remain traceable
- its limitations are not hidden
- future CFD work is added through architecture, not through visual tricks
