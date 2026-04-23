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
         * @param {Object} config {uLattice, tau, uPhysical, rhoPhysical, nuPhysical, charLengthPhys, charLengthLat, inletDir, meshType}
         */
        static deriveScales(config) {
            const { 
                uLattice, tau,
                uPhysical = 10.0, rhoPhysical = 1.225, nuPhysical = 1.5e-5,
                charLengthPhys, charLengthLat, inletDir, meshType
            } = config;
            
            if (!charLengthPhys || !charLengthLat) {
                return {
                    isFullyCalibrated: false,
                    status: 'MISMATCH',
                    reason: 'Incomplete Metadata (Missing Char Length)',
                    forceScale: 0, velocityScale: 0, densityScale: 0,
                    Re_target: 0, Re_actual: 0
                };
            }

            // 1. Target Physical Reynolds Number (Object-based)
            const Re_target = (uPhysical * charLengthPhys) / nuPhysical;

            // 2. Actual Lattice Reynolds Number (Object-based)
            const nu_lattice = (tau - 0.5) / 3.0;
            const Re_actual = (uLattice * charLengthLat) / nu_lattice;

            // 3. Evaluate Status
            let status = 'MISMATCH';
            let reason = 'Reynolds Mismatch';
            let isFullyCalibrated = false;

            const reRatio = Re_actual / Re_target;
            const diffPercent = Math.abs(Re_actual - Re_target) / Re_target;

            if (diffPercent <= 0.05) {
                status = 'MATCH';
                reason = 'Reynolds Consistent (within 5%)';
                isFullyCalibrated = true;
            } else if (reRatio >= 0.1 && reRatio <= 10.0) {
                status = 'NEAR';
                reason = 'Reynolds Same-Order (Partial Match)';
            } else {
                status = 'MISMATCH';
                reason = 'Reynolds Order-of-Magnitude Mismatch';
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
                status,
                reason,
                isFullyCalibrated,
                Re_target,
                Re_actual,
                nu_lattice,
                nuPhysical,
                uLattice,
                uPhysical,
                rhoPhysical,
                rhoLattice: 1.0,
                dx,
                dt,
                forceScale: cf,
                velocityScale: cu,
                densityScale: crho,
                charLengthPhys,
                charLengthLat,
                inletDir,
                meshType,
                worldAxes: { lift: 'Y', vertical: 'Y' }
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
         * @param {string} meshType Type of mesh for L rule selection
         * @returns {Object} {area, charLengthPhys, charLengthLat, rule}
         */
        static computeGeometryMetadata(mask, resolution, domainSize, direction, meshType = 'other') {
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

            if (!found) return { area: 0, charLengthPhys: 0, charLengthLat: 0, rule: 'none' };

            // 1. Calculate bounding dimensions
            const dimLat = {
                x: maxI - minI + 1,
                y: maxJ - minJ + 1,
                z: maxK - minK + 1
            };
            const dimPhys = {
                x: dimLat.x * dx,
                y: dimLat.y * dy,
                z: dimLat.z * dz
            };

            // 2. Select characteristic length based on rules
            let charLengthLat = 0;
            let charLengthPhys = 0;
            let rule = 'main_body';

            if (meshType === 'sphere') {
                // Sphere uses diameter (dimension perp to flow, or any dimension)
                charLengthLat = Math.max(dimLat.x, dimLat.y, dimLat.z);
                charLengthPhys = charLengthLat * Math.max(dx, dy, dz);
                rule = 'diameter';
            } else if (meshType === 'airfoil') {
                // Airfoil uses chord (dimension along flow)
                if (direction === '+x' || direction === '-x') {
                    charLengthLat = dimLat.x;
                    charLengthPhys = dimPhys.x;
                } else {
                    charLengthLat = dimLat.z;
                    charLengthPhys = dimPhys.z;
                }
                rule = 'chord';
            } else {
                // Default: main body length (max bounding dimension)
                charLengthLat = Math.max(dimLat.x, dimLat.y, dimLat.z);
                charLengthPhys = Math.max(dimPhys.x, dimPhys.y, dimPhys.z);
                rule = 'main_body';
            }

            // 3. Compute projected area
            let areaCount = 0;
            let area = 0;
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
                        if (hit) areaCount++;
                    }
                }
                area = areaCount * dy * dz;
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
                        if (hit) areaCount++;
                    }
                }
                area = areaCount * dx * dy;
            }

            return { area, charLengthPhys, charLengthLat, rule };
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
            
            // Derive unit mapping and status
            const cal = WindSimCalibration.deriveScales(config);
            
            // Map raw lattice forces to drag/lift/side
            const latticeMapped = this.mapForces(rawForces, inletDir);
            
            // Convert to physical forces (Newtons)
            const physicalForces = {
                drag: latticeMapped.drag * cal.forceScale,
                lift: latticeMapped.lift * cal.forceScale,
                side: latticeMapped.side * cal.forceScale
            };

            // Physical dynamic pressure (q = 0.5 * rho * U^2) in Pascals
            const dynPressure = 0.5 * cal.rhoPhysical * (cal.uPhysical ** 2);

            const result = {
                dragForce: physicalForces.drag,
                liftForce: physicalForces.lift,
                sideForce: physicalForces.side,
                
                rawDrag: latticeMapped.drag,
                rawLift: latticeMapped.lift,
                rawSide: latticeMapped.side,
                
                cd: null, cl: null, cs: null,
                
                dynamicPressure: dynPressure,
                refArea: refArea,
                mapping: latticeMapped.mapping,
                calibration: cal
            };

            // Gating: Only compute coefficients if status is MATCH
            if (cal.status === 'MATCH' && refArea > 0 && dynPressure > 0) {
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
