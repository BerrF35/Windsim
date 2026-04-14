/**
 * WindSim CFD Laboratory — Engine
 * WebGPU initialization, Three.js scene setup, orbit controls, and solver scaffolding.
 */
(function () {
  'use strict';

  /* ─── State ─── */
  var state = {
    gpu: null,          // GPUDevice
    adapter: null,      // GPUAdapter
    gpuReady: false,
    gpuError: '',
    scene: null,
    camera: null,
    renderer: null,
    controls: {
      yaw: -0.4,
      pitch: 0.6,
      distance: 8,
      target: { x: 0, y: 0, z: 0 },
      dragging: false,
      lastX: 0, lastY: 0,
      fov: 50
    },
    solver: {
      running: false,
      paused: false,
      iteration: 0,
      gridX: 64, gridY: 64, gridZ: 64,
      tau: 0.6,
      inletSpeed: 0.08,
      stepsPerFrame: 4
    },
    mesh: {
      active: 'sphere',
      object: null,
      wireframe: null
    },
    vizMode: 'solid',
    results: {
      cd: 0, cl: 0, cs: 0,
      maxVel: 0, massError: 0
    },
    lastTs: 0,
    frameCount: 0
  };

  /* ─── DOM helpers ─── */
  function $(id) { return document.getElementById(id); }
  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ─── WebGPU Initialization ─── */
  async function initWebGPU() {
    var errorOverlay = $('gpu-error-overlay');

    if (!navigator.gpu) {
      showGPUError('WebGPU Not Available', 
        'Your browser does not support WebGPU, which is required for the CFD solver. Please use Chrome 113+, Edge 113+, or Firefox Nightly with WebGPU enabled.',
        'chrome://flags → #enable-unsafe-webgpu');
      return false;
    }

    try {
      state.adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!state.adapter) {
        showGPUError('No GPU Adapter Found',
          'WebGPU is supported but no suitable GPU adapter was found. This can happen on systems without a dedicated GPU.',
          'Try updating your GPU drivers');
        return false;
      }

      state.gpu = await state.adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: Math.min(state.adapter.limits.maxStorageBufferBindingSize, 268435456),
          maxBufferSize: Math.min(state.adapter.limits.maxBufferSize, 268435456),
          maxComputeWorkgroupsPerDimension: 65535
        }
      });

      state.gpu.lost.then(function (info) {
        console.error('WebGPU device lost:', info.message);
        showGPUError('GPU Device Lost', 'The GPU device was lost: ' + info.message, 'Try reloading the page');
        state.gpuReady = false;
      });

      state.gpuReady = true;
      if (errorOverlay) errorOverlay.style.display = 'none';
      updateGPUStatus('ready', 'WebGPU Ready — ' + (state.adapter.info ? state.adapter.info.description || state.adapter.info.device || 'GPU' : 'GPU'));
      console.log('WebGPU initialized:', state.adapter.info);
      return true;

    } catch (err) {
      showGPUError('WebGPU Init Failed', err.message || 'Unknown error during GPU initialization', 'Check browser console for details');
      return false;
    }
  }

  function showGPUError(title, body, hint) {
    state.gpuError = title;
    state.gpuReady = false;
    var overlay = $('gpu-error-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      var titleEl = overlay.querySelector('.cfd-gpu-error-title');
      var bodyEl = overlay.querySelector('.cfd-gpu-error-body');
      var hintEl = overlay.querySelector('.cfd-gpu-error-hint');
      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.textContent = body;
      if (hintEl) hintEl.textContent = hint;
    }
    updateGPUStatus('error', title);
  }

  function updateGPUStatus(status, label) {
    var dot = $('status-dot');
    var txt = $('status-text');
    if (dot) {
      dot.className = 'cfd-status-dot';
      if (status === 'ready') dot.classList.add('is-ready');
      else if (status === 'running') dot.classList.add('is-running');
      else if (status === 'error') dot.classList.add('is-error');
    }
    if (txt) txt.textContent = label || '';
  }

  /* ─── Three.js Scene ─── */
  function initScene() {
    var viewport = $('cfd-viewport');
    if (!viewport) return;

    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0a0e13);
    state.scene.fog = new THREE.FogExp2(0x0a0e13, 0.008);

    state.camera = new THREE.PerspectiveCamera(state.controls.fov, 1, 0.1, 500);
    updateCamera();

    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.outputEncoding = THREE.sRGBEncoding;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.1;
    viewport.appendChild(state.renderer.domElement);

    /* Lights */
    var ambient = new THREE.AmbientLight(0x4488aa, 0.4);
    state.scene.add(ambient);

    var keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 8, 6);
    state.scene.add(keyLight);

    var fillLight = new THREE.DirectionalLight(0x5ad1ff, 0.3);
    fillLight.position.set(-4, 2, -3);
    state.scene.add(fillLight);

    var rimLight = new THREE.DirectionalLight(0xe8715a, 0.2);
    rimLight.position.set(0, -2, -5);
    state.scene.add(rimLight);

    /* Domain bounding box */
    buildDomainBox();

    /* Floor grid */
    var gridHelper = new THREE.GridHelper(12, 24, 0x1a232e, 0x151c24);
    gridHelper.position.y = -3;
    state.scene.add(gridHelper);

    /* Default object */
    setMesh('sphere');

    /* Axes in corner */
    buildAxesHelper();

    resize();
    window.addEventListener('resize', resize);
  }

  function buildDomainBox() {
    var sx = 6, sy = 6, sz = 6;
    var boxGeo = new THREE.BoxGeometry(sx, sy, sz);
    var edges = new THREE.EdgesGeometry(boxGeo);
    var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: 0x5ad1ff, transparent: true, opacity: 0.12
    }));
    state.scene.add(line);

    /* Inlet plane indicator */
    var planeGeo = new THREE.PlaneGeometry(sy, sz);
    var planeMat = new THREE.MeshBasicMaterial({
      color: 0x5ad1ff, transparent: true, opacity: 0.04, side: THREE.DoubleSide
    });
    var inlet = new THREE.Mesh(planeGeo, planeMat);
    inlet.position.x = -sx / 2;
    inlet.rotation.y = Math.PI / 2;
    state.scene.add(inlet);

    /* Inlet arrows */
    for (var j = -2; j <= 2; j += 2) {
      for (var k = -2; k <= 2; k += 2) {
        var arrow = new THREE.ArrowHelper(
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(-sx / 2 - 0.3, j * 0.8, k * 0.8),
          0.8, 0x5ad1ff, 0.15, 0.1
        );
        arrow.line.material.transparent = true;
        arrow.line.material.opacity = 0.25;
        arrow.cone.material.transparent = true;
        arrow.cone.material.opacity = 0.25;
        state.scene.add(arrow);
      }
    }
  }

  function buildAxesHelper() {
    var axes = new THREE.AxesHelper(0.6);
    axes.position.set(-4.5, -2.5, -4.5);
    axes.material.transparent = true;
    axes.material.opacity = 0.5;
    state.scene.add(axes);
  }

  /* ─── Mesh Library ─── */
  var MESHES = {
    sphere: { label: 'Sphere', ico: '⚪', meta: 'r = 0.6, ~2500 faces', build: function () {
      return new THREE.SphereGeometry(0.6, 40, 40);
    }},
    cube: { label: 'Cube', ico: '🟦', meta: '1.0 × 1.0 × 1.0', build: function () {
      return new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
    }},
    cylinder: { label: 'Cylinder', ico: '🔵', meta: 'r = 0.4, h = 1.2', build: function () {
      return new THREE.CylinderGeometry(0.4, 0.4, 1.2, 36, 1);
    }},
    airfoil: { label: 'NACA 0012', ico: '✈️', meta: 'chord = 2.0, span = 1.0', build: function () {
      var points = [];
      var chord = 2.0;
      for (var i = 0; i <= 30; i++) {
        var t = i / 30;
        var x = chord * t;
        var yt = 0.12 / 0.2 * chord * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t);
        points.push(new THREE.Vector2(x - chord / 2, yt));
      }
      for (var i = 30; i >= 0; i--) {
        var t = i / 30;
        var x = chord * t;
        var yt = 0.12 / 0.2 * chord * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t);
        points.push(new THREE.Vector2(x - chord / 2, -yt));
      }
      var shape = new THREE.Shape(points);
      var extrudeSettings = { depth: 1.0, bevelEnabled: false };
      var geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geo.center();
      geo.rotateX(Math.PI / 2);
      return geo;
    }},
    car: { label: 'Ahmed Body', ico: '🚗', meta: 'simplified bluff body', build: function () {
      var group = new THREE.Group();
      var bodyGeo = new THREE.BoxGeometry(2.2, 0.6, 0.8, 4, 4, 4);
      var bodyMesh = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x3a4855, roughness: 0.6, metalness: 0.3 }));
      bodyMesh.position.y = 0;
      group.add(bodyMesh);
      var topGeo = new THREE.BoxGeometry(1.0, 0.4, 0.76, 2, 2, 2);
      var topMesh = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: 0x3a4855, roughness: 0.6, metalness: 0.3 }));
      topMesh.position.set(-0.2, 0.5, 0);
      group.add(topMesh);
      return group;
    }}
  };

  function setMesh(key) {
    if (state.mesh.object) {
      state.scene.remove(state.mesh.object);
      state.scene.remove(state.mesh.wireframe);
    }

    state.mesh.active = key;
    var def = MESHES[key];
    if (!def) return;

    var built = def.build();

    if (built instanceof THREE.Group) {
      state.mesh.object = built;
      state.scene.add(built);
      state.mesh.wireframe = null;
    } else {
      var mat = new THREE.MeshStandardMaterial({
        color: 0x5a7080,
        roughness: 0.5,
        metalness: 0.4,
        transparent: false
      });
      state.mesh.object = new THREE.Mesh(built, mat);
      state.scene.add(state.mesh.object);

      var wireEdges = new THREE.EdgesGeometry(built, 15);
      state.mesh.wireframe = new THREE.LineSegments(wireEdges, new THREE.LineBasicMaterial({
        color: 0x5ad1ff, transparent: true, opacity: 0.08
      }));
      state.scene.add(state.mesh.wireframe);
    }

    /* Update mesh list UI */
    document.querySelectorAll('.cfd-mesh-item').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.mesh === key);
    });

    setText('sb-mesh-name', def.label);
    setText('vp-object', def.label + ' (' + def.meta + ')');
  }

  /* ─── Camera ─── */
  function updateCamera() {
    var c = state.controls;
    var x = c.target.x + c.distance * Math.sin(c.yaw) * Math.cos(c.pitch);
    var y = c.target.y + c.distance * Math.sin(c.pitch);
    var z = c.target.z + c.distance * Math.cos(c.yaw) * Math.cos(c.pitch);
    state.camera.position.set(x, y, z);
    state.camera.lookAt(c.target.x, c.target.y, c.target.z);
  }

  function resize() {
    var vp = $('cfd-viewport');
    if (!vp || !state.renderer) return;
    var w = vp.clientWidth;
    var h = vp.clientHeight;
    if (!w || !h) return;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h, false);
  }

  /* ─── Input ─── */
  function installInput() {
    var vp = $('cfd-viewport');
    if (!vp) return;

    vp.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    vp.addEventListener('mousedown', function (e) {
      state.controls.dragging = true;
      state.controls.dragMode = (e.shiftKey || e.button === 2) ? 'pan' : 'orbit';
      state.controls.lastX = e.clientX;
      state.controls.lastY = e.clientY;
    });

    window.addEventListener('mousemove', function (e) {
      if (!state.controls.dragging) return;
      var dx = e.clientX - state.controls.lastX;
      var dy = e.clientY - state.controls.lastY;
      state.controls.lastX = e.clientX;
      state.controls.lastY = e.clientY;

      if (state.controls.dragMode === 'orbit') {
        state.controls.yaw -= dx * 0.006;
        state.controls.pitch = clamp(state.controls.pitch + dy * 0.006, 0.05, Math.PI / 2 - 0.05);
      } else {
        var scale = state.controls.distance * 0.002;
        state.controls.target.x -= dx * scale;
        state.controls.target.y += dy * scale;
      }
      updateCamera();
    });

    window.addEventListener('mouseup', function () { state.controls.dragging = false; });

    vp.addEventListener('wheel', function (e) {
      state.controls.distance = clamp(state.controls.distance + e.deltaY * 0.01, 2, 50);
      updateCamera();
      e.preventDefault();
    }, { passive: false });

    /* Touch */
    vp.addEventListener('touchstart', function (e) {
      state.controls.dragging = true;
      state.controls.dragMode = 'orbit';
      state.controls.lastX = e.touches[0].clientX;
      state.controls.lastY = e.touches[0].clientY;
    }, { passive: true });

    vp.addEventListener('touchmove', function (e) {
      if (!state.controls.dragging) return;
      var dx = e.touches[0].clientX - state.controls.lastX;
      var dy = e.touches[0].clientY - state.controls.lastY;
      state.controls.lastX = e.touches[0].clientX;
      state.controls.lastY = e.touches[0].clientY;
      state.controls.yaw -= dx * 0.007;
      state.controls.pitch = clamp(state.controls.pitch + dy * 0.007, 0.05, Math.PI / 2 - 0.05);
      updateCamera();
      e.preventDefault();
    }, { passive: false });
  }

  /* ─── UI Binding ─── */
  function bindUI() {
    /* Mesh items */
    document.querySelectorAll('.cfd-mesh-item').forEach(function (el) {
      el.addEventListener('click', function () {
        setMesh(el.dataset.mesh);
      });
    });

    /* Panel collapse */
    document.querySelectorAll('.cfd-panel-head').forEach(function (head) {
      head.addEventListener('click', function () {
        head.parentElement.classList.toggle('is-open');
      });
    });

    /* Viz mode buttons */
    document.querySelectorAll('.cfd-viz-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.cfd-viz-btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        state.vizMode = btn.dataset.mode;
        applyVizMode();
      });
    });

    /* Solver controls */
    var runBtn = $('btn-run');
    var pauseBtn = $('btn-pause');
    var resetBtn = $('btn-reset');

    if (runBtn) runBtn.addEventListener('click', function () {
      if (!state.gpuReady) return;
      state.solver.running = true;
      state.solver.paused = false;
      updateGPUStatus('running', 'Solver Running — Iteration ' + state.solver.iteration);
    });

    if (pauseBtn) pauseBtn.addEventListener('click', function () {
      state.solver.paused = !state.solver.paused;
      if (state.solver.paused) {
        updateGPUStatus('ready', 'Solver Paused — Iteration ' + state.solver.iteration);
      } else {
        updateGPUStatus('running', 'Solver Running — Iteration ' + state.solver.iteration);
      }
    });

    if (resetBtn) resetBtn.addEventListener('click', function () {
      state.solver.running = false;
      state.solver.paused = false;
      state.solver.iteration = 0;
      state.results = { cd: 0, cl: 0, cs: 0, maxVel: 0, massError: 0 };
      updateGPUStatus('ready', 'WebGPU Ready');
      updateResults();
      updateStatusBar();
    });

    /* Slider bindings */
    bindSlider('s-tau', 'v-tau', function (v) {
      state.solver.tau = parseFloat(v);
      return parseFloat(v).toFixed(3);
    });

    bindSlider('s-inlet', 'v-inlet', function (v) {
      state.solver.inletSpeed = parseFloat(v);
      return parseFloat(v).toFixed(3) + ' lu/ts';
    });

    bindSlider('s-steps', 'v-steps', function (v) {
      state.solver.stepsPerFrame = parseInt(v);
      return v;
    });

    /* Grid resolution */
    var gridSel = $('s-grid');
    if (gridSel) gridSel.addEventListener('change', function () {
      var parts = gridSel.value.split('x');
      state.solver.gridX = parseInt(parts[0]);
      state.solver.gridY = parseInt(parts[1]);
      state.solver.gridZ = parseInt(parts[2]);
    });
  }

  function bindSlider(sliderId, valId, handler) {
    var s = $(sliderId);
    if (!s) return;
    s.addEventListener('input', function () {
      var display = handler(s.value);
      setText(valId, display);
    });
  }

  function applyVizMode() {
    if (!state.mesh.object) return;
    if (state.mesh.object instanceof THREE.Group) return;

    switch (state.vizMode) {
      case 'wireframe':
        state.mesh.object.material.wireframe = true;
        state.mesh.object.material.opacity = 0.6;
        state.mesh.object.material.transparent = true;
        if (state.mesh.wireframe) state.mesh.wireframe.visible = true;
        break;
      case 'solid':
      default:
        state.mesh.object.material.wireframe = false;
        state.mesh.object.material.opacity = 1;
        state.mesh.object.material.transparent = false;
        if (state.mesh.wireframe) state.mesh.wireframe.visible = true;
        break;
    }
  }

  function updateResults() {
    setText('r-cd', state.results.cd.toFixed(4));
    setText('r-cl', state.results.cl.toFixed(4));
    setText('r-cs', state.results.cs.toFixed(4));
    setText('r-maxvel', state.results.maxVel.toFixed(4));
    setText('r-mass-err', (state.results.massError * 100).toFixed(4) + '%');
  }

  function updateStatusBar() {
    setText('sb-iter', state.solver.iteration.toLocaleString());
    setText('sb-grid', state.solver.gridX + '×' + state.solver.gridY + '×' + state.solver.gridZ);
    setText('sb-tau', state.solver.tau.toFixed(3));
    setText('sb-inlet', state.solver.inletSpeed.toFixed(3));
    setText('sb-fps', '—');
  }

  /* ─── Render Loop ─── */
  function loop(ts) {
    requestAnimationFrame(loop);

    var dt = state.lastTs ? (ts - state.lastTs) / 1000 : 1 / 60;
    state.lastTs = ts;
    state.frameCount++;

    /* FPS */
    if (state.frameCount % 30 === 0) {
      setText('sb-fps', Math.round(1 / dt));
    }

    /* Render */
    if (state.renderer && state.scene && state.camera) {
      /* Gentle object rotation when solver is idle */
      if (!state.solver.running && state.mesh.object) {
        if (state.mesh.object instanceof THREE.Group) {
          state.mesh.object.rotation.y += dt * 0.15;
        } else {
          state.mesh.object.rotation.y += dt * 0.15;
          if (state.mesh.wireframe) state.mesh.wireframe.rotation.y = state.mesh.object.rotation.y;
        }
      }

      state.renderer.render(state.scene, state.camera);
    }

    updateStatusBar();
  }

  /* ─── Boot ─── */
  async function boot() {
    initScene();
    installInput();
    bindUI();
    updateCamera();
    updateResults();
    updateStatusBar();

    await initWebGPU();

    requestAnimationFrame(loop);
  }

  /* Go */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Expose for future modules */
  window.CFDEngine = {
    state: state,
    setMesh: setMesh,
    MESHES: MESHES
  };
})();
