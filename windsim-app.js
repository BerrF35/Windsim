(function () {
  'use strict';

  const D = window.WindSimData;
  const P = window.WindSimPhysics;
  const S = window.WindSimSolvers;
  const UI = window.WindSimUI;
  const V3 = THREE.Vector3;

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function num(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toRad(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.abs(value) <= Math.PI * 2.05 ? value : THREE.MathUtils.degToRad(value);
  }

  function hex(hexValue) {
    return '#' + hexValue.toString(16).padStart(6, '0');
  }

  const SURFACE_WORLD_TILE = 32;
  const GRID_WORLD_TILE = 40;
  const PLAYBACK_MAX_FRAMES = 6000;

  function rgbFromHex(hexValue) {
    return {
      r: (hexValue >> 16) & 255,
      g: (hexValue >> 8) & 255,
      b: hexValue & 255
    };
  }

  function mixRgb(a, b, t) {
    return {
      r: Math.round(THREE.MathUtils.lerp(a.r, b.r, t)),
      g: Math.round(THREE.MathUtils.lerp(a.g, b.g, t)),
      b: Math.round(THREE.MathUtils.lerp(a.b, b.b, t))
    };
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
  }

  function copyVec3(target, source) {
    return target.set(source.x, source.y, source.z);
  }

  function lengthVec3(source) {
    return Math.hypot(source.x, source.y, source.z);
  }

  const SIM_COLORS = {
    drag: 0x5ad1ff,
    grav: 0xff8a4c,
    vel: 0xa8ff78,
    magnus: 0xc78bff,
    spin: 0xffd166,
    compare: 0xc8d3de,
    particles: 0x8faabd,
    ruler: 0x74d3ff,
    height: 0x8af5d1,
    impactFloor: 0xf59e0b,
    impactWall: 0x00d4ff,
    impactCeiling: 0xa78bfa
  };
  const SIM_COLOR_HEX = {
    drag: '#5AD1FF',
    grav: '#FF8A4C',
    vel: '#A8FF78',
    magnus: '#C78BFF',
    spin: '#FFD166',
    ruler: '#74D3FF'
  };

  function seedFromText(text) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function makeRng(seed) {
    let state = seed >>> 0;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normalizeScenario(source) {
    const cfg = S.getSolver('sandbox').makeConfigFromPreset('baseline');
    const src = source || {};

    cfg.solverKey = src.solverKey || src.solver || cfg.solverKey;
    if (src.testMode === 'mounted' || src.testMode === 'free') cfg.testMode = src.testMode;
    cfg.objKey = src.objKey || src.obj || cfg.objKey;
    cfg.surfKey = src.surfKey || src.surf || cfg.surfKey;
    cfg.altitude = num(src.altitude, cfg.altitude);
    cfg.seed = num(src.seed, cfg.seed);
    cfg.simRate = clamp(num(src.simRate, cfg.simRate), 0.05, 3.0);

    if (src.wind) Object.assign(cfg.wind, src.wind);
    if (src.launch) Object.assign(cfg.launch, src.launch);
    if (src.world) Object.assign(cfg.world, src.world);
    if (src.analysis) Object.assign(cfg.analysis, src.analysis);
    if (src.env) Object.assign(cfg.env, src.env);
    if (src.objectScale) cfg.objectScale = deepClone(src.objectScale);

    if (src.visuals) {
      if (Number.isFinite(src.visuals.pCount)) cfg.visuals.particleCount = src.visuals.pCount;
      if (Number.isFinite(src.visuals.particleCount)) cfg.visuals.particleCount = src.visuals.particleCount;
      if (Number.isFinite(src.visuals.pSize)) cfg.visuals.particleSize = src.visuals.pSize;
      if (Number.isFinite(src.visuals.particleSize)) cfg.visuals.particleSize = src.visuals.particleSize;
      if (Number.isFinite(src.visuals.trailLen)) cfg.visuals.trailMax = src.visuals.trailLen;
      if (Number.isFinite(src.visuals.trailMax)) cfg.visuals.trailMax = src.visuals.trailMax;
    }

    if (src.cam) {
      cfg.camera.follow = src.cam.follow != null ? !!src.cam.follow : cfg.camera.follow;
      cfg.camera.distance = num(src.cam.distance, cfg.camera.distance);
      cfg.camera.yaw = THREE.MathUtils.degToRad(num(src.cam.yaw, THREE.MathUtils.radToDeg(cfg.camera.yaw)));
      cfg.camera.pitch = THREE.MathUtils.degToRad(num(src.cam.pitch, THREE.MathUtils.radToDeg(cfg.camera.pitch)));
      cfg.camera.fov = num(src.cam.fov, cfg.camera.fov);
      cfg.camera.lag = num(src.cam.lag, cfg.camera.lag);
    } else if (src.camera) {
      cfg.camera.follow = src.camera.follow != null ? !!src.camera.follow : cfg.camera.follow;
      cfg.camera.distance = num(src.camera.distance, cfg.camera.distance);
      cfg.camera.yaw = toRad(num(src.camera.yaw, cfg.camera.yaw));
      cfg.camera.pitch = toRad(num(src.camera.pitch, cfg.camera.pitch));
      cfg.camera.fov = num(src.camera.fov, cfg.camera.fov);
      cfg.camera.lag = num(src.camera.lag, cfg.camera.lag);
    }

    cfg.wind.azim = P.wrap360(cfg.wind.azim);
    cfg.wind.modeStrength = clamp(cfg.wind.modeStrength, 0, 100);
    cfg.visuals.particleCount = Math.round(clamp(cfg.visuals.particleCount, 0, D.PART_MAX));
    cfg.visuals.particleSize = clamp(cfg.visuals.particleSize, 0.03, 1.0);
    cfg.visuals.trailMax = Math.round(clamp(cfg.visuals.trailMax, 20, D.TRAIL_MAX));
    cfg.world.halfWidth = clamp(cfg.world.halfWidth, 10, 320);
    cfg.world.halfDepth = clamp(cfg.world.halfDepth, 10, 320);
    cfg.world.ceiling = clamp(cfg.world.ceiling, 6, 600);
    cfg.camera.distance = clamp(cfg.camera.distance, 4, 140);
    cfg.camera.pitch = clamp(cfg.camera.pitch, THREE.MathUtils.degToRad(5), THREE.MathUtils.degToRad(88));
    cfg.camera.fov = clamp(cfg.camera.fov, 25, 100);
    cfg.camera.lag = clamp(cfg.camera.lag, 0.01, 0.4);
    if (!S.hasSolver(cfg.solverKey)) cfg.solverKey = 'sandbox';
    if (!cfg.objectScale) cfg.objectScale = { x: 1, y: 1, z: 1 };
    return cfg;
  }

  const tmpA = new V3();
  const tmpB = new V3();
  const tmpC = new V3();
  const tmpD = new V3();

  const defaultSolver = S.getSolver('sandbox');

  const app = {
    solver: defaultSolver,
    cfg: defaultSolver.makeConfigFromPreset('baseline'),
    currentPresetName: 'baseline',
    savedScenarios: [],
    state: {
      paused: false,
      time: 0,
      telemetry: [],
      lastTelemetry: -1,
      impacts: [],
      forceHistory: [],
      currentTrail: [],
      comparisonTrail: [],
      validation: null,
      body: null,
      playback: {
        frames: [],
        active: false,
        playing: false,
        frameIndex: -1,
        cursorTime: 0,
        lastCaptureTime: -1
      }
    },
    render: {
      mainEl: $('main'),
      scene: null,
      camera: null,
      renderer: null,
      lights: {},
      surfaceTexCache: new Map(),
      objectTexCache: new Map(),
      objectPivot: null,
      activeModel: null,
      groundGroup: null,
      groundMat: null,
      groundOverlayMat: null,
      chamberGroup: null,
      chamberLines: null,
      trailGeo: null,
      trailLine: null,
      trailPos: null,
      trailCol: null,
      compareGeo: null,
      compareLine: null,
      comparePos: null,
      particleGeo: null,
      particleMat: null,
      particlePoints: null,
      particlePositions: null,
      particles: [],
      arrows: {},
      arrowState: {
        drag: { tip: new V3(), visible: false },
        grav: { tip: new V3(), visible: false },
        vel: { tip: new V3(), visible: false },
        magnus: { tip: new V3(), visible: false },
        spin: { tip: new V3(), visible: false }
      },
      rulerGeo: null,
      rulerLine: null,
      rulerPositions: new Float32Array(6),
      heightGeo: null,
      heightLine: null,
      heightPositions: new Float32Array(6),
      impactGroup: null,
      lastImpactStamp: '',
      bodyWind: new V3(),
      focus: new V3(0, 2, 0),
      target: new V3(0, 2, 0),
      pan: new V3(0, 2, 0),
      forward: new V3(),
      right: new V3(),
      viewDir: new V3(),
      anchor: new V3(),
      dragMode: null,
      dragPos: { x: 0, y: 0 },
      keysDown: new Set(),
      lastTs: 0,
      lastDt: 1 / 60
    },
    ui: null
  };

  function bindSolver(solverKey) {
    const solver = S.getSolver(solverKey);
    app.solver = solver;
    if (app.cfg) app.cfg.solverKey = solver.key;
    return solver;
  }

  function resetPlaybackState() {
    app.state.playback.frames = [];
    app.state.playback.active = false;
    app.state.playback.playing = false;
    app.state.playback.frameIndex = -1;
    app.state.playback.cursorTime = 0;
    app.state.playback.lastCaptureTime = -1;
  }

  function snapshotVec3(source) {
    return { x: source.x, y: source.y, z: source.z };
  }

  function snapshotQuat(source) {
    return { x: source.x, y: source.y, z: source.z, w: source.w };
  }

  function snapshotBody(body) {
    return {
      pos: snapshotVec3(body.pos),
      vel: snapshotVec3(body.vel),
      q: snapshotQuat(body.q),
      omegaBody: snapshotVec3(body.omegaBody),
      omegaWorld: snapshotVec3(body.omegaWorld),
      acc: snapshotVec3(body.acc),
      launchPos: snapshotVec3(body.launchPos),
      supportY: body.supportY,
      metrics: Object.assign({}, body.metrics),
      forces: {
        drag: snapshotVec3(body.forces.drag),
        lift: snapshotVec3(body.forces.lift),
        side: snapshotVec3(body.forces.side),
        magnus: snapshotVec3(body.forces.magnus),
        gravity: snapshotVec3(body.forces.gravity),
        net: snapshotVec3(body.forces.net)
      }
    };
  }

  function capturePlaybackFrame(force) {
    const playback = app.state.playback;
    const body = app.state.body;
    if (!body) return;
    if (!force && playback.lastCaptureTime >= 0 && app.state.time - playback.lastCaptureTime < 1 / D.TRATE) return;

    const frame = {
      time: app.state.time,
      body: snapshotBody(body),
      energy: Object.assign({}, app.state.energy || { aeroWork: 0, contactLoss: 0 }),
      graph: {
        time: app.state.time,
        drag: body.metrics.drag,
        lift: body.metrics.lift,
        net: body.metrics.net,
        aoa: body.metrics.aoa
      }
    };

    playback.frames.push(frame);
    playback.lastCaptureTime = app.state.time;

    if (playback.frames.length > PLAYBACK_MAX_FRAMES) {
      playback.frames.shift();
      if (playback.active && playback.frameIndex > 0) playback.frameIndex -= 1;
    }

    if (!playback.active) {
      playback.frameIndex = playback.frames.length - 1;
      playback.cursorTime = frame.time;
    }
  }

  function currentPlaybackFrame() {
    const playback = app.state.playback;
    if (!playback.active || playback.frameIndex < 0 || playback.frameIndex >= playback.frames.length) return null;
    return playback.frames[playback.frameIndex];
  }

  function displayBody() {
    const frame = currentPlaybackFrame();
    return frame ? frame.body : app.state.body;
  }

  function displayEnergy() {
    const frame = currentPlaybackFrame();
    return frame ? frame.energy : app.state.energy;
  }

  function displayTime() {
    const frame = currentPlaybackFrame();
    return frame ? frame.time : app.state.time;
  }

  function displayForceHistory() {
    const playback = app.state.playback;
    if (!playback.active) return app.state.forceHistory;
    return playback.frames.slice(0, playback.frameIndex + 1).map(function (frame) {
      return frame.graph;
    });
  }

  function displayImpacts() {
    const frame = currentPlaybackFrame();
    if (!frame) return app.state.impacts;
    return app.state.impacts.filter(function (impact) {
      return impact.time <= frame.time;
    });
  }

  function setPlaybackFrameIndex(index) {
    const playback = app.state.playback;
    if (!playback.frames.length) {
      playback.frameIndex = -1;
      playback.cursorTime = 0;
      return;
    }
    playback.frameIndex = clamp(index, 0, playback.frames.length - 1);
    playback.cursorTime = playback.frames[playback.frameIndex].time;
  }

  function enterPlayback(index) {
    const playback = app.state.playback;
    if (!playback.frames.length) return;
    app.state.paused = true;
    playback.active = true;
    playback.playing = false;
    setPlaybackFrameIndex(index == null ? playback.frames.length - 1 : index);
  }

  function exitPlayback() {
    const playback = app.state.playback;
    playback.active = false;
    playback.playing = false;
    if (playback.frames.length) {
      playback.frameIndex = playback.frames.length - 1;
      playback.cursorTime = playback.frames[playback.frameIndex].time;
    } else {
      playback.frameIndex = -1;
      playback.cursorTime = 0;
    }
  }

  function scrubPlayback(index) {
    if (!app.state.playback.frames.length) return;
    if (!app.state.playback.active) enterPlayback(index);
    else setPlaybackFrameIndex(index);
  }

  function stepPlayback(delta) {
    if (!app.state.playback.frames.length) return;
    if (!app.state.playback.active) enterPlayback(app.state.playback.frames.length - 1);
    app.state.playback.playing = false;
    setPlaybackFrameIndex(app.state.playback.frameIndex + delta);
  }

  function jumpPlaybackLatest() {
    if (!app.state.playback.frames.length) return;
    if (!app.state.playback.active) enterPlayback(app.state.playback.frames.length - 1);
    app.state.playback.playing = false;
    setPlaybackFrameIndex(app.state.playback.frames.length - 1);
  }

  function togglePlaybackRun() {
    const playback = app.state.playback;
    if (!playback.frames.length) return;
    if (!playback.active) {
      enterPlayback(playback.frameIndex >= 0 ? playback.frameIndex : 0);
    }
    if (playback.frameIndex >= playback.frames.length - 1) setPlaybackFrameIndex(0);
    playback.playing = !playback.playing;
  }

  function updatePlayback(dt) {
    const playback = app.state.playback;
    if (!playback.active || !playback.playing || playback.frames.length < 2) return;
    playback.cursorTime += dt;
    while (playback.frameIndex < playback.frames.length - 1 && playback.frames[playback.frameIndex + 1].time <= playback.cursorTime) {
      playback.frameIndex += 1;
    }
    if (playback.frameIndex >= playback.frames.length - 1) {
      playback.frameIndex = playback.frames.length - 1;
      playback.cursorTime = playback.frames[playback.frameIndex].time;
      playback.playing = false;
    }
  }

  function currentDef() {
    return app.solver.resolveObjectDef(app.cfg.objKey, app.cfg);
  }

  function makeCanvasTexture(cache, key, painter) {
    if (cache.has(key)) return cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    painter(ctx, 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(8, app.render.renderer.capabilities.getMaxAnisotropy());
    cache.set(key, texture);
    return texture;
  }

  function drawNoiseDots(ctx, size, rng, count, color, alphaMin, alphaMax, radius) {
    for (let i = 0; i < count; i += 1) {
      ctx.globalAlpha = alphaMin + rng() * (alphaMax - alphaMin);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, radius * (0.45 + rng() * 0.9), 0, D.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function layeredNoise(u, v, seed) {
    const phase = (seed % 997) * 0.013;
    const n1 = Math.sin(D.TAU * (u + v * 0.35) + phase);
    const n2 = Math.cos(D.TAU * (u * 2 - v * 3) - phase * 1.7);
    const n3 = Math.sin(D.TAU * ((u + v) * 5) + phase * 0.6);
    const n4 = Math.cos(D.TAU * (u * 9 - v * 7) + phase * 2.3);
    return clamp(0.5 + 0.5 * (n1 * 0.42 + n2 * 0.28 + n3 * 0.20 + n4 * 0.10), 0, 1);
  }

  function surfaceMaterialProps(type) {
    switch (type) {
      case 'hardwood':
        return { roughness: 0.78, metalness: 0.04 };
      case 'ice':
        return { roughness: 0.18, metalness: 0.08 };
      case 'water':
        return { roughness: 0.12, metalness: 0.18 };
      case 'sand':
        return { roughness: 1.0, metalness: 0.0 };
      case 'grass':
        return { roughness: 0.98, metalness: 0.01 };
      default:
        return { roughness: 0.94, metalness: 0.02 };
    }
  }

  function getSurfaceTexture(type) {
    const surf = D.SURFACES[type];
    const texture = makeCanvasTexture(app.render.surfaceTexCache, 'surface-' + type, function (ctx, size) {
      const base = rgbFromHex(surf.tint);
      const accent = rgbFromHex(surf.accent);
      const light = mixRgb(base, { r: 238, g: 243, b: 248 }, 0.16);
      const dark = mixRgb(base, { r: 10, g: 12, b: 16 }, 0.28);
      const seed = seedFromText('surface:' + type);
      const image = ctx.createImageData(size, size);
      const data = image.data;

      for (let y = 0; y < size; y += 1) {
        const v = y / (size - 1);
        for (let x = 0; x < size; x += 1) {
          const u = x / (size - 1);
          const coarse = layeredNoise(u, v, seed);
          const fine = layeredNoise(u, v, seed + 73);
          const ridge = 0.5 + 0.5 * Math.sin(D.TAU * (u * 6 - v * 4) + fine * 2.8);
          let rgb = base;

          switch (type) {
            case 'grass':
              rgb = mixRgb(dark, accent, clamp(0.08 + coarse * 0.18 + ridge * 0.05, 0, 1));
              break;
            case 'concrete':
              rgb = mixRgb(mixRgb(base, light, 0.12), { r: 222, g: 228, b: 236 }, clamp(0.04 + coarse * 0.14 + fine * 0.08, 0, 0.22));
              break;
            case 'hardwood': {
              const board = Math.floor(u * 8) % 2;
              const boardTone = board ? 0.18 : 0.06;
              rgb = mixRgb(dark, light, clamp(boardTone + coarse * 0.30 + ridge * 0.10, 0, 1));
              break;
            }
            case 'sand':
              rgb = mixRgb(dark, light, clamp(0.20 + coarse * 0.42 + ridge * 0.20, 0, 1));
              break;
            case 'ice': {
              const frost = clamp(0.28 + coarse * 0.28 + fine * 0.18, 0, 1);
              rgb = mixRgb(base, { r: 201, g: 231, b: 246 }, frost);
              break;
            }
            case 'water': {
              const ripple = 0.5 + 0.5 * Math.sin(D.TAU * (u * 7 + v * 2) + fine * 3.4);
              rgb = mixRgb(dark, accent, clamp(0.16 + coarse * 0.30 + ripple * 0.24, 0, 1));
              break;
            }
            default:
              rgb = mixRgb(base, accent, coarse * 0.35);
              break;
          }

          const idx = (y * size + x) * 4;
          data[idx] = rgb.r;
          data[idx + 1] = rgb.g;
          data[idx + 2] = rgb.b;
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (type === 'grass') {
        ctx.strokeStyle = rgba(mixRgb(accent, light, 0.10), 0.02);
        ctx.lineWidth = 1.0;
        for (let i = 0; i < 22; i += 1) {
          const x0 = i * size / 22;
          ctx.beginPath();
          for (let y = 0; y <= size; y += 18) {
            const px = x0 + Math.sin((y / size) * D.TAU * 2 + i * 0.7) * 8;
            if (y === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
          }
          ctx.stroke();
        }
      } else if (type === 'concrete') {
        ctx.strokeStyle = 'rgba(230,236,242,0.08)';
        ctx.lineWidth = 2.4;
        [0.28, 0.67].forEach(function (baseLine, index) {
          ctx.beginPath();
          for (let x = 0; x <= size; x += 12) {
            const y = size * (baseLine + 0.035 * Math.sin(D.TAU * (x / size) * (index + 1)) + 0.012 * Math.sin(D.TAU * (x / size) * 5));
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        });
      } else if (type === 'hardwood') {
        ctx.strokeStyle = 'rgba(248,235,214,0.14)';
        ctx.lineWidth = 3;
        for (let x = 0; x <= size; x += size / 8) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(72,42,18,0.16)';
        ctx.lineWidth = 1.6;
        for (let row = 0; row < 7; row += 1) {
          const y0 = (row + 0.5) * size / 8;
          ctx.beginPath();
          for (let x = 0; x <= size; x += 14) {
            const y = y0 + Math.sin(D.TAU * (x / size) * 3 + row * 0.8) * 6;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (type === 'sand') {
        ctx.strokeStyle = 'rgba(255,235,200,0.09)';
        ctx.lineWidth = 1.8;
        for (let row = 0; row < 18; row += 1) {
          const y0 = row * size / 18;
          ctx.beginPath();
          for (let x = 0; x <= size; x += 12) {
            const y = y0 + Math.sin(D.TAU * (x / size) * 2 + row * 0.4) * 3.8;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (type === 'ice') {
        ctx.strokeStyle = 'rgba(248,252,255,0.14)';
        ctx.lineWidth = 2;
        for (let crack = 0; crack < 5; crack += 1) {
          const x0 = crack * size / 5;
          ctx.beginPath();
          for (let y = 0; y <= size; y += 14) {
            const x = x0 + Math.sin(D.TAU * (y / size) * 2 + crack) * 18 + Math.cos(D.TAU * (y / size) * 4) * 6;
            if (y === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (type === 'water') {
        ctx.strokeStyle = 'rgba(240,248,255,0.13)';
        ctx.lineWidth = 1.8;
        for (let row = 0; row < 14; row += 1) {
          const y0 = row * size / 14;
          ctx.beginPath();
          for (let x = 0; x <= size; x += 10) {
            const y = y0 + Math.sin(D.TAU * (x / size) * 3 + row * 0.45) * 5 + Math.sin(D.TAU * (x / size) * 9 + row) * 1.5;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(D.FLOOR_SIZE / SURFACE_WORLD_TILE, D.FLOOR_SIZE / SURFACE_WORLD_TILE);
    return texture;
  }

  function getGridOverlayTexture() {
    const texture = makeCanvasTexture(app.render.surfaceTexCache, 'surface-overlay', function (ctx, size) {
      ctx.clearRect(0, 0, size, size);
      for (let i = 0; i <= 8; i += 1) {
        const p = i * size / 8;
        const major = i % 4 === 0;
        ctx.strokeStyle = major ? 'rgba(172,187,203,0.12)' : 'rgba(123,138,153,0.07)';
        ctx.lineWidth = major ? 2.0 : 1.0;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.stroke();
      }
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(D.FLOOR_SIZE / GRID_WORLD_TILE, D.FLOOR_SIZE / GRID_WORLD_TILE);
    return texture;
  }

  function getObjectTexture(name, baseColor) {
    return makeCanvasTexture(app.render.objectTexCache, 'object-' + name, function (ctx, size) {
      const rng = makeRng(seedFromText('object:' + name));
      switch (name) {
        case 'soccer':
          ctx.fillStyle = '#f7fafc';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = '#14181d';
          [[128, 116], [260, 72], [388, 124], [106, 286], [260, 246], [408, 304], [210, 408], [334, 426]].forEach(function (pt) {
            ctx.beginPath();
            for (let i = 0; i < 5; i += 1) {
              const ang = -Math.PI / 2 + i * D.TAU / 5;
              const px = pt[0] + Math.cos(ang) * 34;
              const py = pt[1] + Math.sin(ang) * 34;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          });
          break;
        case 'tennis':
          ctx.fillStyle = '#b8f45d';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.arc(size * 0.22, size * 0.45, size * 0.42, -0.5, 1.55);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(size * 0.78, size * 0.55, size * 0.42, 2.64, 4.7);
          ctx.stroke();
          drawNoiseDots(ctx, size, rng, 1400, '#f0fdf4', 0.02, 0.06, 1.1);
          break;
        case 'basketball':
          ctx.fillStyle = '#e56f10';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#2a1409';
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.moveTo(size * 0.5, 0);
          ctx.lineTo(size * 0.5, size);
          ctx.moveTo(0, size * 0.5);
          ctx.lineTo(size, size * 0.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(size * 0.1, size * 0.5, size * 0.48, -0.9, 0.9);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(size * 0.9, size * 0.5, size * 0.48, 2.24, 4.05);
          ctx.stroke();
          break;
        case 'cricket':
          ctx.fillStyle = '#b91c1c';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(size * 0.18, size * 0.42);
          ctx.bezierCurveTo(size * 0.35, size * 0.30, size * 0.65, size * 0.30, size * 0.82, size * 0.42);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(size * 0.18, size * 0.58);
          ctx.bezierCurveTo(size * 0.35, size * 0.70, size * 0.65, size * 0.70, size * 0.82, size * 0.58);
          ctx.stroke();
          break;
        case 'baseball':
          ctx.fillStyle = '#fef7df';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 7;
          for (let i = 0; i < 18; i += 1) {
            const y = 80 + i * 18;
            ctx.beginPath();
            ctx.arc(size * 0.22, y, 10, Math.PI * 0.2, Math.PI * 1.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(size * 0.78, y, 10, -Math.PI * 0.2, Math.PI * 0.8);
            ctx.stroke();
          }
          break;
        case 'pingpong':
          ctx.fillStyle = '#fcfdff';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = 'rgba(202,138,4,0.28)';
          ctx.font = 'bold 72px Barlow, sans-serif';
          ctx.fillText('40', size * 0.36, size * 0.56);
          break;
        case 'golf':
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, size, size);
          for (let y = 18; y < size; y += 24) {
            for (let x = 18 + ((y / 24) % 2) * 12; x < size; x += 24) {
              ctx.fillStyle = 'rgba(148,163,184,0.18)';
              ctx.beginPath();
              ctx.arc(x, y, 6, 0, D.TAU);
              ctx.fill();
            }
          }
          break;
        case 'volleyball':
          ctx.fillStyle = '#fff3c4';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#1d4ed8';
          ctx.lineWidth = 30;
          ctx.beginPath();
          ctx.arc(size * 0.2, size * 0.5, size * 0.55, -0.9, 0.9);
          ctx.stroke();
          ctx.strokeStyle = '#d97706';
          ctx.beginPath();
          ctx.arc(size * 0.78, size * 0.45, size * 0.45, 2.1, 4.05);
          ctx.stroke();
          break;
        case 'rugby':
          ctx.fillStyle = '#6f4625';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(size * 0.44, size * 0.42, size * 0.12, size * 0.16);
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 5;
          for (let i = 0; i < 8; i += 1) {
            const x = size * 0.46 + i * 10;
            ctx.beginPath();
            ctx.moveTo(x, size * 0.41);
            ctx.lineTo(x, size * 0.59);
            ctx.stroke();
          }
          break;
        case 'cannonball': {
          const steel = ctx.createRadialGradient(size * 0.34, size * 0.32, size * 0.04, size * 0.5, size * 0.5, size * 0.72);
          steel.addColorStop(0, '#9aa3b2');
          steel.addColorStop(1, '#29303a');
          ctx.fillStyle = steel;
          ctx.fillRect(0, 0, size, size);
          drawNoiseDots(ctx, size, rng, 900, '#e5e7eb', 0.02, 0.08, 1.8);
          break;
        }
        case 'paper':
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = 'rgba(59,130,246,0.16)';
          ctx.lineWidth = 3;
          for (let i = 0; i < 18; i += 1) {
            ctx.beginPath();
            ctx.moveTo(rng() * size, rng() * size);
            ctx.lineTo(rng() * size, rng() * size);
            ctx.stroke();
          }
          break;
        case 'leaf':
          ctx.clearRect(0, 0, size, size);
          ctx.fillStyle = '#fb923c';
          ctx.beginPath();
          ctx.moveTo(size * 0.5, size * 0.06);
          ctx.bezierCurveTo(size * 0.18, size * 0.22, size * 0.08, size * 0.54, size * 0.48, size * 0.92);
          ctx.bezierCurveTo(size * 0.92, size * 0.56, size * 0.82, size * 0.22, size * 0.5, size * 0.06);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#7c2d12';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(size * 0.5, size * 0.1);
          ctx.lineTo(size * 0.48, size * 0.88);
          ctx.stroke();
          break;
        case 'feather':
          ctx.clearRect(0, 0, size, size);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(size * 0.5, size * 0.06);
          ctx.lineTo(size * 0.5, size * 0.92);
          ctx.stroke();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 4;
          for (let i = 0; i < 22; i += 1) {
            const y = size * (0.12 + i * 0.033);
            const len = size * (0.10 + (1 - Math.abs(i - 11) / 11) * 0.22);
            ctx.beginPath();
            ctx.moveTo(size * 0.5, y);
            ctx.lineTo(size * 0.5 - len, y + 10);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(size * 0.5, y);
            ctx.lineTo(size * 0.5 + len * 0.55, y + 8);
            ctx.stroke();
          }
          break;
        case 'umbrella': {
          const umb = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.08, size * 0.5, size * 0.5, size * 0.5);
          umb.addColorStop(0, '#f5ede1');
          umb.addColorStop(1, '#5b7690');
          ctx.fillStyle = umb;
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = 'rgba(255,255,255,0.30)';
          ctx.lineWidth = 6;
          for (let i = 0; i < 8; i += 1) {
            const ang = i * D.TAU / 8;
            ctx.beginPath();
            ctx.moveTo(size * 0.5, size * 0.5);
            ctx.lineTo(size * 0.5 + Math.cos(ang) * size * 0.46, size * 0.5 + Math.sin(ang) * size * 0.46);
            ctx.stroke();
          }
          break;
        }
        case 'shuttlecock':
          ctx.fillStyle = '#fefce8';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = 'rgba(148,163,184,0.22)';
          ctx.lineWidth = 5;
          for (let i = 0; i < 12; i += 1) {
            const x = 34 + i * 38;
            ctx.beginPath();
            ctx.moveTo(x, 18);
            ctx.lineTo(size * 0.5, size - 22);
            ctx.stroke();
          }
          ctx.fillStyle = '#d97706';
          ctx.fillRect(0, size * 0.05, size, size * 0.08);
          break;
        case 'frisbee':
          ctx.fillStyle = '#4da4d8';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#10212f';
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.arc(size * 0.5, size * 0.5, size * 0.34, 0, D.TAU);
          ctx.stroke();
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(size * 0.5, size * 0.5, size * 0.17, 0, D.TAU);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.72)';
          ctx.fillRect(size * 0.16, size * 0.44, size * 0.68, size * 0.08);
          break;
        case 'crate':
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          for (let i = 0; i < 5; i += 1) ctx.fillRect(0, i * size / 5 + 12, size, 8);
          ctx.strokeStyle = '#5b3717';
          ctx.lineWidth = 16;
          ctx.strokeRect(22, 22, size - 44, size - 44);
          ctx.beginPath();
          ctx.moveTo(40, 40);
          ctx.lineTo(size - 40, size - 40);
          ctx.moveTo(size - 40, 40);
          ctx.lineTo(40, size - 40);
          ctx.stroke();
          break;
        case 'brick':
          ctx.fillStyle = '#b45309';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#f5d7b2';
          ctx.lineWidth = 8;
          for (let y = 0; y <= size; y += 96) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(size, y);
            ctx.stroke();
          }
          for (let y = 0; y < size; y += 96) {
            const off = (y / 96) % 2 ? 0 : 64;
            for (let x = off; x <= size; x += 128) {
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x, Math.min(size, y + 96));
              ctx.stroke();
            }
          }
          break;
        default:
          ctx.fillStyle = hex(baseColor);
          ctx.fillRect(0, 0, size, size);
          drawNoiseDots(ctx, size, rng, 220, '#ffffff', 0.03, 0.08, 2.1);
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 2;
          ctx.strokeRect(10, 10, size - 20, size - 20);
          break;
      }
    });
  }

  function objectMaterial(def, extra) {
    const options = extra || {};
    const profile = {
      cannonball: { roughness: 0.34, metalness: 0.72 },
      crate: { roughness: 0.92, metalness: 0.02 },
      brick: { roughness: 0.98, metalness: 0.01 },
      frisbee: { roughness: 0.38, metalness: 0.04 },
      paper: { roughness: 0.94, metalness: 0.0 },
      leaf: { roughness: 0.96, metalness: 0.0 },
      feather: { roughness: 0.98, metalness: 0.0 },
      umbrella: { roughness: 0.74, metalness: 0.02 },
      shuttlecock: { roughness: 0.88, metalness: 0.0 }
    }[def.texture || def.label.toLowerCase()] || {};
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: getObjectTexture(def.texture || def.label.toLowerCase(), def.col),
      roughness: options.roughness != null ? options.roughness : (profile.roughness != null ? profile.roughness : 0.7),
      metalness: options.metalness != null ? options.metalness : (profile.metalness != null ? profile.metalness : 0.08),
      transparent: !!options.transparent,
      alphaTest: options.alphaTest != null ? options.alphaTest : 0,
      side: options.side != null ? options.side : THREE.FrontSide
    });
  }

  function bendPlane(geometry, amount) {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * Math.PI) * amount + Math.cos(y * Math.PI * 0.5) * amount * 0.25);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  function buildObjectVisual(def) {
    const root = new THREE.Group();
    let mesh = null;

    switch (def.shape) {
      case 'sphere':
      case 'ellipsoid':
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 40), objectMaterial(def));
        break;
      case 'paperball':
        mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 2), objectMaterial(def, { roughness: 0.9 }));
        break;
      case 'disc':
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 40, 1), objectMaterial(def, { roughness: 0.42 }));
        break;
      case 'box':
      case 'brick':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), objectMaterial(def, { roughness: 0.85 }));
        break;
      case 'leaf':
      case 'feather':
        mesh = new THREE.Mesh(
          bendPlane(new THREE.PlaneGeometry(1, 1, 10, 16), def.shape === 'leaf' ? 0.08 : 0.05),
          objectMaterial(def, { transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.92 })
        );
        break;
      case 'umbrella': {
        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 30, 18, 0, D.TAU, 0, Math.PI * 0.58),
          objectMaterial(def, { side: THREE.DoubleSide, roughness: 0.76 })
        );
        canopy.position.y = 0.18;
        canopy.scale.y = 0.7;
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 1.28, 12),
          new THREE.MeshStandardMaterial({ color: 0x6b4a24, roughness: 0.82 })
        );
        shaft.position.y = -0.30;
        const hook = new THREE.Mesh(
          new THREE.TorusGeometry(0.12, 0.022, 8, 24, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0x6b4a24, roughness: 0.84 })
        );
        hook.rotation.z = Math.PI * 0.5;
        hook.position.set(0, -0.92, 0.08);
        root.add(canopy, shaft, hook);
        break;
      }
      case 'shuttlecock': {
        const cork = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 20, 20),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.76 })
        );
        cork.scale.y = 0.8;
        cork.position.y = -0.28;
        const skirt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.5, 0.94, 18, 1, true),
          objectMaterial(def, { side: THREE.DoubleSide, roughness: 0.88 })
        );
        skirt.position.y = 0.12;
        root.add(skirt, cork);
        break;
      }
      default:
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 24), objectMaterial(def));
        break;
    }

    if (mesh) root.add(mesh);
    if (def.shape === 'leaf' || def.shape === 'feather') root.scale.set(def.dims[0], def.dims[1], 1);
    else root.scale.set(def.dims[0], def.dims[1], def.dims[2]);

    root.traverse(function (child) {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return root;
  }

  function disposeObjectVisual(node) {
    node.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  function setObjectVisual() {
    if (app.render.activeModel) {
      app.render.objectPivot.remove(app.render.activeModel);
      disposeObjectVisual(app.render.activeModel);
    }
    app.render.activeModel = buildObjectVisual(currentDef());
    app.render.objectPivot.add(app.render.activeModel);
  }

  function refreshSurface() {
    const props = surfaceMaterialProps(app.cfg.surfKey);
    app.render.groundMat.map = getSurfaceTexture(app.cfg.surfKey);
    app.render.groundMat.roughness = props.roughness;
    app.render.groundMat.metalness = props.metalness;
    app.render.groundMat.needsUpdate = true;
  }

  function updateGround() {
    const body = displayBody();
    if (!body) return;
    const gx = Math.round(body.pos.x / D.FLOOR_STEP) * D.FLOOR_STEP;
    const gz = Math.round(body.pos.z / D.FLOOR_STEP) * D.FLOOR_STEP;
    app.render.groundGroup.position.set(gx, 0, gz);
    app.render.groundMat.map.offset.set(-gx / SURFACE_WORLD_TILE, -gz / SURFACE_WORLD_TILE);
    app.render.groundOverlayMat.map.offset.set(-gx / GRID_WORLD_TILE, -gz / GRID_WORLD_TILE);
  }

  function updateChamber() {
    if (app.render.chamberLines) {
      app.render.chamberGroup.remove(app.render.chamberLines);
      app.render.chamberLines.geometry.dispose();
      app.render.chamberLines.material.dispose();
    }
    app.render.chamberLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(app.cfg.world.halfWidth * 2, app.cfg.world.ceiling, app.cfg.world.halfDepth * 2)),
      new THREE.LineBasicMaterial({ color: 0x314654, transparent: true, opacity: 0.42 })
    );
    app.render.chamberLines.position.y = app.cfg.world.ceiling * 0.5;
    app.render.chamberGroup.add(app.render.chamberLines);
    $('scale-pill').textContent = 'GRID: 5 m | CHAMBER ' +
      (app.cfg.world.halfWidth * 2).toFixed(0) + ' x ' +
      (app.cfg.world.halfDepth * 2).toFixed(0) + ' x ' +
      app.cfg.world.ceiling.toFixed(0) + ' m';
  }

  function resizeRenderer() {
    const width = app.render.mainEl.clientWidth;
    const height = Math.max(1, app.render.mainEl.clientHeight);
    app.render.renderer.setSize(width, height);
    app.render.camera.aspect = width / height;
    app.render.camera.updateProjectionMatrix();
  }

  function setupRenderer() {
    const render = app.render;
    render.scene = new THREE.Scene();
    render.scene.background = new THREE.Color(0x091019);
    render.scene.fog = new THREE.Fog(0x091019, 180, 820);

    render.camera = new THREE.PerspectiveCamera(app.cfg.camera.fov, render.mainEl.clientWidth / Math.max(1, render.mainEl.clientHeight), 0.05, 3000);
    render.renderer = new THREE.WebGLRenderer({ antialias: true });
    render.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    render.renderer.setSize(render.mainEl.clientWidth, Math.max(1, render.mainEl.clientHeight));
    render.renderer.outputEncoding = THREE.sRGBEncoding;
    render.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    render.renderer.toneMappingExposure = 0.88;
    render.renderer.shadowMap.enabled = true;
    render.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    render.mainEl.insertBefore(render.renderer.domElement, render.mainEl.firstChild);

    const ambient = new THREE.AmbientLight(0x1c2832, 1.28);
    const dir = new THREE.DirectionalLight(0xeaf1f7, 1.18);
    dir.position.set(26, 38, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.left = -40;
    dir.shadow.camera.right = 40;
    dir.shadow.camera.top = 40;
    dir.shadow.camera.bottom = -40;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 180;
    const hemi = new THREE.HemisphereLight(0x556879, 0x070a0d, 0.58);
    const rim = new THREE.DirectionalLight(0x90afc9, 0.58);
    const fill = new THREE.PointLight(0x6f93b2, 0.22, 140);
    const point = new THREE.PointLight(0x89bad8, 0.48, 56);
    render.scene.add(ambient, dir, hemi, rim, fill, point, new THREE.AxesHelper(4));
    render.lights = { ambient: ambient, dir: dir, hemi: hemi, rim: rim, fill: fill, point: point };

    render.objectPivot = new THREE.Group();
    render.scene.add(render.objectPivot);

    render.groundGroup = new THREE.Group();
    render.groundMat = new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, map: getSurfaceTexture(app.cfg.surfKey) }, surfaceMaterialProps(app.cfg.surfKey)));
    render.groundOverlayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: getGridOverlayTexture(), transparent: true, opacity: 0.10, depthWrite: false });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(D.FLOOR_SIZE, D.FLOOR_SIZE), render.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(D.FLOOR_SIZE, D.FLOOR_SIZE), render.groundOverlayMat);
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.y = 0.02;
    const grid = new THREE.GridHelper(D.FLOOR_SIZE, Math.round(D.FLOOR_SIZE / 5), 0x334554, 0x141b23);
    grid.material.transparent = true;
    grid.material.opacity = 0.06;
    render.groundGroup.add(ground, overlay, grid);
    render.scene.add(render.groundGroup);

    render.chamberGroup = new THREE.Group();
    render.scene.add(render.chamberGroup);
  }

  function particleSpan() {
    return {
      x: Math.max(app.cfg.world.halfWidth * 1.2, app.cfg.camera.distance * 6.5, 110),
      y: Math.min(app.cfg.world.ceiling * 0.72, Math.max(26, app.cfg.camera.distance * 2.6)),
      z: Math.max(app.cfg.world.halfDepth * 1.2, app.cfg.camera.distance * 6.5, 110)
    };
  }

  function particleAnchor() {
    app.render.camera.getWorldDirection(app.render.viewDir);
    app.render.anchor
      .lerpVectors(app.render.camera.position, app.render.focus, app.cfg.camera.follow ? 0.38 : 0.18)
      .addScaledVector(app.render.viewDir, Math.max(18, app.cfg.camera.distance * 0.9));
    app.render.anchor.y = clamp(app.render.anchor.y, 4, Math.max(8, app.cfg.world.ceiling * 0.68));
    return app.render.anchor;
  }

  function spawnParticle() {
    const anchor = particleAnchor();
    const span = particleSpan();
    return {
      x: anchor.x + (Math.random() - 0.5) * span.x,
      y: clamp(anchor.y - span.y * 0.35 + Math.random() * span.y, 0.3, app.cfg.world.ceiling * 0.82),
      z: anchor.z + (Math.random() - 0.5) * span.z,
      life: Math.random(),
      maxLife: 2.2 + Math.random() * 2.8
    };
  }

  function initGeometryLayers() {
    app.render.trailPos = new Float32Array(D.TRAIL_MAX * 3);
    app.render.trailCol = new Float32Array(D.TRAIL_MAX * 3);
    app.render.trailGeo = new THREE.BufferGeometry();
    app.render.trailGeo.setAttribute('position', new THREE.BufferAttribute(app.render.trailPos, 3));
    app.render.trailGeo.setAttribute('color', new THREE.BufferAttribute(app.render.trailCol, 3));
    app.render.trailLine = new THREE.Line(app.render.trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
    app.render.trailLine.frustumCulled = false;
    app.render.scene.add(app.render.trailLine);

    app.render.comparePos = new Float32Array(D.TRAIL_MAX * 3);
    app.render.compareGeo = new THREE.BufferGeometry();
    app.render.compareGeo.setAttribute('position', new THREE.BufferAttribute(app.render.comparePos, 3));
    app.render.compareLine = new THREE.Line(app.render.compareGeo, new THREE.LineBasicMaterial({ color: SIM_COLORS.compare, transparent: true, opacity: 0.28 }));
    app.render.compareLine.frustumCulled = false;
    app.render.scene.add(app.render.compareLine);

    app.render.particlePositions = new Float32Array(D.PART_MAX * 3);
    app.render.particleGeo = new THREE.BufferGeometry();
    app.render.particleGeo.setAttribute('position', new THREE.BufferAttribute(app.render.particlePositions, 3));
    app.render.particleMat = new THREE.PointsMaterial({ color: SIM_COLORS.particles, size: app.cfg.visuals.particleSize, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending });
    app.render.particlePoints = new THREE.Points(app.render.particleGeo, app.render.particleMat);
    app.render.particlePoints.frustumCulled = false;
    app.render.scene.add(app.render.particlePoints);

    app.render.arrows.drag = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, SIM_COLORS.drag, 0.5, 0.3);
    app.render.arrows.grav = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, SIM_COLORS.grav, 0.5, 0.3);
    app.render.arrows.vel = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, SIM_COLORS.vel, 0.5, 0.3);
    app.render.arrows.magnus = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, SIM_COLORS.magnus, 0.5, 0.3);
    app.render.arrows.spin = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, SIM_COLORS.spin, 0.5, 0.3);
    Object.keys(app.render.arrows).forEach(function (key) {
      app.render.arrows[key].visible = false;
      app.render.scene.add(app.render.arrows[key]);
    });

    app.render.rulerGeo = new THREE.BufferGeometry();
    app.render.rulerGeo.setAttribute('position', new THREE.BufferAttribute(app.render.rulerPositions, 3));
    app.render.rulerLine = new THREE.Line(app.render.rulerGeo, new THREE.LineBasicMaterial({ color: SIM_COLORS.ruler, transparent: true, opacity: 0.58 }));
    app.render.rulerLine.frustumCulled = false;
    app.render.scene.add(app.render.rulerLine);

    app.render.heightGeo = new THREE.BufferGeometry();
    app.render.heightGeo.setAttribute('position', new THREE.BufferAttribute(app.render.heightPositions, 3));
    app.render.heightLine = new THREE.Line(app.render.heightGeo, new THREE.LineBasicMaterial({ color: SIM_COLORS.height, transparent: true, opacity: 0.48 }));
    app.render.heightLine.frustumCulled = false;
    app.render.scene.add(app.render.heightLine);

    app.render.impactGroup = new THREE.Group();
    app.render.scene.add(app.render.impactGroup);
  }

  function setParticleSize() {
    app.render.particleMat.size = app.cfg.visuals.particleSize;
  }

  function initParticles() {
    const count = Math.min(app.cfg.visuals.particleCount, D.PART_MAX);
    app.render.particles = [];
    for (let i = 0; i < count; i += 1) app.render.particles.push(spawnParticle());
    app.render.particleGeo.setDrawRange(0, count);
  }

  function updateParticles(dt) {
    const count = Math.min(app.cfg.visuals.particleCount, D.PART_MAX);
    const anchor = particleAnchor();
    const span = particleSpan();
    const jitter = Math.max(0.4, app.cfg.wind.speed * 0.2) * (app.cfg.wind.turb / 100);
    for (let i = 0; i < count; i += 1) {
      let particle = app.render.particles[i];
      if (!particle) particle = app.render.particles[i] = spawnParticle();
      tmpA.set(particle.x, particle.y, particle.z);
      const wind = app.solver.sampleWindAt(app, tmpA);
      particle.x += (wind.x + (Math.random() - 0.5) * jitter) * dt;
      particle.y += (wind.y + (Math.random() - 0.5) * jitter * 0.18) * dt;
      particle.z += (wind.z + (Math.random() - 0.5) * jitter) * dt;
      particle.life += dt / particle.maxLife;
      if (particle.life >= 1 || Math.abs(particle.x - anchor.x) > span.x * 0.65 || Math.abs(particle.z - anchor.z) > span.z * 0.65 || particle.y < 0.05 || particle.y > app.cfg.world.ceiling * 0.86 || Math.abs(particle.y - anchor.y) > span.y * 0.72) {
        particle = app.render.particles[i] = spawnParticle();
      }
      app.render.particlePositions[i * 3] = particle.x;
      app.render.particlePositions[i * 3 + 1] = particle.y;
      app.render.particlePositions[i * 3 + 2] = particle.z;
    }
    app.render.particleGeo.setDrawRange(0, count);
    app.render.particleGeo.attributes.position.needsUpdate = true;
    app.render.particlePoints.visible = app.cfg.env.part;
  }

  function setArrow(key, origin, direction, length) {
    const arrow = app.render.arrows[key];
    const state = app.render.arrowState[key];
    const len = Math.min(length, 18);
    if (len < 0.12 || direction.lengthSq() < 1e-8) {
      arrow.visible = false;
      state.visible = false;
      return;
    }
    tmpA.copy(direction).normalize();
    arrow.visible = true;
    arrow.position.copy(origin);
    arrow.setDirection(tmpA);
    arrow.setLength(len, Math.min(0.7, len * 0.18), Math.min(0.4, len * 0.10));
    state.tip.copy(origin).addScaledVector(tmpA, len);
    state.visible = true;
  }

  function projectPoint(world, out) {
    tmpA.copy(world).project(app.render.camera);
    out.x = (tmpA.x * 0.5 + 0.5) * app.render.mainEl.clientWidth;
    out.y = (-tmpA.y * 0.5 + 0.5) * app.render.mainEl.clientHeight;
    out.visible = tmpA.z > -1 && tmpA.z < 1 && out.x >= 0 && out.x <= app.render.mainEl.clientWidth && out.y >= 0 && out.y <= app.render.mainEl.clientHeight;
    return out;
  }

  function syncTrails() {
    const def = currentDef();
    const color = new THREE.Color(def.col);
    const playback = app.state.playback;
    const current = playback.active ? playback.frames.slice(0, playback.frameIndex + 1).map(function (frame) { return frame.body.pos; }) : app.state.currentTrail;
    const currentCount = Math.min(current.length, D.TRAIL_MAX);
    if (!app.cfg.env.trail || currentCount < 2) {
      app.render.trailLine.visible = false;
      app.render.trailGeo.setDrawRange(0, 0);
    } else {
      const start = current.length - currentCount;
      for (let i = 0; i < currentCount; i += 1) {
        const point = current[start + i];
        const t = i / Math.max(1, currentCount - 1);
        app.render.trailPos[i * 3] = point.x;
        app.render.trailPos[i * 3 + 1] = point.y;
        app.render.trailPos[i * 3 + 2] = point.z;
        app.render.trailCol[i * 3] = color.r * t;
        app.render.trailCol[i * 3 + 1] = color.g * t;
        app.render.trailCol[i * 3 + 2] = color.b * t;
      }
      app.render.trailGeo.attributes.position.needsUpdate = true;
      app.render.trailGeo.attributes.color.needsUpdate = true;
      app.render.trailGeo.setDrawRange(0, currentCount);
      app.render.trailLine.visible = true;
    }

    const compare = app.state.comparisonTrail;
    const compareCount = Math.min(compare.length, D.TRAIL_MAX);
    if (!app.cfg.analysis.compare || compareCount < 2) {
      app.render.compareLine.visible = false;
      app.render.compareGeo.setDrawRange(0, 0);
    } else {
      const start = compare.length - compareCount;
      for (let i = 0; i < compareCount; i += 1) {
        const point = compare[start + i];
        app.render.comparePos[i * 3] = point.x;
        app.render.comparePos[i * 3 + 1] = point.y;
        app.render.comparePos[i * 3 + 2] = point.z;
      }
      app.render.compareGeo.attributes.position.needsUpdate = true;
      app.render.compareGeo.setDrawRange(0, compareCount);
      app.render.compareLine.visible = true;
    }
  }

  function syncRuler() {
    const body = displayBody();
    const visible = !!app.cfg.analysis.ruler;
    app.render.rulerLine.visible = visible;
    app.render.heightLine.visible = visible;
    if (!visible || !body) {
      UI.setOverlay(app.ui.rulerLabel, 0, 0, false);
      return;
    }
    app.render.rulerPositions[0] = body.launchPos.x;
    app.render.rulerPositions[1] = body.launchPos.y;
    app.render.rulerPositions[2] = body.launchPos.z;
    app.render.rulerPositions[3] = body.pos.x;
    app.render.rulerPositions[4] = body.pos.y;
    app.render.rulerPositions[5] = body.pos.z;
    app.render.rulerGeo.attributes.position.needsUpdate = true;
    app.render.heightPositions[0] = body.pos.x;
    app.render.heightPositions[1] = 0;
    app.render.heightPositions[2] = body.pos.z;
    app.render.heightPositions[3] = body.pos.x;
    app.render.heightPositions[4] = body.pos.y;
    app.render.heightPositions[5] = body.pos.z;
    app.render.heightGeo.attributes.position.needsUpdate = true;
    tmpA.addVectors(body.launchPos, body.pos).multiplyScalar(0.5);
    const screen = { x: 0, y: 0, visible: false };
    projectPoint(tmpA, screen);
    app.ui.rulerLabel.style.color = SIM_COLOR_HEX.ruler;
    app.ui.rulerLabel.style.borderColor = 'rgba(116,211,255,0.26)';
    app.ui.rulerLabel.textContent = 'Range ' + Math.hypot(body.pos.x - body.launchPos.x, body.pos.y - body.launchPos.y, body.pos.z - body.launchPos.z).toFixed(1) + ' m | Y ' + Math.max(0, body.pos.y).toFixed(1) + ' m';
    UI.setOverlay(app.ui.rulerLabel, screen.x, screen.y, screen.visible);
  }

  function syncImpactMarkers() {
    const impacts = app.cfg.analysis.impacts ? displayImpacts() : [];
    const stamp = impacts.length ? impacts.length + ':' + impacts[impacts.length - 1].time.toFixed(3) : '0';
    if (stamp === app.render.lastImpactStamp) {
      app.render.impactGroup.visible = !!app.cfg.analysis.impacts;
      return;
    }
    while (app.render.impactGroup.children.length) {
      const child = app.render.impactGroup.children[0];
      app.render.impactGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    impacts.forEach(function (impact) {
      let color = SIM_COLORS.impactFloor;
      if (impact.kind.indexOf('wall') === 0) color = SIM_COLORS.impactWall;
      if (impact.kind === 'ceiling') color = SIM_COLORS.impactCeiling;
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.6, roughness: 0.35 }));
      marker.position.copy(impact.pos);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([impact.pos, impact.pos.clone().addScaledVector(impact.normal, 1.4)]),
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.8 })
      );
      app.render.impactGroup.add(marker, line);
    });
    app.render.lastImpactStamp = stamp;
    app.render.impactGroup.visible = !!app.cfg.analysis.impacts;
  }

  function syncStatus() {
    if (app.state.playback.active) {
      $('pauseBtn').textContent = 'Resume Live';
      $('sTxt').textContent = 'PLAYBACK';
      $('sTxt').className = 'sp';
      return;
    }
    $('pauseBtn').textContent = app.state.paused ? 'Resume' : 'Pause';
    if (app.state.validation && !app.state.validation.result && !app.state.paused) {
      $('sTxt').textContent = 'VALIDATING';
      $('sTxt').className = 'sr';
      return;
    }
    if (app.cfg.testMode === 'mounted' && !app.state.paused) {
      $('sTxt').textContent = 'MOUNTED';
      $('sTxt').className = 'sr';
      return;
    }
    $('sTxt').textContent = app.state.paused ? 'PAUSED' : 'RUNNING';
    $('sTxt').className = app.state.paused ? 'sp' : 'sr';
  }

  function syncValidationUi() {
    const validation = app.state.validation;
    if (!validation) {
      app.ui.validationPill.style.display = 'none';
      return;
    }
    app.ui.validationPill.style.display = 'block';
    if (!validation.result) {
      app.ui.validationPill.textContent = 'VALIDATION RUNNING';
      app.ui.validationPill.style.color = 'var(--amber)';
      app.ui.validationReport.textContent = validation.label + '\n' + 'time: ' + displayTime().toFixed(2) + ' / ' + validation.endTime.toFixed(2) + ' s';
      return;
    }
    const pass = validation.result.passed === validation.result.total;
    app.ui.validationPill.textContent = pass ? 'VALIDATION PASS' : 'VALIDATION WARN';
    app.ui.validationPill.style.color = pass ? 'var(--green)' : 'var(--amber)';
    app.ui.validationReport.textContent = validation.label + '\n' + 'checks: ' + validation.result.passed + ' / ' + validation.result.total + '\n\n' + validation.result.text;
  }

  function syncCameraInputs() {
    $('sCamDist').value = app.cfg.camera.distance.toFixed(1);
    $('sCamYaw').value = THREE.MathUtils.radToDeg(app.cfg.camera.yaw).toFixed(0);
    $('sCamPitch').value = THREE.MathUtils.radToDeg(app.cfg.camera.pitch).toFixed(0);
    $('sFov').value = app.cfg.camera.fov.toFixed(0);
    $('sCamLag').value = app.cfg.camera.lag.toFixed(2);
    $('vCamDist').textContent = app.cfg.camera.distance.toFixed(1) + ' m';
    $('vCamYaw').textContent = THREE.MathUtils.radToDeg(app.cfg.camera.yaw).toFixed(0) + ' deg';
    $('vCamPitch').textContent = THREE.MathUtils.radToDeg(app.cfg.camera.pitch).toFixed(0) + ' deg';
    $('vFov').textContent = app.cfg.camera.fov.toFixed(0) + ' deg';
    $('vCamLag').textContent = app.cfg.camera.lag.toFixed(2);
    UI.setToggle($('tCamFollow'), app.cfg.camera.follow);
  }

  function updateFov() {
    app.render.camera.fov = app.cfg.camera.fov;
    app.render.camera.updateProjectionMatrix();
  }

  function panCamera(dx, dy) {
    const scale = app.cfg.camera.distance * 0.015;
    app.render.forward.set(-Math.cos(app.cfg.camera.yaw), 0, -Math.sin(app.cfg.camera.yaw)).normalize();
    app.render.right.set(-app.render.forward.z, 0, app.render.forward.x).normalize();
    app.render.pan.addScaledVector(app.render.right, -dx * scale);
    app.render.pan.y += dy * scale * 0.45;
  }

  function updateCameraKeys(dt) {
    if (!app.render.keysDown.size) return;
    const move = Math.max(6, app.cfg.camera.distance * 0.55) * dt;
    app.render.forward.set(-Math.cos(app.cfg.camera.yaw), 0, -Math.sin(app.cfg.camera.yaw)).normalize();
    app.render.right.set(-app.render.forward.z, 0, app.render.forward.x).normalize();
    if (app.render.keysDown.has('KeyW')) app.render.pan.addScaledVector(app.render.forward, move);
    if (app.render.keysDown.has('KeyS')) app.render.pan.addScaledVector(app.render.forward, -move);
    if (app.render.keysDown.has('KeyA')) app.render.pan.addScaledVector(app.render.right, -move);
    if (app.render.keysDown.has('KeyD')) app.render.pan.addScaledVector(app.render.right, move);
    if (app.render.keysDown.has('KeyQ')) app.render.pan.y += move;
    if (app.render.keysDown.has('KeyE')) app.render.pan.y -= move;
  }

  function positionCamera() {
    const body = displayBody();
    if (!body) return;
    app.render.target.set(
      (app.cfg.camera.follow ? body.pos.x : 0) + app.render.pan.x,
      Math.max(1.2, (app.cfg.camera.follow ? body.pos.y * 0.55 : 0) + app.render.pan.y),
      (app.cfg.camera.follow ? body.pos.z : 0) + app.render.pan.z
    );
    const lerp = Math.min(1, app.cfg.camera.follow ? (app.cfg.camera.lag * 60 * app.render.lastDt) : 0.22);
    app.render.focus.lerp(app.render.target, lerp);
    const sinPitch = Math.sin(app.cfg.camera.pitch);
    app.render.camera.position.set(
      app.render.focus.x + app.cfg.camera.distance * sinPitch * Math.cos(app.cfg.camera.yaw),
      app.render.focus.y + app.cfg.camera.distance * Math.cos(app.cfg.camera.pitch),
      app.render.focus.z + app.cfg.camera.distance * sinPitch * Math.sin(app.cfg.camera.yaw)
    );
    app.render.camera.lookAt(app.render.focus);
  }

  function updateLighting() {
    const body = displayBody();
    if (!body) return;
    const windBlend = clamp(app.render.bodyWind.length() / 60, 0, 1);
    const speedBlend = clamp(lengthVec3(body.vel) / 26, 0, 1);
    app.render.lights.dir.intensity = 1.10 + windBlend * 0.28;
    app.render.lights.hemi.intensity = 0.56 + windBlend * 0.12;
    app.render.lights.rim.intensity = 0.60 + speedBlend * 0.28;
    app.render.lights.fill.intensity = 0.32 + speedBlend * 0.14;
    app.render.lights.point.intensity = 0.46 + windBlend * 0.20 + speedBlend * 0.10;
    app.render.lights.point.position.lerp(tmpA.copy(body.pos).addScaledVector(app.render.bodyWind, 0.18).add(tmpB.set(0, 4.5, 0)), 0.18);
    app.render.lights.fill.position.lerp(tmpC.set(app.render.camera.position.x * 0.55 + app.render.focus.x * 0.45, app.render.focus.y + 10, app.render.camera.position.z * 0.55 + app.render.focus.z * 0.45), 0.14);
    app.render.lights.rim.position.set(app.render.camera.position.x * 0.35 + app.render.focus.x * 0.65, app.render.focus.y + 18, app.render.camera.position.z * 0.35 + app.render.focus.z * 0.65);
  }

  function refreshScene() {
    const body = displayBody();
    const def = currentDef();
    if (!body) return;
    updateGround();
    app.render.objectPivot.position.set(body.pos.x, body.pos.y, body.pos.z);
    app.render.objectPivot.quaternion.set(body.q.x, body.q.y, body.q.z, body.q.w);
    app.render.bodyWind.copy(app.solver.sampleWindAt(app, body.pos));
    tmpA.copy(app.render.bodyWind).sub(body.vel);
    if (app.cfg.env.force && tmpA.lengthSq() > 1e-4 && body.metrics.drag > 1e-5) setArrow('drag', body.pos, tmpA, Math.min(body.metrics.drag / def.mass * 1.25, 10)); else app.render.arrowState.drag.visible = app.render.arrows.drag.visible = false;
    if (app.cfg.env.force && app.cfg.env.grav) setArrow('grav', body.pos, tmpB.set(0, -1, 0), Math.min(D.GRAV * 0.3, 5)); else app.render.arrowState.grav.visible = app.render.arrows.grav.visible = false;
    if (app.cfg.env.force && (body.vel.x * body.vel.x + body.vel.y * body.vel.y + body.vel.z * body.vel.z) > 0.0025) setArrow('vel', body.pos, body.vel, Math.min(lengthVec3(body.vel) * 0.5, 8)); else app.render.arrowState.vel.visible = app.render.arrows.vel.visible = false;
    if (app.cfg.env.force && app.cfg.env.magnus && (body.forces.magnus.x * body.forces.magnus.x + body.forces.magnus.y * body.forces.magnus.y + body.forces.magnus.z * body.forces.magnus.z) > 1e-8) setArrow('magnus', body.pos, body.forces.magnus, Math.min(lengthVec3(body.forces.magnus) / def.mass * 1.2, 8)); else app.render.arrowState.magnus.visible = app.render.arrows.magnus.visible = false;
    if (app.cfg.env.spinViz && app.cfg.env.rotation && (body.omegaWorld.x * body.omegaWorld.x + body.omegaWorld.y * body.omegaWorld.y + body.omegaWorld.z * body.omegaWorld.z) > 0.1225) setArrow('spin', body.pos, body.omegaWorld, Math.min(lengthVec3(body.omegaWorld) / D.TAU * 1.35, 7)); else app.render.arrowState.spin.visible = app.render.arrows.spin.visible = false;
    syncTrails();
    syncRuler();
    syncImpactMarkers();
  }

  function refreshForceLabels() {
    const labels = app.ui.forceLabels;
    const labelColors = {
      drag: SIM_COLOR_HEX.drag,
      grav: SIM_COLOR_HEX.grav,
      vel: SIM_COLOR_HEX.vel,
      magnus: SIM_COLOR_HEX.magnus,
      spin: SIM_COLOR_HEX.spin
    };
    ['drag', 'grav', 'vel', 'magnus', 'spin'].forEach(function (key) {
      const state = app.render.arrowState[key];
      const screen = { x: 0, y: 0, visible: false };
      labels[key].style.color = labelColors[key];
      labels[key].style.borderColor = labelColors[key];
      if (!app.cfg.analysis.forceLabels || !state.visible || (key !== 'spin' && !app.cfg.env.force)) {
        UI.setOverlay(labels[key], 0, 0, false);
        return;
      }
      projectPoint(state.tip, screen);
      UI.setOverlay(labels[key], screen.x, screen.y, screen.visible);
    });
  }

  function applyScenario(source) {
    app.cfg = normalizeScenario(source);
    bindSolver(app.cfg.solverKey);
    app.state.paused = false;
    resetPlaybackState();
    setObjectVisual();
    refreshSurface();
    updateChamber();
    updateFov();
    app.solver.resetSimulationState(app);
    capturePlaybackFrame(true);
    setParticleSize();
    initParticles();
    syncCameraInputs();
    UI.syncScenarioControls(app);
    UI.updateStaticPanels(app);
    UI.updateDynamicPanels(app);
    syncStatus();
  }

  function applyPreset(name) {
    if (!D.PRESETS[name]) return;
    app.currentPresetName = name;
    applyScenario(D.PRESETS[name]);
    $('presetSelect').value = name;
  }

  function resetObject() {
    resetPlaybackState();
    app.solver.resetSimulationState(app);
    capturePlaybackFrame(true);
    setObjectVisual();
    UI.updateStaticPanels(app);
    UI.updateDynamicPanels(app);
    syncStatus();
  }

  function updateObjectScale() {
    const body = app.state.body;
    const def = currentDef();
    setObjectVisual();
    if (body) {
      body.supportY = app.solver.supportExtentAlong(def, body.q, tmpA.set(0, 1, 0));
      if (body.pos.y < body.supportY) body.pos.y = body.supportY;
      const ex = app.solver.supportExtentAlong(def, body.q, tmpB.set(1, 0, 0));
      const ez = app.solver.supportExtentAlong(def, body.q, tmpC.set(0, 0, 1));
      body.pos.x = clamp(body.pos.x, -app.cfg.world.halfWidth + ex, app.cfg.world.halfWidth - ex);
      body.pos.z = clamp(body.pos.z, -app.cfg.world.halfDepth + ez, app.cfg.world.halfDepth - ez);
      body.pos.y = Math.min(body.pos.y, app.cfg.world.ceiling - body.supportY);
    }
    UI.syncGeometryControls(app);
    UI.updateStaticPanels(app);
    UI.updateDynamicPanels(app);
  }

  function startValidation(caseId) {
    if (!app.solver.startValidation(app, caseId)) return;
    UI.syncScenarioControls(app);
    UI.updateStaticPanels(app);
    UI.updateDynamicPanels(app);
    syncStatus();
    syncValidationUi();
  }

  function togglePause() {
    if (app.state.playback.active) {
      exitPlayback();
      app.state.paused = false;
      syncStatus();
      return;
    }
    app.state.paused = !app.state.paused;
    syncStatus();
  }

  function toggleCamFollow() {
    app.cfg.camera.follow = !app.cfg.camera.follow;
    syncCameraInputs();
  }

  function toggleEnv(key) {
    if (!(key in app.cfg.env)) return;
    app.cfg.env[key] = !app.cfg.env[key];
    const idMap = { grav: 'tGrav', part: 'tPart', trail: 'tTrail', bounce: 'tBounce', force: 'tForce', magnus: 'tMagnus', rotation: 'tRotation', reCd: 'tReCd', spinViz: 'tSpinViz' };
    UI.setToggle($(idMap[key]), app.cfg.env[key]);
    if (key === 'trail' && !app.cfg.env.trail) {
      app.state.currentTrail = [];
      app.render.trailGeo.setDrawRange(0, 0);
    }
  }

  function clearTelemetry() {
    app.state.telemetry = [];
    app.state.lastTelemetry = -1;
    app.state.forceHistory = [];
    resetPlaybackState();
    $('tcount').textContent = '0 data points recorded';
  }

  function downloadCSV() {
    if (!app.state.telemetry.length) {
      window.alert('Run the simulation first to record data.');
      return;
    }
    const header = Object.keys(app.state.telemetry[0]).join(',');
    const rows = app.state.telemetry.map(function (row) { return Object.values(row).join(','); });
    const blob = new Blob(['# WindSim 3D Telemetry Export\n# ' + new Date().toISOString() + '\n# Units: SI\n' + header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'windsim3d_' + app.cfg.objKey + '_' + Date.now() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetCamera(fullReset) {
    if (fullReset) {
      app.cfg.camera.follow = true;
      app.cfg.camera.yaw = THREE.MathUtils.degToRad(-23);
      app.cfg.camera.pitch = THREE.MathUtils.degToRad(49);
      app.cfg.camera.distance = 28;
      app.cfg.camera.fov = 52;
      app.cfg.camera.lag = 0.08;
      app.render.pan.set(0, 2, 0);
    }
    updateFov();
    if (displayBody()) app.render.focus.set(displayBody().pos.x, Math.max(1.2, displayBody().pos.y * 0.55 + app.render.pan.y), displayBody().pos.z);
    syncCameraInputs();
  }

  function installInput() {
    const canvas = app.render.renderer.domElement;
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    canvas.addEventListener('mousedown', function (event) {
      app.render.dragMode = (event.shiftKey || event.button === 2) ? 'pan' : 'orbit';
      app.render.dragPos.x = event.clientX;
      app.render.dragPos.y = event.clientY;
    });
    canvas.addEventListener('mousemove', function (event) {
      if (!app.render.dragMode) return;
      const dx = event.clientX - app.render.dragPos.x;
      const dy = event.clientY - app.render.dragPos.y;
      app.render.dragPos.x = event.clientX;
      app.render.dragPos.y = event.clientY;
      if (app.render.dragMode === 'orbit') {
        app.cfg.camera.yaw -= dx * 0.006;
        app.cfg.camera.pitch = clamp(app.cfg.camera.pitch - dy * 0.006, THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(88));
      } else {
        panCamera(dx, dy);
      }
      syncCameraInputs();
    });
    window.addEventListener('mouseup', function () { app.render.dragMode = null; });
    canvas.addEventListener('mouseleave', function () { app.render.dragMode = null; });
    canvas.addEventListener('wheel', function (event) {
      app.cfg.camera.distance = clamp(app.cfg.camera.distance + event.deltaY * 0.05, 4, 140);
      syncCameraInputs();
      event.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchstart', function (event) {
      app.render.dragMode = 'orbit';
      app.render.dragPos.x = event.touches[0].clientX;
      app.render.dragPos.y = event.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', function (event) {
      if (!app.render.dragMode) return;
      const dx = event.touches[0].clientX - app.render.dragPos.x;
      const dy = event.touches[0].clientY - app.render.dragPos.y;
      app.render.dragPos.x = event.touches[0].clientX;
      app.render.dragPos.y = event.touches[0].clientY;
      app.cfg.camera.yaw -= dx * 0.007;
      app.cfg.camera.pitch = clamp(app.cfg.camera.pitch - dy * 0.007, THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(88));
      syncCameraInputs();
      event.preventDefault();
    }, { passive: false });
    window.addEventListener('resize', resizeRenderer);
    if (window.ResizeObserver) {
      app.render.mainResizeObserver = new window.ResizeObserver(resizeRenderer);
      app.render.mainResizeObserver.observe(app.render.mainEl);
    }
    document.addEventListener('keydown', function (event) {
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePause();
        return;
      }
      if (app.state.playback.active && event.code === 'ArrowLeft') {
        event.preventDefault();
        stepPlayback(-1);
        return;
      }
      if (app.state.playback.active && event.code === 'ArrowRight') {
        event.preventDefault();
        stepPlayback(1);
        return;
      }
      if (app.state.playback.active && event.code === 'Escape') {
        event.preventDefault();
        exitPlayback();
        syncStatus();
        return;
      }
      if (event.code === 'KeyR') {
        resetObject();
        return;
      }
      app.render.keysDown.add(event.code);
    });
    document.addEventListener('keyup', function (event) {
      app.render.keysDown.delete(event.code);
    });
  }

  function loop(ts) {
    if (!app.render.lastTs) app.render.lastTs = ts;
    const dt = Math.min((ts - app.render.lastTs) / 1000, 0.05);
    app.render.lastTs = ts;
    app.render.lastDt = dt;
    updateCameraKeys(dt);
    if (!app.state.paused && dt > 0) {
      app.solver.step(app, dt);
      capturePlaybackFrame(false);
      updateParticles(dt);
    } else if (app.state.playback.active) {
      updatePlayback(dt);
      updateParticles(0);
    } else {
      updateParticles(0);
    }
    refreshScene();
    positionCamera();
    updateLighting();
    refreshForceLabels();
    UI.updateDynamicPanels(app);
    UI.drawGraph(app);
    UI.syncPlaybackControls(app);
    syncValidationUi();
    syncStatus();
    app.render.renderer.render(app.render.scene, app.render.camera);
    requestAnimationFrame(loop);
  }

  app.resetObject = resetObject;
  app.applyPreset = applyPreset;
  app.applyScenario = applyScenario;
  app.updateChamber = updateChamber;
  app.initParticles = initParticles;
  app.setParticleSize = setParticleSize;
  app.updateFov = updateFov;
  app.startValidation = startValidation;
  app.refreshSurface = refreshSurface;
  app.resetCamera = resetCamera;
  app.updateObjectScale = updateObjectScale;
  app.resizeRenderer = resizeRenderer;
  app.enterPlayback = enterPlayback;
  app.exitPlayback = exitPlayback;
  app.stepPlayback = stepPlayback;
  app.scrubPlayback = scrubPlayback;
  app.togglePlaybackRun = togglePlaybackRun;
  app.jumpPlaybackLatest = jumpPlaybackLatest;
  app.getDisplayFrame = currentPlaybackFrame;
  app.getDisplayForceHistory = displayForceHistory;

  setupRenderer();
  initGeometryLayers();
  UI.install(app);
  app.ui = {
    graphCanvas: $('graphCanvas'),
    graphPanel: $('graphPanel'),
    validationReport: $('validationReport'),
    validationPill: $('validationPill'),
    rulerLabel: $('rulerLabel'),
    forceLabels: {
      drag: $('forceLabelDrag'),
      grav: $('forceLabelGrav'),
      vel: $('forceLabelVel'),
      magnus: $('forceLabelMagnus'),
      spin: $('forceLabelSpin')
    }
  };
  installInput();
  applyPreset('baseline');
  resetCamera(false);
  $('orbitHint').innerHTML = 'DRAG: orbit . SHIFT+DRAG: pan . SCROLL: zoom<br>AXES: X = East, Y = Up, Z = North';
  $('simKbd').textContent = 'Space = pause, R = reset';
  $('camKbd').textContent = 'Drag = orbit, Shift+drag = pan, Follow off = WASDQE move';

  window.WindSimApp = app;
  window.toggleEnv = toggleEnv;
  window.toggleCamFollow = toggleCamFollow;
  window.togglePause = togglePause;
  window.resetObj = resetObject;
  window.downloadCSV = downloadCSV;
  window.clearTelemetry = clearTelemetry;
  window.resetCamera = resetCamera;

  requestAnimationFrame(loop);
}());
