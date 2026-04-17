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
    executionTier: 'detecting',
    phaseLabel: 'Phase A shell',
    supportsKernel: false,
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
      inletDir: '+x',
      stepsPerFrame: 4
    },
    workflow: {
      geometry: false,
      domain: false,
      boundary: false,
      solver: false,
      run: false,
      inspect: false
    },
    domain: {
      x: 6,
      y: 6,
      z: 6
    },
    domainVisuals: {
      group: null
    },
    mesh: {
      active: 'sphere',
      object: null,
      wireframe: null
    },
    vizMode: 'solid',
    results: {
      cd: null, cl: null, cs: null,
      maxVel: null, massError: null
    },
    lastTs: 0,
    frameCount: 0
  };

  /* ─── DOM helpers ─── */
  function $(id) { return document.getElementById(id); }
  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function setDisabled(el, disabled) {
    if (!el) return;
    el.disabled = !!disabled;
    el.classList.toggle('is-disabled', !!disabled);
  }
  function formatDomainSummary() {
    return state.domain.x.toFixed(1) + ' x ' + state.domain.y.toFixed(1) + ' x ' + state.domain.z.toFixed(1);
  }
  function formatDomainViewport() {
    return state.domain.x.toFixed(1) + ' × ' + state.domain.y.toFixed(1) + ' × ' + state.domain.z.toFixed(1) + ' m';
  }
  function formatMaybe(value, digits, suffix) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value.toFixed(digits) + (suffix || '');
  }

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
    sphere: { label: 'Sphere', ico: '<i data-lucide="circle"></i>', meta: 'r = 0.6, ~2500 faces', build: function () {
      return new THREE.SphereGeometry(0.6, 40, 40);
    }},
    cube: { label: 'Cube', ico: '<i data-lucide="square"></i>', meta: '1.0 × 1.0 × 1.0', build: function () {
      return new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
    }},
    cylinder: { label: 'Cylinder', ico: '<i data-lucide="cylinder"></i>', meta: 'r = 0.4, h = 1.2', build: function () {
      return new THREE.CylinderGeometry(0.4, 0.4, 1.2, 36, 1);
    }},
    airfoil: { label: 'NACA 0012', ico: '<i data-lucide="plane"></i>', meta: 'chord = 2.0, span = 1.0', build: function () {
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
    car: { label: 'Ahmed Body', ico: '<i data-lucide="car"></i>', meta: 'simplified bluff body', build: function () {
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
  function determineExecutionTier(adapter) {
    if (!adapter || !adapter.limits) return 'demo';
    if (
      adapter.limits.maxComputeInvocationsPerWorkgroup >= 256 &&
      adapter.limits.maxStorageBufferBindingSize >= 268435456
    ) {
      return 'full';
    }
    return 'reduced';
  }

  function tierLabel(tier) {
    if (tier === 'detecting') return 'Detecting tier';
    if (tier === 'full') return 'Full route';
    if (tier === 'reduced') return 'Reduced route';
    return 'Demo route';
  }

  function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }
    if (typeof material.dispose === 'function') material.dispose();
  }

  function clearDomainBox() {
    var group = state.domainVisuals.group;
    if (!group || !state.scene) return;
    group.traverse(function (node) {
      if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
      if (node.material) disposeMaterial(node.material);
    });
    state.scene.remove(group);
    state.domainVisuals.group = null;
  }

  function buildDomainBox() {
    if (!state.scene) return;
    clearDomainBox();

    var sx = state.domain.x;
    var sy = state.domain.y;
    var sz = state.domain.z;
    var group = new THREE.Group();
    var boxGeo = new THREE.BoxGeometry(sx, sy, sz);
    var edges = new THREE.EdgesGeometry(boxGeo);
    var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: 0x5ad1ff, transparent: true, opacity: 0.12
    }));
    group.add(line);

    var planeGeo;
    var planeMat = new THREE.MeshBasicMaterial({
      color: 0x5ad1ff, transparent: true, opacity: 0.04, side: THREE.DoubleSide
    });
    var inlet = null;
    var arrowDir = new THREE.Vector3(1, 0, 0);

    if (state.solver.inletDir === '+x' || state.solver.inletDir === '-x') {
      planeGeo = new THREE.PlaneGeometry(sy, sz);
      inlet = new THREE.Mesh(planeGeo, planeMat);
      inlet.position.x = state.solver.inletDir === '+x' ? (-sx / 2) : (sx / 2);
      inlet.rotation.y = Math.PI / 2;
      arrowDir.set(state.solver.inletDir === '+x' ? 1 : -1, 0, 0);
    } else {
      planeGeo = new THREE.PlaneGeometry(sx, sy);
      inlet = new THREE.Mesh(planeGeo, planeMat);
      inlet.position.z = state.solver.inletDir === '+z' ? (-sz / 2) : (sz / 2);
      arrowDir.set(0, 0, state.solver.inletDir === '+z' ? 1 : -1);
    }
    group.add(inlet);

    var yOffsets = [-sy * 0.26, 0, sy * 0.26];
    var zOffsets = [-sz * 0.26, 0, sz * 0.26];
    for (var yi = 0; yi < yOffsets.length; yi++) {
      for (var zi = 0; zi < zOffsets.length; zi++) {
        var origin = new THREE.Vector3(
          arrowDir.x ? inlet.position.x - arrowDir.x * 0.3 : (-sx * 0.26 + zi * sx * 0.26),
          yOffsets[yi],
          arrowDir.z ? inlet.position.z - arrowDir.z * 0.3 : zOffsets[zi]
        );
        if (!arrowDir.x) origin.x = -sx * 0.26 + zi * sx * 0.26;
        if (!arrowDir.z) origin.z = zOffsets[zi];
        var arrow = new THREE.ArrowHelper(arrowDir.clone(), origin, 0.8, 0x5ad1ff, 0.15, 0.1);
        arrow.line.material.transparent = true;
        arrow.line.material.opacity = 0.25;
        arrow.cone.material.transparent = true;
        arrow.cone.material.opacity = 0.25;
        group.add(arrow);
      }
    }

    state.scene.add(group);
    state.domainVisuals.group = group;
    setText('vp-domain', formatDomainViewport());
    setText('domain-badge', formatDomainSummary());
  }

  function invalidateWorkflowFrom(stepKey) {
    var order = ['geometry', 'domain', 'boundary', 'solver', 'run', 'inspect'];
    var seen = false;
    for (var i = 0; i < order.length; i++) {
      if (order[i] === stepKey) seen = true;
      if (seen) state.workflow[order[i]] = false;
    }
    state.solver.running = false;
    state.solver.paused = false;
  }

  function setWorkflowStep(stepKey, message) {
    state.workflow[stepKey] = true;
    state.workflow.run = false;
    state.workflow.inspect = false;
    if (message) updateGPUStatus(state.gpuReady ? 'ready' : 'error', message);
    syncCFDUI();
  }

  function syncWorkflowPills() {
    var order = ['geometry', 'domain', 'boundary', 'solver', 'run', 'inspect'];
    var firstPending = null;
    for (var i = 0; i < order.length; i++) {
      if (!state.workflow[order[i]]) {
        firstPending = order[i];
        break;
      }
    }
    order.forEach(function (key) {
      var el = $('wf-' + key);
      if (!el) return;
      el.classList.remove('is-current', 'is-complete', 'is-locked');
      if (state.workflow[key]) el.classList.add('is-complete');
      else if (firstPending === key) el.classList.add('is-current');
      else el.classList.add('is-locked');
    });

    var note = 'Select and confirm a geometry to unlock the domain stage.';
    var vpWorkflow = 'Geometry pending';
    if (state.workflow.geometry && !state.workflow.domain) {
      note = 'Size the CFD domain and confirm it before boundary work starts.';
      vpWorkflow = 'Domain pending';
    } else if (state.workflow.domain && !state.workflow.boundary) {
      note = 'Apply boundary conditions to unlock solver routing.';
      vpWorkflow = 'Boundary pending';
    } else if (state.workflow.boundary && !state.workflow.solver) {
      note = 'Lock the solver settings to finish Phase A routing.';
      vpWorkflow = 'Solver pending';
    } else if (state.workflow.solver && !state.supportsKernel) {
      note = 'Phase A shell is complete. Run stays locked until the numerical kernel is wired in.';
      vpWorkflow = 'Kernel pending';
    }
    setText('wf-status-note', note);
    setText('vp-workflow', vpWorkflow);
  }

  function syncPanelLocks() {
    var locks = {
      'p-domain': !state.workflow.geometry,
      'p-boundary': !state.workflow.domain,
      'p-solver': !state.workflow.boundary,
      'p-viz': !state.workflow.inspect
    };
    Object.keys(locks).forEach(function (id) {
      var panel = $(id);
      if (!panel) return;
      panel.classList.toggle('is-locked', locks[id]);
      if (locks[id]) panel.classList.remove('is-open');
    });
  }

  function syncGridConstraints() {
    var gridSel = $('s-grid');
    if (!gridSel) return;
    var limitHighRes = state.executionTier !== 'full';
    Array.prototype.forEach.call(gridSel.options, function (opt) {
      var highRes = opt.value === '128x64x64' || opt.value === '128x128x128';
      opt.disabled = limitHighRes && highRes;
    });
    if (limitHighRes && (gridSel.value === '128x64x64' || gridSel.value === '128x128x128')) {
      gridSel.value = '64x64x64';
      state.solver.gridX = 64;
      state.solver.gridY = 64;
      state.solver.gridZ = 64;
    }
    setText('vp-grid', state.solver.gridX + ' × ' + state.solver.gridY + ' × ' + state.solver.gridZ);
  }

  function syncToolbarLocks() {
    var canRun = state.workflow.solver && state.supportsKernel;
    var canInspect = state.workflow.inspect;
    setDisabled($('btn-run'), !canRun);
    setDisabled($('btn-pause'), !(state.solver.running && state.supportsKernel));
    setDisabled($('btn-export'), !canInspect);
    setDisabled($('btn-screenshot'), true);
    setDisabled($('btn-confirm-domain'), !state.workflow.geometry);
    setDisabled($('btn-confirm-boundary'), !state.workflow.domain);
    setDisabled($('btn-confirm-solver'), !state.workflow.boundary);
  }

  function syncFieldLocks() {
    document.querySelectorAll('.cfd-viz-btn[data-requires-field="true"]').forEach(function (btn) {
      btn.classList.toggle('is-disabled', !state.workflow.inspect);
      btn.disabled = !state.workflow.inspect;
    });
    setDisabled($('s-colormap'), !state.workflow.inspect);
    setDisabled($('s-field'), !state.workflow.inspect);
    if (!state.workflow.inspect && state.vizMode !== 'solid' && state.vizMode !== 'wireframe') {
      state.vizMode = 'solid';
    }
  }

  function syncPhaseMeta() {
    var tierText = tierLabel(state.executionTier);
    setText('wf-phase-badge', state.phaseLabel);
    setText('wf-tier-badge', tierText);
    setText('r-phase', state.phaseLabel);
    setText('r-tier', tierText);
    setText('r-kernel', state.supportsKernel ? 'Connected' : 'Workflow shell only');
    setText('r-export', state.workflow.inspect ? 'Inspection unlocked' : 'Locked until kernel is wired');
  }

  function syncCFDUI() {
    syncWorkflowPills();
    syncPanelLocks();
    syncGridConstraints();
    syncToolbarLocks();
    syncFieldLocks();
    syncPhaseMeta();
    updateResults();
    updateStatusBar();
    applyVizMode();
  }

  async function initWebGPU() {
    var errorOverlay = $('gpu-error-overlay');
    if (errorOverlay) errorOverlay.style.display = 'none';

    if (!navigator.gpu) {
      showGPUError(
        'WebGPU unavailable',
        'This browser cannot expose the GPU compute path, so the CFD page stays in demo-route shell mode.',
        'Geometry and workflow validation still work.'
      );
      return false;
    }

    try {
      state.adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!state.adapter) {
        showGPUError(
          'No GPU adapter found',
          'A WebGPU adapter was not returned, so the CFD page is limited to the demo route.',
          'Try updating your GPU drivers or browser build.'
        );
        return false;
      }

      state.executionTier = determineExecutionTier(state.adapter);
      state.gpu = await state.adapter.requestDevice();
      state.gpuReady = true;

      state.gpu.lost.then(function (info) {
        console.error('WebGPU device lost:', info.message);
        state.gpuReady = false;
        state.executionTier = 'demo';
        updateGPUStatus('error', 'GPU device lost - demo route only');
        syncCFDUI();
      });

      updateGPUStatus('ready', 'WebGPU ready - ' + tierLabel(state.executionTier));
      syncCFDUI();
      return true;

    } catch (err) {
      showGPUError(
        'WebGPU init failed',
        err && err.message ? err.message : 'Unknown GPU initialization error',
        'The CFD shell will stay on the demo route.'
      );
      return false;
    }
  }

  function showGPUError(title, body, hint) {
    state.gpuError = title;
    state.gpuReady = false;
    state.executionTier = 'demo';
    console.warn(title + ': ' + body + ' ' + hint);
    updateGPUStatus('error', title + ' - demo route');
    syncCFDUI();
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

  function setMesh(key) {
    if (state.mesh.object) {
      state.scene.remove(state.mesh.object);
      if (state.mesh.wireframe) state.scene.remove(state.mesh.wireframe);
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

    document.querySelectorAll('.cfd-mesh-item').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.mesh === key);
    });

    setText('mesh-badge-name', def.label);
    setText('sb-mesh-name', def.label);
    setText('vp-object', def.label + ' (' + def.meta + ')');
    invalidateWorkflowFrom('geometry');
    syncCFDUI();
  }

  function bindUI() {
    document.querySelectorAll('.cfd-mesh-item').forEach(function (el) {
      el.addEventListener('click', function () {
        setMesh(el.dataset.mesh);
      });
    });

    document.querySelectorAll('.cfd-panel-head').forEach(function (head) {
      head.addEventListener('click', function () {
        if (head.parentElement.classList.contains('is-locked')) return;
        head.parentElement.classList.toggle('is-open');
      });
    });

    document.querySelectorAll('.cfd-viz-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled || btn.classList.contains('is-disabled')) return;
        document.querySelectorAll('.cfd-viz-btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        state.vizMode = btn.dataset.mode;
        applyVizMode();
      });
    });

    var runBtn = $('btn-run');
    var pauseBtn = $('btn-pause');
    var resetBtn = $('btn-reset');

    if (runBtn) runBtn.addEventListener('click', function () {
      if (!state.workflow.solver || !state.supportsKernel) {
        updateGPUStatus('error', 'Run locked - numerical kernel not wired into this shell yet');
        return;
      }
      state.solver.running = true;
      state.solver.paused = false;
      updateGPUStatus('running', 'Solver running - iteration ' + state.solver.iteration);
      syncCFDUI();
    });

    if (pauseBtn) pauseBtn.addEventListener('click', function () {
      if (!state.supportsKernel || !state.solver.running) return;
      state.solver.paused = !state.solver.paused;
      updateGPUStatus(state.solver.paused ? 'ready' : 'running', state.solver.paused ? 'Solver paused' : 'Solver running');
      syncCFDUI();
    });

    if (resetBtn) resetBtn.addEventListener('click', function () {
      state.solver.running = false;
      state.solver.paused = false;
      state.solver.iteration = 0;
      state.workflow.run = false;
      state.workflow.inspect = false;
      state.results = { cd: null, cl: null, cs: null, maxVel: null, massError: null };
      updateGPUStatus(state.gpuReady ? 'ready' : 'error', state.gpuReady ? ('WebGPU ready - ' + tierLabel(state.executionTier)) : 'Demo route active');
      syncCFDUI();
    });

    bindSlider('s-tau', 'v-tau', function (v) {
      state.solver.tau = parseFloat(v);
      invalidateWorkflowFrom('solver');
      syncCFDUI();
      return parseFloat(v).toFixed(3);
    });

    bindSlider('s-inlet', 'v-inlet', function (v) {
      state.solver.inletSpeed = parseFloat(v);
      invalidateWorkflowFrom('boundary');
      syncCFDUI();
      return parseFloat(v).toFixed(3) + ' lu/ts';
    });

    bindSlider('s-steps', 'v-steps', function (v) {
      state.solver.stepsPerFrame = parseInt(v, 10);
      invalidateWorkflowFrom('solver');
      syncCFDUI();
      return v;
    });

    bindSlider('s-domain-x', 'v-domain-x', function (v) {
      state.domain.x = parseFloat(v);
      buildDomainBox();
      invalidateWorkflowFrom('domain');
      syncCFDUI();
      return parseFloat(v).toFixed(1) + ' m';
    });
    bindSlider('s-domain-y', 'v-domain-y', function (v) {
      state.domain.y = parseFloat(v);
      buildDomainBox();
      invalidateWorkflowFrom('domain');
      syncCFDUI();
      return parseFloat(v).toFixed(1) + ' m';
    });
    bindSlider('s-domain-z', 'v-domain-z', function (v) {
      state.domain.z = parseFloat(v);
      buildDomainBox();
      invalidateWorkflowFrom('domain');
      syncCFDUI();
      return parseFloat(v).toFixed(1) + ' m';
    });

    var inletDir = $('s-inlet-dir');
    if (inletDir) inletDir.addEventListener('change', function () {
      state.solver.inletDir = inletDir.value;
      buildDomainBox();
      invalidateWorkflowFrom('boundary');
      syncCFDUI();
    });

    var gridSel = $('s-grid');
    if (gridSel) gridSel.addEventListener('change', function () {
      var parts = gridSel.value.split('x');
      state.solver.gridX = parseInt(parts[0], 10);
      state.solver.gridY = parseInt(parts[1], 10);
      state.solver.gridZ = parseInt(parts[2], 10);
      invalidateWorkflowFrom('solver');
      syncCFDUI();
    });

    if ($('btn-confirm-geometry')) $('btn-confirm-geometry').addEventListener('click', function () {
      setWorkflowStep('geometry', 'Geometry confirmed - define the CFD domain next');
    });
    if ($('btn-confirm-domain')) $('btn-confirm-domain').addEventListener('click', function () {
      if (!state.workflow.geometry) return;
      setWorkflowStep('domain', 'Domain confirmed - boundary setup is now unlocked');
    });
    if ($('btn-confirm-boundary')) $('btn-confirm-boundary').addEventListener('click', function () {
      if (!state.workflow.domain) return;
      setWorkflowStep('boundary', 'Boundary setup confirmed - lock the solver routing next');
    });
    if ($('btn-confirm-solver')) $('btn-confirm-solver').addEventListener('click', function () {
      if (!state.workflow.boundary) return;
      setWorkflowStep('solver', 'Phase A shell complete - run remains locked until the kernel exists');
    });

    syncCFDUI();
  }

  function applyVizMode() {
    if (!state.mesh.object) return;
    if (state.vizMode !== 'solid' && state.vizMode !== 'wireframe' && !state.workflow.inspect) {
      state.vizMode = 'solid';
      document.querySelectorAll('.cfd-viz-btn').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.dataset.mode === 'solid');
      });
    }
    if (state.mesh.object instanceof THREE.Group) return;

    if (state.vizMode === 'wireframe') {
      state.mesh.object.material.wireframe = true;
      state.mesh.object.material.opacity = 0.6;
      state.mesh.object.material.transparent = true;
    } else {
      state.mesh.object.material.wireframe = false;
      state.mesh.object.material.opacity = 1;
      state.mesh.object.material.transparent = false;
    }
    if (state.mesh.wireframe) state.mesh.wireframe.visible = true;
  }

  function updateResults() {
    setText('r-cd', formatMaybe(state.results.cd, 4, ''));
    setText('r-cl', formatMaybe(state.results.cl, 4, ''));
    setText('r-cs', formatMaybe(state.results.cs, 4, ''));
    setText('r-maxvel', formatMaybe(state.results.maxVel, 4, ''));
    setText('r-mass-err', formatMaybe(typeof state.results.massError === 'number' ? state.results.massError * 100 : null, 4, '%'));
    if (!state.workflow.solver) setText('r-conv-status', 'Locked');
    else if (!state.supportsKernel) setText('r-conv-status', 'Kernel pending');
    else if (state.solver.running) setText('r-conv-status', 'Running');
    else setText('r-conv-status', 'Ready');
  }

  function updateStatusBar() {
    setText('sb-phase', state.phaseLabel);
    setText('sb-tier', tierLabel(state.executionTier));
    setText('sb-iter', state.solver.iteration.toLocaleString());
    setText('sb-grid', state.solver.gridX + '×' + state.solver.gridY + '×' + state.solver.gridZ);
    setText('sb-tau', state.solver.tau.toFixed(3));
    setText('sb-inlet', state.solver.inletSpeed.toFixed(3));
    setText('sb-fps', '—');
  }

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
    document.title = 'WindSim - CFD Laboratory';
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'WindSim CFD Laboratory Phase A shell. Hardware routing, geometry setup, domain sizing, and workflow gating for the upcoming WebGPU solver stack.');
    }
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
