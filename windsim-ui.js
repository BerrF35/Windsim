(function () {
  'use strict';

  const D = window.WindSimData;
  const P = window.WindSimPhysics;

  function $(id) {
    return document.getElementById(id);
  }

  function setToggle(el, on) {
    if (!el) return;
    el.classList.toggle('on', !!on);
  }

  function formatMass(mass) {
    return mass >= 0.1 ? mass.toFixed(3) + ' kg' : (mass * 1000).toFixed(2) + ' g';
  }

  function titleizeKey(key) {
    return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (match) {
      return match.toUpperCase();
    });
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

  function injectUiStyles() {
    if ($('windsim-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'windsim-ui-style';
    style.textContent = [
      '.num-input{width:100%;background:var(--surf2);border:1px solid var(--bdr);color:var(--txt);border-radius:5px;padding:7px 10px;font-family:"JetBrains Mono",monospace;font-size:11px;outline:none}',
      '.mini-note{font-family:"JetBrains Mono",monospace;font-size:8px;color:var(--txt3);line-height:1.5;margin-top:4px}',
      '.report-box{margin-top:7px;background:var(--surf2);border:1px solid var(--bdr);border-radius:5px;padding:8px 9px;font-family:"JetBrains Mono",monospace;font-size:8px;line-height:1.7;color:var(--txt2);white-space:pre-wrap;min-height:78px}',
      '.graph-panel{position:absolute;right:11px;top:11px;z-index:20;background:rgba(11,16,24,.86);border:1px solid var(--bdr);border-radius:6px;padding:8px 8px 6px;backdrop-filter:blur(6px);box-shadow:0 12px 26px rgba(0,0,0,.22)}',
      '.graph-title{font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:1px;color:var(--txt3);margin-bottom:5px}',
      '.graph-canvas{display:block;width:260px;height:120px}',
      '.force-label{position:absolute;z-index:24;padding:2px 6px;border-radius:999px;background:rgba(11,16,24,.88);border:1px solid var(--bdr);font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:.8px;color:var(--txt2);pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap}',
      '.measure-label{position:absolute;z-index:24;padding:3px 7px;border-radius:999px;background:rgba(11,16,24,.88);border:1px solid var(--bdr);font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:.8px;color:var(--cyan);pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap}',
      '.validation-pill{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:24;background:rgba(11,16,24,.9);border:1px solid var(--bdr);border-radius:999px;padding:5px 12px;font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:1px;color:var(--amber);pointer-events:none;display:none}',
      '.scenario-row{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:6px}',
      '.measure-kbd{font-family:"JetBrains Mono",monospace;font-size:8px;color:var(--txt3);margin-top:4px;text-align:center}',
      '@media (max-width:980px){.graph-panel{right:8px;top:8px}.graph-canvas{width:220px;height:110px}}'
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
        '<details><summary>Measurements</summary><div class="sec-body">',
        '<div class="tgl-row">Force Labels<div class="tgl on" id="tForceLabels"></div></div>',
        '<div class="tgl-row">Ruler<div class="tgl on" id="tRuler"></div></div>',
        '<div class="tgl-row">Impact Markers<div class="tgl on" id="tImpactMarkers"></div></div>',
        '<div class="tgl-row">Force Graph<div class="tgl on" id="tGraph"></div></div>',
        '<div class="tgl-row">Compare Trails<div class="tgl on" id="tCompareTrail"></div></div>',
        '<button class="btn btn-d" id="clearImpactsBtn">Clear Markers</button>',
        '<div class="measure-kbd">Ruler tracks launch to body in-scene.</div>',
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
        '<div class="graph-title">FORCE HISTORY</div>',
        '<canvas class="graph-canvas" id="graphCanvas" width="260" height="120"></canvas>',
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
    setToggle($('tForceLabels'), cfg.analysis.forceLabels);
    setToggle($('tRuler'), cfg.analysis.ruler);
    setToggle($('tImpactMarkers'), cfg.analysis.impacts);
    setToggle($('tGraph'), cfg.analysis.graph);
    setToggle($('tCompareTrail'), cfg.analysis.compare);
  }

  function updateStaticPanels(app) {
    const def = D.OBJ_DEFS[app.cfg.objKey];
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
  }

  function updateDynamicPanels(app) {
    const body = app.state.body;
    const def = D.OBJ_DEFS[app.cfg.objKey];
    const speed = body.vel.length();
    const accel = body.acc.length();
    const spinRps = body.omegaBody.length() / D.TAU;
    const horizontalTravel = Math.sqrt(
      Math.pow(body.pos.x - body.launchPos.x, 2) +
      Math.pow(body.pos.z - body.launchPos.z, 2)
    );
    const rhoPct = body.metrics.rho / D.RHO0 * 100;
    const energyTrans = 0.5 * def.mass * speed * speed;
    const inertiaAvg = (def.inertia[0] + def.inertia[1] + def.inertia[2]) / 3;
    const energyRot = 0.5 * inertiaAvg * body.omegaBody.lengthSq();
    const energyPot = def.mass * D.GRAV * Math.max(0, body.pos.y - body.supportY);

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
    $('hT').textContent = app.state.time.toFixed(2) + ' s';

    $('eKet').textContent = energyTrans.toFixed(3) + ' J';
    $('eKer').textContent = energyRot.toFixed(3) + ' J';
    $('ePe').textContent = energyPot.toFixed(3) + ' J';
    $('eWw').textContent = (horizontalTravel * body.metrics.drag * 0.08).toFixed(3) + ' J';
    $('eFl').textContent = (app.state.impacts.length * 0.03 + Math.max(0, horizontalTravel - speed) * 0.02).toFixed(3) + ' J';

    $('ppRho').textContent = body.metrics.rho.toFixed(4) + ' kg/m^3';
    $('ppRe').textContent = body.metrics.Re.toFixed(0);
    $('ppCd').textContent = body.metrics.Cd.toFixed(4);
    $('rhoLbl').textContent = 'rho = ' + body.metrics.rho.toFixed(4) + ' kg/m^3 (' + rhoPct.toFixed(0) + '% sea level)';
    $('tcount').textContent = app.state.telemetry.length.toLocaleString() + ' data points recorded';

    if ($('hLift')) $('hLift').textContent = body.metrics.lift.toFixed(3) + ' N';
    if ($('hAoA')) $('hAoA').textContent = body.metrics.aoa.toFixed(1) + ' deg';
  }

  function drawGraph(app) {
    const panel = $('graphPanel');
    panel.style.display = app.cfg.analysis.graph ? 'block' : 'none';
    if (!app.cfg.analysis.graph) return;

    const canvas = $('graphCanvas');
    const ctx = canvas.getContext('2d');
    const history = app.state.forceHistory;
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1018';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(58,80,112,0.6)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = i * height / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (history.length < 2) return;
    const end = history[history.length - 1].time;
    const start = Math.max(0, end - 10);
    const span = Math.max(0.1, end - start);
    let maxForce = 1;
    history.forEach(function (p) {
      if (p.time >= start) maxForce = Math.max(maxForce, p.drag, p.lift, p.net);
    });

    function plot(metric, color) {
      let started = false;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach(function (p) {
        if (p.time < start) return;
        const x = (p.time - start) / span * width;
        const y = height - (p[metric] / maxForce) * (height - 8) - 4;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    plot('drag', '#00d4ff');
    plot('lift', '#10d9a0');
    plot('net', '#f59e0b');

    ctx.fillStyle = '#6888aa';
    ctx.font = '10px "JetBrains Mono"';
    ctx.fillText('drag', 8, 12);
    ctx.fillStyle = '#10d9a0';
    ctx.fillText('lift', 52, 12);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('net', 90, 12);
  }

  function setOverlay(el, x, y, visible) {
    if (!el) return;
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.left = x.toFixed(1) + 'px';
    el.style.top = y.toFixed(1) + 'px';
  }

  function bindEvents(app) {
    function bindRange(id, handler) {
      $(id).addEventListener('input', function (event) {
        handler(parseFloat(event.target.value));
      });
    }

    $('objSelect').addEventListener('change', function () {
      app.cfg.objKey = $('objSelect').value;
      app.resetObject();
    });
    $('surfSelect').addEventListener('change', function () {
      app.cfg.surfKey = $('surfSelect').value;
      if (app.refreshSurface) app.refreshSurface();
      updateStaticPanels(app);
    });

    bindRange('sSpeed', function (value) { app.cfg.wind.speed = value; $('vSpeed').textContent = value.toFixed(1) + ' m/s'; $('beaufort').textContent = P.beaufort(value); });
    bindRange('sAzim', function (value) { app.cfg.wind.azim = P.wrap360(value); $('vAzim').textContent = app.cfg.wind.azim.toFixed(0) + ' deg'; $('azimLbl').textContent = P.headingSummary(app.cfg.wind.azim); });
    bindRange('sElev', function (value) { app.cfg.wind.elev = value; $('vElev').textContent = value.toFixed(0) + ' deg'; $('elevLbl').textContent = value === 0 ? 'Horizontal' : (value > 0 ? value.toFixed(0) + ' deg upward' : Math.abs(value).toFixed(0) + ' deg downward'); });
    bindRange('sTurb', function (value) { app.cfg.wind.turb = value; $('vTurb').textContent = value.toFixed(0) + '%'; });
    bindRange('sGust', function (value) { app.cfg.wind.gust = value; $('vGust').textContent = value.toFixed(0) + '%'; });
    bindRange('sModeStrength', function (value) { app.cfg.wind.modeStrength = value; $('vModeStrength').textContent = value.toFixed(0) + '%'; });
    $('windModeSelect').addEventListener('change', function () { app.cfg.wind.mode = $('windModeSelect').value; });
    $('seedInput').addEventListener('change', function () { app.cfg.seed = parseInt($('seedInput').value, 10) || 0; });

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

    $('presetSelect').addEventListener('change', function () { app.currentPresetName = $('presetSelect').value; });
    $('applyPresetBtn').addEventListener('click', function () { app.applyPreset($('presetSelect').value); });

    $('saveScenarioBtn').addEventListener('click', function () {
      const name = window.prompt('Scenario name');
      if (!name) return;
      const existing = app.savedScenarios.findIndex(function (entry) { return entry.name === name; });
      const payload = { name: name, scenario: P.defaultScenarioSnapshot(app) };
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
      const blob = new Blob([JSON.stringify(P.defaultScenarioSnapshot(app), null, 2)], { type: 'application/json' });
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

    $('tWallCollision').addEventListener('click', function () { app.cfg.world.collision = !app.cfg.world.collision; setToggle($('tWallCollision'), app.cfg.world.collision); });
    $('tForceLabels').addEventListener('click', function () { app.cfg.analysis.forceLabels = !app.cfg.analysis.forceLabels; setToggle($('tForceLabels'), app.cfg.analysis.forceLabels); });
    $('tRuler').addEventListener('click', function () { app.cfg.analysis.ruler = !app.cfg.analysis.ruler; setToggle($('tRuler'), app.cfg.analysis.ruler); });
    $('tImpactMarkers').addEventListener('click', function () { app.cfg.analysis.impacts = !app.cfg.analysis.impacts; setToggle($('tImpactMarkers'), app.cfg.analysis.impacts); });
    $('tGraph').addEventListener('click', function () { app.cfg.analysis.graph = !app.cfg.analysis.graph; setToggle($('tGraph'), app.cfg.analysis.graph); });
    $('tCompareTrail').addEventListener('click', function () { app.cfg.analysis.compare = !app.cfg.analysis.compare; setToggle($('tCompareTrail'), app.cfg.analysis.compare); });
  }

  function install(app) {
    injectUiStyles();
    injectExtraPanels(app);
    app.savedScenarios = loadScenarioList();
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
    bindEvents(app);
    syncScenarioControls(app);
    updateStaticPanels(app);
  }

  window.WindSimUI = {
    install: install,
    setToggle: setToggle,
    syncScenarioControls: syncScenarioControls,
    updateStaticPanels: updateStaticPanels,
    updateDynamicPanels: updateDynamicPanels,
    refreshSavedScenarioSelect: refreshSavedScenarioSelect,
    drawGraph: drawGraph,
    setOverlay: setOverlay
  };
}());
