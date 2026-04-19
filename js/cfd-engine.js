/**
 * WindSim CFD Laboratory — Engine
 * WebGPU initialization, Three.js scene setup, and Phase B Geometry pipeline.
 */
(function () {
  'use strict';

  /* ─── State ─── */
  var state = {
    gpu: null, adapter: null, gpuReady: false, gpuError: '',
    executionTier: 'detecting', // 'full', 'reduced', 'demo'
    phaseLabel: 'Phase C — Solver',
    supportsKernel: false,
    scene: null, camera: null, renderer: null,
    controls: {
      yaw: -0.4, pitch: 0.6, distance: 8,
      target: { x: 0, y: 0, z: 0 },
      dragging: false, lastX: 0, lastY: 0, fov: 50
    },
    solver: {
      running: false, paused: false, iteration: 0,
      gridX: 64, gridY: 64, gridZ: 64,
      tau: 0.8, inletSpeed: 0.02, inletDir: '+x',
      stepsPerFrame: 4,
      divergenceHalt: false
    },
    workflow: {
      geometry: false, domain: false, boundary: false, solver: false, run: false, inspect: false
    },
    domain: { x: 6, y: 6, z: 6 },
    domainVisuals: { group: null },
    mesh: {
      active: 'sphere', object: null, wireframe: null, voxelPoints: null
    },
    viz: {
      post: null, mode: 'solid', field: 'pressure', colormap: 'viridis',
      sliceAxis: 'x', slicePos: 0, sliceMesh: null,
      streamlineSeeds: 64, streamlineSteps: 200, streamlineLines: null,
      range: { min: -0.05, max: 0.05 }, showGeo: true, 
      needsUpdate: false
    },
    results: {
      cd: null, cl: null, cs: null, maxVel: null, massError: null
    },
    lastTs: 0, frameCount: 0,
    voxelMask: null, voxelHash: '',
    solverKernel: null,
    obs: null, // ObservabilityManager instance
    runId: '',
    diagnosticMode: false
  };

  /* ─── DOM Helpers ─── */
  function $(id) { return document.getElementById(id); }
  function setText(id, txt) { var el = (typeof id === 'string') ? $(id) : id; if (el) el.textContent = txt; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function setDisabled(el, disabled) {
    if (typeof el === 'string') el = $(el);
    if (!el) return;
    el.disabled = !!disabled;
    el.classList.toggle('is-disabled', !!disabled);
  }
  function formatDomainSummary() { return state.domain.x.toFixed(1) + 'x' + state.domain.y.toFixed(1) + 'x' + state.domain.z.toFixed(1); }
  function formatDomainViewport() { return state.domain.x.toFixed(1) + ' × ' + state.domain.y.toFixed(1) + ' × ' + state.domain.z.toFixed(1) + ' m'; }

  function logValidation(msg, type) {
    const log = $('validation-log');
    const card = $('validation-log-card');
    if (!log || !card) return;
    card.style.display = 'block';
    const entry = document.createElement('div');
    entry.style.marginBottom = '4px'; entry.style.paddingLeft = '8px';
    entry.style.borderLeft = '2px solid ' + (type === 'error' ? '#ef4444' : (type === 'warning' ? '#f59e0b' : '#10b981'));
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  /* ─── UI Syncing Logic ─── */
  function syncCFDUI() {
    var order = ['geometry', 'domain', 'boundary', 'solver', 'run', 'inspect'];
    var firstPending = null;
    for (var i = 0; i < order.length; i++) {
        if (!state.workflow[order[i]]) { firstPending = order[i]; break; }
    }

    // Update Pills
    order.forEach(key => {
        var el = $('wf-' + key);
        if (!el) return;
        el.classList.remove('is-current', 'is-complete', 'is-locked');
        if (state.workflow[key]) el.classList.add('is-complete');
        else if (firstPending === key) el.classList.add('is-current');
        else el.classList.add('is-locked');
    });

    // Update Text Notes
    var note = 'Select and confirm a geometry to unlock the domain stage.';
    var vpWorkflow = 'Geometry pending';
    if (state.workflow.geometry && !state.workflow.domain) {
      note = 'Size the CFD domain and confirm it before boundary work starts.';
      vpWorkflow = 'Domain pending';
    } else if (state.workflow.domain && !state.workflow.boundary) {
      note = 'Apply boundary conditions to unlock solver routing.';
      vpWorkflow = 'Boundary pending';
    } else if (state.workflow.boundary && !state.workflow.solver) {
      note = 'Lock the solver settings to finish Phase B setup.';
      vpWorkflow = 'Solver pending';
    } else if (state.workflow.solver) {
      note = 'Pipeline set. CPU Voxelization confirmed.';
      vpWorkflow = 'Ready to Simulate';
    }
    setText('wf-status-note', note);
    setText('vp-workflow', vpWorkflow);

    // Update Panel Locks
    var locks = { 'p-domain': !state.workflow.geometry, 'p-boundary': !state.workflow.domain, 'p-solver': !state.workflow.boundary, 'p-viz': !state.workflow.inspect };
    Object.keys(locks).forEach(id => {
      var panel = $(id);
      if (panel) {
          panel.classList.toggle('is-locked', locks[id]);
          if (locks[id]) panel.classList.remove('is-open');
      }
    });

    // Toolbar Locks
    setDisabled('btn-confirm-domain', !state.workflow.geometry);
    setDisabled('btn-confirm-boundary', !state.workflow.domain);
    setDisabled('btn-confirm-solver', !state.workflow.boundary);
    setDisabled('btn-run', !state.workflow.solver || !state.supportsKernel || state.solver.divergenceHalt);
    setDisabled('btn-pause', !state.workflow.run || state.solver.divergenceHalt);

    setText('vp-grid', state.solver.gridX + ' × ' + state.solver.gridY + ' × ' + state.solver.gridZ);
    setText('vp-domain', formatDomainViewport());
    setText('domain-badge', formatDomainSummary());
    
    // Check if we can unlock Inspect
    if (state.solver.iteration > 100 && !state.workflow.inspect) {
        setWorkflowStep('inspect');
    }

    updateStatusBar();
    applyVizMode();
  }

  function invalidateWorkflowFrom(stepKey, silent) {
    if (silent) return;
    var order = ['geometry', 'domain', 'boundary', 'solver', 'run', 'inspect'];
    var seen = false;
    for (var i = 0; i < order.length; i++) {
      if (order[i] === stepKey) seen = true;
      if (seen) state.workflow[order[i]] = false;
    }
    syncCFDUI();
  }

  function setWorkflowStep(stepKey, message) {
    state.workflow[stepKey] = true;
    if (message) updateGPUStatus(state.gpuReady ? 'ready' : 'error', message);
    
    // Auto-unlock solver on Phase B completion
    if (stepKey === 'solver') {
        initSolver();
    }
    
    syncCFDUI();
  }

  /* ─── Solver Management (Phase C) ─── */
  function initSolver() {
    if (!state.voxelMask) return;
    logValidation('Initializing LBM D3Q19 kernel...', 'info');
    
    state.solverKernel = new WindSimSolver.LBMSolver();
    state.solverKernel.init(
        [state.domain.x, state.domain.y, state.domain.z],
        [state.solver.gridX, state.solver.gridY, state.solver.gridZ],
        { tau: state.solver.tau },
        state.voxelMask
    );

    // Apply strict BCs
    state.solverKernel.setBoundaryConditions([
        { type: 'inlet', dir: state.solver.inletDir, speed: state.solver.inletSpeed }
    ]);

    state.obs = state.obs || new WindSimObservability.ObservabilityManager(state.runId);
    state.runId = state.obs.runId;
    state.workflow.run = true;
    state.supportsKernel = true;
    state.solver.divergenceHalt = false;
    
    syncCFDUI();
    logValidation(`Solver ready. Run ID: ${state.runId}`, 'success');
    saveSimulationState();
  }

  function toggleSimulation() {
    if (!state.solverKernel) return;
    state.solver.running = !state.solver.running;
    state.solver.paused = !state.solver.running;
    
    if (state.solver.running) {
        updateGPUStatus('running', 'Solver Active');
        logValidation('Simulation started.', 'info');
    } else {
        updateGPUStatus('ready', 'Solver Paused');
        logValidation('Simulation paused.', 'warning');
    }
    syncCFDUI();
    saveSimulationState();
  }

  function resetSimulation() {
    if (!state.solverKernel) return;
    state.solver.running = false;
    state.solver.paused = false;
    state.solver.iteration = 0;
    state.logs = [];
    initSolver(); // Re-init
    logValidation('Simulation reset.', 'warning');
    syncCFDUI();
  }

  function handleDivergence(diag) {
    state.solver.running = false;
    state.solver.paused = false;
    state.solver.divergenceHalt = true;
    updateGPUStatus('error', 'DIVERGENCE DETECTED');
    logValidation(`HALT: Physical stability limit exceeded! Mass drift: ${(diag.massDrift*100).toFixed(2)}%`, 'error');
    
    setText('r-conv-status', 'HALTED');
    $('r-conv-status').style.color = '#ef4444';
    syncCFDUI();
    saveSimulationState();
  }

  async function saveSimulationState() {
    if (state.obs) {
        await state.obs.saveSession(state, state.solverKernel);
    }
  }

  async function loadSimulationState() {
    state.obs = new WindSimObservability.ObservabilityManager();
    let snapshot = null;
    try {
        snapshot = await state.obs.loadSession();
    } catch (e) {
        console.warn('Persistence Load Error:', e);
    }
    
    if (!snapshot || !snapshot.engine) {
        logValidation('No saved session found.', 'info');
        return;
    }
    
    try {
        const engine = snapshot.engine;
        const savedSolver = engine.solver;
        if (!savedSolver) return;

        // Restore basic state with fallbacks
        Object.assign(state.solver, savedSolver);
        Object.assign(state.workflow, engine.workflow || {});
        state.domain = engine.domain || state.domain;
        state.voxelHash = engine.voxelHash || '';
        state.runId = snapshot.runId || state.runId;
        
        // Restore Mesh Context
        if (engine.mesh && engine.mesh.active && engine.mesh.active !== state.mesh.active) {
            setMesh(engine.mesh.active, true);
        }

        // Ensure workflow flags are consistent
        if (state.voxelHash) state.workflow.geometry = true;
        
        // Restore solver kernel if saved
        if (snapshot.solverState) {
            state.solverKernel = new WindSimSolver.LBMSolver();
            state.solverKernel.loadStateSnapshot(snapshot.solverState);
            state.supportsKernel = true;
        } else if (state.workflow.solver) {
            // Re-init if metadata exists but buffers don't (fallback)
            initSolver();
            state.solver.iteration = savedSolver.iteration || 0;
        }
        
        logValidation(`Recovered session (Iter: ${state.solver.iteration}). Run ID: ${state.runId}`, 'success');
        syncCFDUI();
    } catch (e) {
        console.error('Failed to load state', e);
        logValidation('Session recovery partially failed. (Schema mismatch)', 'error');
    }
  }

  /* ─── Three.js Scene ─── */
  function initScene() {
    var viewport = $('cfd-viewport');
    if (!viewport) return;
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0a0e13);
    state.camera = new THREE.PerspectiveCamera(state.controls.fov, viewport.clientWidth / viewport.clientHeight, 0.1, 500);
    updateCamera();
    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    viewport.appendChild(state.renderer.domElement);

    state.scene.add(new THREE.AmbientLight(0x4488aa, 0.5));
    var dl = new THREE.DirectionalLight(0xffffff, 1);
    dl.position.set(5, 10, 7);
    state.scene.add(dl);

    var grid = new THREE.GridHelper(12, 24, 0x1a232e, 0x151c24);
    grid.position.y = -3;
    state.scene.add(grid);

    buildDomainBox();
    setMesh('sphere');
    window.addEventListener('resize', resize);
  }

  /* ─── Mesh Logic ─── */
  var MESHES = {
    sphere: { label: 'Sphere', build: () => new THREE.SphereGeometry(0.6, 32, 32), meta: 'r=0.6' },
    cube: { label: 'Cube', build: () => new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), meta: '1x1x1' },
    cylinder: { label: 'Cylinder', build: () => new THREE.CylinderGeometry(0.4, 0.4, 1.2, 32), meta: 'r=0.4, h=1.2' },
    airfoil: { label: 'Airfoil', build: () => {
        var shape = new THREE.Shape();
        // Upper surface
        for (var i = 0; i <= 30; i++) {
            var t = i / 30; var x = 2 * t;
            var yt = 0.12 / 0.2 * 2 * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t**2 + 0.2843 * t**3 - 0.1015 * t**4);
            if (i === 0) shape.moveTo(x - 1, yt); else shape.lineTo(x - 1, yt);
        }
        // Explicitly close trailing edge to zero thickness for manifold voxelization
        shape.lineTo(1.0, 0.0); 
        // Lower surface
        for (var i = 30; i >= 0; i--) {
            var t = i / 30; var x = 2 * t;
            var yt = 0.12 / 0.2 * 2 * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t**2 + 0.2843 * t**3 - 0.1015 * t**4);
            shape.lineTo(x - 1, -yt);
        }
        shape.closePath(); 
        var geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
        geo.center(); geo.rotateX(Math.PI/2); return geo;
    }, meta: 'chord=2.0' }
  };

  function setMesh(key) {
    if (state.mesh.object) {
        state.scene.remove(state.mesh.object);
        if (state.mesh.wireframe) state.scene.remove(state.mesh.wireframe);
    }
    state.mesh.active = key;
    var def = MESHES[key]; if (!def) return;
    var built = def.build();
    state.mesh.object = new THREE.Mesh(built, new THREE.MeshStandardMaterial({ color: 0x5a7080, roughness: 0.5, metalness: 0.4 }));
    state.scene.add(state.mesh.object);

    state.mesh.wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(built, 15), new THREE.LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.08 }));
    state.scene.add(state.mesh.wireframe);

    document.querySelectorAll('.cfd-mesh-item').forEach(el => el.classList.toggle('is-active', el.dataset.mesh === key));
    setText('sb-mesh-name', def.label);
    setText('vp-object', def.label + ' (' + def.meta + ')');
    invalidateWorkflowFrom('geometry', arguments[1] === true);
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    logValidation(`Loading ${file.name}...`, 'info');
    if (file.name.toLowerCase().endsWith('.stl')) {
        const reader = new FileReader();
        reader.onload = async event => {
            try {
                if (THREE.STLLoader) {
                    const geometry = new THREE.STLLoader().parse(event.target.result);
                    updateActiveMesh(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x5a7080 })), file.name);
                } else logValidation('STLLoader missing.', 'error');
            } catch (err) { logValidation(`Error: ${err.message}`, 'error'); }
        };
        reader.readAsArrayBuffer(file);
    }
  }

  function updateActiveMesh(threeMesh, name) {
    if (state.mesh.object) { state.scene.remove(state.mesh.object); if (state.mesh.wireframe) state.scene.remove(state.mesh.wireframe); }
    state.mesh.active = 'custom'; state.mesh.object = threeMesh; state.scene.add(threeMesh);
    state.mesh.wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(threeMesh.geometry, 15), new THREE.LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.08 }));
    state.scene.add(state.mesh.wireframe);
    setText('sb-mesh-name', name); setText('vp-object', name);
    invalidateWorkflowFrom('geometry');
  }

  async function runVoxelization() {
    if (!state.mesh.object) return false;
    logValidation('Starting Geometry Pipeline...', 'info');
    let geometry = null;
    state.mesh.object.traverse(c => { if (c.isMesh) geometry = c.geometry; });
    if (!geometry) return false;

    let pos = geometry.attributes.position.array;
    let idx = geometry.index ? geometry.index.array : new Int32Array(pos.length/3).map((_, i) => i);

    const mesh = new WindSimGeometry.TriMesh(pos, idx);
    const report = mesh.validate();
    report.warnings.forEach(w => logValidation(w, 'warning'));
    report.errors.forEach(e => logValidation(e, 'error'));
    if (!report.success) return false;
    logValidation('Geometry manifold validation passed. (Open edges: 0)', 'success');

    const gridAABB = { min: [-state.domain.x/2, -state.domain.y/2, -state.domain.z/2], max: [state.domain.x/2, state.domain.y/2, state.domain.z/2] };
    const voxelizer = new WindSimGeometry.Voxelizer(mesh, [state.solver.gridX, state.solver.gridY, state.solver.gridZ], gridAABB);
    
    const start = performance.now();
    state.voxelMask = await voxelizer.voxelize();
    state.voxelHash = await voxelizer.generateHash(state.voxelMask, { res: [state.solver.gridX, state.solver.gridY, state.solver.gridZ], aabb: gridAABB });
    const elapsed = performance.now() - start;

    updateVoxelPoints();
    logValidation(`Voxelized in ${elapsed.toFixed(0)}ms. Hash: ${state.voxelHash}`, 'success');
    return true;
  }

  /* ─── Domain ─── */
  function buildDomainBox() {
    if (!state.scene) return;
    if (state.domainVisuals.group) state.scene.remove(state.domainVisuals.group);
    var sx = state.domain.x, sy = state.domain.y, sz = state.domain.z;
    var group = new THREE.Group();
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)), new THREE.LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.12 })));
    var inlet = new THREE.Mesh(new THREE.PlaneGeometry(sy, sz), new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.04, side: THREE.DoubleSide }));
    inlet.position.x = -sx/2; inlet.rotation.y = Math.PI/2;
    group.add(inlet);
    state.scene.add(group);
    state.domainVisuals.group = group;
  }

  /* ─── UI Binding ─── */
  function bindUI() {
    document.querySelectorAll('.cfd-mesh-item').forEach(el => el.addEventListener('click', () => setMesh(el.dataset.mesh)));
    document.querySelectorAll('.cfd-panel-head').forEach(el => el.addEventListener('click', () => { if (!el.parentElement.classList.contains('is-locked')) el.parentElement.classList.toggle('is-open'); }));
    document.querySelectorAll('.cfd-viz-btn').forEach(btn => btn.addEventListener('click', () => {
      if (btn.classList.contains('is-disabled')) return;
      document.querySelectorAll('.cfd-viz-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.vizMode = btn.dataset.mode;
      applyVizMode();
    }));

    if ($('upload-zone')) $('upload-zone').addEventListener('click', () => $('file-upload').click());
    if ($('file-upload')) $('file-upload').addEventListener('change', handleFileUpload);

    if ($('btn-confirm-geometry')) $('btn-confirm-geometry').addEventListener('click', async () => {
      const btn = $('btn-confirm-geometry'); var old = btn.textContent; btn.disabled = true; btn.textContent = 'Processing...';
      const success = await runVoxelization();
      btn.disabled = false; btn.textContent = old;
      if (success) setWorkflowStep('geometry', 'Geometry confirmed');
    });
    if ($('btn-confirm-domain')) $('btn-confirm-domain').addEventListener('click', () => setWorkflowStep('domain', 'Domain confirmed'));
    if ($('btn-confirm-boundary')) $('btn-confirm-boundary').addEventListener('click', () => setWorkflowStep('boundary', 'Boundary confirmed'));
    if ($('btn-confirm-solver')) $('btn-confirm-solver').addEventListener('click', () => setWorkflowStep('solver', 'Solver setup locked'));

    if ($('btn-run')) $('btn-run').addEventListener('click', toggleSimulation);
    if ($('btn-pause')) $('btn-pause').addEventListener('click', toggleSimulation);
    if ($('btn-reset')) $('btn-reset').addEventListener('click', resetSimulation);

    // Phase D Bindings
    $('s-field').addEventListener('change', e => { state.viz.field = e.target.value; state.viz.needsUpdate = true; });
    $('s-colormap').addEventListener('change', e => { state.viz.colormap = e.target.value; state.viz.needsUpdate = true; });
    $('s-slice-pos').addEventListener('input', e => { 
        state.viz.slicePos = parseFloat(e.target.value); 
        setText('v-slice-pos', state.viz.slicePos.toFixed(2) + ' m');
        state.viz.needsUpdate = true; 
    });
    document.querySelectorAll('[data-axis]').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('[data-axis]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.viz.sliceAxis = btn.dataset.axis;
        state.viz.needsUpdate = true;
    }));
    $('s-seed-count').addEventListener('input', e => { 
        state.viz.streamlineSeeds = parseInt(e.target.value); 
        setText('v-seed-count', state.viz.streamlineSeeds);
        state.viz.needsUpdate = true; 
    });
    $('s-max-steps').addEventListener('input', e => { 
        state.viz.streamlineSteps = parseInt(e.target.value); 
        setText('v-max-steps', state.viz.streamlineSteps);
        state.viz.needsUpdate = true; 
    });
    $('i-range-min').addEventListener('input', e => { state.viz.range.min = parseFloat(e.target.value) || 0; state.viz.needsUpdate = true; });
    $('i-range-max').addEventListener('input', e => { state.viz.range.max = parseFloat(e.target.value) || 0.1; state.viz.needsUpdate = true; });
    $('c-show-geo').addEventListener('change', e => { state.viz.showGeo = e.target.checked; applyVizMode(); });

    function bind(id, sid, fn) { 
        var s = $(id); if (!s) return;
        s.addEventListener('input', () => { setText(sid, fn(s.value)); syncCFDUI(); }); 
    }
    bind('s-domain-x', 'v-domain-x', v => { state.domain.x = parseFloat(v); buildDomainBox(); invalidateWorkflowFrom('domain'); return v + ' m'; });
    bind('s-domain-y', 'v-domain-y', v => { state.domain.y = parseFloat(v); buildDomainBox(); invalidateWorkflowFrom('domain'); return v + ' m'; });
    bind('s-domain-z', 'v-domain-z', v => { state.domain.z = parseFloat(v); buildDomainBox(); invalidateWorkflowFrom('domain'); return v + ' m'; });
    
    var gridSel = $('s-grid');
    if (gridSel) gridSel.addEventListener('change', () => {
        var p = gridSel.value.split('x'); state.solver.gridX = parseInt(p[0]); state.solver.gridY = parseInt(p[1]); state.solver.gridZ = parseInt(p[2]);
        invalidateWorkflowFrom('solver');
    });

    syncCFDUI();
  }

  function applyVizMode() {
    if (!state.mesh.object) return;
    var mode = state.viz.mode;
    var isVoxel = mode === 'voxel';
    
    if (state.mesh.object) state.mesh.object.visible = state.viz.showGeo && !isVoxel;
    if (state.mesh.wireframe) state.mesh.wireframe.visible = state.viz.showGeo && !isVoxel && (mode === 'wireframe' || mode === 'solid');
    if (state.mesh.voxelPoints) state.mesh.voxelPoints.visible = isVoxel;
    
    if (!isVoxel && state.mesh.object.material) {
        state.mesh.object.material.wireframe = (mode === 'wireframe');
        state.mesh.object.material.opacity = (mode === 'wireframe') ? 0.6 : 1;
        state.mesh.object.material.transparent = (mode === 'wireframe');
        // Reset surface mapping colors if not in surface mode
        if (mode !== 'surface' && state.mesh.object.geometry.attributes.color) {
            state.mesh.object.geometry.deleteAttribute('color');
            state.mesh.object.material.vertexColors = false;
        }
    }

    // Toggle panel visibility
    $('ctl-slice-group').style.display = (mode === 'slice') ? 'block' : 'none';
    $('ctl-streamline-group').style.display = (mode === 'streamlines') ? 'block' : 'none';
    
    // Clear post meshes if mode changed
    if (mode !== 'slice' && state.viz.sliceMesh) { state.scene.remove(state.viz.sliceMesh); state.viz.sliceMesh = null; }
    if (mode !== 'streamlines' && state.viz.streamlineLines) { state.scene.remove(state.viz.streamlineLines); state.viz.streamlineLines = null; }
    
    state.viz.needsUpdate = true;
  }

  function updatePostVisuals() {
    if (!state.solverKernel || !state.workflow.inspect) return;
    if (!state.viz.needsUpdate) return;
    
    if (!state.viz.post) {
      const gridAABB = { min: [-state.domain.x/2, -state.domain.y/2, -state.domain.z/2], max: [state.domain.x/2, state.domain.y/2, state.domain.z/2] };
      state.viz.post = new WindSimPost.PostProcessor(
        [state.solver.gridX, state.solver.gridY, state.solver.gridZ],
        gridAABB,
        state.solverKernel.getFieldBuffers()
      );
    }

    const mode = state.viz.mode;
    const post = state.viz.post;

    if (mode === 'slice') {
        if (state.viz.sliceMesh) state.scene.remove(state.viz.sliceMesh);
        state.viz.sliceMesh = post.createSlice(state.viz.sliceAxis, state.viz.slicePos, state.viz.field, state.viz.colormap, state.viz.range);
        state.scene.add(state.viz.sliceMesh);
    } else if (mode === 'streamlines') {
        if (state.viz.streamlineLines) state.scene.remove(state.viz.streamlineLines);
        // Deterministic seeds: 8x8 grid on inlet plane
        const seeds = [];
        const dimA = state.domain.y, dimB = state.domain.z;
        const count = Math.sqrt(state.viz.streamlineSeeds);
        for(let i=0; i<count; i++) for(let j=0; j<count; j++) {
            seeds.push(new THREE.Vector3(-state.domain.x/2 + 0.1, -dimA/2 + (i+0.5)*(dimA/count), -dimB/2 + (j+0.5)*(dimB/count)));
        }
        state.viz.streamlineLines = post.createStreamlines(seeds, {
            maxSteps: state.viz.streamlineSteps,
            colormapName: state.viz.colormap,
            range: state.viz.range,
            fieldType: state.viz.field === 'pressure' ? 'pressure' : 'velocity_mag'
        });
        state.scene.add(state.viz.streamlineLines);
    } else if (mode === 'surface') {
        post.mapSurface(state.mesh.object, state.viz.field, state.viz.colormap, state.viz.range);
    }

    updateLegend();
    state.viz.needsUpdate = false;
  }

  function updateLegend() {
    const legend = $('vp-legend');
    if (state.viz.mode === 'solid' || state.viz.mode === 'wireframe' || state.viz.mode === 'voxel') {
        legend.style.display = 'none';
        return;
    }
    legend.style.display = 'block';
    setText('l-field-name', state.viz.field.toUpperCase());
    setText('l-min', state.viz.range.min.toFixed(3));
    setText('l-max', state.viz.range.max.toFixed(3));
    
    // Update gradient bar CSS
    const cmName = state.viz.colormap;
    const bar = legend.querySelector('.cfd-legend-bar');
    if (cmName === 'viridis') bar.style.background = 'linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)';
    else if (cmName === 'coolwarm') bar.style.background = 'linear-gradient(90deg, #3b4cc0, #8db0fe, #dddcdc, #f49477, #b40426)';
    else if (cmName === 'jet') bar.style.background = 'linear-gradient(90deg, #00008f, #0000ff, #00ffff, #ffff00, #ff0000, #800000)';
    else bar.style.background = 'linear-gradient(90deg, #000, #fff)';
  }

  function updateVoxelPoints() {
    if (!state.voxelMask) return;
    if (state.mesh.voxelPoints) state.scene.remove(state.mesh.voxelPoints);
    const [nx, ny, nz] = [state.solver.gridX, state.solver.gridY, state.solver.gridZ];
    const gridAABB = { min: [-state.domain.x/2, -state.domain.y/2, -state.domain.z/2], max: [state.domain.x/2, state.domain.y/2, state.domain.z/2] };
    const vSize = [(gridAABB.max[0] - gridAABB.min[0]) / nx, (gridAABB.max[1] - gridAABB.min[1]) / ny, (gridAABB.max[2] - gridAABB.min[2]) / nz];
    const pos = [], col = [];
    const c1 = new THREE.Color(0x5ad1ff), c2 = new THREE.Color(0xe8715a);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
        const idx = i + nx * (j + ny * k); const v = state.voxelMask[idx]; if (v === 0) continue;
        pos.push(gridAABB.min[0]+(i+0.5)*vSize[0], gridAABB.min[1]+(j+0.5)*vSize[1], gridAABB.min[2]+(k+0.5)*vSize[2]);
        const c = (v === 1) ? c1 : c2; col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    state.mesh.voxelPoints = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.8 }));
    state.mesh.voxelPoints.visible = (state.vizMode === 'voxel');
    state.scene.add(state.mesh.voxelPoints);
  }

  function updateStatusBar() {
    setText('sb-grid', state.solver.gridX + '×' + state.solver.gridY + '×' + state.solver.gridZ);
    setText('sb-tau', state.solver.tau.toFixed(3));
    setText('sb-inlet', state.solver.inletSpeed.toFixed(3));
    
    if (state.solverKernel) {
        const diag = state.solverKernel.getDiagnostics();
        setText('sb-iter', diag.iteration);
        setText('r-cd', formatMaybe(state.results.cd, 4));
        setText('r-cl', formatMaybe(state.results.cl, 4));
        setText('r-maxvel', diag.maxVelocity.toFixed(4));
        setText('r-mass-err', (diag.massDrift * 100).toFixed(4) + '%');
        setText('r-conv-status', state.solver.running ? 'Running' : (state.solver.paused ? 'Paused' : 'Ready'));
    }
  }

  function formatMaybe(val, d) { return (val === null || val === undefined) ? '—' : val.toFixed(d); }

  async function initWebGPU() {
    if (!navigator.gpu) { 
        state.executionTier = 'demo';
        updateGPUStatus('error', 'WebGPU missing'); 
        enforceTierLimits();
        return false; 
    }
    try {
        state.adapter = await navigator.gpu.requestAdapter();
        if (!state.adapter) throw new Error('No adapter');
        state.gpu = await state.adapter.requestDevice();
        
        // Detect Tier
        const limits = state.adapter.limits;
        const invocations = limits.maxComputeInvocationsPerWorkgroup || 0;
        const bufferSize = limits.maxStorageBufferBindingSize || 0;
        
        if (invocations >= 256 && bufferSize >= 256 * 1024 * 1024) {
            state.executionTier = 'full';
        } else {
            state.executionTier = 'reduced';
        }
        
        state.gpuReady = true;
        updateGPUStatus('ready', `WebGPU Visualization Active`);
    } catch (e) {
        state.executionTier = 'demo';
        updateGPUStatus('error', 'WebGPU Driver Error');
    }
    
    enforceTierLimits();
    syncCFDUI();
    return state.gpuReady;
  }

  function enforceTierLimits() {
      const tierStr = state.executionTier.toUpperCase();
      setText('wf-tier-badge', tierStr + ' TIER');
      setText('sb-tier', tierStr);
      setText('r-tier', tierStr);
      
      if (state.executionTier === 'reduced' || state.executionTier === 'demo') {
          // Cap resolution options in dropdown if it exists
          const sel = $('s-grid');
          if (sel) {
              Array.from(sel.options).forEach(opt => {
                  const res = parseInt(opt.value.split('x')[0]);
                  if (res > 64) {
                      opt.disabled = true;
                      opt.textContent += ' (Unavailable in ' + state.executionTier + ')';
                  }
              });
              if (state.solver.gridX > 64) {
                  state.solver.gridX = state.solver.gridY = state.solver.gridZ = 64;
                  sel.value = '64x64x64';
              }
          }
      }
  }

  function updateGPUStatus(status, label) {
    var dot = $('status-dot'); var txt = $('status-text');
    if (dot) { dot.className = 'cfd-status-dot ' + (status === 'ready' ? 'is-ready' : (status === 'running' ? 'is-running' : 'is-error')); }
    if (txt) txt.textContent = label;
  }

  function updateCamera() {
    var c = state.controls;
    state.camera.position.set(c.target.x + c.distance * Math.sin(c.yaw) * Math.cos(c.pitch), c.target.y + c.distance * Math.sin(c.pitch), c.target.z + c.distance * Math.cos(c.yaw) * Math.cos(c.pitch));
    state.camera.lookAt(c.target.x, c.target.y, c.target.z);
  }

  function resize() {
    var vp = $('cfd-viewport'); if (!vp || !state.renderer) return;
    state.camera.aspect = vp.clientWidth / vp.clientHeight; state.camera.updateProjectionMatrix();
    state.renderer.setSize(vp.clientWidth, vp.clientHeight, false);
  }

  function installInput() {
    var vp = $('cfd-viewport');
    vp.addEventListener('mousedown', e => { state.controls.dragging = true; state.controls.lastX = e.clientX; state.controls.lastY = e.clientY; });
    window.addEventListener('mousemove', e => {
      if (!state.controls.dragging) return;
      state.controls.yaw -= (e.clientX - state.controls.lastX) * 0.007;
      state.controls.pitch = clamp(state.controls.pitch + (e.clientY - state.controls.lastY) * 0.007, 0.05, Math.PI / 2 - 0.05);
      state.controls.lastX = e.clientX; state.controls.lastY = e.clientY;
      updateCamera();
    });
    window.addEventListener('mouseup', () => state.controls.dragging = false);
    vp.addEventListener('wheel', e => { state.controls.distance = clamp(state.controls.distance + e.deltaY * 0.01, 2, 50); updateCamera(); e.preventDefault(); }, { passive: false });
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = state.lastTs ? (ts - state.lastTs) / 1000 : 1 / 60; state.lastTs = ts;
    if (state.renderer && state.scene && state.camera) {
      if (state.solver.running && state.solverKernel) {
          const res = state.solverKernel.step(state.solver.stepsPerFrame);
          const diag = state.solverKernel.getDiagnostics();
          
          if (diag.isDiverged) {
              handleDivergence(diag);
          } else {
              // Log state: every iteration in diagnosticMode, else every 100
              const freq = state.diagnosticMode ? 1 : 100;
              if (diag.iteration % freq === 0) {
                  state.obs.log({
                      iter: diag.iteration,
                      drift: diag.massDrift,
                      uMax: diag.maxVelocity,
                      timeMs: res.computeTimeMs,
                      config: { tau: state.solver.tau, grid: state.solver.gridX },
                      meta: { tier: state.executionTier }
                  });
                  
                  // Auto-unlock workflow on some iterations
                  if (diag.iteration === 200) syncCFDUI();
                  
                  // Force viz update if field changed
                  if (state.viz.mode !== 'solid') state.viz.needsUpdate = true;
              }
              state.solver.iteration = diag.iteration;
          }
          updateStatusBar();
      }

      if (state.workflow.inspect) {
          updatePostVisuals();
      }

      if (!state.solver.running && state.mesh.object && state.viz.mode === 'solid') {
        state.mesh.object.rotation.y += dt * 0.15;
        if (state.mesh.wireframe) state.mesh.wireframe.rotation.y = state.mesh.object.rotation.y;
      }
      state.renderer.render(state.scene, state.camera);
    }
  }

  async function boot() {
    initScene(); installInput(); bindUI(); await initWebGPU();
    loadSimulationState();
    requestAnimationFrame(loop);
    if (window.lucide) lucide.createIcons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.CFDEngine = { state, setMesh, MESHES };
})();
