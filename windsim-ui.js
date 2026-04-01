(function () {
  'use strict';

  const D = window.WindSimData;
  const P = window.WindSimPhysics;

  function $(id) {
    return document.getElementById(id);
  }

  function activeSolver(app) {
    return app && app.solver ? app.solver : P;
  }

  function displayFrame(app) {
    return app && typeof app.getDisplayFrame === 'function' ? app.getDisplayFrame() : null;
  }

  function displayBody(app) {
    const frame = displayFrame(app);
    return frame ? frame.body : app.state.body;
  }

  function displayEnergy(app) {
    const frame = displayFrame(app);
    return frame ? frame.energy : app.state.energy;
  }

  function displayForceHistory(app) {
    return app && typeof app.getDisplayForceHistory === 'function' ? app.getDisplayForceHistory() : app.state.forceHistory;
  }

  function displayTime(app) {
    const frame = displayFrame(app);
    return frame ? frame.time : app.state.time;
  }

  function vecLength(source) {
    return Math.hypot(source.x, source.y, source.z);
  }

  const EXPERIMENT_FIELDS = [
    { value: 'wind_speed', label: 'Wind Speed' },
    { value: 'wind_heading', label: 'Wind Heading' },
    { value: 'wind_elevation', label: 'Wind Elevation' },
    { value: 'altitude', label: 'Altitude' },
    { value: 'mode_strength', label: 'Mode Strength' }
  ];

  function setToggle(el, on) {
    if (!el) return;
    el.classList.toggle('on', !!on);
  }

  function formatMass(mass) {
    return mass >= 0.1 ? mass.toFixed(3) + ' kg' : (mass * 1000).toFixed(2) + ' g';
  }

  function isResizableObject(app) {
    const def = D.OBJ_DEFS[app.cfg.objKey];
    return !!def && (def.shape === 'box' || def.shape === 'brick');
  }

  function titleizeKey(key) {
    return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (match) {
      return match.toUpperCase();
    });
  }

  const LAYOUT_STORAGE_KEY = 'windsim3d-layout-v4';
  const DEFAULT_LAYOUT = {
    sidebarWidth: 336,
    hudHeight: 136,
    panels: {
      energy: { width: 232, height: 168 },
      legend: { width: 232, height: 192 },
      graph: { width: 420, height: 240 }
    }
  };
  const PANEL_LIMITS = {
    energy: { minWidth: 220, minHeight: 156, maxWidth: 460, maxHeight: 360 },
    legend: { minWidth: 220, minHeight: 180, maxWidth: 460, maxHeight: 420 },
    graph: { minWidth: 340, minHeight: 220, maxWidth: 720, maxHeight: 460 }
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function compactLayout() {
    return window.matchMedia('(max-width:980px)').matches;
  }

  function clampSidebarWidth(value) {
    const viewport = Math.max(760, window.innerWidth || 0);
    return clamp(Math.round(value), 296, Math.min(560, viewport - 220));
  }

  function clampHudHeight(value) {
    const maxHeight = Math.min(300, Math.round((window.innerHeight || 720) * 0.54));
    return clamp(Math.round(value), 96, Math.max(152, maxHeight));
  }

  function clampPanelSize(name, size) {
    const limits = PANEL_LIMITS[name];
    const maxWidth = Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round((window.innerWidth || 1280) * 0.46)));
    const maxHeight = Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round((window.innerHeight || 720) * 0.5)));
    return {
      width: clamp(Math.round(size.width), limits.minWidth, maxWidth),
      height: clamp(Math.round(size.height), limits.minHeight, maxHeight)
    };
  }

  function normalizeLayoutState(rawState) {
    const state = clone(DEFAULT_LAYOUT);
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    if (Number.isFinite(source.sidebarWidth)) state.sidebarWidth = clampSidebarWidth(source.sidebarWidth);
    if (Number.isFinite(source.hudHeight)) state.hudHeight = clampHudHeight(source.hudHeight);
    if (source.panels && typeof source.panels === 'object') {
      Object.keys(state.panels).forEach(function (key) {
        if (source.panels[key] && Number.isFinite(source.panels[key].width) && Number.isFinite(source.panels[key].height)) {
          state.panels[key] = clampPanelSize(key, source.panels[key]);
        } else {
          state.panels[key] = clampPanelSize(key, state.panels[key]);
        }
      });
    } else {
      Object.keys(state.panels).forEach(function (key) {
        state.panels[key] = clampPanelSize(key, state.panels[key]);
      });
    }
    return state;
  }

  function loadLayoutState() {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      return normalizeLayoutState(raw ? JSON.parse(raw) : null);
    } catch (err) {
      return normalizeLayoutState(null);
    }
  }

  function saveLayoutState(app) {
    if (!app.layoutState) return;
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(app.layoutState));
    } catch (err) {
      /* ignore storage failures */
    }
  }

  function ensureLayoutState(app) {
    if (!app.layoutState) app.layoutState = loadLayoutState();
    return app.layoutState;
  }

  function applyLayoutState(app, persist) {
    const state = normalizeLayoutState(ensureLayoutState(app));
    const root = document.documentElement;
    app.layoutState = state;
    root.style.setProperty('--sidebar-width', state.sidebarWidth + 'px');
    root.style.setProperty('--hud-height', state.hudHeight + 'px');
    ['energy', 'legend', 'graph'].forEach(function (key) {
      const panelId = key === 'graph' ? 'graphPanel' : key + '-panel';
      const panel = $(panelId);
      if (!panel) return;
      panel.style.width = state.panels[key].width + 'px';
      panel.style.height = state.panels[key].height + 'px';
    });
    if (typeof app.resizeRenderer === 'function' && !compactLayout()) app.resizeRenderer();
    if (persist) saveLayoutState(app);
  }

  function resetLayoutState(app) {
    app.layoutState = normalizeLayoutState(DEFAULT_LAYOUT);
    applyLayoutState(app, true);
  }

  function startDrag(event, cursor, onMove, onEnd) {
    const previousCursor = document.body.style.cursor;
    event.preventDefault();
    document.body.classList.add('layout-dragging');
    document.body.style.cursor = cursor;

    function stop() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.classList.remove('layout-dragging');
      document.body.style.cursor = previousCursor;
      if (onEnd) onEnd();
    }

    function handleMove(moveEvent) {
      onMove(moveEvent);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function ensurePanelHandle(panel, anchorRight) {
    let handle = panel.querySelector('.panel-resize-handle');
    if (handle) return handle;
    handle = document.createElement('div');
    handle.className = 'panel-resize-handle' + (anchorRight ? ' anchor-right' : '');
    handle.setAttribute('aria-hidden', 'true');
    panel.appendChild(handle);
    return handle;
  }

  function saveScenarioList(app) {
    localStorage.setItem(D.STORAGE_KEY, JSON.stringify(app.savedScenarios));
  }

  function loadScenarioList() {
    try {
      const raw = localStorage.getItem(D.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function saveExperimentList(app) {
    try {
      localStorage.setItem(D.EXPERIMENT_STORAGE_KEY, JSON.stringify(app.state.experiment.savedRuns));
    } catch (err) {
      /* ignore storage failures */
    }
  }

  function loadExperimentList() {
    try {
      const raw = localStorage.getItem(D.EXPERIMENT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (entry) {
        return entry && typeof entry.id === 'string' && typeof entry.name === 'string' && Array.isArray(entry.rows);
      });
    } catch (err) {
      return [];
    }
  }

  function injectUiStyles() {
    if ($('windsim-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'windsim-ui-style';
    style.textContent = [
      '.num-input{width:100%;background:#262D33;border:1px solid rgba(236,114,90,.18);color:var(--txt);border-radius:10px;padding:8px 10px;font-family:"JetBrains Mono",monospace;font-size:11px;outline:none}',
      '.mini-note{font-family:"JetBrains Mono",monospace;font-size:8px;color:var(--txt3);line-height:1.5;margin-top:4px}',
      '.report-box{margin-top:7px;background:rgba(236,114,90,.03);border:1px solid rgba(236,114,90,.14);border-radius:12px;padding:10px 11px;font-family:"JetBrains Mono",monospace;font-size:8px;line-height:1.7;color:var(--txt2);white-space:pre-wrap;min-height:78px}',
      '.btn[disabled]{opacity:.46;cursor:not-allowed}',
      '.graph-panel{position:absolute;right:14px;top:64px;z-index:20;background:rgba(38,45,51,.92);border:1px solid rgba(236,114,90,.16);border-radius:16px;padding:14px 14px 16px;backdrop-filter:blur(10px);box-shadow:0 14px 30px rgba(38,45,51,.42);display:flex;flex-direction:column;gap:12px}',
      '.graph-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding-bottom:8px;border-bottom:1px solid rgba(236,114,90,.12)}',
      '.graph-title{font-family:"JetBrains Mono",monospace;font-size:8.5px;letter-spacing:1.8px;color:var(--txt3);text-transform:uppercase}',
      '.graph-meta{font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:1.2px;color:var(--cyan);text-transform:uppercase}',
      '.graph-canvas-wrap{flex:1;min-height:180px;padding:8px;background:rgba(38,45,51,.82);border:1px solid rgba(236,114,90,.10);border-radius:12px;box-shadow:inset 0 1px 0 rgba(236,114,90,.04)}',
      '.graph-canvas{display:block;width:100%;height:100%}',
      '.panel-resize-handle{position:absolute;right:10px;bottom:10px;width:24px;height:24px;border-radius:9px;background:rgba(236,114,90,.08);border:1px solid rgba(236,114,90,.22);box-shadow:0 8px 18px rgba(38,45,51,.36);cursor:nwse-resize}',
      '.panel-resize-handle::before{content:"";position:absolute;inset:5px;background:linear-gradient(135deg,transparent 0,transparent 22%,rgba(236,114,90,.92) 22%,rgba(236,114,90,.92) 32%,transparent 32%,transparent 46%,rgba(236,114,90,.92) 46%,rgba(236,114,90,.92) 56%,transparent 56%,transparent 70%,rgba(236,114,90,.92) 70%,rgba(236,114,90,.92) 80%,transparent 80%)}',
      '.panel-resize-handle.anchor-right{left:10px;right:auto;cursor:nesw-resize}',
      '.force-label{position:absolute;z-index:24;padding:3px 7px;border-radius:999px;background:rgba(38,45,51,.94);border:1px solid rgba(236,114,90,.14);font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:1px;color:var(--txt2);pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap}',
      '.measure-label{position:absolute;z-index:24;padding:4px 8px;border-radius:999px;background:rgba(38,45,51,.94);border:1px solid rgba(90,209,255,.26);font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:1px;color:#74D3FF;pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap}',
      '.validation-pill{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:24;background:rgba(38,45,51,.94);border:1px solid rgba(236,114,90,.14);border-radius:999px;padding:6px 13px;font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:1.2px;color:var(--cyan);pointer-events:none;display:none}',
      '.scenario-row{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:6px}',
      '.measure-kbd{font-family:"JetBrains Mono",monospace;font-size:8px;color:var(--txt3);margin-top:4px;text-align:center}',
      '.geometry-panel[hidden]{display:none!important}',
      '@media (max-width:980px){.graph-panel{right:8px;top:64px;left:8px;width:auto!important;max-width:none}.graph-canvas-wrap{min-height:140px}.panel-resize-handle{display:none}}'
    ].join('');
    document.head.appendChild(style);
  }

  function injectExtraPanels(app) {
    const sidebar = $('sidebar');
    const main = $('main');
    if (!$('windModeSelect')) {
      sidebar.insertAdjacentHTML('beforeend', [
        '<details open><summary>Wind Field</summary><div class="sec-body">',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Field Mode</span></div><select id="windModeSelect"></select></div>',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Mode Strength</span><span class="ctl-val" id="vModeStrength">35%</span></div><input type="range" id="sModeStrength" min="0" max="100" value="35"></div>',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Seed</span></div><input class="num-input" id="seedInput" type="number" value="1337" step="1"></div>',
        '<div class="mini-note">Seeded flow makes turbulence, wake modes, and validation reproducible.</div>',
        '</div></details>',
        '<details><summary>Chamber</summary><div class="sec-body">',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Width</span><span class="ctl-val" id="vChamberW">240 m</span></div><input type="range" id="sChamberW" min="40" max="320" value="240" step="5"></div>',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Depth</span><span class="ctl-val" id="vChamberD">240 m</span></div><input type="range" id="sChamberD" min="40" max="320" value="240" step="5"></div>',
        '<div class="tgl-row">Wall Collision<div class="tgl on" id="tWallCollision"></div></div>',
        '<div class="mini-note">Chamber collisions now include side walls, corners, floor, and ceiling.</div>',
        '</div></details>',
        '<details><summary>Test Mode</summary><div class="sec-body">',
        '<div class="tgl-row">Wind Tunnel Mount<div class="tgl" id="tMountedMode"></div></div>',
        '<div class="mini-note" id="testModeNote">Mounted mode holds the object fixed at launch height and rest attitude. Launch velocity and spin inputs are ignored while aerodynamic loads are still computed.</div>',
        '</div></details>',
        '<details><summary>Measurements</summary><div class="sec-body">',
        '<div class="tgl-row">Force Labels<div class="tgl on" id="tForceLabels"></div></div>',
        '<div class="tgl-row">Ruler<div class="tgl on" id="tRuler"></div></div>',
        '<div class="tgl-row">Impact Markers<div class="tgl on" id="tImpactMarkers"></div></div>',
        '<div class="tgl-row">Force Graph<div class="tgl on" id="tGraph"></div></div>',
        '<div class="tgl-row">Compare Trails<div class="tgl on" id="tCompareTrail"></div></div>',
        '<div class="tgl-row">Flow Probe Slice<div class="tgl" id="tFlowSlice"></div></div>',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Slice Height</span><span class="ctl-val" id="vFlowSliceH">8.0 m</span></div><input type="range" id="sFlowSliceH" min="1" max="220" value="8" step="0.5"></div>',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Slice Span</span><span class="ctl-val" id="vFlowSliceSpan">36 m</span></div><input type="range" id="sFlowSliceSpan" min="12" max="120" value="36" step="2"></div>',
        '<button class="btn btn-d" id="clearImpactsBtn">Clear Markers</button>',
        '<div class="report-box" id="flowSliceInfo">Probe slice off.</div>',
        '<div class="measure-kbd">Ruler tracks launch to body in-scene.</div>',
        '<div class="mini-note">Probe slice samples the current reduced-order wind field only. It is not CFD and it does not include two-way wake coupling.</div>',
        '</div></details>',
        '<details><summary>Playback</summary><div class="sec-body">',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Recorded Timeline</span><span class="ctl-val" id="playbackFrameStat">0 / 0</span></div><input type="range" id="playbackScrub" min="0" max="0" value="0" step="1"></div>',
        '<div class="mini-note" id="playbackInfo">No recorded frames yet. Run the simulation to build a timeline.</div>',
        '<div class="scenario-row"><button class="btn btn-d" id="playbackEnterBtn">Enter</button><button class="btn btn-d" id="playbackExitBtn">Exit</button></div>',
        '<div class="scenario-row"><button class="btn btn-d" id="playbackPrevBtn">Prev</button><button class="btn btn-d" id="playbackPlayBtn">Play</button></div>',
        '<div class="scenario-row"><button class="btn btn-d" id="playbackNextBtn">Next</button><button class="btn btn-d" id="playbackLatestBtn">Latest</button></div>',
        '<div class="measure-kbd">Arrow Left / Right step frames. Escape exits playback.</div>',
        '</div></details>',
        '<details><summary>Experiment</summary><div class="sec-body">',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Sweep Variable</span></div><select id="sweepVarSelect"></select></div>',
        '<div class="scenario-row"><div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Start</span></div><input class="num-input" id="sweepStartInput" type="number" value="0" step="0.1"></div><div class="ctl"><div class="ctl-row"><span class="ctl-lbl">End</span></div><input class="num-input" id="sweepEndInput" type="number" value="40" step="0.1"></div></div>',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Steps</span></div><input class="num-input" id="sweepStepsInput" type="number" value="9" min="1" max="41" step="1"></div>',
        '<div class="scenario-row"><button class="btn btn-g" id="runSweepBtn">Run Sweep</button><button class="btn btn-d" id="exportSweepBtn">Export Sweep</button></div>',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Saved Sweeps</span></div><select id="savedSweepSelect"></select></div>',
        '<div class="scenario-row"><button class="btn btn-d" id="saveSweepBtn">Save Sweep</button><button class="btn btn-d" id="compareSweepBtn">Compare</button></div>',
        '<div class="scenario-row"><button class="btn btn-d" id="useSavedSweepBtn">Use Saved</button><button class="btn btn-r" id="deleteSweepBtn">Delete Saved</button></div>',
        '<div class="report-box" id="experimentReport">No sweep run.</div>',
        '<div class="report-box" id="experimentCompareReport">No saved comparison yet.</div>',
        '<div class="mini-note">Sweep uses instantaneous mounted reduced-order samples with the object fixed. This is not CFD and not a time-averaged tunnel solution.</div>',
        '</div></details>',
        '<details><summary>Workspace</summary><div class="sec-body">',
        '<button class="btn btn-d" id="resetLayoutBtn">Reset Layout</button>',
        '<div class="mini-note">Use the highlighted center divider, the telemetry grip above the bottom strip, and the panel corners to resize the workspace.</div>',
        '</div></details>',
        '<details class="geometry-panel" id="objectGeometryPanel"><summary>Object Geometry</summary><div class="sec-body">',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Width Scale</span><span class="ctl-val" id="vObjScaleX">1.00x</span></div><input type="range" id="sObjScaleX" min="0.35" max="3.50" value="1.00" step="0.01"></div>',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Height Scale</span><span class="ctl-val" id="vObjScaleY">1.00x</span></div><input type="range" id="sObjScaleY" min="0.35" max="3.50" value="1.00" step="0.01"></div>',
        '<div class="ctl"><div class="ctl-row"><span class="ctl-lbl">Depth Scale</span><span class="ctl-val" id="vObjScaleZ">1.00x</span></div><input type="range" id="sObjScaleZ" min="0.35" max="3.50" value="1.00" step="0.01"></div>',
        '<button class="btn btn-d" id="resetObjectScaleBtn">Reset Box Size</button>',
        '<div class="mini-note" id="objectScaleNote">Resize box-like objects while preserving density, inertia, and collision shape.</div>',
        '</div></details>',
        '<details><summary>Scenarios</summary><div class="sec-body">',
        '<div class="ctl"><select id="savedScenarioSelect"></select></div>',
        '<div class="scenario-row"><button class="btn btn-c" id="saveScenarioBtn">Save</button><button class="btn btn-d" id="loadScenarioBtn">Load</button></div>',
        '<div class="scenario-row"><button class="btn btn-d" id="exportScenarioBtn">Export</button><button class="btn btn-r" id="deleteScenarioBtn">Delete</button></div>',
        '<button class="btn btn-d" id="importScenarioBtn">Import JSON</button>',
        '<div class="mini-note">Scenario files include seed, wind mode, chamber size, object, launch state, and camera.</div>',
        '</div></details>',
        '<details><summary>Validation</summary><div class="sec-body">',
        '<div class="ctl"><select id="validationSelect"></select></div>',
        '<button class="btn btn-g" id="runValidationBtn">Run Validation</button>',
        '<div class="report-box" id="validationReport">No validation run.</div>',
        '</div></details>'
      ].join(''));
    }

    if (!$('graphPanel')) {
      main.insertAdjacentHTML('beforeend', [
        '<div class="graph-panel" id="graphPanel">',
        '<div class="graph-head"><div class="graph-title">Force History</div><div class="graph-meta">Live 10s</div></div>',
        '<div class="graph-canvas-wrap"><canvas class="graph-canvas" id="graphCanvas" width="340" height="160"></canvas></div>',
        '</div>',
        '<div class="measure-label" id="rulerLabel" style="display:none">0.0 m</div>',
        '<div class="validation-pill" id="validationPill">VALIDATION RUNNING</div>',
        '<div class="force-label" id="forceLabelDrag" style="display:none">Drag</div>',
        '<div class="force-label" id="forceLabelGrav" style="display:none">Gravity</div>',
        '<div class="force-label" id="forceLabelVel" style="display:none">Velocity</div>',
        '<div class="force-label" id="forceLabelMagnus" style="display:none">Lift / Magnus</div>',
        '<div class="force-label" id="forceLabelSpin" style="display:none">Spin Axis</div>',
        '<input id="scenarioFileInput" type="file" accept=".json,application/json" style="display:none">'
      ].join(''));
    }
  }

  function populateSelect(select, entries) {
    select.innerHTML = '';
    entries.forEach(function (entry) {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      select.appendChild(option);
    });
  }

  function refreshSavedScenarioSelect(app) {
    const select = $('savedScenarioSelect');
    const list = app.savedScenarios.length ? app.savedScenarios : [{ name: '__none__', scenario: null }];
    populateSelect(select, list.map(function (entry) {
      return {
        value: entry.name,
        label: entry.name === '__none__' ? 'No saved scenarios' : entry.name
      };
    }));
    if (app.savedScenarios.length) select.value = app.savedScenarios[0].name;
  }

  function refreshSavedSweepSelect(app) {
    const select = $('savedSweepSelect');
    if (!select) return;
    const runs = app.state.experiment.savedRuns || [];
    const options = runs.length ? runs.map(function (run) {
      return {
        value: run.id,
        label: run.name + ' | ' + (run.objectLabel || run.objectKey || 'object') + ' | ' + ((run.sweep && run.sweep.label) || 'Sweep')
      };
    }) : [{ value: '__none__', label: 'No saved sweeps' }];
    populateSelect(select, options);
    if (!runs.length) {
      select.value = '__none__';
      app.state.experiment.selectedSavedId = '';
      return;
    }
    if (!app.state.experiment.selectedSavedId || !runs.some(function (run) { return run.id === app.state.experiment.selectedSavedId; })) {
      app.state.experiment.selectedSavedId = runs[0].id;
    }
    select.value = app.state.experiment.selectedSavedId;
  }

  function populateStaticSelects(app) {
    populateSelect($('presetSelect'), Object.keys(D.PRESETS).map(function (key) {
      return { value: key, label: D.PRESETS[key].label || titleizeKey(key) };
    }));
    populateSelect($('objSelect'), Object.keys(D.OBJ_DEFS).map(function (key) {
      return { value: key, label: D.OBJ_DEFS[key].label };
    }));
    populateSelect($('windModeSelect'), Object.keys(D.WIND_MODES).map(function (key) {
      return { value: key, label: D.WIND_MODES[key].label };
    }));
    populateSelect($('sweepVarSelect'), EXPERIMENT_FIELDS);
    populateSelect($('validationSelect'), [{ value: '', label: 'Select Validation Case' }].concat(Object.keys(D.VALIDATION_CASES).map(function (key) {
      return { value: key, label: D.VALIDATION_CASES[key].label };
    })));
    refreshSavedScenarioSelect(app);
  }

  function syncScenarioControls(app) {
    const cfg = app.cfg;
    $('objSelect').value = cfg.objKey;
    $('surfSelect').value = cfg.surfKey;
    $('presetSelect').value = app.currentPresetName || 'baseline';
    $('windModeSelect').value = cfg.wind.mode;
    $('seedInput').value = String(cfg.seed);

    $('sSpeed').value = cfg.wind.speed;
    $('vSpeed').textContent = cfg.wind.speed.toFixed(1) + ' m/s';
    $('beaufort').textContent = P.beaufort(cfg.wind.speed);

    $('sAzim').value = cfg.wind.azim;
    $('vAzim').textContent = cfg.wind.azim.toFixed(0) + ' deg';
    $('azimLbl').textContent = P.headingSummary(cfg.wind.azim);

    $('sElev').value = cfg.wind.elev;
    $('vElev').textContent = cfg.wind.elev.toFixed(0) + ' deg';
    $('elevLbl').textContent = cfg.wind.elev === 0 ? 'Horizontal' : (cfg.wind.elev > 0 ? cfg.wind.elev.toFixed(0) + ' deg upward' : Math.abs(cfg.wind.elev).toFixed(0) + ' deg downward');

    $('sTurb').value = cfg.wind.turb;
    $('vTurb').textContent = cfg.wind.turb.toFixed(0) + '%';
    $('sGust').value = cfg.wind.gust;
    $('vGust').textContent = cfg.wind.gust.toFixed(0) + '%';
    $('sModeStrength').value = cfg.wind.modeStrength;
    $('vModeStrength').textContent = cfg.wind.modeStrength.toFixed(0) + '%';

    $('sH0').value = cfg.launch.h0;
    $('vH0').textContent = cfg.launch.h0.toFixed(1) + ' m';
    $('sVX').value = cfg.launch.vx;
    $('vVX').textContent = cfg.launch.vx.toFixed(0) + ' m/s';
    $('sVY').value = cfg.launch.vy;
    $('vVY').textContent = cfg.launch.vy.toFixed(0) + ' m/s';
    $('sVZ').value = cfg.launch.vz;
    $('vVZ').textContent = cfg.launch.vz.toFixed(0) + ' m/s';
    $('sOX').value = cfg.launch.omx;
    $('vOX').textContent = cfg.launch.omx.toFixed(0) + ' r/s';
    $('sOY').value = cfg.launch.omy;
    $('vOY').textContent = cfg.launch.omy.toFixed(0) + ' r/s';
    $('sOZ').value = cfg.launch.omz;
    $('vOZ').textContent = cfg.launch.omz.toFixed(0) + ' r/s';

    $('sAlt').value = cfg.altitude;
    $('vAlt').textContent = cfg.altitude.toFixed(0) + ' m';
    $('sCeil').value = cfg.world.ceiling;
    $('vCeil').textContent = cfg.world.ceiling.toFixed(0) + ' m';
    $('sPCount').value = cfg.visuals.particleCount;
    $('vPCount').textContent = String(cfg.visuals.particleCount);
    $('sPSize').value = cfg.visuals.particleSize;
    $('vPSize').textContent = cfg.visuals.particleSize.toFixed(2);
    $('sTrailLen').value = cfg.visuals.trailMax;
    $('vTrailLen').textContent = String(cfg.visuals.trailMax);
    $('sSimRate').value = cfg.simRate;
    $('vSimRate').textContent = cfg.simRate.toFixed(2) + 'x';

    $('sChamberW').value = cfg.world.halfWidth * 2;
    $('vChamberW').textContent = (cfg.world.halfWidth * 2).toFixed(0) + ' m';
    $('sChamberD').value = cfg.world.halfDepth * 2;
    $('vChamberD').textContent = (cfg.world.halfDepth * 2).toFixed(0) + ' m';

    $('sCamDist').value = cfg.camera.distance;
    $('vCamDist').textContent = cfg.camera.distance.toFixed(1) + ' m';
    $('sCamYaw').value = THREE.MathUtils.radToDeg(cfg.camera.yaw);
    $('vCamYaw').textContent = THREE.MathUtils.radToDeg(cfg.camera.yaw).toFixed(0) + ' deg';
    $('sCamPitch').value = THREE.MathUtils.radToDeg(cfg.camera.pitch);
    $('vCamPitch').textContent = THREE.MathUtils.radToDeg(cfg.camera.pitch).toFixed(0) + ' deg';
    $('sFov').value = cfg.camera.fov;
    $('vFov').textContent = cfg.camera.fov.toFixed(0) + ' deg';
    $('sCamLag').value = cfg.camera.lag;
    $('vCamLag').textContent = cfg.camera.lag.toFixed(2);

    setToggle($('tCamFollow'), cfg.camera.follow);
    setToggle($('tGrav'), cfg.env.grav);
    setToggle($('tPart'), cfg.env.part);
    setToggle($('tTrail'), cfg.env.trail);
    setToggle($('tBounce'), cfg.env.bounce);
    setToggle($('tForce'), cfg.env.force);
    setToggle($('tMagnus'), cfg.env.magnus);
    setToggle($('tRotation'), cfg.env.rotation);
    setToggle($('tReCd'), cfg.env.reCd);
    setToggle($('tSpinViz'), cfg.env.spinViz);
    setToggle($('tWallCollision'), cfg.world.collision);
    setToggle($('tMountedMode'), cfg.testMode === 'mounted');
    setToggle($('tForceLabels'), cfg.analysis.forceLabels);
    setToggle($('tRuler'), cfg.analysis.ruler);
    setToggle($('tImpactMarkers'), cfg.analysis.impacts);
    setToggle($('tGraph'), cfg.analysis.graph);
    setToggle($('tCompareTrail'), cfg.analysis.compare);
    setToggle($('tFlowSlice'), cfg.analysis.flowSlice);
    $('sFlowSliceH').max = String(Math.max(20, Math.round(cfg.world.ceiling)));
    $('sFlowSliceH').value = cfg.analysis.flowSliceHeight;
    $('vFlowSliceH').textContent = cfg.analysis.flowSliceHeight.toFixed(1) + ' m';
    $('sFlowSliceSpan').max = String(Math.max(24, Math.round(Math.min(cfg.world.halfWidth * 2, cfg.world.halfDepth * 2))));
    $('sFlowSliceSpan').value = cfg.analysis.flowSliceSpan;
    $('vFlowSliceSpan').textContent = cfg.analysis.flowSliceSpan.toFixed(0) + ' m';
    syncGeometryControls(app);
  }

  function syncExperimentPanel(app) {
    const experiment = app.state.experiment;
    const report = $('experimentReport');
    const compareReport = $('experimentCompareReport');
    function formatCoeff(value) {
      return Number.isFinite(value) ? value.toFixed(3) : 'n/a';
    }
    refreshSavedSweepSelect(app);
    const selectedRun = experiment.savedRuns.find(function (run) { return run.id === experiment.selectedSavedId; }) || null;
    $('sweepVarSelect').value = experiment.variable;
    $('sweepStartInput').value = String(experiment.start);
    $('sweepEndInput').value = String(experiment.end);
    $('sweepStepsInput').value = String(experiment.steps);
    $('exportSweepBtn').disabled = !experiment.rows.length;
    $('saveSweepBtn').disabled = !experiment.rows.length;
    $('compareSweepBtn').disabled = !experiment.rows.length || !selectedRun;
    $('useSavedSweepBtn').disabled = !selectedRun;
    $('deleteSweepBtn').disabled = !selectedRun;

    if (!experiment.rows.length) {
      report.textContent = 'No sweep run.';
    } else {
      const lines = experiment.rows.map(function (row) {
        return row.sweep_value.toFixed(2) + ' ' + row.sweep_unit +
          ' | drag ' + row.drag_N.toFixed(3) +
          ' N | lift ' + row.lift_N.toFixed(3) +
          ' N | Cd ' + formatCoeff(row.cd_current) +
          ' | Re ' + (row.reynolds > 1e6 ? (row.reynolds / 1e6).toFixed(2) + 'M' : (row.reynolds > 1e3 ? (row.reynolds / 1e3).toFixed(1) + 'k' : row.reynolds.toFixed(0)));
      });
      report.textContent = 'Mounted sweep: ' + experiment.variable + (experiment.dirty ? ' [stale]' : '') + '\n' + 'rows: ' + experiment.rows.length + '\n\n' + lines.join('\n');
    }

    if (experiment.comparison && experiment.comparison.text) {
      compareReport.textContent = experiment.comparison.text;
    } else if (selectedRun) {
      compareReport.textContent =
        'Selected saved sweep: ' + selectedRun.name + '\n' +
        'rows: ' + selectedRun.rows.length + '\n' +
        'object: ' + (selectedRun.objectLabel || selectedRun.objectKey || 'unknown') + '\n' +
        'mode: ' + (selectedRun.windMode || 'unknown') + '\n' +
        'Click Compare to evaluate deltas against the current sweep.';
    } else {
      compareReport.textContent = 'No saved comparison yet.';
    }
  }

  function syncFlowProbeInfo(app) {
    const info = $('flowSliceInfo');
    if (!info) return;
    const stats = app.render && app.render.flowProbeStats ? app.render.flowProbeStats : null;
    const ceiling = Math.max(1, app.cfg.world.ceiling);
    const maxSpan = Math.max(24, Math.round(Math.min(app.cfg.world.halfWidth * 2, app.cfg.world.halfDepth * 2)));
    app.cfg.analysis.flowSliceHeight = clamp(app.cfg.analysis.flowSliceHeight, 0.5, ceiling);
    app.cfg.analysis.flowSliceSpan = clamp(app.cfg.analysis.flowSliceSpan, 12, maxSpan);
    $('sFlowSliceH').max = String(Math.max(20, Math.round(ceiling)));
    $('sFlowSliceH').value = String(app.cfg.analysis.flowSliceHeight);
    $('vFlowSliceH').textContent = app.cfg.analysis.flowSliceHeight.toFixed(1) + ' m';
    $('sFlowSliceSpan').max = String(maxSpan);
    $('sFlowSliceSpan').value = String(app.cfg.analysis.flowSliceSpan);
    $('vFlowSliceSpan').textContent = app.cfg.analysis.flowSliceSpan.toFixed(0) + ' m';

    if (!app.cfg.analysis.flowSlice || !stats || !stats.active) {
      info.textContent = 'Probe slice off.';
      return;
    }

    info.textContent =
      'Reduced-order flow slice\n' +
      'samples: ' + stats.sampleCount +
      ' | y ' + stats.height.toFixed(1) + ' m' +
      ' | span ' + stats.span.toFixed(0) + ' m\n' +
      'mean speed ' + stats.meanSpeed.toFixed(2) + ' m/s' +
      ' | peak ' + stats.peakSpeed.toFixed(2) + ' m/s\n' +
      'anchor x ' + stats.anchorX.toFixed(1) + ' m' +
      ' | z ' + stats.anchorZ.toFixed(1) + ' m';
  }

  function syncGeometryControls(app) {
    if (!$('objectGeometryPanel')) return;
    const panel = $('objectGeometryPanel');
    const scale = app.cfg.objectScale || { x: 1, y: 1, z: 1 };
    const def = activeSolver(app).resolveObjectDef(app.cfg.objKey, app.cfg);
    const base = D.OBJ_DEFS[app.cfg.objKey];
    const visible = isResizableObject(app);

    panel.hidden = !visible;
    $('sObjScaleX').value = scale.x;
    $('sObjScaleY').value = scale.y;
    $('sObjScaleZ').value = scale.z;
    $('vObjScaleX').textContent = scale.x.toFixed(2) + 'x';
    $('vObjScaleY').textContent = scale.y.toFixed(2) + 'x';
    $('vObjScaleZ').textContent = scale.z.toFixed(2) + 'x';

    if (!visible) {
      $('objectScaleNote').textContent = 'Size controls are available for box-like objects.';
      return;
    }

    const density = base.mass / Math.max(1e-6, base.dims[0] * base.dims[1] * base.dims[2]);
    $('objectScaleNote').textContent =
      'Dims ' + def.dims[0].toFixed(3) + ' x ' + def.dims[1].toFixed(3) + ' x ' + def.dims[2].toFixed(3) +
      ' m | rho ' + density.toFixed(0) + ' kg/m^3';
  }

  function bindLayoutControls(app) {
    if (app.layoutControlsBound) return;
    app.layoutControlsBound = true;

    function bindPanelResize(panelId, key, anchorRight) {
      const panel = $(panelId);
      const handle = ensurePanelHandle(panel, anchorRight);
      handle.addEventListener('pointerdown', function (event) {
        if (compactLayout()) return;
        const startSize = clone(ensureLayoutState(app).panels[key]);
        const startX = event.clientX;
        const startY = event.clientY;
        startDrag(event, anchorRight ? 'nesw-resize' : 'nwse-resize', function (moveEvent) {
          const next = clampPanelSize(key, {
            width: startSize.width + (anchorRight ? (startX - moveEvent.clientX) : (moveEvent.clientX - startX)),
            height: startSize.height + (moveEvent.clientY - startY)
          });
          ensureLayoutState(app).panels[key] = next;
          applyLayoutState(app, false);
        }, function () {
          saveLayoutState(app);
        });
      });
    }

    $('sidebar-resizer').addEventListener('pointerdown', function (event) {
      if (compactLayout()) return;
      const startWidth = ensureLayoutState(app).sidebarWidth;
      const startX = event.clientX;
      startDrag(event, 'col-resize', function (moveEvent) {
        ensureLayoutState(app).sidebarWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX));
        applyLayoutState(app, false);
      }, function () {
        saveLayoutState(app);
      });
    });

    $('hud-resizer').addEventListener('pointerdown', function (event) {
      if (compactLayout()) return;
      const startHeight = ensureLayoutState(app).hudHeight;
      const startY = event.clientY;
      startDrag(event, 'ns-resize', function (moveEvent) {
        ensureLayoutState(app).hudHeight = clampHudHeight(startHeight + (startY - moveEvent.clientY));
        applyLayoutState(app, false);
      }, function () {
        saveLayoutState(app);
      });
    });

    bindPanelResize('energy-panel', 'energy', false);
    bindPanelResize('legend-panel', 'legend', false);
    bindPanelResize('graphPanel', 'graph', true);

    window.addEventListener('resize', function () {
      app.layoutState = normalizeLayoutState(ensureLayoutState(app));
      applyLayoutState(app, false);
    });
  }

  function updateStaticPanels(app) {
    const def = activeSolver(app).resolveObjectDef(app.cfg.objKey, app.cfg);
    const surface = D.SURFACES[app.cfg.surfKey];
    $('iMass').textContent = formatMass(def.mass);
    $('iCd').textContent = def.Cd0.toFixed(2);
    $('iR').textContent = (def.r * 100).toFixed(1) + ' cm';
    $('iArea').textContent = (def.area * 1e4).toFixed(def.area >= 0.01 ? 0 : 1) + ' cm^2';
    $('iI').textContent = (def.inertia[1] / Math.max(1e-8, def.mass * def.r * def.r)).toFixed(3);
    $('iCdMode').textContent = def.aero.useCurve ? (def.aero.useCurve === 'golf' ? 'Golf' : 'Sphere') : def.aero.model.charAt(0).toUpperCase() + def.aero.model.slice(1);
    $('ppMs').textContent = (surface.mu_s * def.ground.muS).toFixed(3);
    $('ppMk').textContent = (surface.mu_k * def.ground.muK).toFixed(3);
    $('ppMr').textContent = (surface.mu_r * def.ground.muR).toFixed(3);
    $('ppCr').textContent = (surface.cr * def.crO * def.ground.bounce).toFixed(3);
    syncGeometryControls(app);
  }

  function updateDynamicPanels(app) {
    const body = displayBody(app);
    const def = activeSolver(app).resolveObjectDef(app.cfg.objKey, app.cfg);
    const speed = vecLength(body.vel);
    const accel = vecLength(body.acc);
    const spinRps = vecLength(body.omegaBody) / D.TAU;
    const rhoPct = body.metrics.rho / D.RHO0 * 100;
    const energyTrans = 0.5 * def.mass * speed * speed;
    const energyRot = 0.5 * (
      def.inertia[0] * body.omegaBody.x * body.omegaBody.x +
      def.inertia[1] * body.omegaBody.y * body.omegaBody.y +
      def.inertia[2] * body.omegaBody.z * body.omegaBody.z
    );
    const energyPot = def.mass * D.GRAV * Math.max(0, body.pos.y - body.supportY);
    const energyState = displayEnergy(app) || { aeroWork: 0, contactLoss: 0 };

    $('hSpd').textContent = speed.toFixed(2) + ' m/s';
    $('hDrag').textContent = body.metrics.drag.toFixed(3) + ' N';
    $('hNet').textContent = body.metrics.net.toFixed(3) + ' N';
    $('hAcc').textContent = accel.toFixed(2) + ' m/s^2';
    $('hH').textContent = Math.max(0, body.pos.y).toFixed(2) + ' m';
    $('hX').textContent = body.pos.x.toFixed(2) + ' m';
    $('hZ').textContent = body.pos.z.toFixed(2) + ' m';
    $('hRe').textContent = body.metrics.Re > 1e6 ? (body.metrics.Re / 1e6).toFixed(2) + 'M' : (body.metrics.Re > 1e3 ? (body.metrics.Re / 1e3).toFixed(1) + 'k' : body.metrics.Re.toFixed(0));
    $('hCd').textContent = body.metrics.Cd.toFixed(3);
    $('hSpin').textContent = spinRps.toFixed(2) + ' r/s';
    $('hHead').textContent = P.headingSummary(app.cfg.wind.azim);
    $('hRho').textContent = body.metrics.rho.toFixed(3) + ' kg/m^3';
    $('hT').textContent = displayTime(app).toFixed(2) + ' s';

    $('eKet').textContent = energyTrans.toFixed(3) + ' J';
    $('eKer').textContent = energyRot.toFixed(3) + ' J';
    $('ePe').textContent = energyPot.toFixed(3) + ' J';
    $('eWw').textContent = energyState.aeroWork.toFixed(3) + ' J';
    $('eFl').textContent = energyState.contactLoss.toFixed(3) + ' J';

    $('ppRho').textContent = body.metrics.rho.toFixed(4) + ' kg/m^3';
    $('ppRe').textContent = body.metrics.Re.toFixed(0);
    $('ppCd').textContent = body.metrics.Cd.toFixed(4);
    $('rhoLbl').textContent = 'rho = ' + body.metrics.rho.toFixed(4) + ' kg/m^3 (' + rhoPct.toFixed(0) + '% sea level)';
    $('tcount').textContent = app.state.telemetry.length.toLocaleString() + ' data points recorded';

    if ($('hLift')) $('hLift').textContent = body.metrics.lift.toFixed(3) + ' N';
    if ($('hAoA')) $('hAoA').textContent = body.metrics.aoa.toFixed(1) + ' deg';
  }

  function syncGraphCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(240, Math.round(rect.width));
    const height = Math.max(120, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function drawGraph(app) {
    const panel = $('graphPanel');
    panel.style.display = app.cfg.analysis.graph ? 'flex' : 'none';
    if (!app.cfg.analysis.graph) return;

    const canvas = $('graphCanvas');
    const sized = syncGraphCanvasSize(canvas);
    const ctx = sized.ctx;
    const width = sized.width;
    const height = sized.height;
    const history = displayForceHistory(app);
    const padX = 34;
    const padY = 16;
    const plotWidth = Math.max(24, width - padX - 12);
    const plotHeight = Math.max(24, height - padY * 2);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#111820';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = padY + i * plotHeight / 4;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(width - 8, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i += 1) {
      const x = padX + i * plotWidth / 4;
      ctx.beginPath();
      ctx.moveTo(x, padY);
      ctx.lineTo(x, height - padY);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(226,232,240,0.72)';
    ctx.font = '10px "JetBrains Mono"';
    ctx.textAlign = 'right';
    ctx.fillText('0', padX - 6, height - padY + 3);

    if (history.length < 2) return;
    const end = history[history.length - 1].time;
    const start = Math.max(0, end - 10);
    const span = Math.max(0.1, end - start);
    let maxForce = 1;
    history.forEach(function (point) {
      if (point.time >= start) maxForce = Math.max(maxForce, point.drag, point.lift, point.net);
    });

    ctx.fillText(maxForce.toFixed(2), padX - 6, padY + 3);
    ctx.textAlign = 'left';
    ctx.fillText('-' + span.toFixed(span < 9.5 ? 1 : 0) + 's', padX, height - 3);
    ctx.fillText('now', width - 28, height - 3);

    function plot(metric, color) {
      let started = false;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach(function (point) {
        if (point.time < start) return;
        const x = padX + (point.time - start) / span * plotWidth;
        const y = height - padY - (point[metric] / maxForce) * plotHeight;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    plot('drag', '#5AD1FF');
    plot('lift', '#C78BFF');
    plot('net', '#FFD166');

    ctx.font = '10px "JetBrains Mono"';
    ctx.fillStyle = '#5AD1FF';
    ctx.fillText('drag', padX, 11);
    ctx.fillStyle = '#C78BFF';
    ctx.fillText('lift', padX + 44, 11);
    ctx.fillStyle = '#FFD166';
    ctx.fillText('net', padX + 82, 11);
  }

  function setOverlay(el, x, y, visible) {
    if (!el) return;
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.left = x.toFixed(1) + 'px';
    el.style.top = y.toFixed(1) + 'px';
  }

  function syncPlaybackControls(app) {
    const playback = app.state.playback;
    const frames = playback.frames;
    const count = frames.length;
    const active = playback.active;
    const index = count ? (active ? playback.frameIndex : count - 1) : 0;
    const slider = $('playbackScrub');
    const stat = $('playbackFrameStat');
    const info = $('playbackInfo');
    const enterBtn = $('playbackEnterBtn');
    const exitBtn = $('playbackExitBtn');
    const prevBtn = $('playbackPrevBtn');
    const playBtn = $('playbackPlayBtn');
    const nextBtn = $('playbackNextBtn');
    const latestBtn = $('playbackLatestBtn');

    slider.max = String(Math.max(0, count - 1));
    slider.value = String(Math.max(0, index));
    slider.disabled = count < 2;
    stat.textContent = count ? (index + 1) + ' / ' + count : '0 / 0';

    if (!count) {
      info.textContent = 'No recorded frames yet. Run the simulation to build a timeline.';
    } else {
      const frame = frames[Math.max(0, index)];
      const stateLabel = active ? (playback.playing ? 'Playback running' : 'Playback paused') : 'Live view at latest recorded frame';
      info.textContent = stateLabel + ' | t ' + frame.time.toFixed(2) + ' s';
    }

    enterBtn.disabled = count === 0;
    exitBtn.disabled = !active;
    prevBtn.disabled = count === 0;
    playBtn.disabled = count < 2;
    nextBtn.disabled = count === 0;
    latestBtn.disabled = count === 0;
    playBtn.textContent = playback.playing ? 'Pause' : 'Play';
  }

  function bindEvents(app) {
    function bindRange(id, handler) {
      $(id).addEventListener('input', function (event) {
        handler(parseFloat(event.target.value));
        if (app.markExperimentDirty) app.markExperimentDirty();
      });
    }

    $('objSelect').addEventListener('change', function () {
      app.cfg.objKey = $('objSelect').value;
      app.cfg.objectScale = { x: 1, y: 1, z: 1 };
      app.resetObject();
    });
    $('surfSelect').addEventListener('change', function () {
      app.cfg.surfKey = $('surfSelect').value;
      if (app.refreshSurface) app.refreshSurface();
      if (app.markExperimentDirty) app.markExperimentDirty();
      updateStaticPanels(app);
    });

    bindRange('sSpeed', function (value) { app.cfg.wind.speed = value; $('vSpeed').textContent = value.toFixed(1) + ' m/s'; $('beaufort').textContent = P.beaufort(value); });
    bindRange('sAzim', function (value) { app.cfg.wind.azim = P.wrap360(value); $('vAzim').textContent = app.cfg.wind.azim.toFixed(0) + ' deg'; $('azimLbl').textContent = P.headingSummary(app.cfg.wind.azim); });
    bindRange('sElev', function (value) { app.cfg.wind.elev = value; $('vElev').textContent = value.toFixed(0) + ' deg'; $('elevLbl').textContent = value === 0 ? 'Horizontal' : (value > 0 ? value.toFixed(0) + ' deg upward' : Math.abs(value).toFixed(0) + ' deg downward'); });
    bindRange('sTurb', function (value) { app.cfg.wind.turb = value; $('vTurb').textContent = value.toFixed(0) + '%'; });
    bindRange('sGust', function (value) { app.cfg.wind.gust = value; $('vGust').textContent = value.toFixed(0) + '%'; });
    bindRange('sModeStrength', function (value) { app.cfg.wind.modeStrength = value; $('vModeStrength').textContent = value.toFixed(0) + '%'; });
    $('windModeSelect').addEventListener('change', function () { app.cfg.wind.mode = $('windModeSelect').value; if (app.markExperimentDirty) app.markExperimentDirty(); });
    $('seedInput').addEventListener('change', function () { app.cfg.seed = parseInt($('seedInput').value, 10) || 0; if (app.markExperimentDirty) app.markExperimentDirty(); });

    bindRange('sH0', function (value) { app.cfg.launch.h0 = value; $('vH0').textContent = value.toFixed(1) + ' m'; });
    bindRange('sVX', function (value) { app.cfg.launch.vx = value; $('vVX').textContent = value.toFixed(0) + ' m/s'; });
    bindRange('sVY', function (value) { app.cfg.launch.vy = value; $('vVY').textContent = value.toFixed(0) + ' m/s'; });
    bindRange('sVZ', function (value) { app.cfg.launch.vz = value; $('vVZ').textContent = value.toFixed(0) + ' m/s'; });
    bindRange('sOX', function (value) { app.cfg.launch.omx = value; $('vOX').textContent = value.toFixed(0) + ' r/s'; });
    bindRange('sOY', function (value) { app.cfg.launch.omy = value; $('vOY').textContent = value.toFixed(0) + ' r/s'; });
    bindRange('sOZ', function (value) { app.cfg.launch.omz = value; $('vOZ').textContent = value.toFixed(0) + ' r/s'; });

    bindRange('sAlt', function (value) { app.cfg.altitude = value; $('vAlt').textContent = value.toFixed(0) + ' m'; });
    bindRange('sCeil', function (value) { app.cfg.world.ceiling = value; $('vCeil').textContent = value.toFixed(0) + ' m'; app.updateChamber(); });
    bindRange('sPCount', function (value) { app.cfg.visuals.particleCount = Math.round(value); $('vPCount').textContent = String(app.cfg.visuals.particleCount); app.initParticles(); });
    bindRange('sPSize', function (value) { app.cfg.visuals.particleSize = value; $('vPSize').textContent = value.toFixed(2); app.setParticleSize(); });
    bindRange('sTrailLen', function (value) { app.cfg.visuals.trailMax = Math.round(value); $('vTrailLen').textContent = String(app.cfg.visuals.trailMax); });
    bindRange('sSimRate', function (value) { app.cfg.simRate = value; $('vSimRate').textContent = value.toFixed(2) + 'x'; });
    bindRange('sChamberW', function (value) { app.cfg.world.halfWidth = value * 0.5; $('vChamberW').textContent = value.toFixed(0) + ' m'; app.updateChamber(); });
    bindRange('sChamberD', function (value) { app.cfg.world.halfDepth = value * 0.5; $('vChamberD').textContent = value.toFixed(0) + ' m'; app.updateChamber(); });

    bindRange('sCamDist', function (value) { app.cfg.camera.distance = value; $('vCamDist').textContent = value.toFixed(1) + ' m'; });
    bindRange('sCamYaw', function (value) { app.cfg.camera.yaw = THREE.MathUtils.degToRad(value); $('vCamYaw').textContent = value.toFixed(0) + ' deg'; });
    bindRange('sCamPitch', function (value) { app.cfg.camera.pitch = THREE.MathUtils.degToRad(value); $('vCamPitch').textContent = value.toFixed(0) + ' deg'; });
    bindRange('sFov', function (value) { app.cfg.camera.fov = value; $('vFov').textContent = value.toFixed(0) + ' deg'; app.updateFov(); });
    bindRange('sCamLag', function (value) { app.cfg.camera.lag = value; $('vCamLag').textContent = value.toFixed(2); });
    bindRange('sObjScaleX', function (value) { app.cfg.objectScale.x = value; $('vObjScaleX').textContent = value.toFixed(2) + 'x'; app.updateObjectScale(); });
    bindRange('sObjScaleY', function (value) { app.cfg.objectScale.y = value; $('vObjScaleY').textContent = value.toFixed(2) + 'x'; app.updateObjectScale(); });
    bindRange('sObjScaleZ', function (value) { app.cfg.objectScale.z = value; $('vObjScaleZ').textContent = value.toFixed(2) + 'x'; app.updateObjectScale(); });

    $('presetSelect').addEventListener('change', function () { app.currentPresetName = $('presetSelect').value; });
    $('applyPresetBtn').addEventListener('click', function () { app.applyPreset($('presetSelect').value); });

    $('saveScenarioBtn').addEventListener('click', function () {
      const name = window.prompt('Scenario name');
      if (!name) return;
      const existing = app.savedScenarios.findIndex(function (entry) { return entry.name === name; });
      const payload = { name: name, scenario: activeSolver(app).defaultScenarioSnapshot(app) };
      if (existing >= 0) app.savedScenarios.splice(existing, 1, payload);
      else app.savedScenarios.push(payload);
      saveScenarioList(app);
      refreshSavedScenarioSelect(app);
      $('savedScenarioSelect').value = name;
    });

    $('loadScenarioBtn').addEventListener('click', function () {
      const name = $('savedScenarioSelect').value;
      const entry = app.savedScenarios.find(function (item) { return item.name === name; });
      if (entry) app.applyScenario(entry.scenario, false);
    });

    $('deleteScenarioBtn').addEventListener('click', function () {
      const name = $('savedScenarioSelect').value;
      app.savedScenarios = app.savedScenarios.filter(function (item) { return item.name !== name; });
      saveScenarioList(app);
      refreshSavedScenarioSelect(app);
    });

    $('exportScenarioBtn').addEventListener('click', function () {
      const blob = new Blob([JSON.stringify(activeSolver(app).defaultScenarioSnapshot(app), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'windsim_scenario.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    $('importScenarioBtn').addEventListener('click', function () {
      $('scenarioFileInput').click();
    });

    $('scenarioFileInput').addEventListener('change', function (event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const scenario = JSON.parse(reader.result);
          app.applyScenario(scenario, false);
        } catch (err) {
          window.alert('Invalid scenario JSON');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    });

    $('runValidationBtn').addEventListener('click', function () {
      const caseId = $('validationSelect').value;
      if (!caseId) return;
      app.startValidation(caseId);
      $('validationReport').textContent = 'Validation running...';
    });

    $('clearImpactsBtn').addEventListener('click', function () {
      app.state.impacts = [];
    });
    $('resetLayoutBtn').addEventListener('click', function () {
      resetLayoutState(app);
    });
    $('resetObjectScaleBtn').addEventListener('click', function () {
      app.cfg.objectScale = { x: 1, y: 1, z: 1 };
      syncGeometryControls(app);
      app.updateObjectScale();
    });

    $('tWallCollision').addEventListener('click', function () { app.cfg.world.collision = !app.cfg.world.collision; setToggle($('tWallCollision'), app.cfg.world.collision); });
    $('tMountedMode').addEventListener('click', function () {
      app.cfg.testMode = app.cfg.testMode === 'mounted' ? 'free' : 'mounted';
      setToggle($('tMountedMode'), app.cfg.testMode === 'mounted');
      app.resetObject();
    });
    $('playbackScrub').addEventListener('input', function (event) {
      app.scrubPlayback(parseInt(event.target.value, 10) || 0);
    });
    $('playbackEnterBtn').addEventListener('click', function () {
      app.enterPlayback();
    });
    $('playbackExitBtn').addEventListener('click', function () {
      app.exitPlayback();
    });
    $('playbackPrevBtn').addEventListener('click', function () {
      app.stepPlayback(-1);
    });
    $('playbackPlayBtn').addEventListener('click', function () {
      app.togglePlaybackRun();
    });
    $('playbackNextBtn').addEventListener('click', function () {
      app.stepPlayback(1);
    });
    $('playbackLatestBtn').addEventListener('click', function () {
      app.jumpPlaybackLatest();
    });
    $('sweepVarSelect').addEventListener('change', function () {
      app.state.experiment.variable = $('sweepVarSelect').value;
    });
    $('sweepStartInput').addEventListener('change', function () {
      app.state.experiment.start = parseFloat($('sweepStartInput').value) || 0;
    });
    $('sweepEndInput').addEventListener('change', function () {
      app.state.experiment.end = parseFloat($('sweepEndInput').value) || 0;
    });
    $('sweepStepsInput').addEventListener('change', function () {
      app.state.experiment.steps = Math.max(1, Math.min(41, parseInt($('sweepStepsInput').value, 10) || 1));
    });
    $('runSweepBtn').addEventListener('click', function () {
      app.runMountedSweep({
        variable: $('sweepVarSelect').value,
        start: parseFloat($('sweepStartInput').value) || 0,
        end: parseFloat($('sweepEndInput').value) || 0,
        steps: parseInt($('sweepStepsInput').value, 10) || 1
      });
    });
    $('exportSweepBtn').addEventListener('click', function () {
      app.exportMountedSweepCSV();
    });
    $('savedSweepSelect').addEventListener('change', function () {
      app.state.experiment.selectedSavedId = $('savedSweepSelect').value === '__none__' ? '' : $('savedSweepSelect').value;
      app.state.experiment.comparison = null;
      syncExperimentPanel(app);
    });
    $('saveSweepBtn').addEventListener('click', function () {
      const name = window.prompt('Sweep name');
      if (name === null) return;
      if (!app.saveMountedSweep(name)) return;
      saveExperimentList(app);
      refreshSavedSweepSelect(app);
      syncExperimentPanel(app);
    });
    $('compareSweepBtn').addEventListener('click', function () {
      app.compareCurrentSweepToSaved($('savedSweepSelect').value === '__none__' ? '' : $('savedSweepSelect').value);
    });
    $('useSavedSweepBtn').addEventListener('click', function () {
      app.useSavedSweep($('savedSweepSelect').value === '__none__' ? '' : $('savedSweepSelect').value);
    });
    $('deleteSweepBtn').addEventListener('click', function () {
      const runId = $('savedSweepSelect').value === '__none__' ? '' : $('savedSweepSelect').value;
      if (!runId) return;
      app.deleteSavedSweep(runId);
      saveExperimentList(app);
      refreshSavedSweepSelect(app);
      syncExperimentPanel(app);
    });
    $('tForceLabels').addEventListener('click', function () { app.cfg.analysis.forceLabels = !app.cfg.analysis.forceLabels; setToggle($('tForceLabels'), app.cfg.analysis.forceLabels); });
    $('tRuler').addEventListener('click', function () { app.cfg.analysis.ruler = !app.cfg.analysis.ruler; setToggle($('tRuler'), app.cfg.analysis.ruler); });
    $('tImpactMarkers').addEventListener('click', function () { app.cfg.analysis.impacts = !app.cfg.analysis.impacts; setToggle($('tImpactMarkers'), app.cfg.analysis.impacts); });
    $('tGraph').addEventListener('click', function () { app.cfg.analysis.graph = !app.cfg.analysis.graph; setToggle($('tGraph'), app.cfg.analysis.graph); });
    $('tCompareTrail').addEventListener('click', function () { app.cfg.analysis.compare = !app.cfg.analysis.compare; setToggle($('tCompareTrail'), app.cfg.analysis.compare); });
    $('tFlowSlice').addEventListener('click', function () {
      app.cfg.analysis.flowSlice = !app.cfg.analysis.flowSlice;
      setToggle($('tFlowSlice'), app.cfg.analysis.flowSlice);
      syncFlowProbeInfo(app);
    });
    $('sFlowSliceH').addEventListener('input', function (event) {
      app.cfg.analysis.flowSliceHeight = parseFloat(event.target.value) || 0.5;
      syncFlowProbeInfo(app);
    });
    $('sFlowSliceSpan').addEventListener('input', function (event) {
      app.cfg.analysis.flowSliceSpan = parseFloat(event.target.value) || 12;
      syncFlowProbeInfo(app);
    });
  }

  function install(app) {
    injectUiStyles();
    injectExtraPanels(app);
    app.savedScenarios = loadScenarioList();
    app.state.experiment.savedRuns = loadExperimentList();
    app.layoutState = loadLayoutState();
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

    if (!$('hLift')) {
      $('hud').insertAdjacentHTML('beforeend', '<div class="hi"><div class="hl">Lift F</div><div class="hv" id="hLift">0.000 N</div></div><div class="hi"><div class="hl">AoA</div><div class="hv" id="hAoA">0.0 deg</div></div>');
    }

    populateStaticSelects(app);
    refreshSavedSweepSelect(app);
    bindEvents(app);
    bindLayoutControls(app);
    syncScenarioControls(app);
    applyLayoutState(app, false);
    updateStaticPanels(app);
    syncPlaybackControls(app);
    syncExperimentPanel(app);
    syncFlowProbeInfo(app);
  }

  window.WindSimUI = {
    install: install,
    setToggle: setToggle,
    syncScenarioControls: syncScenarioControls,
    updateStaticPanels: updateStaticPanels,
    updateDynamicPanels: updateDynamicPanels,
    syncGeometryControls: syncGeometryControls,
    refreshSavedScenarioSelect: refreshSavedScenarioSelect,
    drawGraph: drawGraph,
    setOverlay: setOverlay,
    syncPlaybackControls: syncPlaybackControls,
    syncExperimentPanel: syncExperimentPanel,
    syncFlowProbeInfo: syncFlowProbeInfo
  };
}());
