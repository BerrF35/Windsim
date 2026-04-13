(function () {
  'use strict';

  var D = window.WindSimData;
  var P = window.WindSimPhysics;
  var S = window.WindSimSolvers;
  var UI = window.WindSimUI;
  var W = window.WindSimWorkflows;
  var Scene = window.WindSimScene;
  var V3 = THREE.Vector3;

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

  var PLAYBACK_MAX_FRAMES = 6000;
  var SWEEP_FIELDS = {
    wind_speed: {
      label: 'Wind Speed',
      unit: 'm/s',
      read: function (cfg) { return cfg.wind.speed; },
      write: function (cfg, value) { cfg.wind.speed = value; }
    },
    wind_heading: {
      label: 'Wind Heading',
      unit: 'deg',
      read: function (cfg) { return cfg.wind.azim; },
      write: function (cfg, value) { cfg.wind.azim = P.wrap360(value); }
    },
    wind_elevation: {
      label: 'Wind Elevation',
      unit: 'deg',
      read: function (cfg) { return cfg.wind.elev; },
      write: function (cfg, value) { cfg.wind.elev = value; }
    },
    altitude: {
      label: 'Altitude',
      unit: 'm',
      read: function (cfg) { return cfg.altitude; },
      write: function (cfg, value) { cfg.altitude = value; }
    },
    mode_strength: {
      label: 'Mode Strength',
      unit: '%',
      read: function (cfg) { return cfg.wind.modeStrength; },
      write: function (cfg, value) { cfg.wind.modeStrength = value; }
    }
  };

  function normalizeScenario(source) {
    var cfg = S.getSolver('sandbox').makeConfigFromPreset('baseline');
    var src = source || {};

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
    cfg.analysis.flowSlice = !!cfg.analysis.flowSlice;
    if (!Object.prototype.hasOwnProperty.call(D.FLOW_SLICE_PLANES, cfg.analysis.flowSlicePlane)) cfg.analysis.flowSlicePlane = 'horizontal';
    cfg.analysis.flowSliceHeight = clamp(num(cfg.analysis.flowSliceHeight, 8), 0.5, cfg.world.ceiling);
    cfg.analysis.flowSliceSpan = clamp(num(cfg.analysis.flowSliceSpan, 36), 12, Math.max(20, Math.min(cfg.world.halfWidth * 2, cfg.world.halfDepth * 2)));
    cfg.camera.distance = clamp(cfg.camera.distance, 4, 140);
    cfg.camera.pitch = clamp(cfg.camera.pitch, THREE.MathUtils.degToRad(5), THREE.MathUtils.degToRad(88));
    cfg.camera.fov = clamp(cfg.camera.fov, 25, 100);
    cfg.camera.lag = clamp(cfg.camera.lag, 0.01, 0.4);
    if (!S.hasSolver(cfg.solverKey)) cfg.solverKey = 'sandbox';
    if (!cfg.objectScale) cfg.objectScale = { x: 1, y: 1, z: 1 };
    return cfg;
  }

  var tmpA = new V3();
  var tmpB = new V3();
  var tmpC = new V3();

  var defaultSolver = S.getSolver('sandbox');

  var app = {
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
      experiment: {
        variable: 'wind_speed',
        start: 0,
        end: 40,
        steps: 9,
        rows: [],
        baseScenario: null,
        objectKey: '',
        objectLabel: '',
        surfaceKey: '',
        windMode: '',
        savedRuns: [],
        selectedSavedId: '',
        comparison: null,
        dirty: false
      },
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
      flowProbeGeo: null,
      flowProbeLine: null,
      flowProbePositions: new Float32Array(49 * 6),
      flowProbeColors: new Float32Array(49 * 6),
      flowProbeTipGeo: null,
      flowProbeTips: null,
      flowProbeTipPositions: new Float32Array(49 * 3),
      flowProbeTipColors: new Float32Array(49 * 3),
      flowProbeStats: {
        active: false,
        sampleCount: 0,
        planeKey: 'horizontal',
        planeLabel: D.FLOW_SLICE_PLANES.horizontal.label,
        projected: false,
        fixedAxis: 'y',
        fixedValue: 0,
        height: 0,
        span: 0,
        sectionHeight: 0,
        meanSpeed: 0,
        peakSpeed: 0,
        sampledMeanSpeed: 0,
        sampledPeakSpeed: 0,
        anchorX: 0,
        anchorZ: 0
      },
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
    var solver = S.getSolver(solverKey);
    app.solver = solver;
    if (app.cfg) app.cfg.solverKey = solver.key;
    return solver;
  }

  function displayBody() {
    var frame = app.getDisplayFrame ? app.getDisplayFrame() : null;
    return frame ? frame.body : app.state.body;
  }

  function displayEnergy() {
    var frame = app.getDisplayFrame ? app.getDisplayFrame() : null;
    return frame ? frame.energy : app.state.energy;
  }

  function displayTime() {
    var frame = app.getDisplayFrame ? app.getDisplayFrame() : null;
    return frame ? frame.time : app.state.time;
  }

  function displayImpacts() {
    return app.getDisplayImpacts ? app.getDisplayImpacts() : app.state.impacts;
  }

  function currentDef() {
    return app.solver.resolveObjectDef(app.cfg.objKey, app.cfg);
  }

  /* ---- workflows ---- */

  W.attach(app, {
    clamp: clamp,
    deepClone: deepClone,
    sweepFields: SWEEP_FIELDS,
    currentDef: currentDef,
    applyScenario: function (s) { applyScenario(s); },
    playbackMaxFrames: PLAYBACK_MAX_FRAMES,
    syncExperimentPanel: function () {
      if (UI.syncExperimentPanel) UI.syncExperimentPanel(app);
    }
  });

  /* ---- scene ---- */

  Scene.install(app, {
    displayBody: displayBody,
    displayImpacts: displayImpacts,
    currentDef: currentDef
  });

  /* ---- UI ---- */

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

  /* ---- scenario orchestration ---- */

  function applyScenario(source) {
    app.cfg = normalizeScenario(source);
    bindSolver(app.cfg.solverKey);
    app.state.paused = false;
    app.markExperimentDirty();
    app.resetPlaybackState();
    app.setObjectVisual();
    app.refreshSurface();
    app.updateChamber();
    app.updateFov();
    app.solver.resetSimulationState(app);
    app.capturePlaybackFrame(true);
    app.setParticleSize();
    app.initParticles();
    app.syncCameraInputs();
    UI.syncScenarioControls(app);
    UI.updateStaticPanels(app);
    UI.updateDynamicPanels(app);
    UI.syncStatus(app);
  }

  function applyPreset(name) {
    if (!D.PRESETS[name]) return;
    app.currentPresetName = name;
    applyScenario(D.PRESETS[name]);
    $('presetSelect').value = name;
  }

  function resetObject() {
    app.markExperimentDirty();
    app.resetPlaybackState();
    app.solver.resetSimulationState(app);
    app.capturePlaybackFrame(true);
    app.setObjectVisual();
    UI.updateStaticPanels(app);
    UI.updateDynamicPanels(app);
    UI.syncStatus(app);
  }

  function updateObjectScale() {
    app.markExperimentDirty();
    var body = app.state.body;
    var def = currentDef();
    app.setObjectVisual();
    if (body) {
      body.supportY = app.solver.supportExtentAlong(def, body.q, tmpA.set(0, 1, 0));
      if (body.pos.y < body.supportY) body.pos.y = body.supportY;
      var ex = app.solver.supportExtentAlong(def, body.q, tmpB.set(1, 0, 0));
      var ez = app.solver.supportExtentAlong(def, body.q, tmpC.set(0, 0, 1));
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
    app.markExperimentDirty();
    UI.syncScenarioControls(app);
    UI.updateStaticPanels(app);
    UI.updateDynamicPanels(app);
    UI.syncStatus(app);
    UI.syncValidationUi(app, displayTime());
  }

  /* ---- controls ---- */

  function togglePause() {
    if (app.state.playback.active) {
      app.exitPlayback();
      app.state.paused = false;
      UI.syncStatus(app);
      return;
    }
    app.state.paused = !app.state.paused;
    UI.syncStatus(app);
  }

  function toggleCamFollow() {
    app.cfg.camera.follow = !app.cfg.camera.follow;
    app.syncCameraInputs();
  }

  function toggleEnv(key) {
    if (!(key in app.cfg.env)) return;
    app.cfg.env[key] = !app.cfg.env[key];
    app.markExperimentDirty();
    var idMap = { grav: 'tGrav', part: 'tPart', trail: 'tTrail', bounce: 'tBounce', force: 'tForce', magnus: 'tMagnus', rotation: 'tRotation', reCd: 'tReCd', spinViz: 'tSpinViz' };
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
    app.resetPlaybackState();
    $('tcount').textContent = '0 data points recorded';
  }

  function downloadCSV() {
    if (!app.state.telemetry.length) {
      window.alert('Run the simulation first to record data.');
      return;
    }
    var header = Object.keys(app.state.telemetry[0]).join(',');
    var rows = app.state.telemetry.map(function (row) { return Object.values(row).join(','); });
    var blob = new Blob(['# WindSim 3D Telemetry Export\n# ' + new Date().toISOString() + '\n# Units: SI\n' + header + '\n' + rows.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
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
    app.updateFov();
    if (displayBody()) app.render.focus.set(displayBody().pos.x, Math.max(1.2, displayBody().pos.y * 0.55 + app.render.pan.y), displayBody().pos.z);
    app.syncCameraInputs();
  }

  /* ---- input ---- */

  function installInput() {
    var canvas = app.render.renderer.domElement;
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    canvas.addEventListener('mousedown', function (event) {
      app.render.dragMode = (event.shiftKey || event.button === 2) ? 'pan' : 'orbit';
      app.render.dragPos.x = event.clientX;
      app.render.dragPos.y = event.clientY;
    });
    canvas.addEventListener('mousemove', function (event) {
      if (!app.render.dragMode) return;
      var dx = event.clientX - app.render.dragPos.x;
      var dy = event.clientY - app.render.dragPos.y;
      app.render.dragPos.x = event.clientX;
      app.render.dragPos.y = event.clientY;
      if (app.render.dragMode === 'orbit') {
        app.cfg.camera.yaw -= dx * 0.006;
        app.cfg.camera.pitch = clamp(app.cfg.camera.pitch - dy * 0.006, THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(88));
      } else {
        app.panCamera(dx, dy);
      }
      app.syncCameraInputs();
    });
    window.addEventListener('mouseup', function () { app.render.dragMode = null; });
    canvas.addEventListener('mouseleave', function () { app.render.dragMode = null; });
    canvas.addEventListener('wheel', function (event) {
      app.cfg.camera.distance = clamp(app.cfg.camera.distance + event.deltaY * 0.05, 4, 140);
      app.syncCameraInputs();
      event.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchstart', function (event) {
      app.render.dragMode = 'orbit';
      app.render.dragPos.x = event.touches[0].clientX;
      app.render.dragPos.y = event.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', function (event) {
      if (!app.render.dragMode) return;
      var dx = event.touches[0].clientX - app.render.dragPos.x;
      var dy = event.touches[0].clientY - app.render.dragPos.y;
      app.render.dragPos.x = event.touches[0].clientX;
      app.render.dragPos.y = event.touches[0].clientY;
      app.cfg.camera.yaw -= dx * 0.007;
      app.cfg.camera.pitch = clamp(app.cfg.camera.pitch - dy * 0.007, THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(88));
      app.syncCameraInputs();
      event.preventDefault();
    }, { passive: false });
    window.addEventListener('resize', app.resizeRenderer);
    if (window.ResizeObserver) {
      app.render.mainResizeObserver = new window.ResizeObserver(app.resizeRenderer);
      app.render.mainResizeObserver.observe(app.render.mainEl);
    }
    document.addEventListener('keydown', function (event) {
      var tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePause();
        return;
      }
      if (app.state.playback.active && event.code === 'ArrowLeft') {
        event.preventDefault();
        app.stepPlayback(-1);
        return;
      }
      if (app.state.playback.active && event.code === 'ArrowRight') {
        event.preventDefault();
        app.stepPlayback(1);
        return;
      }
      if (app.state.playback.active && event.code === 'Escape') {
        event.preventDefault();
        app.exitPlayback();
        UI.syncStatus(app);
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

  /* ---- frame loop ---- */

  function loop(ts) {
    if (!app.render.lastTs) app.render.lastTs = ts;
    var dt = Math.min((ts - app.render.lastTs) / 1000, 0.05);
    app.render.lastTs = ts;
    app.render.lastDt = dt;
    app.updateCameraKeys(dt);
    if (!app.state.paused && dt > 0) {
      app.solver.step(app, dt);
      app.capturePlaybackFrame(false);
      app.updateParticles(dt);
    } else if (app.state.playback.active) {
      app.updatePlayback(dt);
      app.updateParticles(0);
    } else {
      app.updateParticles(0);
    }
    app.refreshScene();
    app.positionCamera();
    app.updateLighting();
    app.refreshForceLabels();
    UI.updateDynamicPanels(app);
    UI.drawGraph(app);
    UI.syncPlaybackControls(app);
    if (UI.syncFlowProbeInfo) UI.syncFlowProbeInfo(app);
    UI.syncValidationUi(app, displayTime());
    UI.syncStatus(app);
    app.render.renderer.render(app.render.scene, app.render.camera);
    requestAnimationFrame(loop);
  }

  /* ---- snapshot / save / load ---- */

  function getScenarioSnapshot() {
    return app.solver.defaultScenarioSnapshot(app);
  }

  function getSavedScenarioList() {
    return deepClone(app.savedScenarios || []);
  }

  function loadSavedScenario(name) {
    var entry = (app.savedScenarios || []).find(function (item) {
      return item && item.name === name && item.scenario;
    });
    if (!entry) return false;
    app.currentPresetName = '';
    applyScenario(entry.scenario);
    return true;
  }

  function setPausedState(paused) {
    app.state.paused = !!paused;
    UI.syncStatus(app);
  }

  /* ---- public API on app ---- */

  app.resetObject = resetObject;
  app.applyPreset = applyPreset;
  app.applyScenario = applyScenario;
  app.startValidation = startValidation;
  app.updateObjectScale = updateObjectScale;
  app.getScenarioSnapshot = getScenarioSnapshot;
  app.getSavedScenarioList = getSavedScenarioList;
  app.loadSavedScenario = loadSavedScenario;
  app.setPausedState = setPausedState;
  app.resetCamera = resetCamera;

  /* ---- bootstrap ---- */

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
