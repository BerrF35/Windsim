(function () {
  'use strict';

  const D = window.WindSimData;
  const V3 = THREE.Vector3;
  const Q4 = THREE.Quaternion;
  const E3 = THREE.Euler;

  const AX_X = new V3(1, 0, 0);
  const AX_Y = new V3(0, 1, 0);
  const AX_Z = new V3(0, 0, 1);

  const tempA = new V3();
  const tempB = new V3();
  const tempC = new V3();
  const tempD = new V3();
  const tempE = new V3();
  const tempF = new V3();
  const tempG = new V3();
  const tempH = new V3();
  const tempI = new V3();
  const tempQuat = new Q4();
  const tempQuat2 = new Q4();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrap360(value) {
    return (value % 360 + 360) % 360;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function degToRad(value) {
    return value * Math.PI / 180;
  }

  function radToDeg(value) {
    return value * 180 / Math.PI;
  }

  function headingSummary(value) {
    const deg = wrap360(value);
    return deg.toFixed(0) + ' deg ' + D.COMPASS16[Math.round(deg / 22.5) % 16];
  }

  function beaufort(value) {
    for (let i = 0; i < D.BEAUFORT_T.length; i += 1) {
      if (value < D.BEAUFORT_T[i]) return D.BEAUFORT_LABELS[i];
    }
    return D.BEAUFORT_LABELS[D.BEAUFORT_LABELS.length - 1];
  }

  function vectorFromDeg(azimDeg, elevDeg) {
    const az = degToRad(azimDeg);
    const el = degToRad(elevDeg);
    return new V3(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el)
    );
  }

  function seededWave(seed, x, y, z, t, phase) {
    return (
      Math.sin(seed * 0.071 + x * 0.061 + y * 0.133 + z * 0.047 + t * 0.91 + phase) +
      0.55 * Math.sin(seed * 0.117 + x * 0.029 - y * 0.097 + z * 0.083 - t * 0.63 + phase * 1.7) +
      0.33 * Math.sin(seed * 0.191 - x * 0.043 + y * 0.071 - z * 0.059 + t * 1.37 + phase * 2.3)
    ) / 1.88;
  }

  function computeRho(altitude) {
    const h = Math.max(0, altitude);
    if (h <= 11000) {
      const temp = 288.15 - 0.0065 * h;
      const pressure = 101325 * Math.pow(temp / 288.15, 5.255877);
      return pressure / (287.05 * temp);
    }
    const temp = 216.65;
    const p11 = 22632.06;
    const pressure = p11 * Math.exp(-D.GRAV * 0.0289644 * (h - 11000) / (8.3144598 * temp));
    return pressure / (287.05 * temp);
  }

  function boxInertia(width, height, depth, mass) {
    return [
      (mass / 12) * (height * height + depth * depth),
      (mass / 12) * (width * width + depth * depth),
      (mass / 12) * (width * width + height * height)
    ];
  }

  function objectScale(cfg) {
    const source = cfg && cfg.objectScale ? cfg.objectScale : {};
    return {
      x: clamp(source.x || 1, 0.35, 3.5),
      y: clamp(source.y || 1, 0.35, 3.5),
      z: clamp(source.z || 1, 0.35, 3.5)
    };
  }

  function resolveObjectDef(objKey, cfg) {
    const base = D.OBJ_DEFS[objKey];
    if (!base) return null;
    if (base.shape !== 'box' && base.shape !== 'brick') return base;

    const scale = objectScale(cfg);
    const dims = [
      base.dims[0] * scale.x,
      base.dims[1] * scale.y,
      base.dims[2] * scale.z
    ];
    const baseVolume = Math.max(1e-6, base.dims[0] * base.dims[1] * base.dims[2]);
    const volume = Math.max(1e-6, dims[0] * dims[1] * dims[2]);
    const density = base.mass / baseVolume;
    const mass = density * volume;
    const cp = (base.aero.cp || [0, 0, 0]).map(function (value, index) {
      return value * [scale.x, scale.y, scale.z][index];
    });

    return Object.assign({}, base, {
      r: Math.max(dims[0], dims[1], dims[2]) * 0.5,
      mass: mass,
      area: dims[0] * dims[2],
      dims: dims,
      inertia: boxInertia(dims[0], dims[1], dims[2], mass),
      aero: Object.assign({}, base.aero, {
        chord: Math.max(dims[0], dims[1], dims[2]),
        cp: cp
      }),
      objectScale: scale
    });
  }

  function getRestQuaternion(def) {
    if (def.restEuler) return new Q4().setFromEuler(new E3(def.restEuler[0], def.restEuler[1], def.restEuler[2]));
    return new Q4();
  }

  function createBody(def, cfg) {
    const q = getRestQuaternion(def);
    const support = supportExtentAlong(def, q, AX_Y);
    const pos = new V3(0, Math.max(cfg.launch.h0, support), 0);
    return {
      pos: pos.clone(),
      vel: new V3(cfg.launch.vx, cfg.launch.vy, cfg.launch.vz),
      q: q,
      omegaBody: new V3(cfg.launch.omx * D.TAU, cfg.launch.omy * D.TAU, cfg.launch.omz * D.TAU),
      omegaWorld: new V3(),
      acc: new V3(),
      launchPos: pos.clone(),
      supportY: support,
      metrics: {
        rho: computeRho(cfg.altitude),
        areaEff: def.area,
        Cd: def.Cd0,
        Cl: 0,
        Cm: 0,
        Re: 0,
        aoa: 0,
        drag: 0,
        lift: 0,
        side: 0,
        net: 0,
        aeroPower: 0
      },
      forces: {
        drag: new V3(),
        lift: new V3(),
        side: new V3(),
        magnus: new V3(),
        gravity: new V3(),
        wall: new V3(),
        net: new V3()
      },
      torques: {
        aero: new V3(),
        ground: new V3(),
        wall: new V3(),
        net: new V3()
      }
    };
  }

  function makeConfigFromPreset(presetLike) {
    const preset = typeof presetLike === 'string' ? D.PRESETS[presetLike] : presetLike;
    const source = preset || D.PRESETS.baseline;
    const cfg = {
      objKey: source.obj,
      surfKey: source.surf,
      altitude: source.altitude,
      seed: source.seed,
      simRate: source.simRate,
      wind: deepClone(source.wind),
      launch: deepClone(source.launch),
      visuals: {
        particleCount: source.visuals.pCount,
        particleSize: source.visuals.pSize,
        trailMax: source.visuals.trailLen
      },
      world: {
        ceiling: source.world.ceiling,
        halfWidth: source.world.halfWidth,
        halfDepth: source.world.halfDepth,
        collision: true
      },
      camera: {
        follow: source.cam.follow,
        distance: source.cam.distance,
        yaw: degToRad(source.cam.yaw),
        pitch: degToRad(source.cam.pitch),
        fov: source.cam.fov,
        lag: source.cam.lag
      },
      env: {
        grav: true,
        part: true,
        trail: true,
        bounce: true,
        force: true,
        magnus: true,
        rotation: true,
        reCd: true,
        spinViz: true
      },
      analysis: deepClone(D.DEFAULT_ANALYSIS)
    };
    cfg.objectScale = deepClone(source.objectScale || { x: 1, y: 1, z: 1 });
    return cfg;
  }

  function defaultScenarioSnapshot(app) {
    return {
      version: 2,
      obj: app.cfg.objKey,
      surf: app.cfg.surfKey,
      altitude: app.cfg.altitude,
      seed: app.cfg.seed,
      simRate: app.cfg.simRate,
      wind: deepClone(app.cfg.wind),
      launch: deepClone(app.cfg.launch),
      visuals: {
        pCount: app.cfg.visuals.particleCount,
        pSize: app.cfg.visuals.particleSize,
        trailLen: app.cfg.visuals.trailMax
      },
      objectScale: deepClone(app.cfg.objectScale || { x: 1, y: 1, z: 1 }),
      world: deepClone(app.cfg.world),
      analysis: deepClone(app.cfg.analysis),
      env: deepClone(app.cfg.env),
      cam: {
        follow: app.cfg.camera.follow,
        distance: app.cfg.camera.distance,
        yaw: radToDeg(app.cfg.camera.yaw),
        pitch: radToDeg(app.cfg.camera.pitch),
        fov: app.cfg.camera.fov,
        lag: app.cfg.camera.lag
      }
    };
  }

  function bodyAxisWorld(body, refAxis) {
    if (refAxis === 'x') return tempA.copy(AX_X).applyQuaternion(body.q);
    if (refAxis === 'z') return tempA.copy(AX_Z).applyQuaternion(body.q);
    return tempA.copy(AX_Y).applyQuaternion(body.q);
  }

  function bodyAxes(body) {
    return {
      x: tempB.copy(AX_X).applyQuaternion(body.q),
      y: tempC.copy(AX_Y).applyQuaternion(body.q),
      z: tempD.copy(AX_Z).applyQuaternion(body.q)
    };
  }

  function supportExtentAlong(def, quat, axisWorld) {
    const dir = tempE.copy(axisWorld).normalize();
    const inv = tempQuat.copy(quat).invert();
    const bodyDir = dir.applyQuaternion(inv);
    const hx = def.dims[0] * 0.5;
    const hy = def.dims[1] * 0.5;
    const hz = def.dims[2] * 0.5;

    switch (def.shape) {
      case 'sphere':
      case 'paperball':
        return def.r;
      case 'ellipsoid':
        return Math.sqrt(
          bodyDir.x * bodyDir.x * hx * hx +
          bodyDir.y * bodyDir.y * hy * hy +
          bodyDir.z * bodyDir.z * hz * hz
        );
      default:
        return Math.abs(bodyDir.x) * hx + Math.abs(bodyDir.y) * hy + Math.abs(bodyDir.z) * hz;
    }
  }

  function projectedArea(def, body, flowDir) {
    const inv = tempQuat.copy(body.q).invert();
    const bodyFlow = tempF.copy(flowDir).applyQuaternion(inv);
    const fx = Math.abs(bodyFlow.x);
    const fy = Math.abs(bodyFlow.y);
    const fz = Math.abs(bodyFlow.z);
    const width = def.dims[0];
    const height = def.dims[1];
    const depth = def.dims[2];

    switch (def.shape) {
      case 'sphere':
      case 'paperball':
        return def.area;
      case 'ellipsoid': {
        const hx = width * 0.5;
        const hy = height * 0.5;
        const hz = depth * 0.5;
        return Math.PI * Math.sqrt(
          (hy * hz * fx) * (hy * hz * fx) +
          (hx * hz * fy) * (hx * hz * fy) +
          (hx * hy * fz) * (hx * hy * fz)
        );
      }
      case 'disc': {
        const face = Math.PI * (width * 0.5) * (depth * 0.5);
        const edge = Math.max(0.0015, width * height * 0.55);
        return edge + (face - edge) * fy;
      }
      case 'leaf':
      case 'feather': {
        const face = width * height;
        const edge = Math.max(0.0003, (width + height) * depth);
        return edge + (face - edge) * fz;
      }
      case 'umbrella': {
        const face = def.area;
        const edge = Math.max(0.02, width * height * 0.25);
        return edge + (face - edge) * fy;
      }
      case 'shuttlecock': {
        const face = def.area;
        const side = Math.max(0.001, (width + depth) * height * 0.4);
        return side + (face - side) * fy;
      }
      default:
        return fy * width * depth + fx * height * depth + fz * width * height;
    }
  }

  function sphereCd(curve, reynolds) {
    if (curve === 'golf') {
      if (reynolds < 2e4) return 0.50;
      if (reynolds < 5e4) return 0.50 - 0.27 * (reynolds - 2e4) / 3e4;
      return 0.24;
    }
    if (reynolds < 1) return 24 / reynolds;
    if (reynolds < 1e3) return 24 / reynolds + 4 * Math.pow(reynolds, -0.333) + 0.4;
    if (reynolds < 2e5) return 0.44;
    if (reynolds < 4e5) return 0.44 - 0.34 * (reynolds - 2e5) / 2e5;
    return Math.max(0.10, 0.10 + 0.12 * (reynolds - 4e5) / 3e5);
  }

  function aerodynamicCoefficients(def, alpha, axial, reverse, reynolds) {
    const sinA = Math.sin(alpha);
    const cosA = Math.cos(alpha);
    let Cd = def.Cd0;
    let Cl = 0;
    let Cm = 0;

    switch (def.aero.model) {
      case 'sphere':
        Cd = def.aero.useCurve ? sphereCd(def.aero.useCurve, reynolds) : def.Cd0;
        break;
      case 'disc':
        Cd = clamp(0.08 + 2.72 * Math.pow(alpha + 0.0698, 2), 0.08, 1.75);
        Cl = clamp(0.15 + 1.4 * alpha, -0.15, 1.65);
        Cm = clamp(0.05 + 0.36 * alpha, 0.02, 0.55);
        break;
      case 'shuttlecock':
        Cd = clamp(0.55 + 0.08 * (1 - axial) + 0.12 * reverse, 0.50, 0.78);
        Cl = 0.04 * Math.sin(2 * alpha);
        Cm = clamp(0.18 + 0.65 * (1 - axial), 0.12, 0.95);
        break;
      case 'umbrella':
        Cd = clamp(0.28 + 1.65 * Math.pow(Math.max(0, axial), 1.35) + 0.65 * reverse, 0.25, 2.25);
        Cl = 0.22 * Math.sin(2 * alpha);
        Cm = clamp(0.14 + 0.42 * Math.max(0, axial), 0.10, 0.65);
        break;
      case 'flat':
        Cd = clamp(0.10 + 1.95 * axial * axial, 0.10, 2.15);
        Cl = clamp(1.15 * sinA * cosA, -0.90, 0.90);
        Cm = clamp(0.12 + 0.26 * Math.abs(sinA), 0.08, 0.42);
        break;
      case 'ellipsoid':
        Cd = clamp(0.18 + 0.45 * Math.pow(sinA, 1.6) + 0.12 * reverse, 0.18, 0.82);
        Cl = 0.10 * Math.sin(2 * alpha);
        Cm = clamp(0.06 + 0.16 * Math.abs(sinA), 0.03, 0.24);
        break;
      case 'box':
        Cd = clamp(0.82 + 0.55 * axial * axial + 0.12 * reverse, 0.80, 1.65);
        Cl = 0.14 * Math.sin(2 * alpha);
        Cm = clamp(0.10 + 0.18 * Math.abs(sinA), 0.05, 0.32);
        break;
      default:
        break;
    }

    return { Cd: Cd, Cl: Cl, Cm: Cm };
  }

  function sampleWindAt(app, pos) {
    const wind = app.cfg.wind;
    const modeIntensity = clamp((wind.modeStrength || 0) / 100, 0, 1.4);
    const dir = vectorFromDeg(wind.azim, wind.elev).normalize();
    const base = tempG.copy(dir).multiplyScalar(wind.speed);
    const horizontal = tempH.set(dir.x, 0, dir.z);
    if (horizontal.lengthSq() < 1e-6) horizontal.set(1, 0, 0);
    horizontal.normalize();
    const cross = tempI.set(-horizontal.z, 0, horizontal.x).normalize();
    const result = new V3().copy(base);
    const t = app.state.time;

    if (wind.speed < 0.05 && modeIntensity === 0 && wind.turb <= 0 && wind.gust <= 0) {
      return result.set(0, 0, 0);
    }

    switch (wind.mode) {
      case 'shear': {
        const heightFactor = clamp(pos.y / Math.max(10, app.cfg.world.ceiling), 0, 1);
        result.multiplyScalar(0.65 + 0.75 * heightFactor * modeIntensity);
        break;
      }
      case 'vortex': {
        const radial = new V3(pos.x, 0, pos.z);
        const dist = Math.max(1, radial.length());
        const tangential = new V3(-radial.z, 0, radial.x).normalize();
        const swirl = wind.speed * (0.35 + 0.90 * modeIntensity) * Math.exp(-dist / 95);
        result.addScaledVector(tangential, swirl);
        result.y += wind.speed * 0.16 * modeIntensity * Math.exp(-dist / 120);
        break;
      }
      case 'gustfront': {
        const along = horizontal.dot(pos) - (18 + wind.speed * 0.35) * t;
        const front = Math.exp(-(along * along) / 280);
        result.addScaledVector(dir, wind.speed * (0.45 + 1.05 * modeIntensity) * front);
        result.addScaledVector(cross, wind.speed * 0.18 * modeIntensity * front * Math.sin(t * 0.7));
        break;
      }
      case 'tunnel': {
        const nx = clamp(Math.abs(pos.x) / Math.max(20, app.cfg.world.halfWidth), 0, 1);
        const nz = clamp(Math.abs(pos.z) / Math.max(20, app.cfg.world.halfDepth), 0, 1);
        const wallLoss = (nx * nx + nz * nz) * 0.75 * modeIntensity;
        result.multiplyScalar(clamp(1.10 - wallLoss, 0.20, 1.35));
        break;
      }
      case 'wake': {
        const along = horizontal.dot(pos);
        const side = cross.dot(pos);
        const wakeWidth = 6 + 22 * modeIntensity;
        const wakeCore = along > 0 ? Math.exp(-(side * side) / (wakeWidth * wakeWidth)) * Math.exp(-along / 80) : 0;
        result.multiplyScalar(1 - 0.72 * modeIntensity * wakeCore);
        result.addScaledVector(cross, wind.speed * 0.55 * modeIntensity * wakeCore * Math.sin(along * 0.12 + t * 1.3));
        result.y += wind.speed * 0.18 * modeIntensity * wakeCore * Math.cos(along * 0.16 + t * 1.8);
        break;
      }
      default:
        break;
    }

    if (wind.speed > 0.05) {
      const gust = wind.speed * (wind.gust / 100) * Math.pow(Math.max(0, Math.sin(t * 0.63 + app.cfg.seed * 0.01 + pos.x * 0.01)), 4);
      result.addScaledVector(dir, gust);
    }

    if (wind.turb > 0 && wind.speed > 0.05) {
      const amp = wind.speed * (wind.turb / 100) * 0.22;
      result.x += amp * seededWave(app.cfg.seed + 11, pos.x, pos.y, pos.z, t, 0.0);
      result.y += amp * 0.28 * seededWave(app.cfg.seed + 29, pos.x, pos.y, pos.z, t, 1.1);
      result.z += amp * seededWave(app.cfg.seed + 47, pos.x, pos.y, pos.z, t, 2.4);
    }

    return result;
  }

  function integrateAngular(body, torqueWorld, def, dt) {
    const invQ = tempQuat.copy(body.q).invert();
    const torqueBody = tempA.copy(torqueWorld).applyQuaternion(invQ);
    const inertia = def.inertia;
    const omega = body.omegaBody;
    const Iomega = tempB.set(inertia[0] * omega.x, inertia[1] * omega.y, inertia[2] * omega.z);
    const gyro = tempC.copy(omega).cross(Iomega);
    const omegaDot = tempD.set(
      (torqueBody.x - gyro.x) / Math.max(1e-6, inertia[0]),
      (torqueBody.y - gyro.y) / Math.max(1e-6, inertia[1]),
      (torqueBody.z - gyro.z) / Math.max(1e-6, inertia[2])
    );

    omega.addScaledVector(omegaDot, dt);
    body.omegaWorld.copy(omega).applyQuaternion(body.q);

    const angSpeed = body.omegaWorld.length();
    if (angSpeed > 1e-5) {
      tempQuat2.setFromAxisAngle(tempE.copy(body.omegaWorld).normalize(), angSpeed * dt);
      body.q.multiply(tempQuat2).normalize();
    }
  }

  function recordImpact(app, pos, normal, kind, energy) {
    if (!app.cfg.analysis.impacts) return;
    app.state.impacts.push({
      pos: pos.clone(),
      normal: normal.clone(),
      kind: kind,
      time: app.state.time,
      energy: energy
    });
    if (app.state.impacts.length > 40) app.state.impacts.shift();
  }

  function applyGroundContact(app, def, dt) {
    const body = app.state.body;
    const surf = D.SURFACES[app.cfg.surfKey];
    const ground = def.ground;
    const kineticBefore = 0.5 * def.mass * body.vel.lengthSq();
    const support = supportExtentAlong(def, body.q, AX_Y);
    body.supportY = support;
    if (body.pos.y > support) return;

    const contactEnergy = 0.5 * def.mass * Math.max(0, body.vel.y * body.vel.y);
    body.pos.y = support;
    const muS = surf.mu_s * ground.muS;
    const muK = surf.mu_k * ground.muK;
    const muR = surf.mu_r * ground.muR;
    const bounce = surf.cr * def.crO * ground.bounce;
    const horiz = Math.hypot(body.vel.x, body.vel.z);
    const normalForce = def.mass * D.GRAV;
    const drive = Math.hypot(body.forces.net.x, body.forces.net.z);

    if (body.vel.y < -0.05) {
      recordImpact(app, body.pos, AX_Y, 'floor', contactEnergy);
    }

    if (app.cfg.env.bounce && body.vel.y < -0.06) body.vel.y = -body.vel.y * bounce;
    else body.vel.y = 0;

    if (ground.mode === 'flat' || ground.mode === 'skid' || ground.mode === 'disc') {
      if (horiz < 0.2 && drive < muS * normalForce * 0.95) {
        body.vel.x = 0;
        body.vel.z = 0;
      } else if (horiz > 1e-4) {
        const dv = Math.min(muK * D.GRAV * dt, horiz);
        body.vel.x -= dv * body.vel.x / horiz;
        body.vel.z -= dv * body.vel.z / horiz;
      }

      const keepSpinY = ground.mode === 'disc' ? Math.exp(-ground.yawDamp * 0.4 * dt) : Math.exp(-ground.yawDamp * dt);
      body.omegaBody.x *= Math.exp(-ground.yawDamp * dt);
      body.omegaBody.z *= Math.exp(-ground.yawDamp * dt);
      body.omegaBody.y *= keepSpinY;

      body.q.slerp(getRestQuaternion(def), Math.min(1, ground.settle * dt));
    } else {
      const radius = def.shape === 'ellipsoid' ? def.dims[2] * 0.35 : def.r;
      const omegaWorld = tempF.copy(body.omegaBody).applyQuaternion(body.q);
      const slipX = body.vel.x + omegaWorld.z * radius;
      const slipZ = body.vel.z - omegaWorld.x * radius;
      const slip = Math.hypot(slipX, slipZ);
      if (horiz < 0.1 && drive < muS * normalForce * 0.35) {
        body.vel.x = 0;
        body.vel.z = 0;
      } else if (slip > 0.01) {
        const friction = muK * normalForce;
        const ffx = -friction * slipX / slip;
        const ffz = -friction * slipZ / slip;
        body.vel.x += ffx * dt / def.mass;
        body.vel.z += ffz * dt / def.mass;
        tempG.set(ffx, 0, ffz);
        body.torques.ground.add(tempH.set(0, 0, 0).set(-radius * ffz, 0, radius * ffx));
      } else if (horiz > 0.001) {
        const rollDrag = Math.min(muR * D.GRAV * dt, horiz);
        body.vel.x -= rollDrag * body.vel.x / horiz;
        body.vel.z -= rollDrag * body.vel.z / horiz;
      }

      if (ground.mode === 'wobble' && horiz > 0.05) {
        body.omegaBody.x += Math.sin(app.state.time * 10) * ground.wobble * dt;
        body.omegaBody.z += Math.cos(app.state.time * 8.3) * ground.wobble * 0.5 * dt;
      }
    }

    if (app.state.energy) {
      const kineticAfter = 0.5 * def.mass * body.vel.lengthSq();
      app.state.energy.contactLoss += Math.max(0, kineticBefore - kineticAfter);
    }
  }

  function applyWallContact(app, def) {
    const body = app.state.body;
    if (!app.cfg.world.collision) return;
    const kineticBefore = 0.5 * def.mass * body.vel.lengthSq();

    const ex = supportExtentAlong(def, body.q, AX_X);
    const ey = supportExtentAlong(def, body.q, AX_Y);
    const ez = supportExtentAlong(def, body.q, AX_Z);
    const wallBounce = 0.28 * def.crO;
    const wallFric = 0.22;

    if (body.pos.x + ex > app.cfg.world.halfWidth) {
      body.pos.x = app.cfg.world.halfWidth - ex;
      if (body.vel.x > 0) {
        recordImpact(app, body.pos, AX_X.clone().multiplyScalar(-1), 'wall-x+', 0.5 * def.mass * body.vel.x * body.vel.x);
        body.vel.x *= -wallBounce;
        body.vel.y *= 1 - wallFric * 0.4;
        body.vel.z *= 1 - wallFric;
        body.omegaBody.multiplyScalar(0.86);
      }
    }

    if (body.pos.x - ex < -app.cfg.world.halfWidth) {
      body.pos.x = -app.cfg.world.halfWidth + ex;
      if (body.vel.x < 0) {
        recordImpact(app, body.pos, AX_X, 'wall-x-', 0.5 * def.mass * body.vel.x * body.vel.x);
        body.vel.x *= -wallBounce;
        body.vel.y *= 1 - wallFric * 0.4;
        body.vel.z *= 1 - wallFric;
        body.omegaBody.multiplyScalar(0.86);
      }
    }

    if (body.pos.z + ez > app.cfg.world.halfDepth) {
      body.pos.z = app.cfg.world.halfDepth - ez;
      if (body.vel.z > 0) {
        recordImpact(app, body.pos, AX_Z.clone().multiplyScalar(-1), 'wall-z+', 0.5 * def.mass * body.vel.z * body.vel.z);
        body.vel.z *= -wallBounce;
        body.vel.y *= 1 - wallFric * 0.4;
        body.vel.x *= 1 - wallFric;
        body.omegaBody.multiplyScalar(0.86);
      }
    }

    if (body.pos.z - ez < -app.cfg.world.halfDepth) {
      body.pos.z = -app.cfg.world.halfDepth + ez;
      if (body.vel.z < 0) {
        recordImpact(app, body.pos, AX_Z, 'wall-z-', 0.5 * def.mass * body.vel.z * body.vel.z);
        body.vel.z *= -wallBounce;
        body.vel.y *= 1 - wallFric * 0.4;
        body.vel.x *= 1 - wallFric;
        body.omegaBody.multiplyScalar(0.86);
      }
    }

    if (body.pos.y + ey > app.cfg.world.ceiling) {
      body.pos.y = app.cfg.world.ceiling - ey;
      if (body.vel.y > 0) {
        recordImpact(app, body.pos, AX_Y.clone().multiplyScalar(-1), 'ceiling', 0.5 * def.mass * body.vel.y * body.vel.y);
        body.vel.y *= -0.22 * def.crO;
        body.vel.x *= 1 - wallFric * 0.4;
        body.vel.z *= 1 - wallFric * 0.4;
        body.omegaBody.multiplyScalar(0.90);
      }
    }

    if (app.state.energy) {
      const kineticAfter = 0.5 * def.mass * body.vel.lengthSq();
      app.state.energy.contactLoss += Math.max(0, kineticBefore - kineticAfter);
    }
  }

  function aerodynamicStep(app, dt) {
    const def = resolveObjectDef(app.cfg.objKey, app.cfg);
    const body = app.state.body;
    const rho = computeRho(app.cfg.altitude);
    const wind = sampleWindAt(app, body.pos);
    const relWind = tempA.copy(wind).sub(body.vel);
    const relSpeed = relWind.length();
    const flowDir = relSpeed > 1e-6 ? relWind.clone().multiplyScalar(1 / relSpeed) : new V3(0, 0, 0);
    const axis = relSpeed > 1e-6 ? bodyAxisWorld(body, def.aero.refAxis).clone().normalize() : AX_Y.clone();
    const alignAxis = tempB.copy(axis).cross(flowDir);
    const mis = alignAxis.length();
    const axial = clamp(Math.abs(axis.dot(flowDir)), 0, 1);
    const reverse = axis.dot(flowDir) < 0 ? 1 : 0;
    const alpha = mis > 1e-6 ? Math.asin(clamp(mis, 0, 1)) : 0;
    const liftDir = mis > 1e-6 ? tempC.copy(flowDir).cross(alignAxis.normalize()).normalize() : new V3();
    const qdyn = 0.5 * rho * relSpeed * relSpeed;
    const areaEff = projectedArea(def, body, flowDir);
    const reynolds = Math.max(0.1, rho * relSpeed * Math.max(0.02, def.aero.chord) / D.MU_AIR);
    const coeff = aerodynamicCoefficients(def, alpha, axial, reverse, reynolds);

    body.metrics.rho = rho;
    body.metrics.areaEff = areaEff;
    body.metrics.Re = reynolds;
    body.metrics.Cd = coeff.Cd;
    body.metrics.Cl = coeff.Cl;
    body.metrics.Cm = coeff.Cm;
    body.metrics.aoa = radToDeg(alpha);

    body.forces.drag.set(0, 0, 0);
    body.forces.lift.set(0, 0, 0);
    body.forces.side.set(0, 0, 0);
    body.forces.magnus.set(0, 0, 0);
    body.forces.gravity.set(0, app.cfg.env.grav ? -def.mass * D.GRAV : 0, 0);
    body.torques.aero.set(0, 0, 0);
    body.torques.ground.set(0, 0, 0);
    body.torques.wall.set(0, 0, 0);

    if (relSpeed > 1e-5) {
      body.forces.drag.copy(flowDir).multiplyScalar(qdyn * areaEff * coeff.Cd);

      if (liftDir.lengthSq() > 0) {
        body.forces.lift.copy(liftDir).multiplyScalar(qdyn * areaEff * coeff.Cl);
        body.torques.aero.addScaledVector(alignAxis.normalize(), qdyn * areaEff * def.aero.chord * coeff.Cm);
      }

      if (app.cfg.env.magnus && def.aero.spinLift > 0) {
        const spinWorld = tempD.copy(body.omegaBody).applyQuaternion(body.q);
        body.forces.magnus.copy(spinWorld).cross(relWind).multiplyScalar(def.aero.spinLift * rho * Math.pow(def.r, 3));
      }

      const cpOffset = tempE.fromArray(def.aero.cp || [0, 0, 0]).applyQuaternion(body.q);
      body.torques.aero.add(cpOffset.cross(tempF.copy(body.forces.drag).add(body.forces.lift)));

      const omegaWorld = tempG.copy(body.omegaBody).applyQuaternion(body.q);
      body.torques.aero.addScaledVector(omegaWorld, -0.03 * qdyn * def.aero.chord * def.aero.chord);
    }

    body.forces.net.copy(body.forces.drag).add(body.forces.lift).add(body.forces.side).add(body.forces.magnus).add(body.forces.gravity).add(body.forces.wall);
    body.torques.net.copy(body.torques.aero).add(body.torques.ground).add(body.torques.wall);
    body.metrics.aeroPower = tempH.copy(body.forces.drag).add(body.forces.lift).add(body.forces.side).add(body.forces.magnus).dot(body.vel);
    if (app.state.energy) app.state.energy.aeroWork += body.metrics.aeroPower * dt;

    body.acc.copy(body.forces.net).multiplyScalar(1 / def.mass);
    body.vel.addScaledVector(body.acc, dt);
    body.pos.addScaledVector(body.vel, dt);

    if (app.cfg.env.rotation) integrateAngular(body, body.torques.net, def, dt);
    else {
      body.omegaBody.set(0, 0, 0);
      body.omegaWorld.set(0, 0, 0);
    }

    applyWallContact(app, def);
    applyGroundContact(app, def, dt);

    body.metrics.drag = body.forces.drag.length();
    body.metrics.lift = body.forces.lift.length();
    body.metrics.side = body.forces.side.length();
    body.metrics.net = body.forces.net.length();
  }

  function resetSimulationState(app) {
    const def = resolveObjectDef(app.cfg.objKey, app.cfg);
    if (app.state.currentTrail && app.state.currentTrail.length > 2) {
      app.state.comparisonTrail = app.state.currentTrail.slice(-app.cfg.visuals.trailMax);
    }
    app.state.time = 0;
    app.state.telemetry = [];
    app.state.lastTelemetry = -1;
    app.state.impacts = [];
    app.state.forceHistory = [];
    app.state.currentTrail = [];
    app.state.body = createBody(def, app.cfg);
    app.state.validation = null;
    app.state.energy = { aeroWork: 0, contactLoss: 0 };
  }

  function recordTelemetry(app) {
    if (app.state.time - app.state.lastTelemetry < 1 / D.TRATE) return;
    app.state.lastTelemetry = app.state.time;

    const def = resolveObjectDef(app.cfg.objKey, app.cfg);
    const body = app.state.body;
    const speed = body.vel.length();
    const accel = body.acc.length();
    const energy = app.state.energy || { aeroWork: 0, contactLoss: 0 };
    const keTrans = 0.5 * def.mass * body.vel.lengthSq();
    const keRot = 0.5 * (
      def.inertia[0] * body.omegaBody.x * body.omegaBody.x +
      def.inertia[1] * body.omegaBody.y * body.omegaBody.y +
      def.inertia[2] * body.omegaBody.z * body.omegaBody.z
    );
    const pe = def.mass * D.GRAV * Math.max(0, body.pos.y - body.supportY);

    app.state.telemetry.push({
      time_s: +app.state.time.toFixed(3),
      object: def.label,
      surface: app.cfg.surfKey,
      wind_mode: app.cfg.wind.mode,
      seed: app.cfg.seed,
      altitude_m: app.cfg.altitude,
      x_m: +body.pos.x.toFixed(4),
      y_m: +body.pos.y.toFixed(4),
      z_m: +body.pos.z.toFixed(4),
      vx_ms: +body.vel.x.toFixed(4),
      vy_ms: +body.vel.y.toFixed(4),
      vz_ms: +body.vel.z.toFixed(4),
      speed_ms: +speed.toFixed(4),
      ax_ms2: +body.acc.x.toFixed(4),
      ay_ms2: +body.acc.y.toFixed(4),
      az_ms2: +body.acc.z.toFixed(4),
      accel_ms2: +accel.toFixed(4),
      aoa_deg: +body.metrics.aoa.toFixed(4),
      lift_N: +body.metrics.lift.toFixed(6),
      drag_N: +body.metrics.drag.toFixed(6),
      net_force_N: +body.metrics.net.toFixed(6),
      reynolds: +body.metrics.Re.toFixed(0),
      cd_current: +body.metrics.Cd.toFixed(5),
      cl_current: +body.metrics.Cl.toFixed(5),
      cm_current: +body.metrics.Cm.toFixed(5),
      area_eff_m2: +body.metrics.areaEff.toFixed(5),
      spin_x_rps: +(body.omegaBody.x / D.TAU).toFixed(4),
      spin_y_rps: +(body.omegaBody.y / D.TAU).toFixed(4),
      spin_z_rps: +(body.omegaBody.z / D.TAU).toFixed(4),
      wind_speed_ms: app.cfg.wind.speed,
      wind_heading_deg: app.cfg.wind.azim,
      wind_elev_deg: app.cfg.wind.elev,
      wind_mode_strength: app.cfg.wind.modeStrength,
      rho_kgm3: +body.metrics.rho.toFixed(5),
      object_width_m: +def.dims[0].toFixed(4),
      object_height_m: +def.dims[1].toFixed(4),
      object_depth_m: +def.dims[2].toFixed(4),
      ke_trans_J: +keTrans.toFixed(5),
      ke_rot_J: +keRot.toFixed(5),
      pe_J: +pe.toFixed(5),
      aero_work_J: +energy.aeroWork.toFixed(5),
      contact_loss_J: +energy.contactLoss.toFixed(5)
    });

    if (app.state.telemetry.length > 25000) app.state.telemetry.shift();
    app.state.forceHistory.push({
      time: app.state.time,
      drag: body.metrics.drag,
      lift: body.metrics.lift,
      net: body.metrics.net,
      aoa: body.metrics.aoa
    });
    if (app.state.forceHistory.length > 300) app.state.forceHistory.shift();
  }

  function startValidation(app, caseId) {
    const validationCase = D.VALIDATION_CASES[caseId];
    if (!validationCase) return null;
    app.applyScenario(validationCase.preset, false);
    app.state.validation = {
      id: caseId,
      label: validationCase.label,
      endTime: validationCase.duration,
      checks: validationCase.checks,
      samples: 0,
      minCd: Infinity,
      maxRe: 0,
      clSum: 0,
      cdSum: 0,
      finalAoA: 0,
      maxX: 0,
      maxZ: 0,
      launchY: app.state.body.pos.y,
      minY: app.state.body.pos.y,
      rollAngle: 0,
      result: null
    };
    app.state.paused = false;
    return app.state.validation;
  }

  function updateValidation(app) {
    const validation = app.state.validation;
    if (!validation || validation.result) return;

    const body = app.state.body;
    validation.samples += 1;
    validation.minCd = Math.min(validation.minCd, body.metrics.Cd);
    validation.maxRe = Math.max(validation.maxRe, body.metrics.Re);
    validation.clSum += body.metrics.Cl;
    validation.cdSum += body.metrics.Cd;
    validation.finalAoA = body.metrics.aoa;
    validation.maxX = Math.max(validation.maxX, Math.abs(body.pos.x - body.launchPos.x));
    validation.maxZ = Math.max(validation.maxZ, Math.abs(body.pos.z - body.launchPos.z));
    validation.minY = Math.min(validation.minY, body.pos.y);
    validation.rollAngle = radToDeg(Math.acos(clamp(Math.abs(tempA.copy(AX_Y).applyQuaternion(body.q).dot(AX_Y)), -1, 1)));

    if (app.state.time < validation.endTime) return;

    const glideDrop = Math.max(0.1, validation.launchY - validation.minY);
    const metrics = {
      minCd: validation.minCd,
      maxRe: validation.maxRe,
      meanCl: validation.clSum / Math.max(1, validation.samples),
      meanCd: validation.cdSum / Math.max(1, validation.samples),
      finalAoA: validation.finalAoA,
      glideRatio: validation.maxX / glideDrop,
      rollAngle: validation.rollAngle,
      travel: Math.sqrt(validation.maxX * validation.maxX + validation.maxZ * validation.maxZ)
    };

    const lines = [];
    let passCount = 0;
    validation.checks.forEach(function (check) {
      const value = metrics[check.metric];
      const pass = value >= check.min && value <= check.max;
      if (pass) passCount += 1;
      lines.push((pass ? 'PASS' : 'WARN') + '  ' + check.label + ': ' + value.toFixed(3) + ' (target ' + check.min + ' to ' + check.max + ')');
    });

    validation.result = {
      metrics: metrics,
      passed: passCount,
      total: validation.checks.length,
      text: lines.join('\n')
    };
    app.state.paused = true;
  }

  function step(app, dt) {
    if (app.state.paused) return;
    const simDt = dt * app.cfg.simRate;
    app.state.time += simDt;
    const subDt = simDt / D.SUB;
    for (let i = 0; i < D.SUB; i += 1) aerodynamicStep(app, subDt);
    app.state.currentTrail.push(app.state.body.pos.clone());
    if (app.state.currentTrail.length > app.cfg.visuals.trailMax) app.state.currentTrail.shift();
    recordTelemetry(app);
    updateValidation(app);
  }

  window.WindSimPhysics = {
    wrap360: wrap360,
    headingSummary: headingSummary,
    beaufort: beaufort,
    computeRho: computeRho,
    createBody: createBody,
    makeConfigFromPreset: makeConfigFromPreset,
    defaultScenarioSnapshot: defaultScenarioSnapshot,
    resetSimulationState: resetSimulationState,
    step: step,
    sampleWindAt: sampleWindAt,
    supportExtentAlong: supportExtentAlong,
    projectedArea: projectedArea,
    startValidation: startValidation,
    resolveObjectDef: resolveObjectDef
  };
}());
