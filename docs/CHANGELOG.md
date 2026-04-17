# Changelog

All notable changes to WindSim are documented here.

## [Unreleased]

### Added
- `index.html` launcher routing between the sandbox and the CFD lab
- `docs/CFD_MASTER_BLUEPRINT.md` as the active CFD implementation blueprint
- Phase A CFD workflow gating for geometry, domain, boundary, and solver setup
- hardware-tier reporting on the CFD page (`full`, `reduced`, `demo`)

### Changed
- CFD lab copy and status reporting now match the actual implementation instead of implying a finished numerical kernel
- launcher copy now describes the CFD surface as a workbench shell rather than a solved production solver
- `README.md` now reflects the current split between the working sandbox and the Phase A CFD surface

### Removed
- stale references to `landing.html` and `PROJECT_MASTER_PLAN.md`
- fake-looking default CFD result values on first load

## [v2.6] - 2026-04-13

### Added
- `windsim-textures.js` for canvas texture generation and color utilities
- `windsim-models.js` for 3D object visual construction
- `windsim-scene.js` for rendering, camera, lighting, particles, and overlays
- cinematic landing and entry flow with mode routing and returning-user fast track
- mounted wind-tunnel test mode
- recorded playback timeline with scrubbing and frame stepping
- mounted sweep experiment panel for repeatable reduced-order comparisons
- saved sweep result management and current-vs-saved comparison workflow
- multi-plane flow probe slices with vertical sections
- validation cases for geometry-resize stress and chamber-endurance checks
- sidebar and HUD panel resizing
- 2D grid-based experimental CFD work on the sandbox side
- GLTFLoader support for external mesh importing
- RGBELoader support for studio lighting

### Changed
- `windsim-app.js` reduced to orchestration-oriented app glue
- particle cues moved from `Math.random()` to seeded deterministic visuals
- particle UI labels clarified as reduced-order visuals rather than solved CFD

### Removed
- legacy inline JavaScript archive from the old sandbox shell
- side-force and wall-force placeholder channels
