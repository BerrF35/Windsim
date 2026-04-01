# WindSim Project Master Plan

This document is the permanent execution contract for WindSim. It is the source of truth for what the project is, what it is not, how work will be sequenced, and what quality bar must be met before features are treated as real.

If the product vision changes, this file must be updated. If implementation diverges from this file, the divergence must be called out explicitly and corrected.

## 1. Mission

WindSim is being developed toward two connected outcomes:

1. A high-quality browser-based aerodynamic sandbox with immediate feedback and strong visual legibility.
2. A browser-based aerodynamic lab that can support more serious flow analysis, controlled experiments, and eventually a research-grade flow solver.

The current application is an advanced reduced-order aerodynamic simulator. It is not yet a CFD platform. The engineering plan is to evolve it in stages without misrepresenting approximations as solved fluid behavior.

## 2. Non-Negotiable Rules

These rules apply to every future change.

1. No fake physics may be presented as real solved physics.
   Approximate models are allowed, but they must be labeled and implemented honestly.

2. Every metric must have a known source.
   If a value is derived from a reduced-order model, coefficient curve, heuristic, interpolation, or empirical approximation, that must be clear in code and documentation.

3. The fast sandbox and the research path must remain distinct.
   High-framerate visual features must not be mislabeled as engineering-grade analysis.

4. Working features are assets, not disposable clutter.
   Existing controls, telemetry, scenarios, validation tools, visual overlays, and object behavior must be preserved unless intentionally replaced by something demonstrably better.

5. Verification is mandatory.
   Every meaningful change must include:
   - syntax or build verification
   - runtime verification where possible
   - regression checks against known scenarios
   - explicit note of anything not verified

6. Performance cannot be ignored.
   New accuracy work must be introduced behind architecture boundaries that let the app remain usable in browser conditions.

7. Labels must remain truthful.
   The UI must distinguish between estimated, reduced-order, measured-from-solver, and derived values.

## 3. Current Baseline

The present WindSim build already contains a substantial foundation:

- Modular browser architecture split across `index.html`, `windsim-data.js`, `windsim-physics.js`, `windsim-ui.js`, and `windsim-app.js`
- Real-time 3D rendering with Three.js
- Multiple object archetypes with object-specific mass, dimensions, drag behavior, texture treatment, and inertia assumptions
- Shape-aware projected area and aerodynamic behavior for spheres, discs, box-like objects, flat bodies, shuttlecock-style objects, umbrella-like objects, and ellipsoidal forms
- Quaternion orientation, angular velocity state, torque accumulation, and rotational dynamics
- Altitude-dependent density handling
- Multiple wind field modes including uniform, shear, vortex, gust front, tunnel, and wake
- Turbulence and gust controls
- Floor, wall, and ceiling collision handling
- Object-specific ground behavior and bounce / slide / roll responses
- Force arrows, force labels, graph overlays, ruler and height markers, particles, trails, impact markers, and HUD telemetry
- Presets, scenario save/load/export/import, and validation case support
- Resizable workspace panels and HUD regions

This baseline must be protected while the deeper solver and analytics work is built.

## 4. Target End State

The intended end state is a dual-mode platform:

### Sandbox Mode

- Immediate interaction
- Stable high framerate
- Reduced-order aerodynamic simulation
- Strong visual readability
- Fast iteration for intuition, teaching, and scenario testing

### Research Lab Mode

- Explicit experiment setup
- Repeatable and inspectable outputs
- Advanced analytics and field visualization
- Stationary wind-tunnel style testing
- Slower but more faithful flow computation
- Clear distinction between approximate and solver-driven outputs

The final system must allow these modes to share the same scene, object library, telemetry framework, and visualization layer where appropriate, while using different solver pipelines where necessary.

## 5. Execution Strategy

This project will be built brick by brick in ordered phases. No phase is considered complete until its acceptance criteria are met.

### Phase 0: Governance, Baseline Protection, and Regression Discipline

Purpose:
Create the engineering guardrails needed for a long build.

Deliverables:
- Master plan document
- Updated repo documentation
- Regression checklist for core scenarios
- Definition of feature classes: sandbox, reduced-order analysis, solver-backed analysis
- Change log discipline for future milestones

Acceptance criteria:
- There is a written source of truth for architecture and scope.
- Known working scenarios can be rerun after changes.
- The project stops relying on informal memory.

### Phase 1: Stabilize the Existing Reduced-Order Engine

Purpose:
Turn the current system into a reliable reduced-order simulator instead of an evolving prototype.

Deliverables:
- Audit of current force pipeline and telemetry naming
- Explicit separation of aerodynamic coefficients, force assembly, and integration steps
- Clear designation of which outputs are direct model outputs versus derived values
- Stronger validation suite using known expected behavior for selected objects
- Improved replayability of saved scenarios

Acceptance criteria:
- Existing sandbox behavior remains intact or improves measurably.
- Validation cases are reproducible.
- No placeholder values remain in active telemetry or UI.

### Phase 2: Solver Abstraction Layer

Purpose:
Prevent the future CFD path from becoming tangled into the existing sandbox loop.

Deliverables:
- A solver interface that supports at minimum:
  - body state update
  - field sampling
  - force and torque output
  - auxiliary field output for visualization
- Existing physics moved behind `SandboxSolver`
- Shared state contracts for telemetry, graphing, playback, and rendering

Acceptance criteria:
- The current app can run through the solver interface with no visible regression.
- UI and renderer do not hard-code one solver implementation.

### Phase 3: Research Workflow Foundations

Purpose:
Add serious experiment control before full CFD work begins.

Deliverables:
- Stationary mount / wind-tunnel mode
- Controlled parameter sweeps
- Run recording, timeline scrubbing, pause, replay, and frame-step inspection
- Comparison mode between runs
- More complete plot set for `Cd`, `Cl`, `Cm`, AoA, energies, and force components

Acceptance criteria:
- A user can run repeatable experiments instead of only free-flight launches.
- Plots and recorded runs are synchronized to simulation time.

### Phase 4: Geometry and Material Pipeline

Purpose:
Move from a fixed object catalog toward arbitrary test articles.

Deliverables:
- Mesh import support for at least `OBJ`, `STL`, and `GLTF`
- Mesh normalization and bounds extraction
- Volume, reference area, and characteristic length extraction
- Mass-property pipeline with center of mass and inertia tensor estimation
- Surface roughness and material property editing

Acceptance criteria:
- Imported models can be loaded consistently.
- Mass properties are computed or approximated through a defined method, not hand-waved.
- The UI exposes material and geometry properties clearly.

### Phase 5: Reduced-Order Flow Field Visualization

Purpose:
Improve visibility of the air behavior before committing to full CFD.

Deliverables:
- Local vector probes
- Slice-based quiver plots
- Streamline seeding and tracing from a sampled field
- Wake deficit visualization for reduced-order solvers
- Pressure-proxy and velocity-proxy visualizations with honest labeling

Acceptance criteria:
- Users can inspect not just object motion but also modeled airflow structure.
- All field visuals are tagged as reduced-order where applicable.

### Phase 6: Coupled Field Prototype

Purpose:
Cross the boundary from pure parametric forcing into explicit flow computation.

Deliverables:
- Coarse 3D grid or lattice representation of the chamber
- Prototype flow solver, likely low-resolution and bounded in scope
- Two-way coupling between object and local flow field
- Preliminary wake, recirculation, and pressure-region behavior
- Separate solver outputs from derived visual effects

Acceptance criteria:
- The object affects the flow field and the changed field affects the object.
- The result is demonstrably different from the current static-wind forcing model.

### Phase 7: Research Lab Mode UI

Purpose:
Expose the deeper solver and analytics without damaging usability.

Deliverables:
- Distinct Sandbox and Research Lab modes
- Research-focused panel organization
- Field inspection tools
- Multi-run comparison workspace
- Explicit solver status, resolution, and confidence/readiness indicators

Acceptance criteria:
- Users can tell which mode they are in.
- Solver-backed outputs are visibly separated from sandbox outputs.

### Phase 8: GPU / Compute Upgrade

Purpose:
Make the field solver viable in a browser.

Deliverables:
- WebGPU compute path for the field solver
- Worker/off-thread scheduling where feasible
- Optional WebAssembly support for geometry preprocessing and heavy CPU-side math
- Resolution and quality presets

Acceptance criteria:
- Heavier flow calculations no longer block the UI loop.
- Performance scales in a controlled way across devices.

### Phase 9: Research-Grade Analysis Expansion

Purpose:
Reach the advanced capability set described in the target vision.

Deliverables:
- Pressure heatmaps
- Vorticity visualization
- More mature boundary-condition handling
- Better atmospheric controls including temperature, pressure, and humidity
- Physically structured turbulence models
- Better experiment export formats and reporting

Acceptance criteria:
- Advanced analytics are solver-driven where labeled as such.
- The app can support serious analysis workflows without pretending to be a laboratory instrument when it is not.

### Phase 10: Hardening, Documentation, and Release Readiness

Purpose:
Make the platform durable and understandable.

Deliverables:
- Architecture documentation
- Solver documentation
- Verification notes
- Known limitation registry
- Release checklist

Acceptance criteria:
- A technically literate user can understand what each subsystem does, what it approximates, and what remains limited.

## 6. Permanent Workstreams

These workstreams run across all phases.

### A. Verification and Validation

- Maintain a growing set of scenario checks.
- Compare new solver outputs against expected trends and invariants.
- Add reference cases where practical.
- Reject features that look impressive but cannot be explained or verified.

### B. Documentation and Traceability

- Update this plan when milestones change.
- Keep README aligned with the actual architecture.
- Document new formulas, coefficients, and assumptions where they are introduced.

### C. UI Truthfulness

- Distinguish estimated, reduced-order, and solver-derived outputs.
- Avoid visual flourishes that imply precision the math does not support.

### D. Backward Compatibility

- Keep the existing sandbox useful while deeper work is in progress.
- Preserve scenarios and telemetry paths where possible.

## 7. Technical Principles

1. Data definitions belong in the data layer.
2. State update logic belongs in the solver / physics layer.
3. UI code must not invent physical values.
4. Rendering code may visualize state but must not silently become a second physics system.
5. Any future CFD path must be isolated enough that it can fail, degrade, or run at lower resolution without breaking the rest of the app.

## 8. Risk Register

The largest risks are:

- Trying to jump to full CFD too early and stalling the project
- Polluting the current sandbox loop with half-finished solver logic
- Showing estimated visuals as if they were solved data
- Breaking existing interaction quality while chasing accuracy
- Underestimating browser performance limits

Mitigation:

- Build in explicit phases
- Preserve solver boundaries
- Label approximations honestly
- Verify before claiming realism gains

## 9. Definition of Done for Future Features

A feature is only done when:

- it is implemented cleanly
- it is wired into the existing architecture intentionally
- it does not silently break previous features
- it is verified
- its limitations are known
- its UI labeling is truthful

## 10. Immediate Next Steps

The next implementation sequence is:

1. Lock this plan into the repo.
2. Align repo documentation with the actual modular architecture.
3. Build a regression and validation discipline around the current reduced-order simulator.
4. Extract and formalize the solver boundary.
5. Begin the research workflow features before full CFD work.

## 11. Living Status Ledger

Current status:

- Phase 0: in progress
- Active focus: baseline protection, regression discipline, and reduced-order audit
- Current product classification: advanced reduced-order aerodynamic sandbox
- Research-grade CFD status: not yet implemented
- Completed in current phase:
  - persistent master plan added
  - README aligned with the modular repo architecture
  - local tool artifacts cleaned from the workspace
  - baseline regression checklist added
  - reduced-order physics audit added
  - explicit sandbox solver registry and app-bound solver contract added
  - mounted wind-tunnel test mode added to the sandbox solver path
  - recorded playback timeline with scrubbing and frame stepping added
  - mounted sweep experiment panel added for repeatable reduced-order comparisons
- Next milestone:
  - extend experiment tooling into comparison workflows and more structured result management before moving toward field-visualization work

When work advances, this section must be updated with:

- completed phase items
- current active phase
- known blockers
- next milestone
