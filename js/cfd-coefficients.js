/**
 * WindSim CFD — Aerodynamic Coefficients Module (Phase C)
 * 
 * Provides utilities for calculating Drag, Lift, and Side coefficients
 * from raw Momentum Exchange Method (MEM) force vectors, using explicit
 * physical unit calibration.
 */
(function () {
    'use strict';

    class WindSimCalibration {
        /**
         * Derives lattice-to-physical mapping scales and computes Reynolds consistency.
         * @param {Object} config {uLattice, tau, uPhysical, rhoPhysical, nuPhysical, charLengthPhys, charLengthLat}
         */
        static deriveScales(config) {
            const { 
                uLattice, tau,
                uPhysical = 10.0, rhoPhysical = 1.225, nuPhysical = 1.5e-5,
                charLengthPhys, charLengthLat
            } = config;
            
            if (!charLengthPhys || !charLengthLat) {
                return {
                    isFullyCalibrated: false,
                    calibrationReason: 'Incomplete Metadata (Missing Char Length)',
                    forceScale: 0, velocityScale: 0, densityScale: 0,
                    Re_target: 0, Re_actual: 0
                };
            }

            // 1. Target Physical Reynolds Number (Object-based)
            const Re_target = (uPhysical * charLengthPhys) / nuPhysical;

            // 2. Actual Lattice Reynolds Number (Object-based)
            const nu_lattice = (tau - 0.5) / 3.0;
            const Re_actual = (uLattice * charLengthLat) / nu_lattice;

            // 3. Evaluate Match (tolerance 5%)
            let isFullyCalibrated = true;
            let calibrationReason = 'Fully Calibrated';
            
            const reRatio = Math.abs(Re_actual - Re_target) / Re_target;
            if (reRatio > 0.05) {
                isFullyCalibrated = false;
                calibrationReason = 'Partially Calibrated (Reynolds Mismatch)';
            }

            // Physical dx (meters per lattice unit)
            const dx = charLengthPhys / charLengthLat;
            
            // Velocity scale (m/s per lu/ts)
            const cu = uPhysical / uLattice;
            
            // Time scale (seconds per timestep)
            const dt = dx / cu;
            
            // Density scale (kg/m3 per lattice density)
            const crho = rhoPhysical / 1.0;
            
            // Force scale (Newtons per lattice force)
            // F_p = F_l * crho * cu^2 * dx^2 (for 3D force scaling)
            const cf = crho * (cu * cu) * (dx * dx);

            return {
                strategy: 'Object-based Reynolds Matching',
                isFullyCalibrated,
                calibrationReason,
                Re_target,
                Re_actual,
                nu_lattice,
                nuPhysical,
                uLattice,
                uPhysical,
                rhoPhysical,
                dx,
                dt,
                forceScale: cf,
                velocityScale: cu,
                densityScale: crho,
                charLengthPhys,
                charLengthLat
            };
        }
    }

    class CoefficientCalculator {
        /**
         * Computes geometric metadata (projected area and characteristic length).
         * @param {Uint8Array} mask Voxel mask
         * @param {number[]} resolution [nx, ny, nz]
         * @param {number[]} domainSize [sx, sy, sz]
         * @param {string} direction Inlet direction ('+x', '-x', '+z', '-z')
         * @returns {Object} {area, charLengthPhys, charLengthLat}
         */
        static computeGeometryMetadata(mask, resolution, domainSize, direction) {
            const [nx, ny, nz] = resolution;
            const [sx, sy, sz] = domainSize;
            const dx = sx / nx;
            const dy = sy / ny;
            const dz = sz / nz;

            let count = 0;
            let minI = nx, maxI = -1, minJ = ny, maxJ = -1, minK = nz, maxK = -1;
            let found = false;

            for (let i = 0; i < nx; i++) {
                for (let j = 0; j < ny; j++) {
                    for (let k = 0; k < nz; k++) {
                        if (mask[i + nx * (j + ny * k)] > 0) {
                            if (i < minI) minI = i; if (i > maxI) maxI = i;
                            if (j < minJ) minJ = j; if (j > maxJ) maxJ = j;
                            if (k < minK) minK = k; if (k > maxK) maxK = k;
                            found = true;
                        }
                    }
                }
            }

            if (!found) return { area: 0, charLengthPhys: 0, charLengthLat: 0 };

            let area = 0;
            let charLengthLat = 0;
            let charLengthPhys = 0;

            if (direction === '+x' || direction === '-x') {
                for (let j = 0; j < ny; j++) {
                    for (let k = 0; k < nz; k++) {
                        let hit = false;
                        for (let i = 0; i < nx; i++) {
                            if (mask[i + nx * (j + ny * k)] > 0) {
                                hit = true;
                                break;
                            }
                        }
                        if (hit) count++;
                    }
                }
                area = count * dy * dz;
                // For flow along X, characteristic length is typically X-dimension (chord)
                charLengthLat = (maxI - minI + 1);
                charLengthPhys = charLengthLat * dx;
            } else if (direction === '+z' || direction === '-z') {
                for (let i = 0; i < nx; i++) {
                    for (let j = 0; j < ny; j++) {
                        let hit = false;
                        for (let k = 0; k < nz; k++) {
                            if (mask[i + nx * (j + ny * k)] > 0) {
                                hit = true;
                                break;
                            }
                        }
                        if (hit) count++;
                    }
                }
                area = count * dx * dy;
                // For flow along Z, characteristic length is typically Z-dimension
                charLengthLat = (maxK - minK + 1);
                charLengthPhys = charLengthLat * dz;
            }

            return { area, charLengthPhys, charLengthLat };
        }

        /**
         * Maps raw force vectors to Drag, Lift, and Side components.
         * Convention: Lift is vertical (Y), Drag opposes flow, Side is orthogonal.
         */
        static mapForces(rawForces, direction) {
            const { x, y, z } = rawForces;
            let drag = 0, lift = y, side = 0;
            let mapping = { drag: '', lift: 'Fy', side: '' };

            switch (direction) {
                case '+x':
                    drag = x; side = z;
                    mapping.drag = 'Fx'; mapping.side = 'Fz';
                    break;
                case '-x':
                    drag = -x; side = -z;
                    mapping.drag = '-Fx'; mapping.side = '-Fz';
                    break;
                case '+z':
                    drag = z; side = -x;
                    mapping.drag = 'Fz'; mapping.side = '-Fx';
                    break;
                case '-z':
                    drag = -z; side = x;
                    mapping.drag = '-Fz'; mapping.side = 'Fx';
                    break;
            }

            return { drag, lift, side, mapping };
        }

        /**
         * Computes physically calibrated forces and coefficients.
         * @param {Object} rawForces {x, y, z}
         * @param {Object} config Contains calibration inputs and refArea
         * @returns {Object} Physical forces, coefficients, and calibration metadata
         */
        static calculate(rawForces, config) {
            const { inletDir, refArea } = config;
            
            // Derive unit mapping
            const scales = WindSimCalibration.deriveScales(config);
            
            // Map raw lattice forces to drag/lift/side
            const latticeMapped = this.mapForces(rawForces, inletDir);
            
            // Convert to physical forces (Newtons)
            const physicalForces = {
                drag: latticeMapped.drag * scales.forceScale,
                lift: latticeMapped.lift * scales.forceScale,
                side: latticeMapped.side * scales.forceScale
            };

            // Physical dynamic pressure (q = 0.5 * rho * U^2) in Pascals
            const dynPressure = 0.5 * scales.rhoPhysical * (scales.uPhysical ** 2);

            const result = {
                // Return physical forces
                dragForce: physicalForces.drag,
                liftForce: physicalForces.lift,
                sideForce: physicalForces.side,
                
                // Keep raw forces available for transparency
                rawDrag: latticeMapped.drag,
                rawLift: latticeMapped.lift,
                rawSide: latticeMapped.side,
                
                cd: null, cl: null, cs: null,
                
                dynamicPressure: dynPressure,
                refArea: refArea,
                mapping: latticeMapped.mapping,
                calibration: scales
            };

            // Only compute physical coefficients if the calibration is fully consistent
            if (scales.isFullyCalibrated && refArea > 0 && dynPressure > 0) {
                result.cd = physicalForces.drag / (dynPressure * refArea);
                result.cl = physicalForces.lift / (dynPressure * refArea);
                result.cs = physicalForces.side / (dynPressure * refArea);
            }

            return result;
        }
    }

    window.WindSimCoefficients = {
        CoefficientCalculator,
        WindSimCalibration
    };
})();
