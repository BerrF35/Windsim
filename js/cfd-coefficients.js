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
         * Derives lattice-to-physical mapping scales.
         * @param {Object} config {domainSize(m), resolution(lu), uLattice(lu/ts), uPhysical(m/s), rhoPhysical(kg/m3)}
         */
        static deriveScales(config) {
            const { domainSize, resolution, uLattice, uPhysical = 10.0, rhoPhysical = 1.225 } = config;
            
            // Length scale (meters per lattice unit)
            // Assuming cubic cells, we can use the X-axis for scaling
            const dx = domainSize[0] / resolution[0];
            
            // Velocity scale (meters/sec per lattice unit/ts)
            const cu = uPhysical / uLattice;
            
            // Time scale (seconds per timestep)
            const dt = dx / cu;
            
            // Density scale (kg/m3 per lattice density)
            // LBM density is typically around 1.0
            const crho = rhoPhysical / 1.0;
            
            // Force scale (Newtons per lattice force)
            // F = m * a = (rho * L^3) * (L / T^2) = rho * L^4 / T^2 = rho * (L/T)^2 * L^2
            // CF = C_rho * C_u^2 * dx^2
            const cf = crho * (cu * cu) * (dx * dx);

            return {
                physicalGeometryScale: dx,
                latticeSpacing: dx,
                timestep: dt,
                densityScale: crho,
                velocityScale: cu,
                forceScale: cf,
                uPhysical: uPhysical,
                rhoPhysical: rhoPhysical
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

            if (refArea > 0 && dynPressure > 0) {
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
