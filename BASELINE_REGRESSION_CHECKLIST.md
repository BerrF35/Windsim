# WindSim Baseline Regression Checklist

This checklist protects the current WindSim baseline while the project moves from a reduced-order aerodynamic sandbox toward a more serious analysis platform.

Use this document after any meaningful change to physics, rendering, UI, telemetry, presets, scenarios, or validation logic.

## 1. Baseline Classification

Current product classification:

- advanced reduced-order aerodynamic sandbox
- not a CFD solver
- not a two-way coupled flow solver

This matters because every regression pass must verify the current product honestly, not against features that do not exist yet.

## 2. Minimum Pre-Flight Checks

Run these first after changes:

1. Parse or syntax-check all modular scripts:
   - `windsim-data.js`
   - `windsim-physics.js`
   - `windsim-ui.js`
   - `windsim-app.js`

2. Load the app in a browser and confirm:
   - the page renders
   - the 3D scene initializes
   - the sidebar renders
   - the HUD renders
   - the graph panel can appear
   - no immediate runtime exceptions block interaction

3. Confirm the current product labels remain truthful:
   - no CFD terminology is introduced for reduced-order outputs
   - no solved pressure / vorticity claims are shown unless they are actually computed

## 3. Core Smoke Tests

These checks should pass on every meaningful change.

### Startup

- App boots without syntax errors.
- Default preset loads.
- Object appears in the chamber.
- Camera controls work.
- Pause / resume works.
- Reset object works.
- Apply preset works.

### Workspace

- Sidebar resize works.
- Bottom HUD resize works.
- Energy panel resize works.
- Legend panel resize works.
- Graph panel resize works.
- Reset Layout restores sane defaults.

### Controls

- Wind sliders update live values.
- Object selection resets and relaunches cleanly.
- Surface changes update the environment.
- Mounted wind-tunnel mode toggles cleanly and resets the body into fixed-position operation.
- Chamber dimension changes update visible bounds.
- Particle count and particle size controls work.
- Simulation rate affects playback speed without freezing.
- Box-like object scaling controls update dimensions and mass properties cleanly.

### Analysis Overlays

- Force labels toggle correctly.
- Ruler toggle works.
- Impact markers toggle works.
- Graph toggle works.
- Compare trail toggle works.
- Flow probe slice toggle works.
- Flow probe slice plane selector switches between horizontal and vertical section views.
- Flow probe slice height and span controls update the overlay cleanly.
- Vertical flow probe slices remain labeled as in-plane projections of the reduced-order field rather than CFD output.
- Mounted mode still shows meaningful drag / lift / net-force graph updates while the object remains fixed.
- Force arrows remain color coded and legible.

### Playback

- Recorded timeline accumulates after a run starts.
- Playback slider scrubs through recorded frames.
- Prev / Next frame stepping works.
- Playback play / pause runs through recorded frames without resuming live simulation.
- Exit playback returns to the latest live state.
- Graph and HUD values follow the playback frame instead of the latest live state while playback is active.

### Experiment

- Sweep panel renders.
- Sweep runs produce rows in the report box.
- Sweep export produces CSV when rows exist.
- Sweep results reflect the selected variable range and step count.
- Sweep remains labeled as mounted reduced-order sampling rather than CFD output.
- Saved sweep list persists after reload.
- Using a saved sweep restores the sweep setup and stored rows.
- Compare renders a delta report against the selected saved sweep.
- Current sweep report is marked stale after configuration changes that invalidate the run context.

### Persistence

- Scenario save works.
- Scenario load works.
- Scenario export produces JSON.
- Scenario import accepts valid JSON and rejects invalid JSON cleanly.

## 4. Preset Baseline Matrix

These preset runs protect the existing feature surface in `windsim-data.js`.

### `baseline`

Expected purpose:
- default sanity run
- stable launch, particles, HUD, graph, and chamber operation

Must confirm:
- app starts in a sane state
- no absurd force spikes at launch
- telemetry updates continuously

### `crosswind`

Expected purpose:
- lateral drift under angled wind
- combined launch velocity and spin behavior

Must confirm:
- visible crosswind drift
- nonzero lift / drag / net metrics
- trail and graph remain coherent

### `storm`

Expected purpose:
- strong gust-front behavior with unstable umbrella-like response

Must confirm:
- gust behavior is visibly time-varying
- object remains within chamber collision rules
- particles show aggressive flow motion

### `highalt`

Expected purpose:
- lower density behavior at high altitude

Must confirm:
- `rho` decreases versus sea-level conditions
- Reynolds number changes plausibly
- drag response is reduced compared with denser-air scenarios

### `spinlab`

Expected purpose:
- spinning disc / frisbee-style motion

Must confirm:
- angular motion is visible
- lift and AoA values update
- comparison trail remains useful after reset

### `freight`

Expected purpose:
- heavy box-like body under tunnel-like wind and contact response

Must confirm:
- box visuals remain correct
- resizing logic still works if the object is scaled
- floor / wall / ceiling collision does not explode numerically

### `vortexlab`

Expected purpose:
- vortex wind-field mode stress case

Must confirm:
- field-driven swirling motion is visible
- particles and object path respond consistently to the vortex field

### `waketest`

Expected purpose:
- shuttlecock stability and wake-mode stress case

Must confirm:
- shuttlecock remains directionally stable relative to its model
- wake-mode variation remains visible
- validation-related metrics still update

## 5. Validation Case Gate

The following validation cases must still run and produce a result in the UI:

- `golf_drag_crisis`
- `frisbee_glide`
- `shuttlecock_stability`
- `brick_settle`

Validation pass criteria for the baseline:

- case starts successfully
- simulation runs to completion
- result text is produced
- no runtime exception occurs
- result values remain within the intended qualitative behavior for the object

## 6. Change-Specific Rerun Rules

### If physics changes

Rerun:
- all eight presets
- all four validation cases
- telemetry export sanity
- force graph sanity

### If rendering changes

Rerun:
- startup
- baseline
- storm
- vortexlab
- impact-marker visibility
- force-arrow visibility and color coding

### If UI or layout changes

Rerun:
- startup
- workspace resize suite
- persistence suite
- graph toggle and graph resize
- validation panel behavior

### If data definitions change

Rerun:
- all affected presets
- all affected objects
- at least one collision-heavy scenario

## 7. Honest Failure Logging

If a regression fails, record:

- what changed
- which scenario failed
- whether the failure is visual, physical, telemetry-related, persistence-related, or performance-related
- whether the issue is a real bug or an expected behavior shift from an intentional model change

Do not mask a failure by changing labels or hiding UI.

## 8. Current Known Coverage Gaps

The current baseline still lacks dedicated regression coverage for:

- resizable box geometry stress tests across extreme scales
- export round-tripping across many saved scenarios
- long-duration chamber wall / ceiling bounce endurance
- explicit performance thresholds
- future solver-mode separation

These are known gaps, not excuses to skip the current checklist.
