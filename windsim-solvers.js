(function () {
  'use strict';

  const D = window.WindSimData;
  const P = window.WindSimPhysics;

  function createSandboxSolver() {
    const profile = Object.freeze(Object.assign({ key: 'sandbox' }, D.SOLVER_PROFILES.sandbox || {}));
    return Object.freeze({
      key: 'sandbox',
      getProfile: function () {
        return profile;
      },
      makeConfigFromPreset: function (presetLike) {
        return P.makeConfigFromPreset(presetLike);
      },
      defaultScenarioSnapshot: function (app) {
        return P.defaultScenarioSnapshot(app);
      },
      resolveObjectDef: function (objKey, cfg) {
        return P.resolveObjectDef(objKey, cfg);
      },
      supportExtentAlong: function (def, quat, axis) {
        return P.supportExtentAlong(def, quat, axis);
      },
      sampleWindAt: function (app, pos) {
        return P.sampleWindAt(app, pos);
      },
      resetSimulationState: function (app) {
        return P.resetSimulationState(app);
      },
      startValidation: function (app, caseId) {
        return P.startValidation(app, caseId);
      },
      step: function (app, dt) {
        return P.step(app, dt);
      }
    });
  }

  const SOLVERS = {
    sandbox: createSandboxSolver()
  };

  function hasSolver(key) {
    return !!SOLVERS[key];
  }

  function getSolver(key) {
    return SOLVERS[key] || SOLVERS.sandbox;
  }

  function listSolvers() {
    return Object.keys(SOLVERS);
  }

  window.WindSimSolvers = {
    hasSolver: hasSolver,
    getSolver: getSolver,
    listSolvers: listSolvers
  };
}());
