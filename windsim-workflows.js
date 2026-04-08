(function () {
  'use strict';

  const D = window.WindSimData;
  const S = window.WindSimSolvers;

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

  function attach(app, options) {
    const clamp = options.clamp;
    const deepClone = options.deepClone;
    const sweepFields = options.sweepFields;
    const currentDef = options.currentDef;
    const applyScenario = options.applyScenario;
    const playbackMaxFrames = options.playbackMaxFrames || 6000;
    const syncExperimentPanel = options.syncExperimentPanel || function () {};
    let nextSweepOrdinal = 1;

    function resetPlaybackState() {
      app.state.playback.frames = [];
      app.state.playback.active = false;
      app.state.playback.playing = false;
      app.state.playback.frameIndex = -1;
      app.state.playback.cursorTime = 0;
      app.state.playback.lastCaptureTime = -1;
    }

    function markExperimentDirty() {
      const experiment = app.state.experiment;
      if (!experiment.rows.length) return;
      experiment.dirty = true;
      experiment.comparison = null;
      syncExperimentPanel();
    }

    function clearExperimentDirty() {
      app.state.experiment.dirty = false;
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

      if (playback.frames.length > playbackMaxFrames) {
        playback.frames.shift();
        if (playback.active && playback.frameIndex > 0) playback.frameIndex -= 1;
      }

      if (!playback.active) {
        playback.frameIndex = playback.frames.length - 1;
        playback.cursorTime = frame.time;
      }
    }

    function getDisplayFrame() {
      const playback = app.state.playback;
      if (!playback.active || playback.frameIndex < 0 || playback.frameIndex >= playback.frames.length) return null;
      return playback.frames[playback.frameIndex];
    }

    function getDisplayForceHistory() {
      const playback = app.state.playback;
      if (!playback.active) return app.state.forceHistory;
      return playback.frames.slice(0, playback.frameIndex + 1).map(function (frame) {
        return frame.graph;
      });
    }

    function getDisplayImpacts() {
      const frame = getDisplayFrame();
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

    function sweepField(key) {
      return sweepFields[key] || sweepFields.wind_speed;
    }

    function currentSweepRecord(nameOverride) {
      const experiment = app.state.experiment;
      if (!experiment.rows.length) return null;
      const field = sweepField(experiment.variable);
      const scenario = experiment.baseScenario ? deepClone(experiment.baseScenario) : app.solver.defaultScenarioSnapshot(app);
      const solverKey = scenario.solverKey || app.solver.key;
      const solver = S.getSolver(solverKey);
      const profile = solver.getProfile ? solver.getProfile() : null;
      return {
        id: '',
        name: nameOverride || '',
        createdAt: new Date().toISOString(),
        solverKey: solver.key,
        solverLabel: profile && profile.label ? profile.label : solver.key,
        solverClassification: profile && profile.classification ? profile.classification : 'unknown',
        testMode: 'mounted',
        objectKey: experiment.objectKey || scenario.objKey || app.cfg.objKey,
        objectLabel: experiment.objectLabel || currentDef().label,
        surfaceKey: experiment.surfaceKey || scenario.surfKey || app.cfg.surfKey,
        windMode: experiment.windMode || (scenario.wind && scenario.wind.mode) || app.cfg.wind.mode,
        sweep: {
          variable: experiment.variable,
          label: field.label,
          unit: field.unit,
          start: experiment.start,
          end: experiment.end,
          steps: experiment.steps
        },
        baseScenario: scenario,
        rows: deepClone(experiment.rows)
      };
    }

    function defaultSweepName() {
      const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16).replace(/:/g, '-');
      return currentDef().label + ' ' + sweepField(app.state.experiment.variable).label + ' ' + stamp;
    }

    function ensureUniqueSweepName(name, excludeId) {
      const base = (name || '').trim() || defaultSweepName();
      let candidate = base;
      let index = 2;
      while (app.state.experiment.savedRuns.some(function (run) { return run.name === candidate && run.id !== excludeId; })) {
        candidate = base + ' (' + index + ')';
        index += 1;
      }
      return candidate;
    }

    function createSweepId() {
      const id = 'sweep-' + String(nextSweepOrdinal).padStart(4, '0');
      nextSweepOrdinal += 1;
      return id;
    }

    function findSavedSweep(runId) {
      return app.state.experiment.savedRuns.find(function (run) { return run.id === runId; }) || null;
    }

    function finiteMean(rows, key) {
      let sum = 0;
      let count = 0;
      rows.forEach(function (row) {
        if (!Number.isFinite(row[key])) return;
        sum += row[key];
        count += 1;
      });
      return count ? (sum / count) : null;
    }

    function finitePeak(rows, key) {
      let best = null;
      rows.forEach(function (row) {
        if (!Number.isFinite(row[key])) return;
        if (best === null || row[key] > best) best = row[key];
      });
      return best;
    }

    function summarizeSweepRows(rows) {
      if (!rows.length) return null;
      return {
        start: rows[0].sweep_value,
        end: rows[rows.length - 1].sweep_value,
        meanDrag: finiteMean(rows, 'drag_N'),
        peakDrag: finitePeak(rows, 'drag_N'),
        meanLift: finiteMean(rows, 'lift_N'),
        peakLift: finitePeak(rows, 'lift_N'),
        meanNet: finiteMean(rows, 'net_force_N'),
        peakNet: finitePeak(rows, 'net_force_N'),
        meanCd: finiteMean(rows, 'cd_current')
      };
    }

    function formatMetric(value, digits, suffix) {
      return Number.isFinite(value) ? value.toFixed(digits) + (suffix || '') : 'n/a';
    }

    function formatDelta(value, digits, suffix) {
      return Number.isFinite(value) ? ((value >= 0 ? '+' : '') + value.toFixed(digits) + (suffix || '')) : 'n/a';
    }

    function exactSweepAlignment(currentRun, savedRun) {
      if (!currentRun || !savedRun) return false;
      if (currentRun.sweep.variable !== savedRun.sweep.variable || currentRun.sweep.unit !== savedRun.sweep.unit) return false;
      if (currentRun.rows.length !== savedRun.rows.length) return false;
      for (let i = 0; i < currentRun.rows.length; i += 1) {
        if (Math.abs(currentRun.rows[i].sweep_value - savedRun.rows[i].sweep_value) > 1e-6) return false;
      }
      return true;
    }

    function buildSweepComparison(currentRun, savedRun) {
      if (!currentRun || !savedRun) return null;
      const currentSummary = summarizeSweepRows(currentRun.rows);
      const savedSummary = summarizeSweepRows(savedRun.rows);
      const exact = exactSweepAlignment(currentRun, savedRun);
      const lines = [
        'Compare current vs ' + savedRun.name,
        'Current object: ' + currentRun.objectLabel + ' | Saved object: ' + savedRun.objectLabel,
        'Current mode: ' + currentRun.windMode + ' | Saved mode: ' + savedRun.windMode,
        'Current sweep: ' + currentRun.sweep.label + ' ' + formatMetric(currentRun.sweep.start, 2, ' ' + currentRun.sweep.unit) + ' to ' + formatMetric(currentRun.sweep.end, 2, ' ' + currentRun.sweep.unit) + ' | rows ' + currentRun.rows.length,
        'Saved sweep: ' + savedRun.sweep.label + ' ' + formatMetric(savedRun.sweep.start, 2, ' ' + savedRun.sweep.unit) + ' to ' + formatMetric(savedRun.sweep.end, 2, ' ' + savedRun.sweep.unit) + ' | rows ' + savedRun.rows.length,
        'Peak drag delta: ' + formatDelta((currentSummary && savedSummary) ? currentSummary.peakDrag - savedSummary.peakDrag : null, 3, ' N'),
        'Mean drag delta: ' + formatDelta((currentSummary && savedSummary) ? currentSummary.meanDrag - savedSummary.meanDrag : null, 3, ' N'),
        'Peak lift delta: ' + formatDelta((currentSummary && savedSummary) ? currentSummary.peakLift - savedSummary.peakLift : null, 3, ' N'),
        'Mean Cd delta: ' + formatDelta((currentSummary && savedSummary) ? currentSummary.meanCd - savedSummary.meanCd : null, 3, '')
      ];

      if (!exact) {
        lines.push('');
        lines.push('Point deltas unavailable: sweep variable or sample points do not align exactly.');
        return {
          runId: savedRun.id,
          runName: savedRun.name,
          exactAligned: false,
          text: lines.join('\n')
        };
      }

      lines.push('');
      currentRun.rows.forEach(function (row, index) {
        const savedRow = savedRun.rows[index];
        lines.push(
          row.sweep_value.toFixed(2) + ' ' + currentRun.sweep.unit +
          ' | dDrag ' + formatDelta(row.drag_N - savedRow.drag_N, 3, ' N') +
          ' | dLift ' + formatDelta(row.lift_N - savedRow.lift_N, 3, ' N') +
          ' | dCd ' + formatDelta(
            Number.isFinite(row.cd_current) && Number.isFinite(savedRow.cd_current) ? row.cd_current - savedRow.cd_current : null,
            3,
            ''
          )
        );
      });

      return {
        runId: savedRun.id,
        runName: savedRun.name,
        exactAligned: true,
        text: lines.join('\n')
      };
    }

    function runMountedSweep(options) {
      const experiment = app.state.experiment;
      const variable = options && sweepFields[options.variable] ? options.variable : app.state.experiment.variable;
      const field = sweepField(variable);
      const start = Number.isFinite(options && options.start) ? options.start : app.state.experiment.start;
      const end = Number.isFinite(options && options.end) ? options.end : app.state.experiment.end;
      const steps = clamp(Math.round(Number.isFinite(options && options.steps) ? options.steps : app.state.experiment.steps), 1, 41);
      const rows = [];

      for (let i = 0; i < steps; i += 1) {
        const t = steps === 1 ? 0 : i / (steps - 1);
        const value = steps === 1 ? start : THREE.MathUtils.lerp(start, end, t);
        const cfg = deepClone(app.cfg);
        cfg.solverKey = app.solver.key;
        cfg.testMode = 'mounted';
        field.write(cfg, value);
        const sample = app.solver.sampleMountedLoads(cfg);
        rows.push(Object.assign({
          sweep_variable: variable,
          sweep_label: field.label,
          sweep_unit: field.unit,
          sweep_value: value,
          object: currentDef().label,
          wind_mode: cfg.wind.mode
        }, sample));
      }

      experiment.variable = variable;
      experiment.start = start;
      experiment.end = end;
      experiment.steps = steps;
      experiment.rows = rows;
      experiment.baseScenario = app.solver.defaultScenarioSnapshot(app);
      experiment.objectKey = app.cfg.objKey;
      experiment.objectLabel = currentDef().label;
      experiment.surfaceKey = app.cfg.surfKey;
      experiment.windMode = app.cfg.wind.mode;
      clearExperimentDirty();
      experiment.comparison = experiment.selectedSavedId ? buildSweepComparison(currentSweepRecord(), findSavedSweep(experiment.selectedSavedId)) : null;
      syncExperimentPanel();
    }

    function saveMountedSweep(name) {
      if (!app.state.experiment.rows.length) {
        window.alert('Run a sweep first.');
        return null;
      }
      const requestedName = (name || '').trim();
      const existing = requestedName ? app.state.experiment.savedRuns.find(function (run) { return run.name === requestedName; }) : null;
      const finalName = requestedName || ensureUniqueSweepName('');
      const run = currentSweepRecord(finalName);
      run.id = existing ? existing.id : createSweepId();
      run.createdAt = existing ? existing.createdAt : run.createdAt;
      run.updatedAt = new Date().toISOString();
      if (existing) {
        const index = app.state.experiment.savedRuns.findIndex(function (entry) { return entry.id === existing.id; });
        app.state.experiment.savedRuns.splice(index, 1, run);
      } else {
        app.state.experiment.savedRuns.unshift(run);
      }
      app.state.experiment.selectedSavedId = run.id;
      app.state.experiment.comparison = null;
      syncExperimentPanel();
      return run;
    }

    function deleteSavedSweep(runId) {
      if (!runId) return;
      app.state.experiment.savedRuns = app.state.experiment.savedRuns.filter(function (run) { return run.id !== runId; });
      if (app.state.experiment.selectedSavedId === runId) {
        app.state.experiment.selectedSavedId = app.state.experiment.savedRuns.length ? app.state.experiment.savedRuns[0].id : '';
      }
      if (app.state.experiment.comparison && app.state.experiment.comparison.runId === runId) {
        app.state.experiment.comparison = null;
      }
      syncExperimentPanel();
    }

    function useSavedSweep(runId) {
      const run = findSavedSweep(runId);
      if (!run) return;
      const scenario = run.baseScenario || app.solver.defaultScenarioSnapshot(app);
      applyScenario(scenario);
      app.state.experiment.variable = run.sweep.variable;
      app.state.experiment.start = run.sweep.start;
      app.state.experiment.end = run.sweep.end;
      app.state.experiment.steps = run.sweep.steps;
      app.state.experiment.rows = deepClone(run.rows);
      app.state.experiment.baseScenario = deepClone(scenario);
      app.state.experiment.objectKey = run.objectKey || '';
      app.state.experiment.objectLabel = run.objectLabel || '';
      app.state.experiment.surfaceKey = run.surfaceKey || '';
      app.state.experiment.windMode = run.windMode || '';
      app.state.experiment.selectedSavedId = run.id;
      app.state.experiment.comparison = null;
      clearExperimentDirty();
      syncExperimentPanel();
    }

    function compareCurrentSweepToSaved(runId) {
      const run = findSavedSweep(runId);
      if (!run) {
        window.alert('Select a saved sweep first.');
        return;
      }
      if (!app.state.experiment.rows.length) {
        window.alert('Run or load a sweep first.');
        return;
      }
      app.state.experiment.selectedSavedId = run.id;
      app.state.experiment.comparison = buildSweepComparison(currentSweepRecord(), run);
      syncExperimentPanel();
    }

    function exportMountedSweepCSV() {
      const rows = app.state.experiment.rows;
      if (!rows.length) {
        window.alert('Run a sweep first.');
        return;
      }
      const header = Object.keys(rows[0]).join(',');
      const body = rows.map(function (row) { return Object.values(row).join(','); }).join('\n');
      const blob = new Blob(['# WindSim Mounted Sweep\n# ' + new Date().toISOString() + '\n# Instantaneous mounted reduced-order samples\n' + header + '\n' + body], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'windsim_sweep_' + app.cfg.objKey + '_' + Date.now() + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    }

    app.resetPlaybackState = resetPlaybackState;
    app.markExperimentDirty = markExperimentDirty;
    app.capturePlaybackFrame = capturePlaybackFrame;
    app.getDisplayFrame = getDisplayFrame;
    app.getDisplayForceHistory = getDisplayForceHistory;
    app.getDisplayImpacts = getDisplayImpacts;
    app.enterPlayback = enterPlayback;
    app.exitPlayback = exitPlayback;
    app.scrubPlayback = scrubPlayback;
    app.stepPlayback = stepPlayback;
    app.jumpPlaybackLatest = jumpPlaybackLatest;
    app.togglePlaybackRun = togglePlaybackRun;
    app.updatePlayback = updatePlayback;
    app.runMountedSweep = runMountedSweep;
    app.saveMountedSweep = saveMountedSweep;
    app.deleteSavedSweep = deleteSavedSweep;
    app.useSavedSweep = useSavedSweep;
    app.compareCurrentSweepToSaved = compareCurrentSweepToSaved;
    app.exportMountedSweepCSV = exportMountedSweepCSV;
  }

  window.WindSimWorkflows = {
    attach: attach
  };
}());
