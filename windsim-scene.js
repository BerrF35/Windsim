(function () {
  'use strict';

  var D = window.WindSimData;
  var T = window.WindSimTextures;
  var M = window.WindSimModels;
  var UI = window.WindSimUI;
  var V3 = THREE.Vector3;

  /* ---- constants ---- */

  var FLOW_PROBE_GRID = 7;
  var FLOW_PROBE_SAMPLES = FLOW_PROBE_GRID * FLOW_PROBE_GRID;

  var SIM_COLORS = {
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
  var SIM_COLOR_HEX = {
    drag: '#5AD1FF',
    grav: '#FF8A4C',
    vel: '#A8FF78',
    magnus: '#C78BFF',
    spin: '#FFD166',
    ruler: '#74D3FF'
  };
  var FLOW_PROBE_LOW_RGB = T.rgbFromHex(0x4f6f88);
  var FLOW_PROBE_HIGH_RGB = T.rgbFromHex(0xffd166);

  /* ---- utilities ---- */

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function lengthVec3(s) { return Math.hypot(s.x, s.y, s.z); }
  function $(id) { return document.getElementById(id); }

  /* ---- install ---- */

  function install(app, options) {
    var displayBody = options.displayBody;
    var displayImpacts = options.displayImpacts;
    var currentDef = options.currentDef;

    var tmpA = new V3();
    var tmpB = new V3();
    var tmpC = new V3();
    var tmpD = new V3();

    /* ---- object visual ---- */

    function setObjectVisual() {
      if (app.render.activeModel) {
        app.render.objectPivot.remove(app.render.activeModel);
        M.disposeObjectVisual(app.render.activeModel);
      }
      app.render.activeModel = M.buildObjectVisual(currentDef());
      app.render.objectPivot.add(app.render.activeModel);
    }

    /* ---- surface / ground / chamber ---- */

    function refreshSurface() {
      var props = T.surfaceMaterialProps(app.cfg.surfKey);
      app.render.groundMat.map = T.getSurfaceTexture(app.cfg.surfKey);
      app.render.groundMat.roughness = props.roughness;
      app.render.groundMat.metalness = props.metalness;
      app.render.groundMat.needsUpdate = true;
    }

    function updateGround() {
      var body = displayBody();
      if (!body) return;
      var gx = Math.round(body.pos.x / D.FLOOR_STEP) * D.FLOOR_STEP;
      var gz = Math.round(body.pos.z / D.FLOOR_STEP) * D.FLOOR_STEP;
      app.render.groundGroup.position.set(gx, 0, gz);
      app.render.groundMat.map.offset.set(-gx / T.SURFACE_WORLD_TILE, -gz / T.SURFACE_WORLD_TILE);
      app.render.groundOverlayMat.map.offset.set(-gx / T.GRID_WORLD_TILE, -gz / T.GRID_WORLD_TILE);
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

    /* ---- renderer setup ---- */

    function resizeRenderer() {
      var width = app.render.mainEl.clientWidth;
      var height = Math.max(1, app.render.mainEl.clientHeight);
      app.render.renderer.setSize(width, height);
      app.render.camera.aspect = width / height;
      app.render.camera.updateProjectionMatrix();
    }

    function setupRenderer() {
      var render = app.render;
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

      var ambient = new THREE.AmbientLight(0x1c2832, 1.28);
      var dir = new THREE.DirectionalLight(0xeaf1f7, 1.18);
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
      var hemi = new THREE.HemisphereLight(0x556879, 0x070a0d, 0.58);

      // Async load HDR Environment Map for PBR
      if (THREE.RGBELoader) {
        new THREE.RGBELoader().load('./assets/studio_small_09_1k.hdr', function (texture) {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          render.scene.environment = texture;
          // Clean aerospace background
          render.scene.background = new THREE.Color(0x0C1117);
        });
      }
      var rim = new THREE.DirectionalLight(0x90afc9, 0.58);
      var fill = new THREE.PointLight(0x6f93b2, 0.22, 140);
      var point = new THREE.PointLight(0x89bad8, 0.48, 56);
      render.scene.add(ambient, dir, hemi, rim, fill, point, new THREE.AxesHelper(4));
      render.lights = { ambient: ambient, dir: dir, hemi: hemi, rim: rim, fill: fill, point: point };

      render.objectPivot = new THREE.Group();
      render.scene.add(render.objectPivot);

      render.groundGroup = new THREE.Group();
      render.groundMat = new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, map: T.getSurfaceTexture(app.cfg.surfKey) }, T.surfaceMaterialProps(app.cfg.surfKey)));
      render.groundOverlayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: T.getGridOverlayTexture(), transparent: true, opacity: 0.10, depthWrite: false });
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(D.FLOOR_SIZE, D.FLOOR_SIZE), render.groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      var overlay = new THREE.Mesh(new THREE.PlaneGeometry(D.FLOOR_SIZE, D.FLOOR_SIZE), render.groundOverlayMat);
      overlay.rotation.x = -Math.PI / 2;
      overlay.position.y = 0.02;
      var grid = new THREE.GridHelper(D.FLOOR_SIZE, Math.round(D.FLOOR_SIZE / 5), 0x334554, 0x141b23);
      grid.material.transparent = true;
      grid.material.opacity = 0.06;
      render.groundGroup.add(ground, overlay, grid);
      render.scene.add(render.groundGroup);

      render.chamberGroup = new THREE.Group();
      render.scene.add(render.chamberGroup);

      /* initialise the texture module with the newly-created renderer */
      T.init(render.renderer);
    }

    /* ---- particles ---- */

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

    function particleOscillation(phase, freq, time, offset) {
      return (
        Math.sin(time * freq + phase + offset) * 0.64 +
        Math.sin(time * (freq * 1.73) + phase * 0.61 + offset * 1.4) * 0.36
      );
    }

    function spawnParticle(index, generation) {
      var anchor = particleAnchor();
      var span = particleSpan();
      var gen = Number.isFinite(generation) ? generation : 0;
      var rng = T.makeRng(T.seedFromText('particle:' + app.cfg.seed + ':' + index + ':' + gen));
      return {
        x: anchor.x + (rng() - 0.5) * span.x,
        y: clamp(anchor.y - span.y * 0.35 + rng() * span.y, 0.3, app.cfg.world.ceiling * 0.82),
        z: anchor.z + (rng() - 0.5) * span.z,
        life: rng(),
        maxLife: 2.2 + rng() * 2.8,
        generation: gen,
        phaseX: rng() * D.TAU,
        phaseY: rng() * D.TAU,
        phaseZ: rng() * D.TAU,
        freqX: 0.45 + rng() * 1.15,
        freqY: 0.55 + rng() * 0.95,
        freqZ: 0.50 + rng() * 1.05
      };
    }

    /* ---- geometry layers ---- */

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

      app.render.flowProbeGeo = new THREE.BufferGeometry();
      app.render.flowProbeGeo.setAttribute('position', new THREE.BufferAttribute(app.render.flowProbePositions, 3));
      app.render.flowProbeGeo.setAttribute('color', new THREE.BufferAttribute(app.render.flowProbeColors, 3));
      app.render.flowProbeLine = new THREE.LineSegments(app.render.flowProbeGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72 }));
      app.render.flowProbeLine.frustumCulled = false;
      app.render.flowProbeLine.visible = false;
      app.render.scene.add(app.render.flowProbeLine);

      app.render.flowProbeTipGeo = new THREE.BufferGeometry();
      app.render.flowProbeTipGeo.setAttribute('position', new THREE.BufferAttribute(app.render.flowProbeTipPositions, 3));
      app.render.flowProbeTipGeo.setAttribute('color', new THREE.BufferAttribute(app.render.flowProbeTipColors, 3));
      app.render.flowProbeTips = new THREE.Points(app.render.flowProbeTipGeo, new THREE.PointsMaterial({ size: 4.5, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: false, depthWrite: false }));
      app.render.flowProbeTips.frustumCulled = false;
      app.render.flowProbeTips.visible = false;
      app.render.scene.add(app.render.flowProbeTips);
    }

    function setParticleSize() {
      app.render.particleMat.size = app.cfg.visuals.particleSize;
    }

    function initParticles() {
      var count = Math.min(app.cfg.visuals.particleCount, D.PART_MAX);
      app.render.particles = [];
      for (var i = 0; i < count; i += 1) app.render.particles.push(spawnParticle(i, 0));
      app.render.particleGeo.setDrawRange(0, count);
    }

    /* ---- flow-probe slice ---- */

    function flowProbeAnchor() {
      var body = displayBody();
      return {
        x: body ? body.pos.x : 0,
        z: body ? body.pos.z : 0
      };
    }

    function flowProbePlaneKey() {
      return Object.prototype.hasOwnProperty.call(D.FLOW_SLICE_PLANES, app.cfg.analysis.flowSlicePlane) ? app.cfg.analysis.flowSlicePlane : 'horizontal';
    }

    function updateFlowProbeSlice() {
      var line = app.render.flowProbeLine;
      var tips = app.render.flowProbeTips;
      if (!line || !tips) return;

      if (!app.cfg.analysis.flowSlice) {
        line.visible = false;
        tips.visible = false;
        app.render.flowProbeStats.active = false;
        app.render.flowProbeStats.sampleCount = 0;
        return;
      }

      var anchor = flowProbeAnchor();
      var planeKey = flowProbePlaneKey();
      var planeDef = D.FLOW_SLICE_PLANES[planeKey];
      var height = clamp(app.cfg.analysis.flowSliceHeight, 0.5, app.cfg.world.ceiling);
      var spanLimit = Math.max(20, Math.min(app.cfg.world.halfWidth * 2, app.cfg.world.halfDepth * 2));
      var span = clamp(app.cfg.analysis.flowSliceSpan, 12, spanLimit);
      var sectionHeight = planeKey === 'horizontal' ? span : Math.min(span, Math.max(2, app.cfg.world.ceiling - 0.5));
      var cell = FLOW_PROBE_GRID > 1 ? Math.min(span, sectionHeight) / (FLOW_PROBE_GRID - 1) : Math.min(span, sectionHeight);
      var refSpeed = Math.max(1, app.cfg.wind.speed + app.cfg.wind.gust * 0.12 + app.cfg.wind.modeStrength * 0.10);
      var meanSpeed = 0;
      var peakSpeed = 0;
      var sampledMeanSpeed = 0;
      var sampledPeakSpeed = 0;
      var sampleIndex = 0;

      app.cfg.analysis.flowSlicePlane = planeKey;
      app.cfg.analysis.flowSliceHeight = height;
      app.cfg.analysis.flowSliceSpan = span;

      for (var row = 0; row < FLOW_PROBE_GRID; row += 1) {
        for (var col = 0; col < FLOW_PROBE_GRID; col += 1) {
          var u = FLOW_PROBE_GRID === 1 ? 0.5 : col / (FLOW_PROBE_GRID - 1);
          var v = FLOW_PROBE_GRID === 1 ? 0.5 : row / (FLOW_PROBE_GRID - 1);
          var x = anchor.x;
          var y = height;
          var z = anchor.z;

          if (planeKey === 'vertical_x') {
            x = clamp(anchor.x + (u - 0.5) * span, -app.cfg.world.halfWidth + 0.8, app.cfg.world.halfWidth - 0.8);
            y = clamp(height + (v - 0.5) * sectionHeight, 0.5, app.cfg.world.ceiling);
            z = clamp(anchor.z, -app.cfg.world.halfDepth + 0.8, app.cfg.world.halfDepth - 0.8);
          } else if (planeKey === 'vertical_z') {
            x = clamp(anchor.x, -app.cfg.world.halfWidth + 0.8, app.cfg.world.halfWidth - 0.8);
            y = clamp(height + (v - 0.5) * sectionHeight, 0.5, app.cfg.world.ceiling);
            z = clamp(anchor.z + (u - 0.5) * span, -app.cfg.world.halfDepth + 0.8, app.cfg.world.halfDepth - 0.8);
          } else {
            x = clamp(anchor.x + (u - 0.5) * span, -app.cfg.world.halfWidth + 0.8, app.cfg.world.halfWidth - 0.8);
            y = height;
            z = clamp(anchor.z + (v - 0.5) * span, -app.cfg.world.halfDepth + 0.8, app.cfg.world.halfDepth - 0.8);
          }

          tmpA.set(x, y, z);
          tmpB.copy(app.solver.sampleWindAt(app, tmpA));
          var sampledSpeed = tmpB.length();
          if (planeKey === 'vertical_x') tmpD.set(tmpB.x, tmpB.y, 0);
          else if (planeKey === 'vertical_z') tmpD.set(0, tmpB.y, tmpB.z);
          else tmpD.copy(tmpB);
          var speed = tmpD.length();
          var len = speed > 1e-5 ? Math.min(speed * 0.16, Math.max(0.5, cell * 0.46)) : 0;
          tmpC.copy(tmpA);
          if (speed > 1e-5 && len > 0) tmpC.addScaledVector(tmpD.multiplyScalar(1 / speed), len);
          var colorT = clamp(Math.sqrt(speed / refSpeed), 0, 1);
          var color = T.mixRgb(FLOW_PROBE_LOW_RGB, FLOW_PROBE_HIGH_RGB, colorT);
          var seg = sampleIndex * 6;
          var tip = sampleIndex * 3;

          app.render.flowProbePositions[seg] = x;
          app.render.flowProbePositions[seg + 1] = y;
          app.render.flowProbePositions[seg + 2] = z;
          app.render.flowProbePositions[seg + 3] = tmpC.x;
          app.render.flowProbePositions[seg + 4] = tmpC.y;
          app.render.flowProbePositions[seg + 5] = tmpC.z;

          app.render.flowProbeColors[seg] = color.r / 255;
          app.render.flowProbeColors[seg + 1] = color.g / 255;
          app.render.flowProbeColors[seg + 2] = color.b / 255;
          app.render.flowProbeColors[seg + 3] = color.r / 255;
          app.render.flowProbeColors[seg + 4] = color.g / 255;
          app.render.flowProbeColors[seg + 5] = color.b / 255;

          app.render.flowProbeTipPositions[tip] = tmpC.x;
          app.render.flowProbeTipPositions[tip + 1] = tmpC.y;
          app.render.flowProbeTipPositions[tip + 2] = tmpC.z;
          app.render.flowProbeTipColors[tip] = color.r / 255;
          app.render.flowProbeTipColors[tip + 1] = color.g / 255;
          app.render.flowProbeTipColors[tip + 2] = color.b / 255;

          meanSpeed += speed;
          if (speed > peakSpeed) peakSpeed = speed;
          sampledMeanSpeed += sampledSpeed;
          if (sampledSpeed > sampledPeakSpeed) sampledPeakSpeed = sampledSpeed;
          sampleIndex += 1;
        }
      }

      app.render.flowProbeGeo.attributes.position.needsUpdate = true;
      app.render.flowProbeGeo.attributes.color.needsUpdate = true;
      app.render.flowProbeTipGeo.attributes.position.needsUpdate = true;
      app.render.flowProbeTipGeo.attributes.color.needsUpdate = true;
      app.render.flowProbeGeo.setDrawRange(0, sampleIndex * 2);
      app.render.flowProbeTipGeo.setDrawRange(0, sampleIndex);
      line.visible = true;
      tips.visible = true;

      app.render.flowProbeStats.active = true;
      app.render.flowProbeStats.sampleCount = sampleIndex;
      app.render.flowProbeStats.planeKey = planeKey;
      app.render.flowProbeStats.planeLabel = planeDef.label;
      app.render.flowProbeStats.projected = !!planeDef.projected;
      app.render.flowProbeStats.fixedAxis = planeDef.fixedAxis;
      app.render.flowProbeStats.fixedValue = planeDef.fixedAxis === 'x' ? anchor.x : (planeDef.fixedAxis === 'z' ? anchor.z : height);
      app.render.flowProbeStats.height = height;
      app.render.flowProbeStats.span = span;
      app.render.flowProbeStats.sectionHeight = sectionHeight;
      app.render.flowProbeStats.meanSpeed = sampleIndex ? meanSpeed / sampleIndex : 0;
      app.render.flowProbeStats.peakSpeed = peakSpeed;
      app.render.flowProbeStats.sampledMeanSpeed = sampleIndex ? sampledMeanSpeed / sampleIndex : 0;
      app.render.flowProbeStats.sampledPeakSpeed = sampledPeakSpeed;
      app.render.flowProbeStats.anchorX = anchor.x;
      app.render.flowProbeStats.anchorZ = anchor.z;
    }

    /* ---- particle update ---- */

    function updateParticles(dt) {
      var count = Math.min(app.cfg.visuals.particleCount, D.PART_MAX);
      var anchor = particleAnchor();
      var span = particleSpan();
      var jitter = Math.max(0.4, app.cfg.wind.speed * 0.2) * (app.cfg.wind.turb / 100);
      var time = app.state.time;
      for (var i = 0; i < count; i += 1) {
        var particle = app.render.particles[i];
        if (!particle) particle = app.render.particles[i] = spawnParticle(i, 0);
        tmpA.set(particle.x, particle.y, particle.z);
        var wind = app.solver.sampleWindAt(app, tmpA);
        particle.x += (wind.x + particleOscillation(particle.phaseX, particle.freqX, time, 0.11) * jitter) * dt;
        particle.y += (wind.y + particleOscillation(particle.phaseY, particle.freqY, time, 1.47) * jitter * 0.18) * dt;
        particle.z += (wind.z + particleOscillation(particle.phaseZ, particle.freqZ, time, 2.63) * jitter) * dt;
        particle.life += dt / particle.maxLife;
        if (particle.life >= 1 || Math.abs(particle.x - anchor.x) > span.x * 0.65 || Math.abs(particle.z - anchor.z) > span.z * 0.65 || particle.y < 0.05 || particle.y > app.cfg.world.ceiling * 0.86 || Math.abs(particle.y - anchor.y) > span.y * 0.72) {
          particle = app.render.particles[i] = spawnParticle(i, particle.generation + 1);
        }
        app.render.particlePositions[i * 3] = particle.x;
        app.render.particlePositions[i * 3 + 1] = particle.y;
        app.render.particlePositions[i * 3 + 2] = particle.z;
      }
      app.render.particleGeo.setDrawRange(0, count);
      app.render.particleGeo.attributes.position.needsUpdate = true;
      app.render.particlePoints.visible = app.cfg.env.part;
    }

    /* ---- arrows / projection ---- */

    function setArrow(key, origin, direction, length) {
      var arrow = app.render.arrows[key];
      var state = app.render.arrowState[key];
      var len = Math.min(length, 18);
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

    /* ---- trail / ruler / impacts sync ---- */

    function syncTrails() {
      var def = currentDef();
      var color = new THREE.Color(def.col);
      var playback = app.state.playback;
      var current = playback.active ? playback.frames.slice(0, playback.frameIndex + 1).map(function (frame) { return frame.body.pos; }) : app.state.currentTrail;
      var currentCount = Math.min(current.length, D.TRAIL_MAX);
      if (!app.cfg.env.trail || currentCount < 2) {
        app.render.trailLine.visible = false;
        app.render.trailGeo.setDrawRange(0, 0);
      } else {
        var start = current.length - currentCount;
        for (var i = 0; i < currentCount; i += 1) {
          var point = current[start + i];
          var t = i / Math.max(1, currentCount - 1);
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

      var compare = app.state.comparisonTrail;
      var compareCount = Math.min(compare.length, D.TRAIL_MAX);
      if (!app.cfg.analysis.compare || compareCount < 2) {
        app.render.compareLine.visible = false;
        app.render.compareGeo.setDrawRange(0, 0);
      } else {
        var cstart = compare.length - compareCount;
        for (var ci = 0; ci < compareCount; ci += 1) {
          var cpoint = compare[cstart + ci];
          app.render.comparePos[ci * 3] = cpoint.x;
          app.render.comparePos[ci * 3 + 1] = cpoint.y;
          app.render.comparePos[ci * 3 + 2] = cpoint.z;
        }
        app.render.compareGeo.attributes.position.needsUpdate = true;
        app.render.compareGeo.setDrawRange(0, compareCount);
        app.render.compareLine.visible = true;
      }
    }

    function syncRuler() {
      var body = displayBody();
      var visible = !!app.cfg.analysis.ruler;
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
      var screen = { x: 0, y: 0, visible: false };
      projectPoint(tmpA, screen);
      app.ui.rulerLabel.style.color = SIM_COLOR_HEX.ruler;
      app.ui.rulerLabel.style.borderColor = 'rgba(116,211,255,0.26)';
      app.ui.rulerLabel.textContent = 'Range ' + Math.hypot(body.pos.x - body.launchPos.x, body.pos.y - body.launchPos.y, body.pos.z - body.launchPos.z).toFixed(1) + ' m | Y ' + Math.max(0, body.pos.y).toFixed(1) + ' m';
      UI.setOverlay(app.ui.rulerLabel, screen.x, screen.y, screen.visible);
    }

    function syncImpactMarkers() {
      var impacts = app.cfg.analysis.impacts ? displayImpacts() : [];
      var stamp = impacts.length ? impacts.length + ':' + impacts[impacts.length - 1].time.toFixed(3) : '0';
      if (stamp === app.render.lastImpactStamp) {
        app.render.impactGroup.visible = !!app.cfg.analysis.impacts;
        return;
      }
      while (app.render.impactGroup.children.length) {
        var child = app.render.impactGroup.children[0];
        app.render.impactGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
      impacts.forEach(function (impact) {
        var color = SIM_COLORS.impactFloor;
        if (impact.kind.indexOf('wall') === 0) color = SIM_COLORS.impactWall;
        if (impact.kind === 'ceiling') color = SIM_COLORS.impactCeiling;
        var marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.6, roughness: 0.35 }));
        marker.position.copy(impact.pos);
        var iline = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([impact.pos, impact.pos.clone().addScaledVector(impact.normal, 1.4)]),
          new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.8 })
        );
        app.render.impactGroup.add(marker, iline);
      });
      app.render.lastImpactStamp = stamp;
      app.render.impactGroup.visible = !!app.cfg.analysis.impacts;
    }

    /* ---- camera ---- */

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
      var scale = app.cfg.camera.distance * 0.015;
      app.render.forward.set(-Math.cos(app.cfg.camera.yaw), 0, -Math.sin(app.cfg.camera.yaw)).normalize();
      app.render.right.set(-app.render.forward.z, 0, app.render.forward.x).normalize();
      app.render.pan.addScaledVector(app.render.right, -dx * scale);
      app.render.pan.y += dy * scale * 0.45;
    }

    function updateCameraKeys(dt) {
      if (!app.render.keysDown.size) return;
      var move = Math.max(6, app.cfg.camera.distance * 0.55) * dt;
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
      var body = displayBody();
      if (!body) return;
      app.render.target.set(
        (app.cfg.camera.follow ? body.pos.x : 0) + app.render.pan.x,
        Math.max(1.2, (app.cfg.camera.follow ? body.pos.y * 0.55 : 0) + app.render.pan.y),
        (app.cfg.camera.follow ? body.pos.z : 0) + app.render.pan.z
      );
      var lerp = Math.min(1, app.cfg.camera.follow ? (app.cfg.camera.lag * 60 * app.render.lastDt) : 0.22);
      app.render.focus.lerp(app.render.target, lerp);
      var sinPitch = Math.sin(app.cfg.camera.pitch);
      app.render.camera.position.set(
        app.render.focus.x + app.cfg.camera.distance * sinPitch * Math.cos(app.cfg.camera.yaw),
        app.render.focus.y + app.cfg.camera.distance * Math.cos(app.cfg.camera.pitch),
        app.render.focus.z + app.cfg.camera.distance * sinPitch * Math.sin(app.cfg.camera.yaw)
      );
      app.render.camera.lookAt(app.render.focus);
    }

    /* ---- lighting ---- */

    function updateLighting() {
      var body = displayBody();
      if (!body) return;
      var windBlend = clamp(app.render.bodyWind.length() / 60, 0, 1);
      var speedBlend = clamp(lengthVec3(body.vel) / 26, 0, 1);
      app.render.lights.dir.intensity = 1.10 + windBlend * 0.28;
      app.render.lights.hemi.intensity = 0.56 + windBlend * 0.12;
      app.render.lights.rim.intensity = 0.60 + speedBlend * 0.28;
      app.render.lights.fill.intensity = 0.32 + speedBlend * 0.14;
      app.render.lights.point.intensity = 0.46 + windBlend * 0.20 + speedBlend * 0.10;
      app.render.lights.point.position.lerp(tmpA.copy(body.pos).addScaledVector(app.render.bodyWind, 0.18).add(tmpB.set(0, 4.5, 0)), 0.18);
      app.render.lights.fill.position.lerp(tmpC.set(app.render.camera.position.x * 0.55 + app.render.focus.x * 0.45, app.render.focus.y + 10, app.render.camera.position.z * 0.55 + app.render.focus.z * 0.45), 0.14);
      app.render.lights.rim.position.set(app.render.camera.position.x * 0.35 + app.render.focus.x * 0.65, app.render.focus.y + 18, app.render.camera.position.z * 0.35 + app.render.focus.z * 0.65);
    }

    /* ---- per-frame scene refresh ---- */

    function refreshScene() {
      var body = displayBody();
      var def = currentDef();
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
      updateFlowProbeSlice();
    }

    function refreshForceLabels() {
      var labels = app.ui.forceLabels;
      var labelColors = {
        drag: SIM_COLOR_HEX.drag,
        grav: SIM_COLOR_HEX.grav,
        vel: SIM_COLOR_HEX.vel,
        magnus: SIM_COLOR_HEX.magnus,
        spin: SIM_COLOR_HEX.spin
      };
      ['drag', 'grav', 'vel', 'magnus', 'spin'].forEach(function (key) {
        var state = app.render.arrowState[key];
        var screen = { x: 0, y: 0, visible: false };
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

    /* ---- run setup ---- */

    setupRenderer();
    initGeometryLayers();

    /* ---- attach methods to app ---- */

    app.setObjectVisual = setObjectVisual;
    app.refreshSurface = refreshSurface;
    app.updateChamber = updateChamber;
    app.resizeRenderer = resizeRenderer;
    app.setParticleSize = setParticleSize;
    app.initParticles = initParticles;
    app.updateParticles = updateParticles;
    app.updateFlowProbeSlice = updateFlowProbeSlice;
    app.syncCameraInputs = syncCameraInputs;
    app.updateFov = updateFov;
    app.panCamera = panCamera;
    app.updateCameraKeys = updateCameraKeys;
    app.positionCamera = positionCamera;
    app.updateLighting = updateLighting;
    app.refreshScene = refreshScene;
    app.refreshForceLabels = refreshForceLabels;
  }

  window.WindSimScene = {
    install: install
  };
}());
