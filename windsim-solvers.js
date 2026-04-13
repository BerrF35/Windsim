/**
 * WindSim Solver Registry
 *
 * Defines the solver interface contract, validates implementations,
 * and provides registration/lookup for pluggable solver backends.
 *
 * SOLVER CONTRACT — every solver MUST implement:
 *   key                           : string   — unique solver identifier
 *   getProfile()                  : object   — { label, classification, fieldModel, couplingModel, integrator }
 *   makeConfigFromPreset(name)    : object   — returns a full config object from a preset name
 *   defaultScenarioSnapshot(app)  : object   — serialisable snapshot of current scenario state
 *   resolveObjectDef(objKey, cfg) : object   — returns the definition for the given object key
 *   supportExtentAlong(def,q,ax)  : number   — half-extent of object along axis in current orientation
 *   sampleWindAt(app, pos)        : Vector3  — wind velocity at world position (may mutate internal buffer)
 *   resetSimulationState(app)     : void     — reset body, time, telemetry, trails
 *   step(app, dt)                 : void     — advance simulation by dt seconds
 *
 * OPTIONAL methods (checked via capabilities):
 *   startValidation(app, caseId)  : boolean  — initiate a validation case
 *   sampleMountedLoads(cfg)       : object   — compute steady-state loads for mounted mode
 */
(function () {
  'use strict';

  var D = window.WindSimData;
  var P = window.WindSimPhysics;

  /* ---- contract definition ---- */

  var REQUIRED_METHODS = [
    'key', 'getProfile', 'makeConfigFromPreset', 'defaultScenarioSnapshot',
    'resolveObjectDef', 'supportExtentAlong', 'sampleWindAt',
    'resetSimulationState', 'step'
  ];

  var OPTIONAL_METHODS = ['startValidation', 'sampleMountedLoads'];

  function validateSolver(solver) {
    var missing = [];
    for (var i = 0; i < REQUIRED_METHODS.length; i++) {
      var m = REQUIRED_METHODS[i];
      if (m === 'key') {
        if (typeof solver.key !== 'string' || !solver.key) missing.push('key (string)');
      } else if (typeof solver[m] !== 'function') {
        missing.push(m + '()');
      }
    }
    if (missing.length) {
      throw new Error('WindSimSolvers: solver "' + (solver.key || '?') + '" missing required: ' + missing.join(', '));
    }
    return true;
  }

  function solverCapabilities(solver) {
    var caps = {};
    for (var i = 0; i < OPTIONAL_METHODS.length; i++) {
      caps[OPTIONAL_METHODS[i]] = typeof solver[OPTIONAL_METHODS[i]] === 'function';
    }
    return caps;
  }

  /* ---- sandbox solver (built-in) ---- */

  function createSandboxSolver() {
    var profile = Object.freeze(Object.assign({ key: 'sandbox' }, D.SOLVER_PROFILES.sandbox || {}));
    return Object.freeze({
      key: 'sandbox',
      getProfile: function () { return profile; },
      makeConfigFromPreset: function (presetLike) { return P.makeConfigFromPreset(presetLike); },
      defaultScenarioSnapshot: function (app) { return P.defaultScenarioSnapshot(app); },
      resolveObjectDef: function (objKey, cfg) { return P.resolveObjectDef(objKey, cfg); },
      supportExtentAlong: function (def, quat, axis) { return P.supportExtentAlong(def, quat, axis); },
      sampleWindAt: function (app, pos) { return P.sampleWindAt(app, pos); },
      resetSimulationState: function (app) { return P.resetSimulationState(app); },
      startValidation: function (app, caseId) { return P.startValidation(app, caseId); },
      step: function (app, dt) { return P.step(app, dt); },
      sampleMountedLoads: function (cfg) { return P.sampleMountedLoads(cfg); }
    });
  }

  /* ---- kinematic solver (test) ---- */

  function createKinematicSolver() {
    var profile = Object.freeze(Object.assign({ key: 'kinematic' }, D.SOLVER_PROFILES.kinematic || {}));
    var tmpStart = new THREE.Vector3();
    return Object.freeze({
      key: 'kinematic',
      getProfile: function () { return profile; },
      makeConfigFromPreset: function (presetLike) { return P.makeConfigFromPreset(presetLike); },
      defaultScenarioSnapshot: function (app) {
        var s = P.defaultScenarioSnapshot(app);
        s.solverKey = 'kinematic';
        return s;
      },
      resolveObjectDef: function (objKey, cfg) { return P.resolveObjectDef(objKey, cfg); },
      supportExtentAlong: function (def, quat, axis) { return P.supportExtentAlong(def, quat, axis); },
      sampleWindAt: function (app, pos) { return new THREE.Vector3(); },
      resetSimulationState: function (app) {
        var cfg = app.cfg;
        var r = app.render.body;
        r.pos.set(0, cfg.launch.h0, 0);
        r.q.set(0, 0, 0, 1);
        r.v.set(cfg.launch.vx, cfg.launch.vy, cfg.launch.vz);
        r.w.set(cfg.launch.oz, cfg.launch.oy, cfg.launch.ox); // swap due to old mapping
        r.forces.drag.set(0,0,0);
        r.forces.magnus.set(0,0,0);
        r.forces.net.set(0,0,0);
        app.sim.t = 0;
        app.sim.re = 0;
        app.sim.cd = 0;
        app.sim.ke = 0;
        app.telemetry.length = 0;
      },
      step: function (app, dt) {
        var r = app.render.body;
        if (r.pos.y > 0 || r.v.y > 0) {
          r.v.y -= 9.81 * dt;
          r.pos.addScaledVector(r.v, dt);
          if (r.pos.y < 0) r.pos.y = 0; // stop at ground
        }
        r.forces.net.set(0, -9.81 * P.resolveObjectDef(app.cfg.objKey, app.cfg).mass, 0);
        r.forces.drag.set(0,0,0);
        r.forces.magnus.set(0,0,0);
        app.sim.t += dt;
      }
    });
  }

  /* ---- registry ---- */

  var SOLVERS = {};
  var CAPABILITIES = {};

  function registerSolver(solver) {
    validateSolver(solver);
    SOLVERS[solver.key] = solver;
    CAPABILITIES[solver.key] = solverCapabilities(solver);
    return solver;
  }

  function hasSolver(key) {
    return !!SOLVERS[key];
  }

  function getSolver(key) {
    return SOLVERS[key] || SOLVERS.sandbox;
  }

  function listSolvers() {
    return Object.keys(SOLVERS).map(function (key) {
      var s = SOLVERS[key];
      var p = s.getProfile();
      return {
        key: key,
        label: p.label || key,
        classification: p.classification || 'unknown',
        capabilities: CAPABILITIES[key]
      };
    });
  }

  function getCapabilities(key) {
    return CAPABILITIES[key] || {};
  }

  /* ---- boot: register built-in solver ---- */

  registerSolver(createSandboxSolver());
  registerSolver(createKinematicSolver());

  /* ---- public API ---- */

  window.WindSimSolvers = {
    hasSolver: hasSolver,
    getSolver: getSolver,
    listSolvers: listSolvers,
    registerSolver: registerSolver,
    getCapabilities: getCapabilities,
    REQUIRED_METHODS: REQUIRED_METHODS,
    OPTIONAL_METHODS: OPTIONAL_METHODS
  };
}());
