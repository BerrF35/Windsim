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
         * Strategy 2: Fixed Physical Geometry + Fixed Physical Viscosity + Fixed Physical Speed
         * @param {Object} config {domainSize(m), resolution(lu), uLattice, uPhysical, rhoPhysical, nuPhysical, tau}
         */
        static deriveScales(config) {
            const { 
                domainSize, resolution, 
                uLattice, tau,
                uPhysical = 10.0, rhoPhysical = 1.225, nuPhysical = 1.5e-5
            } = config;
            
            // Physical characteristic length (e.g., domain width)
            const L_pu = domainSize[0];
            const L_lu = resolution[0];

            // 1. Target Physical Reynolds Number
            const Re_target = (uPhysical * L_pu) / nuPhysical;

            // 2. Actual Lattice Reynolds Number
            const nu_lattice = (tau - 0.5) / 3.0;
            const Re_actual = (uLattice * L_lu) / nu_lattice;

            // 3. Evaluate Match (tolerance 5%)
            let isFullyCalibrated = true;
            let calibrationReason = 'Fully Calibrated';
            
            const reRatio = Math.abs(Re_actual - Re_target) / Re_target;
            if (reRatio > 0.05) {
                isFullyCalibrated = false;
                calibrationReason = 'Partially Calibrated (Reynolds Mismatch)';
            }

            // Length scale (meters per lattice unit)
            const dx = L_pu / L_lu;
            
            // Velocity scale (meters/sec per lattice unit/ts)
            const cu = uPhysical / uLattice;
            
            // Time scale (seconds per timestep)
            const dt = dx / cu;
            
            // Density scale (kg/m3 per lattice density)
            const crho = rhoPhysical / 1.0;
            
            // Force scale (Newtons per lattice force)
            const cf = crho * (cu * cu) * (dx * dx);

            return {
                strategy: 'Fixed Physical (Geometry, Viscosity, Speed)',
                isFullyCalibrated,
                calibrationReason,
                Re_target,
                Re_actual,
                nu_lattice,
                nuPhysical,
                uLattice,
                uPhysical,
                rhoPhysical,
                physicalGeometryScale: dx,
                latticeSpacing: dx,
                timestep: dt,
                densityScale: crho,
                velocityScale: cu,
                forceScale: cf
            };
        }
    }

    class CoefficientCalculator {
        /**
         * Computes the projected frontal area of the solid geometry.
         * @param {Uint8Array} mask Voxel mask
         * @param {number[]} resolution [nx, ny, nz]
         * @param {number[]} domainSize [sx, sy, sz]
         * @param {string} direction Inlet direction ('+x', '-x', '+z', '-z')
         * @returns {number} Projected area in square meters
         */
        static computeProjectedArea(mask, resolution, domainSize, direction) {
            const [nx, ny, nz] = resolution;
            const [sx, sy, sz] = domainSize;
            const dx = sx / nx;
            const dy = sy / ny;
            const dz = sz / nz;

            let count = 0;

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
                return count * dy * dz;
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
                return count * dx * dy;
            }

            return 0;
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
