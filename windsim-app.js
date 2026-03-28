(function () {
  'use strict';

  const D = window.WindSimData;
  const P = window.WindSimPhysics;
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

  function normalizeScenario(source) {
    const cfg = P.makeConfigFromPreset('baseline');
    const src = source || {};

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
    return cfg;
  }

  const tmpA = new V3();
  const tmpB = new V3();
  const tmpC = new V3();
  const tmpD = new V3();

  const app = {
    cfg: P.makeConfigFromPreset('baseline'),
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
      body: null
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

  function makeCanvasTexture(cache, key, painter) {
    if (cache.has(key)) return cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    painter(ctx, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(8, app.render.renderer.capabilities.getMaxAnisotropy());
    cache.set(key, texture);
    return texture;
  }

  function dotField(ctx, size, count, color, alpha) {
    for (let i = 0; i < count; i += 1) {
      ctx.globalAlpha = alpha * (0.4 + Math.random() * 0.8);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 0.8 + Math.random() * 2.4, 0, D.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function getSurfaceTexture(type) {
    const surf = D.SURFACES[type];
    const texture = makeCanvasTexture(app.render.surfaceTexCache, 'surface-' + type, function (ctx, size) {
      ctx.fillStyle = hex(surf.tint);
      ctx.fillRect(0, 0, size, size);
      dotField(ctx, size, 500, '#ffffff', 0.06);
      if (type === 'grass') {
        ctx.strokeStyle = 'rgba(120,255,170,0.16)';
        for (let i = 0; i < 90; i += 1) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (Math.random() - 0.5) * 6, y - 6 - Math.random() * 8);
          ctx.stroke();
        }
      } else if (type === 'hardwood') {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        for (let x = 0; x <= size; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size);
          ctx.stroke();
        }
      } else if (type === 'ice') {
        ctx.strokeStyle = 'rgba(200,240,255,0.18)';
        for (let i = 0; i < 16; i += 1) {
          ctx.beginPath();
          ctx.moveTo(Math.random() * size, Math.random() * size);
          ctx.lineTo(Math.random() * size, Math.random() * size);
          ctx.stroke();
        }
      } else if (type === 'water') {
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        for (let y = 10; y < size; y += 22) {
          ctx.beginPath();
          for (let x = 0; x <= size; x += 12) {
            const py = y + Math.sin((x + y) * 0.08) * 3;
            if (x === 0) ctx.moveTo(x, py);
            else ctx.lineTo(x, py);
          }
          ctx.stroke();
        }
      }
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(D.FLOOR_SIZE / D.FLOOR_TILE, D.FLOOR_SIZE / D.FLOOR_TILE);
    return texture;
  }

  function getGridOverlayTexture() {
    const texture = makeCanvasTexture(app.render.surfaceTexCache, 'surface-overlay', function (ctx, size) {
      ctx.clearRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(0,212,255,0.18)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 8; i += 1) {
        const p = i * size / 8;
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
    texture.repeat.set(D.FLOOR_SIZE / D.FLOOR_TILE, D.FLOOR_SIZE / D.FLOOR_TILE);
    return texture;
  }

  function getObjectTexture(name, baseColor) {
    return makeCanvasTexture(app.render.objectTexCache, 'object-' + name, function (ctx, size) {
      ctx.fillStyle = hex(baseColor);
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      if (name.indexOf('ball') >= 0 || /soccer|tennis|basketball|cricket|baseball|golf|volleyball|pingpong/.test(name)) {
        ctx.beginPath();
        ctx.arc(size * 0.5, size * 0.5, size * 0.34, 0, D.TAU);
        ctx.stroke();
      }
      if (name === 'crate' || name === 'brick') {
        for (let y = 0; y <= size; y += 48) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(size, y);
          ctx.stroke();
        }
      } else if (name === 'frisbee') {
        ctx.beginPath();
        ctx.arc(size * 0.5, size * 0.5, size * 0.34, 0, D.TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(size * 0.5, size * 0.5, size * 0.16, 0, D.TAU);
        ctx.stroke();
      } else if (name === 'leaf' || name === 'feather') {
        dotField(ctx, size, 120, '#ffffff', 0.08);
      } else {
        dotField(ctx, size, 160, '#ffffff', 0.06);
      }
    });
  }

  function objectMaterial(def, extra) {
    const options = extra || {};
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: getObjectTexture(def.texture || def.label.toLowerCase(), def.col),
      roughness: options.roughness != null ? options.roughness : 0.7,
      metalness: options.metalness != null ? options.metalness : 0.08,
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
          new THREE.CylinderGeometry(0.03, 0.03, 1.2, 12),
          new THREE.MeshStandardMaterial({ color: 0x6b4a24, roughness: 0.82 })
        );
        shaft.position.y = -0.28;
        root.add(canopy, shaft);
        break;
      }
      case 'shuttlecock': {
        const cork = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 20, 20),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.76 })
        );
        cork.scale.y = 0.8;
        cork.position.y = -0.24;
        const skirt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.5, 0.85, 18, 1, true),
          objectMaterial(def, { side: THREE.DoubleSide, roughness: 0.88 })
        );
        skirt.position.y = 0.18;
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
    app.render.activeModel = buildObjectVisual(D.OBJ_DEFS[app.cfg.objKey]);
    app.render.objectPivot.add(app.render.activeModel);
  }

  function refreshSurface() {
    app.render.groundMat.map = getSurfaceTexture(app.cfg.surfKey);
    app.render.groundMat.needsUpdate = true;
  }

  function updateGround() {
    const body = app.state.body;
    if (!body) return;
    const gx = Math.round(body.pos.x / D.FLOOR_STEP) * D.FLOOR_STEP;
    const gz = Math.round(body.pos.z / D.FLOOR_STEP) * D.FLOOR_STEP;
    app.render.groundGroup.position.set(gx, 0, gz);
    app.render.groundMat.map.offset.set(-gx / D.FLOOR_TILE, -gz / D.FLOOR_TILE);
    app.render.groundOverlayMat.map.offset.set(-gx / D.FLOOR_TILE, -gz / D.FLOOR_TILE);
  }

  function updateChamber() {
    if (app.render.chamberLines) {
      app.render.chamberGroup.remove(app.render.chamberLines);
      app.render.chamberLines.geometry.dispose();
      app.render.chamberLines.material.dispose();
    }
    app.render.chamberLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(app.cfg.world.halfWidth * 2, app.cfg.world.ceiling, app.cfg.world.halfDepth * 2)),
      new THREE.LineBasicMaterial({ color: 0x34526b, transparent: true, opacity: 0.55 })
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
    render.scene.background = new THREE.Color(0x060b12);
    render.scene.fog = new THREE.Fog(0x060b12, 120, 620);

    render.camera = new THREE.PerspectiveCamera(app.cfg.camera.fov, render.mainEl.clientWidth / Math.max(1, render.mainEl.clientHeight), 0.05, 3000);
    render.renderer = new THREE.WebGLRenderer({ antialias: true });
    render.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    render.renderer.setSize(render.mainEl.clientWidth, Math.max(1, render.mainEl.clientHeight));
    render.renderer.outputEncoding = THREE.sRGBEncoding;
    render.renderer.shadowMap.enabled = true;
    render.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    render.mainEl.insertBefore(render.renderer.domElement, render.mainEl.firstChild);

    const ambient = new THREE.AmbientLight(0x1a2535, 2.2);
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
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
    const hemi = new THREE.HemisphereLight(0x1f4f75, 0x05070d, 0.92);
    const rim = new THREE.DirectionalLight(0x84ccff, 1.0);
    const fill = new THREE.PointLight(0xf59e0b, 0.65, 120);
    const point = new THREE.PointLight(0x00d4ff, 1.0, 48);
    render.scene.add(ambient, dir, hemi, rim, fill, point, new THREE.AxesHelper(4));
    render.lights = { ambient: ambient, dir: dir, hemi: hemi, rim: rim, fill: fill, point: point };

    render.objectPivot = new THREE.Group();
    render.scene.add(render.objectPivot);

    render.groundGroup = new THREE.Group();
    render.groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: getSurfaceTexture(app.cfg.surfKey), roughness: 0.96, metalness: 0.02 });
    render.groundOverlayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: getGridOverlayTexture(), transparent: true, opacity: 0.18, depthWrite: false });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(D.FLOOR_SIZE, D.FLOOR_SIZE), render.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(D.FLOOR_SIZE, D.FLOOR_SIZE), render.groundOverlayMat);
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.y = 0.02;
    const grid = new THREE.GridHelper(D.FLOOR_SIZE, Math.round(D.FLOOR_SIZE / 5), 0x243040, 0x13202e);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
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
    app.render.compareLine = new THREE.Line(app.render.compareGeo, new THREE.LineBasicMaterial({ color: 0xd6e4ff, transparent: true, opacity: 0.3 }));
    app.render.compareLine.frustumCulled = false;
    app.render.scene.add(app.render.compareLine);

    app.render.particlePositions = new Float32Array(D.PART_MAX * 3);
    app.render.particleGeo = new THREE.BufferGeometry();
    app.render.particleGeo.setAttribute('position', new THREE.BufferAttribute(app.render.particlePositions, 3));
    app.render.particleMat = new THREE.PointsMaterial({ color: 0x00d4ff, size: app.cfg.visuals.particleSize, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    app.render.particlePoints = new THREE.Points(app.render.particleGeo, app.render.particleMat);
    app.render.particlePoints.frustumCulled = false;
    app.render.scene.add(app.render.particlePoints);

    app.render.arrows.drag = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, 0x00d4ff, 0.5, 0.3);
    app.render.arrows.grav = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, 0xef4444, 0.5, 0.3);
    app.render.arrows.vel = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, 0x10d9a0, 0.5, 0.3);
    app.render.arrows.magnus = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, 0xa78bfa, 0.5, 0.3);
    app.render.arrows.spin = new THREE.ArrowHelper(new V3(1, 0, 0), new V3(), 1, 0xf97316, 0.5, 0.3);
    Object.keys(app.render.arrows).forEach(function (key) {
      app.render.arrows[key].visible = false;
      app.render.scene.add(app.render.arrows[key]);
    });

    app.render.rulerGeo = new THREE.BufferGeometry();
    app.render.rulerGeo.setAttribute('position', new THREE.BufferAttribute(app.render.rulerPositions, 3));
    app.render.rulerLine = new THREE.Line(app.render.rulerGeo, new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.65 }));
    app.render.rulerLine.frustumCulled = false;
    app.render.scene.add(app.render.rulerLine);

    app.render.heightGeo = new THREE.BufferGeometry();
    app.render.heightGeo.setAttribute('position', new THREE.BufferAttribute(app.render.heightPositions, 3));
    app.render.heightLine = new THREE.Line(app.render.heightGeo, new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.55 }));
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
      const wind = P.sampleWindAt(app, tmpA);
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
    const def = D.OBJ_DEFS[app.cfg.objKey];
    const color = new THREE.Color(def.col);
    const current = app.state.currentTrail;
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
    const body = app.state.body;
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
    app.ui.rulerLabel.textContent = 'Range ' + body.pos.distanceTo(body.launchPos).toFixed(1) + ' m | Y ' + Math.max(0, body.pos.y).toFixed(1) + ' m';
    UI.setOverlay(app.ui.rulerLabel, screen.x, screen.y, screen.visible);
  }

  function syncImpactMarkers() {
    const impacts = app.cfg.analysis.impacts ? app.state.impacts : [];
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
      let color = 0xf59e0b;
      if (impact.kind.indexOf('wall') === 0) color = 0x00d4ff;
      if (impact.kind === 'ceiling') color = 0xa78bfa;
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
    $('pauseBtn').textContent = app.state.paused ? 'Resume' : 'Pause';
    if (app.state.validation && !app.state.validation.result && !app.state.paused) {
      $('sTxt').textContent = 'VALIDATING';
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
      app.ui.validationReport.textContent = validation.label + '\n' + 'time: ' + app.state.time.toFixed(2) + ' / ' + validation.endTime.toFixed(2) + ' s';
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
    const body = app.state.body;
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
    const body = app.state.body;
    if (!body) return;
    const windBlend = clamp(app.render.bodyWind.length() / 60, 0, 1);
    const speedBlend = clamp(body.vel.length() / 26, 0, 1);
    app.render.lights.dir.intensity = 1.25 + windBlend * 0.75;
    app.render.lights.hemi.intensity = 0.95 + windBlend * 0.20;
    app.render.lights.rim.intensity = 1.05 + speedBlend * 0.60;
    app.render.lights.fill.intensity = 0.65 + speedBlend * 0.35;
    app.render.lights.point.intensity = 1.05 + windBlend * 0.55 + speedBlend * 0.45;
    app.render.lights.point.position.lerp(tmpA.copy(body.pos).addScaledVector(app.render.bodyWind, 0.18).add(tmpB.set(0, 4.5, 0)), 0.18);
    app.render.lights.fill.position.lerp(tmpC.set(app.render.camera.position.x * 0.55 + app.render.focus.x * 0.45, app.render.focus.y + 10, app.render.camera.position.z * 0.55 + app.render.focus.z * 0.45), 0.14);
    app.render.lights.rim.position.set(app.render.camera.position.x * 0.35 + app.render.focus.x * 0.65, app.render.focus.y + 18, app.render.camera.position.z * 0.35 + app.render.focus.z * 0.65);
  }

  function refreshScene() {
    const body = app.state.body;
    if (!body) return;
    updateGround();
    app.render.objectPivot.position.copy(body.pos);
    app.render.objectPivot.quaternion.copy(body.q);
    app.render.bodyWind.copy(P.sampleWindAt(app, body.pos));
    tmpA.copy(app.render.bodyWind).sub(body.vel);
    if (app.cfg.env.force && tmpA.lengthSq() > 1e-4 && body.metrics.drag > 1e-5) setArrow('drag', body.pos, tmpA, Math.min(body.metrics.drag / D.OBJ_DEFS[app.cfg.objKey].mass * 1.25, 10)); else app.render.arrowState.drag.visible = app.render.arrows.drag.visible = false;
    if (app.cfg.env.force && app.cfg.env.grav) setArrow('grav', body.pos, tmpB.set(0, -1, 0), Math.min(D.GRAV * 0.3, 5)); else app.render.arrowState.grav.visible = app.render.arrows.grav.visible = false;
    if (app.cfg.env.force && body.vel.lengthSq() > 0.0025) setArrow('vel', body.pos, body.vel, Math.min(body.vel.length() * 0.5, 8)); else app.render.arrowState.vel.visible = app.render.arrows.vel.visible = false;
    if (app.cfg.env.force && app.cfg.env.magnus && body.forces.magnus.lengthSq() > 1e-8) setArrow('magnus', body.pos, body.forces.magnus, Math.min(body.forces.magnus.length() / D.OBJ_DEFS[app.cfg.objKey].mass * 1.2, 8)); else app.render.arrowState.magnus.visible = app.render.arrows.magnus.visible = false;
    if (app.cfg.env.spinViz && app.cfg.env.rotation && body.omegaWorld.lengthSq() > 0.1225) setArrow('spin', body.pos, body.omegaWorld, Math.min(body.omegaWorld.length() / D.TAU * 1.35, 7)); else app.render.arrowState.spin.visible = app.render.arrows.spin.visible = false;
    syncTrails();
    syncRuler();
    syncImpactMarkers();
  }

  function refreshForceLabels() {
    const labels = app.ui.forceLabels;
    ['drag', 'grav', 'vel', 'magnus', 'spin'].forEach(function (key) {
      const state = app.render.arrowState[key];
      const screen = { x: 0, y: 0, visible: false };
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
    app.state.paused = false;
    setObjectVisual();
    refreshSurface();
    updateChamber();
    updateFov();
    P.resetSimulationState(app);
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
    P.resetSimulationState(app);
    setObjectVisual();
    UI.updateStaticPanels(app);
    UI.updateDynamicPanels(app);
    syncStatus();
  }

  function startValidation(caseId) {
    if (!P.startValidation(app, caseId)) return;
    UI.syncScenarioControls(app);
    UI.updateStaticPanels(app);
    UI.updateDynamicPanels(app);
    syncStatus();
    syncValidationUi();
  }

  function togglePause() {
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
    if (app.state.body) app.render.focus.set(app.state.body.pos.x, Math.max(1.2, app.state.body.pos.y * 0.55 + app.render.pan.y), app.state.body.pos.z);
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
    document.addEventListener('keydown', function (event) {
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePause();
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
      P.step(app, dt);
      updateParticles(dt);
    } else {
      updateParticles(0);
    }
    refreshScene();
    positionCamera();
    updateLighting();
    refreshForceLabels();
    UI.updateDynamicPanels(app);
    UI.drawGraph(app);
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
