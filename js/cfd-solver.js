/**
 * WindSim CFD — Solver Core (Phase C)
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

    class LBMSolver {
        constructor() {
            this.res = [0, 0, 0];
            this.config = null;
            this.f = null;     // Current distribution
            this.f_tmp = null; // Temp distribution for streaming
            this.mask = null;
            this.stats = {
                iteration: 0,
                mass: 0,
                maxVel: 0,
                maxResidual: 0,
                initialMass: 0,
                rho_prev: null // Cache for residual calculation
            };
            this.isInitialized = false;
        }

        /**
         * ISolverKernel implementation
         */
        init(domainSize, resolution, config, voxelMask) {
            const [nx, ny, nz] = resolution;
            this.res = resolution;
            this.config = config;
            this.mask = voxelMask;

            const size = nx * ny * nz * Q;
            this.f = new Float32Array(size);
            this.f_tmp = new Float32Array(size);

            // Initial condition: Equilibrium with density 1.0 and zero velocity
            const u0 = [0, 0, 0];
            const rho0 = 1.0;
            
            for (let i = 0; i < nx * ny * nz; i++) {
                this.setEquilibrium(i, rho0, u0);
            }

            this.stats.iteration = 0;
            this.stats.initialMass = this.calculateTotalMass();
            this.stats.mass = this.stats.initialMass;
            this.isInitialized = true;
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
            
            const start = performance.now();
            for (let s = 0; s < numSubSteps; s++) {
                this.collisionAndStreaming();
                this.stats.iteration++;
            }
            const time = performance.now() - start;

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
            const omega = 1.0 / tau;
            
            // 1. Collision + Streaming to f_tmp
            for (let x = 0; x < nx; x++) {
                for (let y = 0; y < ny; y++) {
                    for (let z = 0; z < nz; z++) {
                        const idx = x + nx * (y + ny * z);
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

                        // Apply Boundary Conditions at Inlet (Z-min example, depends on config)
                        // Simplified for now: fixed inlet on one side if config says so
                        if (this.config.inletDir === '+x' && x === 0) {
                            ux = this.config.inletSpeed; uy = 0; uz = 0;
                            rho = 1.0; // Fixed density inlet
                        }

                        const u2 = ux*ux + uy*uy + uz*uz;

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
                            } else {
                                this.f_tmp[targetBase + q] = f_post;
                            }
                        }
                    }
                }
            }

            // Swap buffers
            const t = this.f;
            this.f = this.f_tmp;
            this.f_tmp = t;
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
            
            return {
                iteration: this.stats.iteration,
                massConservation: 1.0 - massDrift,
                massDrift: massDrift,
                maxVelocity: this.stats.maxVel,
                maxResidual: this.stats.maxResidual,
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
                if (rho > 0) {
                    velArr[i*3] = ux/rho; velArr[i*3+1] = uy/rho; velArr[i*3+2] = uz/rho;
                }
            }
            return { mass: rhoArr, momentum: velArr, pressure: presArr };
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
                iteration: this.stats.iteration,
                initialMass: this.stats.initialMass,
                f: Array.from(this.f) // Full buffer for bitwise recovery
            };
        }

        loadStateSnapshot(snapshot) {
            const [nx, ny, nz] = snapshot.res;
            this.res = snapshot.res;
            this.stats.iteration = snapshot.iteration;
            this.stats.initialMass = snapshot.initialMass;
            
            const size = nx * ny * nz * Q;
            this.f = new Float32Array(snapshot.f);
            this.f_tmp = new Float32Array(size);
            this.isInitialized = true;
        }
    }

    window.WindSimSolver = {
        LBMSolver: LBMSolver
    };

})();
