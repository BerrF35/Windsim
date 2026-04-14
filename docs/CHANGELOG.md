# Changelog

All notable changes to WindSim are documented here.

## [Unreleased]

### Added
- `landing.html` — split-screen landing page routing to the Sandbox and the CFD Lab
- `docs/CFD_MASTER_BLUEPRINT.md` — consolidated 5-phase CFD build plan inspired by SimScale

### Removed
- `docs/PHASE1_REDUCED_ORDER_AUDIT.md` — completed, no longer needed
- `docs/PROJECT_MASTER_PLAN.md` — completed phases purged, superseded by CFD blueprint
- `docs/BASELINE_REGRESSION_CHECKLIST.md` — completed, superseded by CFD blueprint
- `docs/CFD_ARCHITECTURE.md` — merged into CFD_MASTER_BLUEPRINT.md
- `docs/CFD_IMPLEMENTATION_GUIDE.md` — merged into CFD_MASTER_BLUEPRINT.md

## [v2.6] — 2026-04-13

### Added
- `windsim-textures.js` — canvas texture generation and color utilities extracted from app
- `windsim-models.js` — 3D object visual construction extracted from app
- `windsim-scene.js` — rendering, camera, lighting, particles, overlays extracted from app
- Cinematic landing / entry flow with mode routing and returning-user fast track
- Mounted wind-tunnel test mode
- Recorded playback timeline with scrubbing and frame stepping
- Mounted sweep experiment panel for repeatable reduced-order comparisons
- Saved sweep result management and current-vs-saved comparison workflow
- Multi-plane flow probe slices with vertical sections
- Validation suite with geometry-resize stress and chamber-endurance cases
- Sidebar and HUD-panel resizing
- Differentiated button styles: cyan (primary), green (positive), orange (destructive), neutral (secondary)
- Meta description and favicon for SEO
- 2D MAC Eulerian Grid CPU solver
- GLTFLoader for external mesh importing
- RGBELoader for PBR/IBL studio lighting

### Changed
- `windsim-app.js` reduced from 1,992 lines to 592 lines (pure orchestration)
- CSS color system overhauled: restored semantic color differentiation
- Dark theme deepened to `#0C1117` for premium aerospace feel
- Particle cues moved from `Math.random()` to seed-driven deterministic visuals
- Particle UI labels clarified as reduced-order flow visuals, not solved CFD

### Removed
- Legacy inline JavaScript archive from `index.html`
- Side-force and wall-force placeholder channels
