/**
 * WindSim CFD — Solver Core (Phase C)
 * Phase C / Solver layer enforcing exact numerical consistency, deterministic behavior, and observability.
 * 
 * LBM D3Q19 CPU Implementation.
 * Focuses on ground-truth accuracy, observability, and deterministic execution.
 */
(function () {
    'use strict';

    // D3Q19 Constants
    const Q = 19;
    const E = [
        [0,0,0], [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1],
        [1,1,0], [-1,-1,0], [1,-1,0], [-1,1,0], [1,0,1], [-1,0,-1], [1,0,-1], [-1,0,1],
        [0,1,1], [0,-1,-1], [0,1,-1], [0,-1,1]
    ];
    const W = [
        1/3, 1/18, 1/18, 1/18, 1/18, 1/18, 1/18,
        1/36, 1/36, 1/36, 1/36, 1/36, 1/36, 1/36, 1/36,
        1/36, 1/36, 1/36, 1/36
    ];
    const OPP = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17];
    const SOLVER_MODES = {
        LAMINAR: 'laminar',
        LES: 'les',
        UNSUPPORTED: 'unsupported'
    };
    const LES_DEFAULTS = {
        // Smagorinsky constant in the common engineering range 0.1-0.2.
        smagorinskyCs: 0.12,
        // Lattice spacing is one voxel in this CPU LBM reference kernel.
        delta: 1.0,
        tauMin: 0.500001,
        tauMax: 2.0
    };

    class LBMSolver {
        constructor() {
            this.res = [0, 0, 0];
            this.config = null;
            this.domainSize = [0, 0, 0];
            this.mode = SOLVER_MODES.LAMINAR;
            this.lesSettings = { ...LES_DEFAULTS };
            this._lesSamples = {
                xp: new Float64Array(3), xm: new Float64Array(3),
                yp: new Float64Array(3), ym: new Float64Array(3),
                zp: new Float64Array(3), zm: new Float64Array(3)
            };
            this.f = null;     
            this.f_tmp = null; 
            this.mask = null;
            this.bc = []; // Boundary conditions array
            this.stats = {
                iteration: 0,
                mass: 0,
                maxVel: 0,
                maxResidual: 0,
                initialMass: 0,
                forceX: 0,
                forceY: 0,
                forceZ: 0,
                rho_prev: null,
                effectiveViscosity: this.createViscosityStats(SOLVER_MODES.LAMINAR, 0.0, 0.5)
            };
            this.isInitialized = false;
        }

        createViscosityStats(mode, nu, tau) {
            return {
                mode,
                nuMin: nu,
                nuMax: nu,
                nuMean: nu,
                tauMin: tau,
                tauMax: tau,
                tauMean: tau,
                tauClampCount: 0,
                totalTauClampCount: 0,
                lastStepClampCount: 0,
                cellCount: 0,
                smagorinskyCs: LES_DEFAULTS.smagorinskyCs,
                delta: LES_DEFAULTS.delta
            };
        }

        normalizeMode(mode) {
            if (mode === SOLVER_MODES.LES) return SOLVER_MODES.LES;
            if (!mode || mode === SOLVER_MODES.LAMINAR) return SOLVER_MODES.LAMINAR;
            return SOLVER_MODES.UNSUPPORTED;
        }

        configureMode(config) {
            this.mode = this.normalizeMode(config.solverMode || config.mode);
            this.config.solverMode = this.mode;
            this.lesSettings = {
                smagorinskyCs: Number.isFinite(config.smagorinskyCs) ? config.smagorinskyCs : LES_DEFAULTS.smagorinskyCs,
                delta: Number.isFinite(config.lesDelta) && config.lesDelta > 0 ? config.lesDelta : LES_DEFAULTS.delta,
                tauMin: Number.isFinite(config.lesTauMin) ? config.lesTauMin : LES_DEFAULTS.tauMin,
                tauMax: Number.isFinite(config.lesTauMax) ? config.lesTauMax : LES_DEFAULTS.tauMax
            };
        }

        /**
         * ISolverKernel implementation
         */
        init(domainSize, resolution, config, voxelMask) {
            const [nx, ny, nz] = resolution;
            this.res = resolution;
            this.config = { ...config }; // Store full config for calibration anchors
            this.domainSize = domainSize || [nx, ny, nz];
            this.configureMode(this.config);
            this.mask = voxelMask;

            const size = nx * ny * nz * Q;
            this.f = new Float32Array(size);
            this.f_tmp = new Float32Array(size);

            // Default State: Equilibrium with density 1.0 and zero velocity
            const u0 = [0, 0, 0];
            const rho0 = 1.0;
            
            for (let i = 0; i < nx * ny * nz; i++) {
                this.setEquilibrium(i, rho0, u0);
            }

            this.stats.iteration = 0;
            this.stats.initialMass = this.calculateTotalMass();
            this.stats.mass = this.stats.initialMass;
            const nu = this.baseLatticeViscosity();
            this.stats.effectiveViscosity = this.createViscosityStats(this.mode, nu, this.config.tau);
            this.stats.effectiveViscosity.smagorinskyCs = this.lesSettings.smagorinskyCs;
            this.stats.effectiveViscosity.delta = this.lesSettings.delta;
            this.isInitialized = true;
        }

        setBoundaryConditions(bcArray) {
            this.bc = bcArray || [];
        }

        setEquilibrium(cellIdx, rho, u) {
            const base = cellIdx * Q;
            const u2 = u[0]*u[0] + u[1]*u[1] + u[2]*u[2];
            for (let q = 0; q < Q; q++) {
                const eu = E[q][0]*u[0] + E[q][1]*u[1] + E[q][2]*u[2];
                this.f[base + q] = W[q] * rho * (1 + 3*eu + 4.5*eu*eu - 1.5*u2);
            }
        }

        step(numSubSteps) {
            if (!this.isInitialized) return { status: 'error', message: 'Not initialized' };
            if (this.mode === SOLVER_MODES.UNSUPPORTED) {
                return {
                    status: 'error',
                    message: 'Unsupported solver mode',
                    mode: this.mode,
                    computeTimeMs: 0
                };
            }
            
            const start = performance.now();
            for (let s = 0; s < numSubSteps; s++) {
                this.collisionAndStreaming();
                this.stats.iteration++;
            }
            const time = performance.now() - start;

            this.normalizeMass();
            this.updateTelemetry();

            return {
                status: 'ok',
                iterations: numSubSteps,
                computeTimeMs: time
            };
        }

        collisionAndStreaming() {
            const [nx, ny, nz] = this.res;
            const tau = this.config.tau;
            const baseNu = this.baseLatticeViscosity();
            
            let fx = 0, fy = 0, fz = 0;
            let nuMin = Infinity, nuMax = -Infinity, nuSum = 0;
            let tauMin = Infinity, tauMax = -Infinity, tauSum = 0;
            let rawTauMax = -Infinity;
            let clampCount = 0;
            let fluidCellCount = 0;
            
            // 1. Collision + Streaming to f_tmp
            for (let x = 0; x < nx; x++) {
                for (let y = 0; y < ny; y++) {
                    for (let z = 0; z < nz; z++) {
                        const idx = x + nx * (y + ny * z);
                        
                        // Solid nodes do not participate in fluid collision/streaming
                        if (this.mask && this.mask[idx] > 0) continue;

                        const base = idx * Q;
                        
                        // Calculate macroscopic (at source)
                        let rho = 0, ux = 0, uy = 0, uz = 0;
                        for (let q = 0; q < Q; q++) {
                            const val = this.f[base + q];
                            rho += val;
                            ux += val * E[q][0];
                            uy += val * E[q][1];
                            uz += val * E[q][2];
                        }
                        
                        if (rho > 0) {
                            ux /= rho; uy /= rho; uz /= rho;
                        }

                        // Apply Boundary Conditions with Gradual Ramp for Stability
                        const ramp = Math.min(1.0, this.stats.iteration / 100.0);
                        const iSpeed = this.config.inletSpeed * ramp;
                        if (this.config.inletDir === '+x' && x === 0) {
                            ux = iSpeed; uy = 0; uz = 0; rho = 1.0; 
                        } else if (this.config.inletDir === '-x' && x === nx - 1) {
                            ux = -iSpeed; uy = 0; uz = 0; rho = 1.0;
                        } else if (this.config.inletDir === '+z' && z === 0) {
                            ux = 0; uy = 0; uz = iSpeed; rho = 1.0;
                        } else if (this.config.inletDir === '-z' && z === nz - 1) {
                            ux = 0; uy = 0; uz = -iSpeed; rho = 1.0;
                        }

                        // Physical Stability Clamping
                        rho = Math.max(0.7, Math.min(1.3, rho));
                        const speed = Math.sqrt(ux*ux + uy*uy + uz*uz);
                        if (speed > 0.2) {
                            const factor = 0.2 / speed;
                            ux *= factor; uy *= factor; uz *= factor;
                        }

                        const u2 = ux*ux + uy*uy + uz*uz;
                        let tauEff = tau;
                        let nuEff = baseNu;

                        if (this.mode === SOLVER_MODES.LES) {
                            const strainMag = this.computeStrainMagnitude(x, y, z, ux, uy, uz);
                            const csDelta = this.lesSettings.smagorinskyCs * this.lesSettings.delta;
                            const eddyNu = csDelta * csDelta * strainMag;
                            const rawNuEff = baseNu + eddyNu;
                            const rawTauEff = 3.0 * rawNuEff + 0.5;
                            rawTauMax = Math.max(rawTauMax, rawTauEff);
                            tauEff = rawTauEff;

                            if (tauEff < this.lesSettings.tauMin) {
                                tauEff = this.lesSettings.tauMin;
                                clampCount++;
                            } else if (tauEff > this.lesSettings.tauMax) {
                                tauEff = this.lesSettings.tauMax;
                                clampCount++;
                            }
                            nuEff = Math.max(0.0, (tauEff - 0.5) / 3.0);
                        }

                        fluidCellCount++;
                        nuMin = Math.min(nuMin, nuEff);
                        nuMax = Math.max(nuMax, nuEff);
                        nuSum += nuEff;
                        tauMin = Math.min(tauMin, tauEff);
                        tauMax = Math.max(tauMax, tauEff);
                        tauSum += tauEff;
                        const omega = 1.0 / tauEff;

                        for (let q = 0; q < Q; q++) {
                            const f_val = this.f[base + q];
                            const eu = E[q][0]*ux + E[q][1]*uy + E[q][2]*uz;
                            const feq = W[q] * rho * (1 + 3*eu + 4.5*eu*eu - 1.5*u2);
                            
                            const f_post = f_val + omega * (feq - f_val);

                            // PRE-STREAMING RHO CAPTURE (for residual next step)
                            // We capture the post-collision, pre-stream density change effectively by comparing 
                            // the state at the end of each full step.

                            // Streaming
                            let nx_ = x + E[q][0];
                            let ny_ = y + E[q][1];
                            let nz_ = z + E[q][2];

                            // Periodic or Outflow (Simple Periodic for now)
                            if (nx_ < 0) nx_ = nx - 1; if (nx_ >= nx) nx_ = 0;
                            if (ny_ < 0) ny_ = ny - 1; if (ny_ >= ny) ny_ = 0;
                            if (nz_ < 0) nz_ = nz - 1; if (nz_ >= nz) nz_ = 0;

                            const targetIdx = nx_ + nx * (ny_ + ny * nz_);
                            const targetBase = targetIdx * Q;

                            // Voxel Bounce-back
                            if (this.mask && this.mask[targetIdx] > 0) {
                                // Reflect back to source cell in opposite direction
                                this.f_tmp[base + OPP[q]] = f_post;
                                // Momentum Exchange Method (MEM) force accumulation
                                fx += 2 * f_post * E[q][0];
                                fy += 2 * f_post * E[q][1];
                                fz += 2 * f_post * E[q][2];
                            } else {
                                this.f_tmp[targetBase + q] = f_post;
                            }
                        }
                    }
                }
            }

            this.stats.forceX = fx;
            this.stats.forceY = fy;
            this.stats.forceZ = fz;
            this.updateViscosityStats({
                nuMin,
                nuMax,
                nuMean: fluidCellCount > 0 ? nuSum / fluidCellCount : baseNu,
                tauMin,
                tauMax,
                tauMean: fluidCellCount > 0 ? tauSum / fluidCellCount : tau,
                rawTauMax,
                clampCount,
                fluidCellCount
            });

            // Swap buffers
            const t = this.f;
            this.f = this.f_tmp;
            this.f_tmp = t;
        }

        baseLatticeViscosity() {
            return Math.max(0.0, ((this.config && this.config.tau ? this.config.tau : 0.5) - 0.5) / 3.0);
        }

        updateViscosityStats(stepStats) {
            const prevTotal = this.stats.effectiveViscosity ? this.stats.effectiveViscosity.totalTauClampCount : 0;
            const nu = this.baseLatticeViscosity();
            const fallbackTau = this.config ? this.config.tau : 0.5;
            const cellCount = stepStats.fluidCellCount || 0;
            this.stats.effectiveViscosity = {
                mode: this.mode,
                nuMin: Number.isFinite(stepStats.nuMin) ? stepStats.nuMin : nu,
                nuMax: Number.isFinite(stepStats.nuMax) ? stepStats.nuMax : nu,
                nuMean: Number.isFinite(stepStats.nuMean) ? stepStats.nuMean : nu,
                tauMin: Number.isFinite(stepStats.tauMin) ? stepStats.tauMin : fallbackTau,
                tauMax: Number.isFinite(stepStats.tauMax) ? stepStats.tauMax : fallbackTau,
                tauMean: Number.isFinite(stepStats.tauMean) ? stepStats.tauMean : fallbackTau,
                rawTauMax: Number.isFinite(stepStats.rawTauMax) ? stepStats.rawTauMax : fallbackTau,
                tauClampCount: stepStats.clampCount || 0,
                totalTauClampCount: prevTotal + (stepStats.clampCount || 0),
                lastStepClampCount: stepStats.clampCount || 0,
                cellCount,
                smagorinskyCs: this.lesSettings.smagorinskyCs,
                delta: this.lesSettings.delta
            };
        }

        computeStrainMagnitude(x, y, z, ux, uy, uz) {
            const s = this._lesSamples;
            const xp = this.sampleVelocityInto(x + 1, y, z, ux, uy, uz, s.xp);
            const xm = this.sampleVelocityInto(x - 1, y, z, ux, uy, uz, s.xm);
            const yp = this.sampleVelocityInto(x, y + 1, z, ux, uy, uz, s.yp);
            const ym = this.sampleVelocityInto(x, y - 1, z, ux, uy, uz, s.ym);
            const zp = this.sampleVelocityInto(x, y, z + 1, ux, uy, uz, s.zp);
            const zm = this.sampleVelocityInto(x, y, z - 1, ux, uy, uz, s.zm);
            const inv2d = 1.0 / (2.0 * this.lesSettings.delta);

            const dudx = (xp[0] - xm[0]) * inv2d;
            const dudy = (yp[0] - ym[0]) * inv2d;
            const dudz = (zp[0] - zm[0]) * inv2d;
            const dvdx = (xp[1] - xm[1]) * inv2d;
            const dvdy = (yp[1] - ym[1]) * inv2d;
            const dvdz = (zp[1] - zm[1]) * inv2d;
            const dwdx = (xp[2] - xm[2]) * inv2d;
            const dwdy = (yp[2] - ym[2]) * inv2d;
            const dwdz = (zp[2] - zm[2]) * inv2d;

            const sxx = dudx;
            const syy = dvdy;
            const szz = dwdz;
            const sxy = 0.5 * (dudy + dvdx);
            const sxz = 0.5 * (dudz + dwdx);
            const syz = 0.5 * (dvdz + dwdy);
            const s2 = sxx*sxx + syy*syy + szz*szz + 2.0 * (sxy*sxy + sxz*sxz + syz*syz);
            return Math.sqrt(Math.max(0.0, 2.0 * s2));
        }

        sampleVelocityInto(x, y, z, fallbackUx, fallbackUy, fallbackUz, out) {
            const [nx, ny, nz] = this.res;
            if (x < 0) x = nx - 1; else if (x >= nx) x = 0;
            if (y < 0) y = ny - 1; else if (y >= ny) y = 0;
            if (z < 0) z = nz - 1; else if (z >= nz) z = 0;

            const idx = x + nx * (y + ny * z);
            if (this.mask && this.mask[idx] > 0) {
                out[0] = 0; out[1] = 0; out[2] = 0;
                return out;
            }

            const base = idx * Q;
            let rho = 0, ux = 0, uy = 0, uz = 0;
            for (let q = 0; q < Q; q++) {
                const val = this.f[base + q];
                rho += val;
                ux += val * E[q][0];
                uy += val * E[q][1];
                uz += val * E[q][2];
            }
            if (rho <= 1e-12 || !Number.isFinite(rho)) {
                out[0] = fallbackUx; out[1] = fallbackUy; out[2] = fallbackUz;
                return out;
            }
            out[0] = ux / rho; out[1] = uy / rho; out[2] = uz / rho;
            return out;
        }

        /**
         * Enforces strict mass conservation by scaling distribution functions.
         */
        normalizeMass() {
            if (this.stats.initialMass <= 0) return;
            const currentMass = this.calculateTotalMass();
            if (currentMass <= 0) return;
            
            const drift = Math.abs(currentMass - this.stats.initialMass) / this.stats.initialMass;
            if (drift > 1e-6) {
                const scale = this.stats.initialMass / currentMass;
                for (let i = 0; i < this.f.length; i++) {
                    this.f[i] *= scale;
                }
                this.stats.mass = this.calculateTotalMass();
            }
        }

        updateTelemetry() {
            const [nx, ny, nz] = this.res;
            const count = nx * ny * nz;
            let totalMass = 0;
            let maxU2 = 0;
            let totalDensityDiff = 0;

            const currentRho = new Float32Array(count);

            for (let i = 0; i < count; i++) {
                const base = i * Q;
                let rho = 0, ux = 0, uy = 0, uz = 0;
                for (let q = 0; q < Q; q++) {
                    const v = this.f[base + q];
                    rho += v;
                    ux += v * E[q][0]; uy += v * E[q][1]; uz += v * E[q][2];
                }
                
                currentRho[i] = rho;
                totalMass += rho;
                if (rho > 0) {
                    const u2 = (ux*ux + uy*uy + uz*uz) / (rho*rho);
                    maxU2 = Math.max(maxU2, u2);
                }

                if (this.stats.rho_prev) {
                    totalDensityDiff += Math.abs(rho - this.stats.rho_prev[i]);
                }
            }

            this.stats.mass = totalMass;
            this.stats.maxVel = Math.sqrt(maxU2);
            this.stats.maxResidual = totalDensityDiff / count; // MADD Formula
            this.stats.rho_prev = currentRho;
        }

        async getBufferHash() {
            const hashBuffer = await crypto.subtle.digest('SHA-256', this.f.buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        calculateTotalMass() {
            let m = 0;
            for (let i = 0; i < this.f.length; i++) m += this.f[i];
            return m; 
        }

        getDiagnostics() {
            const massDrift = this.stats.initialMass > 0 ? 
                Math.abs(this.stats.mass - this.stats.initialMass) / this.stats.initialMass : 0;
            
            const rawForces = { x: this.stats.forceX, y: this.stats.forceY, z: this.stats.forceZ };
            const coeffs = (window.WindSimCoefficients && this.config.refArea > 0) 
                ? WindSimCoefficients.CoefficientCalculator.calculate(rawForces, this.config)
                : null;

            return {
                iteration: this.stats.iteration,
                massConservation: 1.0 - massDrift,
                massDrift: massDrift,
                maxVelocity: this.stats.maxVel,
                maxResidual: this.stats.maxResidual,
                forceX: this.stats.forceX,
                forceY: this.stats.forceY,
                forceZ: this.stats.forceZ,
                mode: this.mode,
                solverMode: this.mode,
                effectiveViscosity: { ...this.stats.effectiveViscosity },
                coefficients: coeffs,
                isDiverged: isNaN(this.stats.mass) || !isFinite(this.stats.mass) || massDrift > 0.05
            };
        }

        getFieldBuffers() {
            const [nx, ny, nz] = this.res;
            const count = nx * ny * nz;
            const rhoArr = new Float32Array(count);
            const velArr = new Float32Array(count * 3);
            const presArr = new Float32Array(count);

            for (let i = 0; i < count; i++) {
                const base = i * Q;
                let rho = 0, ux = 0, uy = 0, uz = 0;
                for (let q = 0; q < Q; q++) {
                    const v = this.f[base + q];
                    rho += v;
                    ux += v * E[q][0]; uy += v * E[q][1]; uz += v * E[q][2];
                }
                rhoArr[i] = rho;
                presArr[i] = (rho - 1.0) / 3.0; // Linearized pressure

                // Solid cells: zero velocity and pressure (bounce-back artifacts)
                if (this.mask && this.mask[i] > 0) {
                    velArr[i*3] = 0; velArr[i*3+1] = 0; velArr[i*3+2] = 0;
                    presArr[i] = 0;
                } else if (rho > 0) {
                    velArr[i*3] = ux/rho; velArr[i*3+1] = uy/rho; velArr[i*3+2] = uz/rho;
                }
            }
            return { mass: rhoArr, momentum: velArr, pressure: presArr };
        }

        getMask() {
            return this.mask;
        }

        pause() {}
        resume() {}
        reset() {
            this.isInitialized = false;
        }

        /**
         * Persistence: Serializing state
         * We only serialize macroscopic fields to save space, then reconstruct equilibrium on reload.
         */
        getStateSnapshot() {
            return {
                res: this.res,
                config: { ...this.config },
                iteration: this.stats.iteration,
                initialMass: this.stats.initialMass,
                f: Array.from(this.f) 
            };
        }

        loadStateSnapshot(snapshot) {
            this.res = snapshot.res;
            this.config = snapshot.config || { tau: 0.8 };
            this.domainSize = this.config.domainSize || this.res;
            this.configureMode(this.config);
            this.stats.iteration = snapshot.iteration;
            this.stats.initialMass = snapshot.initialMass;
            
            const [nx, ny, nz] = this.res;
            const size = nx * ny * nz * Q;
            this.f = new Float32Array(snapshot.f);
            this.f_tmp = new Float32Array(size);
            const nu = this.baseLatticeViscosity();
            this.stats.effectiveViscosity = this.createViscosityStats(this.mode, nu, this.config.tau);
            this.stats.effectiveViscosity.smagorinskyCs = this.lesSettings.smagorinskyCs;
            this.stats.effectiveViscosity.delta = this.lesSettings.delta;
            this.isInitialized = true;
        }
    }

    window.WindSimSolver = {
        LBMSolver: LBMSolver,
        SOLVER_MODES: SOLVER_MODES
    };

})();
