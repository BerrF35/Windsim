# Changelog

All notable changes to WindSim are documented here.

## [Unreleased]

### Added
- `windsim-textures.js` — canvas texture generation and color utilities extracted from app
- `windsim-models.js` — 3D object visual construction extracted from app
- `windsim-scene.js` — rendering, camera, lighting, particles, overlays extracted from app
- `CHANGELOG.md` — this file, closing Phase 0 governance requirement
- Meta description and favicon for SEO
- Differentiated button styles: cyan (primary), green (positive), orange (destructive), neutral (secondary)

### Changed
- `windsim-app.js` reduced from 1,992 lines to 592 lines (pure orchestration)
- CSS color system overhauled: restored semantic color differentiation from collapsed single-hue coral palette
- Dark theme deepened from `#262D33` to `#0C1117` for premium aerospace feel
- Status pill now shows distinct green (RUNNING) vs amber (PAUSED)
- Toggle switches use neutral grey (off) vs cyan (on) instead of identical coral
- All UI accent colors now match the 3D force legend colors
- `README.md` updated with new module layout and Phase 1 completion notes
- `PROJECT_MASTER_PLAN.md` living status ledger updated

### Fixed
- All CSS semantic color variables (`--cyan`, `--green`, `--amber`, etc.) were mapped to the same `#EC725A` — now each has its proper distinct color
- Text color (`--txt`) was tinted coral — now neutral `#D4DEE8` for readability

### Removed
- Legacy inline JavaScript archive from `index.html` (removed in prior session)
- `surfaceTexCache` and `objectTexCache` from `app.render` (moved into texture module)

## [v2.6] — 2026-04-13

### Added
- Cinematic landing / entry flow with mode routing and returning-user fast track
- Mounted wind-tunnel test mode
- Recorded playback timeline with scrubbing and frame stepping
- Mounted sweep experiment panel for repeatable reduced-order comparisons
- Saved sweep result management and current-vs-saved comparison workflow
- Multi-plane flow probe slices with vertical sections
- Validation suite with geometry-resize stress and chamber-endurance cases
- Sidebar and HUD-panel resizing

### Changed
- Particle cues moved from `Math.random()` to seed-driven deterministic visuals
- Particle UI labels clarified as reduced-order flow visuals, not solved CFD
- Side-force and wall-force placeholder channels removed
- Playback and experiment workflows extracted into `windsim-workflows.js`
- Status-pill and validation-pill UI sync moved into `windsim-ui.js`
