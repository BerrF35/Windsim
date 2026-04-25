/**
 * WindSim CFD - Regime Manager & Capability Advisor
 *
 * Pure decision layer. It reads solver diagnostics, calibration metadata, and
 * hardware profile, then returns structured truth about what the current case
 * can support. It does not mutate solver buffers, visualization state, or
 * session state.
 */
(function () {
    'use strict';

    const VALID_MODES = ['laminar', 'les'];
    const CALIBRATION_REGIMES = {
        FULL: 'fully_calibrated',
        PARTIAL: 'partially_calibrated',
        MISMATCH: 'calibration_mismatch',
        MISSING: 'calibration_missing'
    };

    function finiteNumber(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }

    function normalizeMode(mode) {
        return VALID_MODES.includes(mode) ? mode : 'unsupported';
    }

    function getGridMax(grid) {
        if (!grid) return 0;
        if (Array.isArray(grid)) return Math.max(grid[0] || 0, grid[1] || 0, grid[2] || 0);
        return Math.max(grid.x || grid.gridX || 0, grid.y || grid.gridY || 0, grid.z || grid.gridZ || 0);
    }

    function classifyCalibration(calibration) {
        if (!calibration) {
            return {
                status: 'MISSING',
                regime: CALIBRATION_REGIMES.MISSING,
                reason: 'No calibration object available.'
            };
        }
        if (calibration.status === 'MATCH') {
            return {
                status: 'MATCH',
                regime: CALIBRATION_REGIMES.FULL,
                reason: calibration.reason || 'Reynolds calibration is within the allowed match band.'
            };
        }
        if (calibration.status === 'NEAR') {
            return {
                status: 'NEAR',
                regime: CALIBRATION_REGIMES.PARTIAL,
                reason: calibration.reason || 'Reynolds calibration is same-order only.'
            };
        }
        return {
            status: calibration.status || 'MISMATCH',
            regime: CALIBRATION_REGIMES.MISMATCH,
            reason: calibration.reason || 'Reynolds calibration does not support engineering coefficients.'
        };
    }

    function classifyReynolds(calibration) {
        const target = calibration && calibration.Re_target;
        const actual = calibration && calibration.Re_actual;
        if (!finiteNumber(target) || !finiteNumber(actual) || target <= 0 || actual <= 0) {
            return { class: 'unknown', ratio: null, isLowRe: false };
        }
        const ratio = actual / target;
        let reClass = 'transitional_or_higher';
        if (actual < 100) reClass = 'low_re_laminar';
        else if (actual < 1000) reClass = 'moderate_re';
        return { class: reClass, ratio, isLowRe: actual < 100 };
    }

    class RegimeManager {
        static evaluate(input = {}) {
            const diagnostics = input.diagnostics || {};
            const coefficients = input.coefficients || diagnostics.coefficients || null;
            const calibration = input.calibration || (coefficients && coefficients.calibration) || null;
            const effectiveViscosity = input.effectiveViscosity || diagnostics.effectiveViscosity || null;
            const mode = normalizeMode(input.solverMode || diagnostics.mode || diagnostics.solverMode);
            const calibrationInfo = classifyCalibration(calibration);
            const re = classifyReynolds(calibration);
            const clampCount = effectiveViscosity ? (effectiveViscosity.totalTauClampCount || effectiveViscosity.tauClampCount || 0) : 0;
            const lastClampCount = effectiveViscosity ? (effectiveViscosity.lastStepClampCount || 0) : 0;
            const stable = diagnostics.isDiverged === true ? false : !(
                diagnostics.massDrift > 0.05 ||
                diagnostics.maxVelocity > 0.25 ||
                (effectiveViscosity && effectiveViscosity.tauClampCount > 0)
            );
            const iteration = diagnostics.iteration || 0;

            let coefficientAvailable = false;
            let coefficientStatus = 'unavailable';
            let coefficientReason = calibrationInfo.reason;
            if (mode === 'unsupported') {
                coefficientReason = 'Unsupported solver mode.';
            } else if (!stable) {
                coefficientReason = 'Solver stability gate failed; coefficients are not defensible.';
            } else if (calibrationInfo.status !== 'MATCH') {
                coefficientReason = calibrationInfo.reason;
            } else if (iteration < 100) {
                coefficientStatus = 'settling';
                coefficientReason = 'Solver is still in the first 100 iterations; raw forces are visible, coefficients wait for settling.';
            } else if (clampCount > 0) {
                coefficientReason = 'Effective-viscosity clamp occurred; engineering coefficients are held unavailable.';
            } else if (coefficients && coefficients.cd !== null && coefficients.cl !== null && coefficients.cs !== null) {
                coefficientAvailable = true;
                coefficientStatus = 'available';
                coefficientReason = 'Calibration MATCH and solver stability gates passed.';
            }

            return {
                version: 1,
                solverRegime: mode,
                calibrationRegime: calibrationInfo.regime,
                calibrationStatus: calibrationInfo.status,
                classification: mode === 'unsupported' ? 'unsupported' : `${mode}_${calibrationInfo.regime}`,
                stable,
                stability: {
                    isDiverged: diagnostics.isDiverged === true,
                    massDrift: finiteNumber(diagnostics.massDrift) ? diagnostics.massDrift : null,
                    maxVelocity: finiteNumber(diagnostics.maxVelocity) ? diagnostics.maxVelocity : null,
                    clampCount,
                    lastClampCount
                },
                reynolds: {
                    target: calibration && finiteNumber(calibration.Re_target) ? calibration.Re_target : null,
                    actual: calibration && finiteNumber(calibration.Re_actual) ? calibration.Re_actual : null,
                    ratio: re.ratio,
                    class: re.class,
                    isLowRe: re.isLowRe
                },
                characteristicLength: {
                    physical: calibration && finiteNumber(calibration.charLengthPhys) ? calibration.charLengthPhys : null,
                    lattice: calibration && finiteNumber(calibration.charLengthLat) ? calibration.charLengthLat : null
                },
                effectiveViscosity: effectiveViscosity ? { ...effectiveViscosity } : null,
                rawForcesAvailable: ['forceX', 'forceY', 'forceZ'].every(k => finiteNumber(diagnostics[k])),
                physicalForcesAvailable: !!(coefficients && calibration && finiteNumber(calibration.forceScale) && calibration.forceScale > 0),
                coefficientAvailability: {
                    available: coefficientAvailable,
                    status: coefficientStatus,
                    reason: coefficientReason
                },
                calibration: calibration ? { ...calibration } : null
            };
        }
    }

    class CapabilityAdvisor {
        static hardwareProfile(hardware = {}) {
            const cpuCores = hardware.cpuCores || hardware.cores || 0;
            const memoryGB = hardware.memoryGB || hardware.mem || 0;
            let computeTier = 'demo';
            if (cpuCores >= 8 && memoryGB >= 8) computeTier = 'full';
            else if (cpuCores >= 4 && memoryGB >= 4) computeTier = 'reduced';
            else if (hardware.executionTier === 'full' || hardware.executionTier === 'reduced') computeTier = 'reduced';

            const rendererTier = hardware.rendererTier || hardware.executionTier || (hardware.gpuReady ? 'full' : 'demo');
            const maxGrid = computeTier === 'full' ? 128 : (computeTier === 'reduced' ? 64 : 32);
            const supportedModes = computeTier === 'demo' ? ['laminar'] : ['laminar', 'les'];

            return {
                computeTier,
                rendererTier,
                cpuCores,
                memoryGB,
                maxGrid,
                supportedModes,
                notes: [
                    `Solver compute tier is ${computeTier}.`,
                    `Renderer/WebGPU tier is ${rendererTier}.`
                ]
            };
        }

        static evaluate(input = {}) {
            const hardware = this.hardwareProfile(input.hardware || {});
            const solverConfig = input.solverConfig || {};
            const regime = input.regime || RegimeManager.evaluate(input);
            const gridMax = getGridMax(solverConfig.grid || solverConfig);
            const requestedMode = normalizeMode(solverConfig.mode || solverConfig.solverMode || regime.solverRegime);
            const blocks = [];

            if (requestedMode === 'unsupported' || !hardware.supportedModes.includes(requestedMode)) {
                blocks.push({
                    code: 'MODE_UNSUPPORTED_ON_PROFILE',
                    reason: `${requestedMode} mode is not supported on ${hardware.computeTier} compute tier.`
                });
            }
            if (gridMax > hardware.maxGrid) {
                blocks.push({
                    code: 'GRID_EXCEEDS_COMPUTE_TIER',
                    reason: `Requested grid max ${gridMax} exceeds safe ${hardware.maxGrid} limit for ${hardware.computeTier} compute tier.`
                });
            }
            if (regime.solverRegime === 'unsupported') {
                blocks.push({ code: 'REGIME_UNSUPPORTED', reason: 'Current solver regime is unsupported.' });
            }
            if (regime.stability && regime.stability.isDiverged) {
                blocks.push({ code: 'SOLVER_DIVERGED', reason: 'Current solver state has diverged and cannot continue safely.' });
            }

            const coeff = regime.coefficientAvailability || { available: false, reason: 'No regime decision available.' };
            return {
                version: 1,
                hardware,
                recommendedGrid: `${hardware.maxGrid}x${hardware.maxGrid}x${hardware.maxGrid}`,
                recommendedModes: hardware.supportedModes.slice(),
                requested: {
                    gridMax,
                    mode: requestedMode
                },
                actions: {
                    run: {
                        supported: blocks.length === 0,
                        reason: blocks.length ? blocks.map(b => b.reason).join(' ') : 'Safe to run within current capability profile.'
                    },
                    coefficients: {
                        rawMEM: regime.rawForcesAvailable,
                        physicalForces: regime.physicalForcesAvailable,
                        engineeringCoefficients: coeff.available,
                        reason: coeff.reason
                    }
                },
                blocks,
                summary: blocks.length
                    ? blocks[0].reason
                    : `Safe profile: ${hardware.computeTier} compute, ${hardware.maxGrid} max grid, ${hardware.supportedModes.join('/')} modes.`
            };
        }
    }

    function assess(input = {}) {
        const regime = RegimeManager.evaluate(input);
        const capability = CapabilityAdvisor.evaluate({ ...input, regime });
        return { regime, capability };
    }

    window.WindSimRegime = {
        RegimeManager,
        CapabilityAdvisor,
        assess
    };
})();
