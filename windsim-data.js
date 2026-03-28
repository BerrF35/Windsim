(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const RHO0 = 1.225;
  const GRAV = 9.81;
  const MU_AIR = 1.81e-5;
  const SUB = 10;
  const TRATE = 20;
  const PART_MAX = 1200;
  const TRAIL_MAX = 2200;
  const FLOOR_SIZE = 640;
  const FLOOR_STEP = 60;
  const FLOOR_TILE = 6;
  const BEAUFORT_LABELS = ['Calm', 'Light Air', 'Light Breeze', 'Gentle Breeze', 'Moderate Breeze', 'Fresh Breeze', 'Strong Breeze', 'Near Gale', 'Gale', 'Strong Gale', 'Storm', 'Violent Storm', 'Hurricane'];
  const BEAUFORT_T = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  const COMPASS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const STORAGE_KEY = 'windsim3d-scenarios-v2';

  function sphereInertia(radius, mass) {
    const value = 0.4 * mass * radius * radius;
    return [value, value, value];
  }

  function boxInertia(width, height, depth, mass) {
    return [
      (mass / 12) * (height * height + depth * depth),
      (mass / 12) * (width * width + depth * depth),
      (mass / 12) * (width * width + height * height)
    ];
  }

  function discInertia(radius, thickness, mass) {
    return [
      (mass / 12) * (3 * radius * radius + thickness * thickness),
      0.5 * mass * radius * radius,
      (mass / 12) * (3 * radius * radius + thickness * thickness)
    ];
  }

  function ellipsoidInertia(a, b, c, mass) {
    return [
      0.2 * mass * (b * b + c * c),
      0.2 * mass * (a * a + c * c),
      0.2 * mass * (a * a + b * b)
    ];
  }

  const WIND_MODES = {
    uniform: { label: 'Uniform', desc: 'Steady chamber flow' },
    shear: { label: 'Vertical Shear', desc: 'Wind varies with height' },
    vortex: { label: 'Vortex', desc: 'Swirl around chamber center' },
    gustfront: { label: 'Gust Front', desc: 'Travelling pressure front' },
    tunnel: { label: 'Wind Tunnel', desc: 'Laminar core with wall losses' },
    wake: { label: 'Obstacle Wake', desc: 'Virtual bluff-body wake' }
  };

  const DEFAULT_WORLD = {
    halfWidth: 120,
    halfDepth: 120,
    ceiling: 220,
    collision: true
  };

  const DEFAULT_ANALYSIS = {
    forceLabels: true,
    ruler: true,
    impacts: true,
    graph: true,
    compare: true,
    markers: true
  };

  const OBJ_DEFS = {
    soccer: {
      label: 'Soccer Ball',
      mass: 0.430,
      r: 0.110,
      area: Math.PI * 0.110 * 0.110,
      Cd0: 0.25,
      crO: 0.65,
      col: 0xdde8f0,
      shape: 'sphere',
      texture: 'soccer',
      dims: [0.22, 0.22, 0.22],
      inertia: sphereInertia(0.110, 0.430),
      aero: { model: 'sphere', refAxis: 'y', cp: [0, 0, 0], chord: 0.22, spinLift: 0.12, useCurve: 'sphere' },
      ground: { mode: 'roll', muS: 1.0, muK: 1.0, muR: 1.0, bounce: 1.0, settle: 2.0, yawDamp: 1.6 }
    },
    tennis: {
      label: 'Tennis Ball',
      mass: 0.058,
      r: 0.033,
      area: Math.PI * 0.033 * 0.033,
      Cd0: 0.47,
      crO: 0.70,
      col: 0xbef264,
      shape: 'sphere',
      texture: 'tennis',
      dims: [0.066, 0.066, 0.066],
      inertia: sphereInertia(0.033, 0.058),
      aero: { model: 'sphere', refAxis: 'y', cp: [0, 0, 0], chord: 0.066, spinLift: 0.18, useCurve: 'sphere' },
      ground: { mode: 'roll', muS: 1.0, muK: 1.0, muR: 1.0, bounce: 1.0, settle: 2.0, yawDamp: 1.6 }
    },
    basketball: {
      label: 'Basketball',
      mass: 0.624,
      r: 0.120,
      area: Math.PI * 0.120 * 0.120,
      Cd0: 0.47,
      crO: 0.75,
      col: 0xf97316,
      shape: 'sphere',
      texture: 'basketball',
      dims: [0.24, 0.24, 0.24],
      inertia: sphereInertia(0.120, 0.624),
      aero: { model: 'sphere', refAxis: 'y', cp: [0, 0, 0], chord: 0.24, spinLift: 0.10, useCurve: 'sphere' },
      ground: { mode: 'roll', muS: 1.0, muK: 1.0, muR: 1.0, bounce: 1.0, settle: 2.0, yawDamp: 1.5 }
    },
    cricket: {
      label: 'Cricket Ball',
      mass: 0.156,
      r: 0.036,
      area: Math.PI * 0.036 * 0.036,
      Cd0: 0.40,
      crO: 0.55,
      col: 0xdc2626,
      shape: 'sphere',
      texture: 'cricket',
      dims: [0.072, 0.072, 0.072],
      inertia: sphereInertia(0.036, 0.156),
      aero: { model: 'sphere', refAxis: 'y', cp: [0, 0, 0], chord: 0.072, spinLift: 0.22, useCurve: 'sphere' },
      ground: { mode: 'roll', muS: 1.0, muK: 1.0, muR: 1.0, bounce: 0.92, settle: 2.0, yawDamp: 1.6 }
    },
    baseball: {
      label: 'Baseball',
      mass: 0.145,
      r: 0.037,
      area: Math.PI * 0.037 * 0.037,
      Cd0: 0.38,
      crO: 0.58,
      col: 0xfef9c3,
      shape: 'sphere',
      texture: 'baseball',
      dims: [0.074, 0.074, 0.074],
      inertia: sphereInertia(0.037, 0.145),
      aero: { model: 'sphere', refAxis: 'y', cp: [0, 0, 0], chord: 0.074, spinLift: 0.24, useCurve: 'sphere' },
      ground: { mode: 'roll', muS: 1.0, muK: 1.0, muR: 1.0, bounce: 0.95, settle: 2.0, yawDamp: 1.6 }
    },
    pingpong: {
      label: 'Ping Pong Ball',
      mass: 0.0027,
      r: 0.020,
      area: Math.PI * 0.020 * 0.020,
      Cd0: 0.40,
      crO: 0.80,
      col: 0xffffff,
      shape: 'sphere',
      texture: 'pingpong',
      dims: [0.040, 0.040, 0.040],
      inertia: sphereInertia(0.020, 0.0027),
      aero: { model: 'sphere', refAxis: 'y', cp: [0, 0, 0], chord: 0.040, spinLift: 0.06, useCurve: 'sphere' },
      ground: { mode: 'roll', muS: 0.8, muK: 0.8, muR: 0.7, bounce: 1.1, settle: 1.5, yawDamp: 1.2 }
    },
    golf: {
      label: 'Golf Ball',
      mass: 0.046,
      r: 0.021,
      area: Math.PI * 0.021 * 0.021,
      Cd0: 0.24,
      crO: 0.65,
      col: 0xf5f5f5,
      shape: 'sphere',
      texture: 'golf',
      dims: [0.042, 0.042, 0.042],
      inertia: sphereInertia(0.021, 0.046),
      aero: { model: 'sphere', refAxis: 'y', cp: [0, 0, 0], chord: 0.042, spinLift: 0.28, useCurve: 'golf' },
      ground: { mode: 'roll', muS: 1.0, muK: 1.0, muR: 0.75, bounce: 1.0, settle: 2.2, yawDamp: 1.4 }
    },
    volleyball: {
      label: 'Volleyball',
      mass: 0.270,
      r: 0.105,
      area: Math.PI * 0.105 * 0.105,
      Cd0: 0.40,
      crO: 0.70,
      col: 0xfde68a,
      shape: 'sphere',
      texture: 'volleyball',
      dims: [0.210, 0.210, 0.210],
      inertia: sphereInertia(0.105, 0.270),
      aero: { model: 'sphere', refAxis: 'y', cp: [0, 0, 0], chord: 0.210, spinLift: 0.12, useCurve: 'sphere' },
      ground: { mode: 'roll', muS: 1.0, muK: 1.0, muR: 1.0, bounce: 1.0, settle: 2.0, yawDamp: 1.6 }
    },
    rugby: {
      label: 'Rugby Ball',
      mass: 0.435,
      r: 0.095,
      area: Math.PI * 0.095 * 0.095,
      Cd0: 0.50,
      crO: 0.55,
      col: 0x7c4f2a,
      shape: 'ellipsoid',
      texture: 'rugby',
      stretch: [0.86, 0.86, 1.48],
      dims: [0.163, 0.163, 0.281],
      inertia: ellipsoidInertia(0.0815, 0.0815, 0.1405, 0.435),
      aero: { model: 'ellipsoid', refAxis: 'z', cp: [0, 0, 0.030], chord: 0.281, spinLift: 0.08, useCurve: false },
      ground: { mode: 'wobble', muS: 1.05, muK: 1.05, muR: 1.55, bounce: 0.85, settle: 3.0, yawDamp: 1.8, wobble: 2.2 }
    },
    cannonball: {
      label: 'Cannonball',
      mass: 4.500,
      r: 0.075,
      area: Math.PI * 0.075 * 0.075,
      Cd0: 0.47,
      crO: 0.22,
      col: 0x3a4151,
      shape: 'sphere',
      texture: 'cannonball',
      dims: [0.150, 0.150, 0.150],
      inertia: sphereInertia(0.075, 4.500),
      aero: { model: 'sphere', refAxis: 'y', cp: [0, 0, 0], chord: 0.150, spinLift: 0.02, useCurve: 'sphere' },
      ground: { mode: 'roll', muS: 1.2, muK: 1.2, muR: 1.4, bounce: 0.40, settle: 2.2, yawDamp: 1.2 }
    },
    leaf: {
      label: 'Autumn Leaf',
      mass: 0.003,
      r: 0.060,
      area: 0.0030,
      Cd0: 1.80,
      crO: 0.12,
      col: 0xfb923c,
      shape: 'leaf',
      texture: 'leaf',
      dims: [0.090, 0.150, 0.006],
      inertia: boxInertia(0.090, 0.150, 0.006, 0.003),
      aero: { model: 'flat', refAxis: 'z', cp: [0, 0.010, 0.004], chord: 0.150, spinLift: 0.0, useCurve: false },
      ground: { mode: 'flat', muS: 1.3, muK: 1.3, muR: 4.0, bounce: 0.08, settle: 8.0, yawDamp: 5.0, wobble: 3.0 },
      restEuler: [-Math.PI / 2, 0, 0]
    },
    feather: {
      label: 'Feather',
      mass: 0.001,
      r: 0.050,
      area: 0.0020,
      Cd0: 2.00,
      crO: 0.06,
      col: 0xe2e8f0,
      shape: 'feather',
      texture: 'feather',
      dims: [0.038, 0.110, 0.004],
      inertia: boxInertia(0.038, 0.110, 0.004, 0.001),
      aero: { model: 'flat', refAxis: 'z', cp: [0, 0.020, 0.003], chord: 0.110, spinLift: 0.0, useCurve: false },
      ground: { mode: 'flat', muS: 1.5, muK: 1.4, muR: 4.5, bounce: 0.05, settle: 10.0, yawDamp: 6.0, wobble: 4.0 },
      restEuler: [-Math.PI / 2, 0, 0]
    },
    paper: {
      label: 'Paper Ball',
      mass: 0.005,
      r: 0.045,
      area: 0.0040,
      Cd0: 1.20,
      crO: 0.10,
      col: 0x93c5fd,
      shape: 'paperball',
      texture: 'paper',
      dims: [0.090, 0.090, 0.090],
      inertia: sphereInertia(0.045, 0.005),
      aero: { model: 'flat', refAxis: 'z', cp: [0, 0.006, 0.003], chord: 0.090, spinLift: 0.0, useCurve: false },
      ground: { mode: 'skid', muS: 1.2, muK: 1.1, muR: 2.5, bounce: 0.10, settle: 6.0, yawDamp: 3.5 }
    },
    umbrella: {
      label: 'Umbrella',
      mass: 0.500,
      r: 0.340,
      area: 0.2800,
      Cd0: 1.80,
      crO: 0.04,
      col: 0xa78bfa,
      shape: 'umbrella',
      texture: 'umbrella',
      dims: [0.680, 0.650, 0.680],
      inertia: boxInertia(0.680, 0.650, 0.680, 0.500),
      aero: { model: 'umbrella', refAxis: 'y', cp: [0, 0.100, 0], chord: 0.680, spinLift: 0.0, useCurve: false },
      ground: { mode: 'flat', muS: 1.1, muK: 1.0, muR: 3.5, bounce: 0.03, settle: 7.0, yawDamp: 4.0 }
    },
    shuttlecock: {
      label: 'Shuttlecock',
      mass: 0.005,
      r: 0.030,
      area: 0.0060,
      Cd0: 0.60,
      crO: 0.16,
      col: 0xfef9c3,
      shape: 'shuttlecock',
      texture: 'shuttlecock',
      dims: [0.067, 0.090, 0.067],
      inertia: boxInertia(0.067, 0.090, 0.067, 0.005),
      aero: { model: 'shuttlecock', refAxis: 'y', cp: [0, 0.020, 0], chord: 0.090, spinLift: 0.0, useCurve: false },
      ground: { mode: 'flat', muS: 1.3, muK: 1.3, muR: 5.0, bounce: 0.10, settle: 8.0, yawDamp: 6.0 }
    },
    frisbee: {
      label: 'Frisbee',
      mass: 0.175,
      r: 0.135,
      area: Math.PI * 0.135 * 0.135,
      Cd0: 0.18,
      crO: 0.32,
      col: 0x38bdf8,
      shape: 'disc',
      texture: 'frisbee',
      dims: [0.270, 0.024, 0.270],
      inertia: discInertia(0.135, 0.024, 0.175),
      aero: { model: 'disc', refAxis: 'y', cp: [0, 0.003, 0], chord: 0.270, spinLift: 0.0, useCurve: false },
      ground: { mode: 'disc', muS: 0.70, muK: 0.60, muR: 2.20, bounce: 0.35, settle: 5.0, yawDamp: 5.5 }
    },
    crate: {
      label: 'Wooden Crate',
      mass: 2.800,
      r: 0.180,
      area: 0.1300,
      Cd0: 1.05,
      crO: 0.24,
      col: 0x8b5a2b,
      shape: 'box',
      texture: 'crate',
      stretch: [1.18, 1.18, 1.18],
      dims: [0.425, 0.425, 0.425],
      inertia: boxInertia(0.425, 0.425, 0.425, 2.800),
      aero: { model: 'box', refAxis: 'y', cp: [0, 0.030, 0], chord: 0.425, spinLift: 0.0, useCurve: false },
      ground: { mode: 'skid', muS: 1.35, muK: 1.30, muR: 4.5, bounce: 0.22, settle: 7.0, yawDamp: 5.0 }
    },
    brick: {
      label: 'Brick',
      mass: 3.200,
      r: 0.145,
      area: 0.0300,
      Cd0: 1.10,
      crO: 0.18,
      col: 0xb45309,
      shape: 'brick',
      texture: 'brick',
      dims: [0.225, 0.090, 0.120],
      inertia: boxInertia(0.225, 0.090, 0.120, 3.200),
      aero: { model: 'box', refAxis: 'y', cp: [0, 0.012, 0], chord: 0.225, spinLift: 0.0, useCurve: false },
      ground: { mode: 'skid', muS: 1.45, muK: 1.35, muR: 5.5, bounce: 0.16, settle: 8.0, yawDamp: 6.0 }
    }
  };

  const SURFACES = {
    grass: { mu_s: 0.35, mu_k: 0.28, mu_r: 0.025, cr: 0.55, tint: 0x18231b, accent: 0x4d6551 },
    concrete: { mu_s: 0.65, mu_k: 0.55, mu_r: 0.008, cr: 0.72, tint: 0x2d3139, accent: 0x6b7280 },
    hardwood: { mu_s: 0.55, mu_k: 0.48, mu_r: 0.010, cr: 0.76, tint: 0x4b2f1f, accent: 0xa46a3f },
    sand: { mu_s: 0.45, mu_k: 0.35, mu_r: 0.050, cr: 0.20, tint: 0x5c4724, accent: 0xc8a96d },
    ice: { mu_s: 0.08, mu_k: 0.05, mu_r: 0.003, cr: 0.42, tint: 0x123047, accent: 0x84ccff },
    water: { mu_s: 0.20, mu_k: 0.15, mu_r: 0.040, cr: 0.10, tint: 0x0b2740, accent: 0x4ab3ff }
  };

  const PRESETS = {
    baseline: { obj: 'soccer', surf: 'grass', wind: { speed: 20, azim: 90, elev: 0, turb: 20, gust: 30, mode: 'uniform', modeStrength: 35 }, launch: { h0: 3, vx: 0, vy: 0, vz: 0, omx: 0, omy: 0, omz: 0 }, altitude: 0, world: { ceiling: 220, halfWidth: 120, halfDepth: 120 }, visuals: { pCount: 320, pSize: 0.13, trailLen: 700 }, simRate: 1.00, seed: 1337, cam: { follow: true, distance: 28, yaw: -23, pitch: 49, fov: 52, lag: 0.08 } },
    crosswind: { obj: 'soccer', surf: 'hardwood', wind: { speed: 26, azim: 60, elev: 4, turb: 15, gust: 20, mode: 'uniform', modeStrength: 30 }, launch: { h0: 1.4, vx: 12, vy: 10, vz: 0, omx: 0, omy: 8, omz: 5 }, altitude: 200, world: { ceiling: 240, halfWidth: 120, halfDepth: 120 }, visuals: { pCount: 360, pSize: 0.14, trailLen: 900 }, simRate: 1.00, seed: 2048, cam: { follow: true, distance: 26, yaw: -20, pitch: 45, fov: 50, lag: 0.07 } },
    storm: { obj: 'umbrella', surf: 'concrete', wind: { speed: 44, azim: 135, elev: 18, turb: 58, gust: 85, mode: 'gustfront', modeStrength: 82 }, launch: { h0: 9, vx: 0, vy: 0, vz: 0, omx: 0, omy: 0, omz: 0 }, altitude: 400, world: { ceiling: 320, halfWidth: 130, halfDepth: 130 }, visuals: { pCount: 620, pSize: 0.18, trailLen: 1100 }, simRate: 1.00, seed: 9001, cam: { follow: true, distance: 38, yaw: -35, pitch: 53, fov: 56, lag: 0.09 } },
    highalt: { obj: 'pingpong', surf: 'ice', wind: { speed: 18, azim: 315, elev: 6, turb: 12, gust: 10, mode: 'shear', modeStrength: 55 }, launch: { h0: 6, vx: 4, vy: 3, vz: 0, omx: 0, omy: 2, omz: 4 }, altitude: 6500, world: { ceiling: 360, halfWidth: 140, halfDepth: 140 }, visuals: { pCount: 260, pSize: 0.12, trailLen: 850 }, simRate: 0.85, seed: 4242, cam: { follow: true, distance: 30, yaw: -28, pitch: 52, fov: 54, lag: 0.08 } },
    spinlab: { obj: 'frisbee', surf: 'grass', wind: { speed: 14, azim: 110, elev: 8, turb: 10, gust: 5, mode: 'uniform', modeStrength: 20 }, launch: { h0: 1.6, vx: 14, vy: 4, vz: 2, omx: 2, omy: 10, omz: 18 }, altitude: 0, world: { ceiling: 260, halfWidth: 120, halfDepth: 120 }, visuals: { pCount: 280, pSize: 0.12, trailLen: 1000 }, simRate: 1.00, seed: 7781, cam: { follow: true, distance: 24, yaw: -16, pitch: 42, fov: 48, lag: 0.06 } },
    freight: { obj: 'crate', surf: 'concrete', wind: { speed: 32, azim: 180, elev: -6, turb: 35, gust: 30, mode: 'tunnel', modeStrength: 65 }, launch: { h0: 14, vx: -6, vy: 0, vz: 0, omx: 1, omy: 0, omz: 0 }, altitude: 500, world: { ceiling: 340, halfWidth: 140, halfDepth: 140 }, visuals: { pCount: 400, pSize: 0.15, trailLen: 1000 }, simRate: 1.00, seed: 5120, cam: { follow: true, distance: 34, yaw: -30, pitch: 50, fov: 55, lag: 0.08 } },
    vortexlab: { obj: 'leaf', surf: 'grass', wind: { speed: 16, azim: 90, elev: 0, turb: 18, gust: 12, mode: 'vortex', modeStrength: 75 }, launch: { h0: 5, vx: 2, vy: 0, vz: 0, omx: 0, omy: 0, omz: 3 }, altitude: 0, world: { ceiling: 240, halfWidth: 120, halfDepth: 120 }, visuals: { pCount: 360, pSize: 0.14, trailLen: 900 }, simRate: 1.00, seed: 6011, cam: { follow: true, distance: 30, yaw: -30, pitch: 52, fov: 52, lag: 0.08 } },
    waketest: { obj: 'shuttlecock', surf: 'hardwood', wind: { speed: 28, azim: 90, elev: 0, turb: 22, gust: 18, mode: 'wake', modeStrength: 70 }, launch: { h0: 2.2, vx: 8, vy: 6, vz: 0, omx: 0, omy: 0, omz: 0 }, altitude: 0, world: { ceiling: 220, halfWidth: 120, halfDepth: 120 }, visuals: { pCount: 320, pSize: 0.13, trailLen: 850 }, simRate: 1.00, seed: 8128, cam: { follow: true, distance: 26, yaw: -20, pitch: 46, fov: 50, lag: 0.07 } }
  };

  const VALIDATION_CASES = {
    golf_drag_crisis: {
      label: 'Golf Drag Crisis',
      duration: 2.4,
      preset: { obj: 'golf', surf: 'hardwood', wind: { speed: 0, azim: 90, elev: 0, turb: 0, gust: 0, mode: 'uniform', modeStrength: 0 }, launch: { h0: 1.0, vx: 52, vy: 0, vz: 0, omx: 0, omy: 0, omz: 0 }, altitude: 0, world: { ceiling: 120, halfWidth: 120, halfDepth: 60 }, visuals: { pCount: 120, pSize: 0.11, trailLen: 500 }, simRate: 1.00, seed: 1776 },
      checks: [
        { metric: 'minCd', min: 0.18, max: 0.30, label: 'drag crisis Cd window' },
        { metric: 'maxRe', min: 70000, max: 500000, label: 'Reynolds regime reached' }
      ]
    },
    frisbee_glide: {
      label: 'Frisbee Glide',
      duration: 4.5,
      preset: { obj: 'frisbee', surf: 'grass', wind: { speed: 0, azim: 90, elev: 0, turb: 0, gust: 0, mode: 'uniform', modeStrength: 0 }, launch: { h0: 1.5, vx: 14, vy: 3.5, vz: 0, omx: 0, omy: 8, omz: 18 }, altitude: 0, world: { ceiling: 80, halfWidth: 140, halfDepth: 80 }, visuals: { pCount: 120, pSize: 0.11, trailLen: 700 }, simRate: 1.00, seed: 2026 },
      checks: [
        { metric: 'glideRatio', min: 2.0, max: 8.5, label: 'glide ratio' },
        { metric: 'meanCl', min: 0.15, max: 1.10, label: 'disc lift window' }
      ]
    },
    shuttlecock_stability: {
      label: 'Shuttlecock Stability',
      duration: 2.2,
      preset: { obj: 'shuttlecock', surf: 'hardwood', wind: { speed: 0, azim: 90, elev: 0, turb: 0, gust: 0, mode: 'uniform', modeStrength: 0 }, launch: { h0: 1.8, vx: 18, vy: 3, vz: 0, omx: 0, omy: 0, omz: 0 }, altitude: 0, world: { ceiling: 80, halfWidth: 120, halfDepth: 80 }, visuals: { pCount: 120, pSize: 0.11, trailLen: 600 }, simRate: 1.00, seed: 2027 },
      checks: [
        { metric: 'finalAoA', min: 0, max: 18, label: 'terminal alignment angle' },
        { metric: 'meanCd', min: 0.50, max: 0.70, label: 'shuttlecock Cd band' }
      ]
    },
    brick_settle: {
      label: 'Brick Settle',
      duration: 3.2,
      preset: { obj: 'brick', surf: 'concrete', wind: { speed: 0, azim: 90, elev: 0, turb: 0, gust: 0, mode: 'uniform', modeStrength: 0 }, launch: { h0: 0.8, vx: 6, vy: 0, vz: 0, omx: 0, omy: 0, omz: 3 }, altitude: 0, world: { ceiling: 20, halfWidth: 80, halfDepth: 40 }, visuals: { pCount: 80, pSize: 0.10, trailLen: 500 }, simRate: 1.00, seed: 2028 },
      checks: [
        { metric: 'rollAngle', min: 0, max: 22, label: 'resting roll angle' },
        { metric: 'travel', min: 0.5, max: 8.0, label: 'skid distance' }
      ]
    }
  };

  window.WindSimData = {
    TAU: TAU,
    RHO0: RHO0,
    GRAV: GRAV,
    MU_AIR: MU_AIR,
    SUB: SUB,
    TRATE: TRATE,
    PART_MAX: PART_MAX,
    TRAIL_MAX: TRAIL_MAX,
    FLOOR_SIZE: FLOOR_SIZE,
    FLOOR_STEP: FLOOR_STEP,
    FLOOR_TILE: FLOOR_TILE,
    BEAUFORT_LABELS: BEAUFORT_LABELS,
    BEAUFORT_T: BEAUFORT_T,
    COMPASS16: COMPASS16,
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_WORLD: DEFAULT_WORLD,
    DEFAULT_ANALYSIS: DEFAULT_ANALYSIS,
    WIND_MODES: WIND_MODES,
    OBJ_DEFS: OBJ_DEFS,
    SURFACES: SURFACES,
    PRESETS: PRESETS,
    VALIDATION_CASES: VALIDATION_CASES
  };
}());
