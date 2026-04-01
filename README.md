# WindSim

See [PROJECT_MASTER_PLAN.md](./PROJECT_MASTER_PLAN.md) for the persistent execution plan and long-term architecture roadmap.

WindSim is a browser-based 3D aerodynamic sandbox for testing how different objects behave inside a controllable wind field. It combines a stylized real-time simulation space with adjustable airflow, altitude, turbulence, spin, bounce, and telemetry so you can watch motion, compare scenarios, and stress-test different launch conditions.

Built as a modular browser project with plain HTML, CSS, and JavaScript, WindSim focuses on immediacy: change a parameter, relaunch an object, and read the result instantly.

## Overview

WindSim simulates projectile and free-flight behavior across a wide range of objects, from sports balls to lightweight debris and heavy cargo. The project sits somewhere between a physics toy, a visualization lab, and an interaction-heavy prototype. It is designed to make aerodynamic behavior readable, not hidden.

The current build includes a full 3D scene, a large continuous test space, object-specific visuals, configurable environmental response, and live instrumentation for forces, energy, and motion.

## Highlights

- Full 3D aerodynamic simulation with live object flight, bounce, drag, and spin behavior
- Wind controls with full `0-359` degree heading, vertical elevation, turbulence, and gust intensity
- Altitude-based air density using a standard-atmosphere style model
- Object library covering sports equipment, lightweight materials, and heavy bodies
- Procedural textures and non-uniform geometry for objects that should not all look like spheres
- Large continuous ground plane and adjustable ceiling for longer and taller test runs
- Visual overlays for velocity, drag, gravity, Magnus force, trails, particles, and spin axis
- Mounted wind-tunnel mode for fixed-position force inspection inside the reduced-order solver
- Free camera movement with orbit, pan, zoom, follow mode, and adjustable cinematic response
- Preset scenarios for quick comparisons between calm tests, crosswinds, storms, high-altitude runs, spin-heavy launches, and cargo drops
- CSV telemetry export for analysis outside the app

## Simulation Systems

- Aerodynamic drag based on relative wind speed
- Reynolds-number-aware drag behavior for supported objects
- Magnus force for spinning bodies
- Rotational damping and visible angular motion
- Gravity, bounce response, rolling resistance, and surface friction
- Altitude-driven density changes that affect lift and drag response
- Time scaling, telemetry recording, and real-time HUD feedback

## Object Library

The current object set spans multiple categories:

- Sports balls: soccer, tennis, basketball, cricket, baseball, ping pong, golf, volleyball, rugby
- Specialty flight objects: shuttlecock, frisbee
- Lightweight / unstable bodies: autumn leaf, feather, paper ball, umbrella
- Heavy objects: cannonball, wooden crate, brick

Each object carries its own mass, effective area, radius, drag profile, restitution behavior, and visual treatment.

## Environment And Control Surface

WindSim exposes nearly every major part of the simulation through the interface:

- Wind speed, heading, elevation, turbulence, and gust strength
- Launch height and initial velocity on all three axes
- Independent spin values across all three rotational axes
- Surface material selection: grass, concrete, hardwood, sand, ice, water
- Altitude, ceiling height, particle density, particle size, trail length, and simulation rate
- Toggleable systems including gravity, particles, trails, bounce, force vectors, Magnus effect, rotational dynamics, Reynolds-based drag, and spin-axis visualization
- Camera controls for follow, distance, yaw, pitch, field of view, and follow lag

## Visualization Layer

The project is built to make the simulation legible while it is running. The current scene includes:

- A live HUD for speed, drag, acceleration, height, Reynolds number, drag coefficient, spin, heading, air density, and sim time
- An energy panel showing translational energy, rotational energy, gravitational potential, wind work, and losses
- Force arrows for drag, gravity, velocity, Magnus force, and angular spin axis
- Wind particles and trajectory trails for reading flow direction and path history
- Procedurally generated textures for both surfaces and objects

## Preset Scenarios

The current build ships with eight presets:

- Baseline Field Test
- Crosswind Sports Test
- Storm Tunnel
- High Altitude Thin Air
- Spin Lab
- Heavy Cargo Drop
- Vortex Lab
- Wake Test

These presets are intended as quick scenario snapshots rather than fixed game levels, making it easy to compare how object type, atmosphere, spin, and wind direction interact.

## Telemetry

WindSim can export recorded simulation data as CSV, including:

- Position and velocity
- Acceleration and net force
- Drag and Magnus force
- Reynolds number and active drag coefficient
- Spin rates
- Wind state and air density
- Translational, rotational, and potential energy values
- Friction and collision loss estimates

This makes the project useful not just as a visual sandbox, but also as a lightweight data-producing experiment tool.

## Technical Profile

- Frontend: HTML, CSS, JavaScript
- Rendering: Three.js
- Architecture: modular browser app split across `index.html`, `windsim-data.js`, `windsim-physics.js`, `windsim-solvers.js`, `windsim-ui.js`, and `windsim-app.js`
- Visual assets: procedural canvas-generated textures
- Data output: in-browser CSV export

## Project Character

WindSim is not framed as a perfect engineering simulator. It is a high-control interactive sandbox built to explore motion, airflow, and readability in a fast, hands-on way. The emphasis is on experimentation, feedback, and making the physics feel inspectable.

## Status

The project is actively oriented around the 3D simulation build and its control-rich interface. Current strengths are breadth of controls, object variety, readable telemetry, and a stronger visual identity than the original prototype direction.
