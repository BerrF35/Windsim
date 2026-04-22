# WindSim Full-Scale Engineering Plan

## 0. Purpose

WindSim is a browser-native aerodynamics and simulation platform with two surfaces:

* **Sandbox**: reduced-order rigid-body aerodynamics for fast experimentation.
* **CFD Lab**: local-compute CFD with deterministic solver behavior, field visualization, hardware gating, and persistent sessions.

This plan defines the full build path for a local-first engineering platform that can grow from the current browser lab into a broad simulation suite while staying honest about what each layer computes.

The plan is written to remove ambiguity. Each layer has a defined responsibility, explicit inputs and outputs, validation rules, failure modes, and release gates. Nothing is treated as implied.

---

## 1. Product goal and non-goals

### 1.1 Product goal

WindSim should let a user open the site, inspect what the machine can handle, load a geometry file, run a simulation, inspect results, save them locally, return later, and continue from the same state without login.

The product must be useful on the first run, but it must never pretend to compute what it does not compute.

### 1.2 Non-goals

The project does not claim full parity with cloud multiphysics platforms on day one.
It does not promise unrestricted city-scale CFD in the browser.
It does not claim every solver family is equally mature.
It does not hide limits behind marketing language.

### 1.3 Long-range target

The long-range target is a local-compute, browser-native engineering suite that can host multiple solver families, each with strict capability gates, storage rules, and validation packs.

---

## 2. Product surfaces

### 2.1 Sandbox surface

The sandbox is the fast interaction layer. It is built for motion, intuition, and rapid comparisons.

Responsibilities:

* rigid-body aerodynamics
* drag, lift, Magnus effects
* rotation and contact
* comparisons and sweep workflows
* probe slices and simple visual feedback

Rules:

* if it is heuristic, label it as such
* if it is reduced-order, do not present it as a full CFD result
* keep it fast, light, and readable

### 2.2 CFD Lab surface

The CFD Lab is the serious simulation layer. It uses deterministic grid-based flow computation with strict workflow gating.

Responsibilities:

* hardware detection
* geometry ingestion
* mesh or voxel validation
* solver setup
* run control
* stable persistence
* field visualization
* trace logging
* validation packs

Rules:

* no fake output
* no auto-run after reload
* no hidden correction unless explicitly marked debug-only
* every layer must be tied to actual data

### 2.3 Launcher surface

The launcher chooses between surfaces and keeps the navigation logic simple.

Responsibilities:

* route to sandbox or CFD Lab
* show state at a glance
* preserve user trust by avoiding hidden transitions
* keep startup fast

---

## 3. System principles

### 3.1 Honest computation

Every displayed quantity must come from actual computation or be marked as a placeholder.

### 3.2 Determinism first

If the same input, same session state, and same settings are replayed, the output must match within the defined numeric tolerance or match exactly where bitwise determinism is required.

### 3.3 No hidden recovery

Recovery actions must be explicit. The user chooses whether to resume.

### 3.4 No silent correction in production

If normalization, clamping, or smoothing is used to stabilize a test case, it must be labeled and turned off by default unless the release gate explicitly allows it.

### 3.5 Evidence over opinion

A feature is finished only when logs, hashes, counts, and runtime checks say so.

---

## 4. Hardware gatekeeper

### 4.1 Purpose

The gatekeeper protects the user from launching workloads the machine cannot hold. It also tells the user what tier they are on before they run expensive work.

### 4.2 Signals to inspect

* logical CPU count
* available device memory estimate
* WebGPU adapter limits
* browser feature support
* storage estimate
* session storage health
* current thermal or memory pressure if accessible indirectly

### 4.3 Capability profile

The app should assign a profile such as:

* Tier A: demo or educational
* Tier B: small local runs
* Tier C: advanced local runs
* Tier D: workstation-class local runs

Each profile should be based on explicit rules.

### 4.4 Gatekeeper outputs

The gatekeeper returns:

* profile label
* recommended grid ceiling
* recommended solver families
* recommended visualization defaults
* warnings about likely instability
* blocked actions with reason text

### 4.5 Gatekeeper behavior

If the machine is weak, the app does not crash later. It should disable or hide options that cannot be supported.
If the machine is strong, the app should still cap risky defaults until validation proves the path is stable.

---

## 5. Local storage and workspace model

### 5.1 Storage layers

WindSim uses multiple local stores for different jobs.

* **Session state store**: current run, active mode, resume metadata
* **Project store**: imported geometry, solver settings, saved cases
* **Log store**: timestamps, iteration data, validation output
* **Export store**: packaged files for download
* **Cache store**: temporary derived objects for performance

### 5.2 Storage rules

* no login required for local operation
* no silent wipe of user data
* every persistence action should be recoverable or at least explainable
* session restore never implies auto-run

### 5.3 Recovery rules

On reload, the app should:

* restore metadata
* show a resume choice if a prior session exists
* start paused if restored
* avoid compute until the user presses Run

### 5.4 Full reset

A full reset must clear:

* solver buffers
* visual objects
* workflow state
* session store
* logs if the user asks for a full wipe

A reset should return the system to the first usable state.

### 5.5 Export

The export system should package the case into a portable file containing:

* geometry
* solver settings
* run logs
* selected visualization settings
* metadata needed for replay

---

## 6. Workflow and state machine

### 6.1 Workflow stages

The CFD Lab workflow should enforce a fixed order:

1. import geometry
2. define domain
3. configure boundaries
4. configure solver
5. run
6. inspect
7. export

### 6.2 State machine rules

* invalid stage jumps are blocked
* later stages stay locked until prerequisites are met
* state unlocks are reversible only when earlier inputs change
* every state transition emits a trace entry

### 6.3 Reload rules

Reloading should restore the correct stage, but not auto-run the solver.

### 6.4 Pause, restart, and stop

* pause freezes state
* restart resets the current run while preserving saved project data if the user wants it
* stop halts computation safely and preserves the latest usable trace

---

## 7. Geometry handling

### 7.1 Supported geometry

The system should accept common local 3D formats such as STL and OBJ, and later extend to more formats where practical.

### 7.2 Ingestion pipeline

* parse file
* validate structural integrity
* reject invalid indices
* reject zero-volume meshes
* warn on non-manifold edges
* warn on open boundaries
* warn on suspect normals
* store a normalized internal representation

### 7.3 Sanitation policy

Allowed:

* degenerate triangle removal
* vertex deduplication with defined tolerance
* normal recomputation when only shading data is affected

Forbidden in production:

* hole filling unless explicitly requested
* hidden topology repair that changes the shape without informing the user
* silent mesh remeshing that changes geometry fidelity

### 7.4 Geometry metadata

Every geometry object should retain:

* source name
* file format
* bounds
* volume estimate where meaningful
* validation warnings
* import timestamp

### 7.5 Geometry failure behavior

Invalid geometry must not quietly proceed into the solver. It should stop the run, explain the issue, and preserve the imported asset for inspection.

---

## 8. Voxelization and domain mapping

### 8.1 Purpose

The geometry must be mapped into a grid representation that the solver can use.

### 8.2 Reference method

A CPU reference method should be the source of truth for inside/outside classification and surface marking.

### 8.3 Required outputs

* solid mask
* surface mask
* fluid mask
* boundary-adjacent mask
* domain bounds
* grid spacing

### 8.4 Classification policy

Each voxel is assigned a role. The classification must be reproducible.

### 8.5 Boundary safety

Streamlines, slices, and solver sampling must respect the solid mask.

### 8.6 Grid scaling

Grid size is tied to the capability profile. The gatekeeper suggests safe limits, and the user can exceed them only when the app can defend the choice with warnings.

---

## 9. Solver architecture

### 9.1 Solver families

The platform may host more than one solver family over time.

Each solver family must have:

* input contract
* state contract
* output contract
* validation pack
* stability limits
* storage limits

### 9.2 LBM core

The current CFD path is based on Lattice Boltzmann dynamics with a defined lattice and collision scheme.

Requirements:

* deterministic stepping order
* explicit boundary handling
* clear fields for density, velocity, pressure proxy, and masks
* traceable update loop
* no hidden corrections unless a debug mode is active

### 9.3 Solver state

Solver state should include:

* current iteration
* distribution fields
* macroscopic fields
* boundary configuration
* current workflow stage
* current run ID
* validation status

### 9.4 Solver output

The solver should be able to produce:

* field buffers
* residual history
* mass drift history
* timing data
* force estimates where supported
* stability state

### 9.5 Solver integrity rules

* visualization must not mutate state
* pause must freeze state exactly
* reload must restore state only when explicitly requested
* divergence must halt safely and preserve evidence

---

## 10. Boundary conditions

### 10.1 Boundary families

The system should support the boundary families needed by the current roadmap.

Examples:

* inlet
* outlet
* no-slip solid boundaries
* symmetry where appropriate
* domain wall constraints where needed

### 10.2 Boundary configuration

Boundary data must be editable in a clear UI and stored with the case.

### 10.3 Boundary validation

The app should validate boundary compatibility before a run begins.

### 10.4 Boundary debugging

When a run fails, the system should expose which boundary or interface became unstable.

---

## 11. Observability and trace logs

### 11.1 Purpose

The app must show what it did, when it did it, and how long it took.

### 11.2 Trace fields

A run trace should store:

* timestamp
* run ID
* solver config
* hardware profile
* iteration timings
* residual history
* mass drift history
* divergence flags
* workflow transitions
* visualization settings

### 11.3 Logging style

Logs should be structured, compact, and readable.

### 11.4 Log retention

Keep enough history to debug a run, but do not bloat the browser store without reason.

### 11.5 Log integrity rules

* every run gets a unique run ID
* recovery must not overwrite prior trace data unless the user starts a fresh run
* if a log entry is missing or malformed, the system should flag the session as incomplete
* exported logs must match the in-app trace for the same run

### 11.6 Recommended log events

* app boot
* session found / no session found
* session resume chosen / rejected
* geometry import started / completed / failed
* workflow step unlocked
* solver start / pause / stop / reset
* iteration milestone
* divergence detected
* visualization mode change
* export started / completed

### 11.7 Trace export

Users should be able to export raw traces for later analysis.

---

## 12. Visualization architecture

### 12.1 Principle

All post-processing must derive from solver buffers. No fake fields.

### 12.2 Modes

* solid view
* wire view
* voxel view
* slice view
* streamline view
* surface view
* later: velocity magnitude, pressure, force overlays

### 12.3 Slice system

Slices should support:

* axis selection
* position slider
* field selection
* range control
* transparent display with honest data mapping
* visible movement across the whole domain, not only the center plane

### 12.4 Streamline system

Streamlines should support:

* deterministic seeding
* adjustable density
* boundary-aware integration
* solid-mask termination
* readable length limits
* stable line or ribbon rendering where suitable
* termination near low-speed regions to prevent wall sticking

### 12.5 Surface mapping

Surface colors should come from actual field data near the boundary.

### 12.6 Layering rules

The render stack must define what draws first, what stays on top, and what is allowed to fade behind.

### 12.7 Visual honesty

No glow that implies physics not present. No shading that misstates the field. No auto smoothing that invents structure.

### 12.8 Debug fallback

If a visualization mode produces zero geometry, show a simple visible marker so the failure is obvious during debugging. Remove or disable the marker once the fix is proven.

---

## 13. Interactions and UI behavior

### 13.1 Input handling

The UI should respect keyboard, mouse, and touch where practical.

### 13.2 Controls

The UI must expose:

* import
* reset
* home/back
* run/pause/stop
* slice axis and position
* seed density
* colormap controls
* export
* resume/start fresh modal

### 13.3 Feedback rules

Every button should have obvious state feedback. Disabled controls should explain why they are disabled.

### 13.4 Navigation rules

The user must have a way to exit to the landing page safely.

### 13.5 Session load behavior

On page load, restore metadata first, then wait for a user choice before resuming computation.

---

## 14. Performance model

### 14.1 Browser constraints

All features must respect browser memory, frame time, and storage limits.

### 14.2 Frame budget

Visualization must not grind the UI to a halt unless the user knowingly launches a heavy mode.

### 14.3 Compute budget

Solver runs should degrade gracefully.

### 14.4 Caching rules

Cache only what helps. Clear caches when state changes would make the cache misleading.

### 14.5 Backpressure rules

If the machine is struggling, the app should tell the user, slow down, or drop resolution before it becomes unusable.

---

## 15. Debug and production modes

### 15.1 Debug mode

Debug mode may allow:

* extra logging
* stronger validation
* slower but more transparent checks
* diagnostic overlays

### 15.2 Production mode

Production mode should:

* stay quiet unless there is a real issue
* avoid excessive logs
* preserve speed and clarity

### 15.3 Mode separation

Debug corrections must not bleed into production without explicit approval.

### 15.4 Reset of debug aids

Temporary debug objects and forced logging must be removed once the bug is proven fixed.

---

## 16. Validation framework

### 16.1 Validation philosophy

Every solver or visualization change needs a test pack.

### 16.2 Validation layers

* unit tests for math and parsing
* integration tests for workflow and storage
* browser tests for UI and visuals
* long-run tests for stability
* replay tests for determinism

### 16.3 Required checks

* geometry rejection
* solid-mask integrity
* no auto-resume on load
* reset clears state
* viz mode switches update correctly
* slice changes affect output
* streamlines never enter solids
* solver does not mutate during visual inspection
* reload behavior is explicit

### 16.4 Evidence policy

A validation pass must record raw numeric values, counts, hashes, and failure points.

### 16.5 Validation output format

Each validation report should state:

* test name
* setup
* numeric evidence
* pass/fail result
* what was fixed if it failed

---

## 17. Benchmark suite

### 17.1 Purpose

Benchmarks are the proof that the system is not just pretty.

### 17.2 Core benchmark cases

* sphere around flow
* airfoil flow
* channel flow
* cavity flow
* simple symmetry case

### 17.3 Benchmark outputs

Each benchmark should produce:

* field snapshots
* residual trend
* mass drift trend
* path coverage for streamlines
* slice sampling stats
* surface mapping stats

### 17.4 Benchmark gates

A benchmark is not passed because it runs. It is passed because its outputs fit the expected ranges and structures.

### 17.5 Repeatability rule

Benchmarks should be rerunnable on the same case with the same settings and produce comparable results.

---

## 18. Force and engineering outputs

### 18.1 Force estimation

The platform should eventually report drag and lift where the solver can support it.

### 18.2 Reporting rules

Force values must be tied to the solver state and the geometry boundary.

### 18.3 Caution

If force estimation is unstable or approximate, label it clearly.

### 18.4 Later extension

If a future solver supports heat transfer or other derived outputs, they should follow the same evidence-first rule.

---

## 19. Packaging and export

### 19.1 Export bundle

A case export should include:

* geometry
* solver settings
* workflow stage
* logs
* selected visualization settings
* optional screenshots or render captures

### 19.2 Export formats

Support a local package format that can be reloaded later without a server.

### 19.3 Reimport rules

Reimported packages should restore the same project state or refuse with a clear reason.

### 19.4 Data portability

A user should be able to move a run from one browser session to another without losing the case context.

---

## 20. Roadmap structure

### 20.1 Near-term

* finish current CFD Lab hardening
* improve streamline readability
* improve slice controls
* add force outputs
* keep storage clean and stable

### 20.2 Mid-term

* broaden benchmark pack
* add more solver options where justified
* add stronger capability gating
* improve local export and replay

### 20.3 Long-term

* GPU compute where it genuinely helps
* larger problem sizes where hardware allows
* more solver families if each one has a real validation pack

### 20.4 Scope discipline

Do not start a new solver family until the current one has a validation pack and a recovery path.

---

## 21. Release gates

### 21.1 A feature may ship only when

* it is implemented
* it is tested
* it is honest about limits
* it does not break existing surfaces
* it is visible in logs or runtime evidence

### 21.2 A release may not ship when

* a mode pretends to work without data
* reload auto-runs unexpectedly
* reset fails to clear state
* visuals are decorative and not tied to the solver
* benchmarks are not reproducible

### 21.3 Promotion rule

A mode only becomes the default when it has survived repeated validation on at least the intended class of geometry.

---

## 22. Risk register

### 22.1 Technical risks

* browser memory ceilings
* large-grid slowdown
* state drift across reload
* geometry misclassification
* visual layer confusion
* overly aggressive stabilizers that hide physics

### 22.2 Product risks

* confusing sandbox with CFD Lab
* unclear skill level limits
* unstable persistence causing user mistrust

### 22.3 Mitigation rules

* keep surfaces separate
* log state transitions
* show capability limits early
* avoid hidden auto-run behavior

### 22.4 Escalation rule

If a bug affects solver truthfulness, storage integrity, or workflow gating, it is a blocking issue.

---

## 23. Documentation plan

### 23.1 Documents to keep current

* master blueprint
* solver notes
* storage notes
* validation pack
* release notes
* user help text

### 23.2 Documentation rules

Docs must match code. If the code changes, the docs must be revisited.

### 23.3 Style rules

Documentation should be direct, unambiguous, and short enough to be read.

### 23.4 Truthfulness rule

If the code is experimental, the docs must say so.

---

## 24. Team and maintenance model

### 24.1 Code ownership

Each subsystem should have a clearly named owner or maintainer role, even in a solo project.

### 24.2 Maintenance routine

* run validation pack
* inspect logs
* review storage state
* check release gates
* clear stale debug artifacts

### 24.3 Change discipline

Large changes should be split into a fixed set of small verified steps.

### 24.4 Bug-fix rule

Fix one failure mode at a time, then rerun the relevant checks before moving on.

---

## 25. Acceptance summary

The project is ready for the next major expansion when the following are true:

* the sandbox stays stable
* the CFD Lab does not auto-run or lose sessions
* geometry is validated correctly
* solver output is deterministic enough for the chosen mode
* slices, streamlines, and surface maps reflect actual field data
* reset and home navigation behave cleanly
* benchmark cases stay within defined tolerances
* the app stays honest about limits

---

## 26. Implementation order guide

1. keep the current CFD Lab stable
2. harden navigation and reset behavior
3. improve visual clarity
4. add force outputs
5. expand validation cases
6. tune performance only after stability is locked
7. grow into broader simulation families only after the current solver stack is trustworthy

### 26.1 Working rule for new features

A new feature should enter the repo only if its failure mode is understood, its storage behavior is defined, and its validation path exists.

---
also some changes in this plan,
First, I would add one explicit line in section 4 or 13 that the hardware gatekeeper must separate “solver compute capability” from “renderer GPU capability.” The plan implies this, but making it explicit removes a common source of confusion. The current text already has the right ingredients, but that one sentence would harden it.

Second, I would add an explicit “Simulation Advisor” subsection or a short paragraph under the hardware gatekeeper saying it must output clear action recommendations, not just a tier label. The current capability profile and blocked-action text are good, but a named advisor makes the UX requirement unmissable.

Third, I would mark “current thermal or memory pressure if accessible indirectly” as optional heuristics rather than a required signal. Browser access to that kind of data is uneven, so keeping it optional avoids a brittle requirement.

Nothing else looks structurally missing. The plan already covers the big failure points that mattered in your earlier work: reload behavior, session persistence, no silent recovery, debug-only corrections, validation evidence, and the streamlines/slice/surface pipeline.

## 27. Final note

This plan is meant to keep the system coherent while it grows. Each piece must earn its place by proving it works, proving it is honest, and proving it does not break the rest of the platform.

The next additions should be modest, visible, and verifiable.
