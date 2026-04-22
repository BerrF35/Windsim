/**
 * WindSim CFD — Post-Processing & Visualization (Phase D)
 * Phase D / Post layer enforcing strict mapping, no fake fields, and solid mask bounds.
 * 
 * Logic for field sampling, streamlines (RK4), cut-planes, and surface mapping.
 * Derived directly from solver FieldBuffers for ground-truth accuracy.
 * 
 * All sampling respects the solid voxel mask.
 * Streamlines terminate on solid entry, low speed, or domain exit.
 */
(function () {
    'use strict';

    const COLORMAPS = {
        coolwarm: (t) => {
            // Diverging Red-Blue
            const r = t < 0.5 ? 0.2 + 1.6 * t : 1.0;
            const g = t < 0.5 ? 0.2 + 1.6 * t : 1.2 - 1.6 * (t - 0.5);
            const b = t < 0.5 ? 1.0 : 1.2 - 1.6 * (t - 0.5);
            return new THREE.Color(r, g, b);
        },
        viridis: (t) => {
            // Simplified Viridis
            return new THREE.Color().setHSL(0.8 - t * 0.8, 0.8, 0.5);
        },
        jet: (t) => {
            const r = t < 0.7 ? (t < 0.3 ? 0 : 4 * t - 1.2) : 1;
            const g = t < 0.5 ? (t < 0.1 ? 0 : 4 * t - 0.4) : (t < 0.9 ? 1 : -4 * t + 4.6);
            const b = t < 0.3 ? (t < -0.1 ? 0 : 4 * t + 0.4) : (t < 0.7 ? 1 : -4 * t + 3.8);
            return new THREE.Color(r, g, b);
        },
        grayscale: (t) => new THREE.Color(t, t, t)
    };

    class PostProcessor {
        /**
         * @param {number[]} res - [nx, ny, nz]
         * @param {Object} domainAABB - { min: [x,y,z], max: [x,y,z] }
         * @param {Object} fieldBuffers - { mass, momentum, pressure }
         * @param {Uint8Array|null} voxelMask - solid mask (0=fluid, 1=surface, 2=interior)
         */
        constructor(res, domainAABB, fieldBuffers, voxelMask) {
            this.res = res; // [nx, ny, nz]
            this.aabb = domainAABB;
            this.fields = fieldBuffers;
            this.mask = voxelMask || null;
            this.vSize = [
                (domainAABB.max[0] - domainAABB.min[0]) / res[0],
                (domainAABB.max[1] - domainAABB.min[1]) / res[1],
                (domainAABB.max[2] - domainAABB.min[2]) / res[2]
            ];
        }

        updateFields(newFields) {
            this.fields = newFields;
        }

        /**
         * Check if a grid cell (i,j,k) is solid.
         */
        isSolidCell(i, j, k) {
            if (!this.mask) return false;
            const [nx, ny, nz] = this.res;
            if (i < 0 || i >= nx || j < 0 || j >= ny || k < 0 || k >= nz) return false;
            const idx = i + nx * (j + ny * k);
            return this.mask[idx] > 0;
        }

        /**
         * Check if a world position falls inside a solid voxel.
         */
        isSolid(pos) {
            const [nx, ny, nz] = this.res;
            const { min } = this.aabb;
            const gi = Math.floor((pos.x - min[0]) / this.vSize[0]);
            const gj = Math.floor((pos.y - min[1]) / this.vSize[1]);
            const gk = Math.floor((pos.z - min[2]) / this.vSize[2]);
            return this.isSolidCell(gi, gj, gk);
        }

        /**
         * Trilinear interpolation for field sampling.
         * Respects solid mask: if any of the 8 interpolation neighbors is solid,
         * only fluid neighbors contribute (inverse-distance weighted fallback).
         */
        sampleField(pos, type = 'pressure') {
            const [nx, ny, nz] = this.res;
            const { min } = this.aabb;
            
            // Convert world pos to grid pos
            let gx = (pos.x - min[0]) / this.vSize[0] - 0.5;
            let gy = (pos.y - min[1]) / this.vSize[1] - 0.5;
            let gz = (pos.z - min[2]) / this.vSize[2] - 0.5;

            // Clamping to ensure we always sample valid interior or boundary cells
            gx = THREE.MathUtils.clamp(gx, 0, nx - 1.001);
            gy = THREE.MathUtils.clamp(gy, 0, ny - 1.001);
            gz = THREE.MathUtils.clamp(gz, 0, nz - 1.001);

            const i0 = Math.floor(gx), i1 = i0 + 1;
            const j0 = Math.floor(gy), j1 = j0 + 1;
            const k0 = Math.floor(gz), k1 = k0 + 1;

            const tx = gx - i0, ty = gy - j0, tz = gz - k0;

            const getVal = (i, j, k) => {
                const idx = i + nx * (j + ny * k);
                if (type === 'pressure') return this.fields.pressure[idx];
                if (type === 'velocity') {
                    const b = idx * 3;
                    return new THREE.Vector3(this.fields.momentum[b], this.fields.momentum[b+1], this.fields.momentum[b+2]);
                }
                if (type === 'velocity_mag') {
                    const b = idx * 3;
                    const vx = this.fields.momentum[b], vy = this.fields.momentum[b+1], vz = this.fields.momentum[b+2];
                    return Math.sqrt(vx*vx + vy*vy + vz*vz);
                }
                return 0;
            };

            // Check if any of the 8 corners is solid
            const corners = [
                [i0, j0, k0], [i1, j0, k0], [i0, j1, k0], [i1, j1, k0],
                [i0, j0, k1], [i1, j0, k1], [i0, j1, k1], [i1, j1, k1]
            ];
            const weights = [
                (1-tx)*(1-ty)*(1-tz), tx*(1-ty)*(1-tz), (1-tx)*ty*(1-tz), tx*ty*(1-tz),
                (1-tx)*(1-ty)*tz, tx*(1-ty)*tz, (1-tx)*ty*tz, tx*ty*tz
            ];

            let hasSolid = false;
            if (this.mask) {
                for (let c = 0; c < 8; c++) {
                    if (this.isSolidCell(corners[c][0], corners[c][1], corners[c][2])) {
                        hasSolid = true;
                        break;
                    }
                }
            }

            if (hasSolid) {
                // Solid-aware sampling: only use fluid neighbors
                if (type === 'velocity') {
                    const result = new THREE.Vector3(0, 0, 0);
                    let totalW = 0;
                    for (let c = 0; c < 8; c++) {
                        if (!this.isSolidCell(corners[c][0], corners[c][1], corners[c][2])) {
                            const v = getVal(corners[c][0], corners[c][1], corners[c][2]);
                            result.addScaledVector(v, weights[c]);
                            totalW += weights[c];
                        }
                    }
                    if (totalW > 1e-12) result.multiplyScalar(1.0 / totalW);
                    return result;
                } else {
                    let result = 0;
                    let totalW = 0;
                    for (let c = 0; c < 8; c++) {
                        if (!this.isSolidCell(corners[c][0], corners[c][1], corners[c][2])) {
                            result += getVal(corners[c][0], corners[c][1], corners[c][2]) * weights[c];
                            totalW += weights[c];
                        }
                    }
                    return totalW > 1e-12 ? result / totalW : 0;
                }
            }

            // Standard trilinear interpolation (no solid neighbors)
            const v000 = getVal(i0, j0, k0);
            const v100 = getVal(i1, j0, k0);
            const v010 = getVal(i0, j1, k0);
            const v110 = getVal(i1, j1, k0);
            const v001 = getVal(i0, j0, k1);
            const v101 = getVal(i1, j0, k1);
            const v011 = getVal(i0, j1, k1);
            const v111 = getVal(i1, j1, k1);

            if (type === 'velocity') {
                const res = new THREE.Vector3();
                res.lerpVectors(v000, v100, tx);
                const res1 = new THREE.Vector3().lerpVectors(v010, v110, tx);
                res.lerp(res1, ty);
                const res2 = new THREE.Vector3().lerpVectors(v001, v101, tx);
                const res3 = new THREE.Vector3().lerpVectors(v011, v111, tx);
                const res_z = new THREE.Vector3().lerpVectors(res2, res3, ty);
                res.lerp(res_z, tz);
                return res;
            } else {
                const c00 = v000 * (1 - tx) + v100 * tx;
                const c10 = v010 * (1 - tx) + v110 * tx;
                const c01 = v001 * (1 - tx) + v101 * tx;
                const c11 = v011 * (1 - tx) + v111 * tx;
                const c0 = c00 * (1 - ty) + c10 * ty;
                const c1 = c01 * (1 - ty) + c11 * ty;
                return c0 * (1 - tz) + c1 * tz;
            }
        }

        getColormap(name) {
            return COLORMAPS[name] || COLORMAPS.coolwarm;
        }

        /**
         * Generates a cut-plane mesh.
         * Material: data-driven vertex colors, transparent, no self-emission.
         */
        createSlice(axis, pos, fieldType, colormapName, range) {
            const [nx, ny, nz] = this.res;
            const { min, max } = this.aabb;
            
            let geometry;
            let resolution = 64; // Visual resolution of the slice
            
            if (axis === 'x') {
                geometry = new THREE.PlaneGeometry(max[2] - min[2], max[1] - min[1], resolution, resolution);
                geometry.rotateY(Math.PI / 2);
                geometry.translate(pos, (min[1]+max[1])/2, (min[2]+max[2])/2);
            } else if (axis === 'y') {
                geometry = new THREE.PlaneGeometry(max[0] - min[0], max[2] - min[2], resolution, resolution);
                geometry.rotateX(-Math.PI / 2);
                geometry.translate((min[0]+max[0])/2, pos, (min[2]+max[2])/2);
            } else {
                geometry = new THREE.PlaneGeometry(max[0] - min[0], max[1] - min[1], resolution, resolution);
                geometry.translate((min[0]+max[0])/2, (min[1]+max[1])/2, pos);
            }

            const cm = this.getColormap(colormapName);
            const positions = geometry.attributes.position.array;
            const colors = new Float32Array(positions.length);
            
            // Track field min/max for diagnostics
            let fieldMin = Infinity, fieldMax = -Infinity;
            
            const tempPos = new THREE.Vector3();
            for (let i = 0; i < positions.length; i += 3) {
                tempPos.set(positions[i], positions[i+1], positions[i+2]);
                const val = this.sampleField(tempPos, fieldType);
                if (val < fieldMin) fieldMin = val;
                if (val > fieldMax) fieldMax = val;
                const t = THREE.MathUtils.clamp((val - range.min) / (range.max - range.min), 0, 1);
                const color = cm(t);
                colors[i] = color.r;
                colors[i+1] = color.g;
                colors[i+2] = color.b;
            }

            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            
            // Non-emissive, data-driven material
            const material = new THREE.MeshBasicMaterial({ 
                vertexColors: true, 
                side: THREE.DoubleSide, 
                transparent: true, 
                opacity: 0.55,
                depthWrite: false,
                depthTest: true
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 1;
            mesh.name = 'cfd-slice';
            
            console.log(`[PostD] Slice: axis=${axis} pos=${pos.toFixed(3)} field=${fieldType} fieldRange=[${fieldMin.toFixed(6)}, ${fieldMax.toFixed(6)}] mapRange=[${range.min.toFixed(6)}, ${range.max.toFixed(6)}]`);

            return mesh;
        }

        /**
         * Streamline generation via RK4.
         * Respects solid mask, deterministic seeding, proper termination.
         */
        createStreamlines(seeds, settings = {}) {
            const { 
                maxSteps = 500, 
                colormapName = 'viridis', 
                range = { min: 0, max: 0.12 },
                fieldType = 'velocity_mag'
            } = settings;

            const cm = this.getColormap(colormapName);
            const linePositions = [];
            const lineColors = [];
            
            // Integration step size for RK4.
            // Velocity from sampleField() is in lattice units (u_lu ~ 0.08 at inlet).
            // Each RK4 step displaces by approximately: u_lu * stepSize (world meters).
            // We want streamlines to span the domain (~6m) in the available maxSteps.
            // With u_lu=0.08 and stepSize=1.0: displacement ≈ 0.08m/step, 200 steps ≈ 16m.
            // Boundary termination naturally clips to domain extent.
            const h = Math.min(...this.vSize);
            const stepSize = 1.0;
            
            // Speed threshold for termination (in lattice units)
            const speedThreshold = 1e-4;
            
            let totalTraveled = 0;
            let totalSegments = 0;
            let solidTerminations = 0;
            let speedTerminations = 0;
            let boundaryTerminations = 0;
            let maxStepTerminations = 0;
            let firstStreamlineSteps = [];

            for (let i = 0; i < seeds.length; i++) {
                const seed = seeds[i];
                
                // Skip seeds that start inside solid
                if (this.isSolid(seed)) {
                    continue;
                }
                
                let currentPos = new THREE.Vector3().copy(seed);
                let streamLength = 0;
                let streamSteps = 0;
                let terminated = false;
                let terminationReason = 'max_steps';

                for (let s = 0; s < maxSteps; s++) {
                    const v_at_pos = this.sampleField(currentPos, 'velocity');
                    const speed = v_at_pos.length();
                    
                    if (speed < speedThreshold) {
                        terminationReason = 'low_speed';
                        terminated = true;
                        break;
                    }

                    // RK4 Integration
                    const k1 = v_at_pos.clone().multiplyScalar(stepSize);
                    
                    const p2 = currentPos.clone().addScaledVector(k1, 0.5);
                    if (this.isSolid(p2)) { terminationReason = 'solid'; terminated = true; break; }
                    const k2 = this.sampleField(p2, 'velocity').multiplyScalar(stepSize);
                    
                    const p3 = currentPos.clone().addScaledVector(k2, 0.5);
                    if (this.isSolid(p3)) { terminationReason = 'solid'; terminated = true; break; }
                    const k3 = this.sampleField(p3, 'velocity').multiplyScalar(stepSize);
                    
                    const p4 = currentPos.clone().add(k3);
                    if (this.isSolid(p4)) { terminationReason = 'solid'; terminated = true; break; }
                    const k4 = this.sampleField(p4, 'velocity').multiplyScalar(stepSize);
                    
                    const delta = k1.clone().addScaledVector(k2, 2).addScaledVector(k3, 2).add(k4).multiplyScalar(1/6);
                    const nextPos = currentPos.clone().add(delta);

                    // Check if next position is inside solid
                    if (this.isSolid(nextPos)) {
                        terminationReason = 'solid';
                        terminated = true;
                        break;
                    }

                    // Check domain boundaries
                    if (nextPos.x < this.aabb.min[0] || nextPos.x > this.aabb.max[0] ||
                        nextPos.y < this.aabb.min[1] || nextPos.y > this.aabb.max[1] ||
                        nextPos.z < this.aabb.min[2] || nextPos.z > this.aabb.max[2]) {
                        terminationReason = 'boundary';
                        terminated = true;
                        break;
                    }

                    // Segment: current -> next
                    linePositions.push(currentPos.x, currentPos.y, currentPos.z);
                    linePositions.push(nextPos.x, nextPos.y, nextPos.z);

                    const val = this.sampleField(currentPos, fieldType);
                    const t = THREE.MathUtils.clamp((val - range.min) / (range.max - range.min), 0, 1);
                    const color = cm(t);
                    lineColors.push(color.r, color.g, color.b);
                    lineColors.push(color.r, color.g, color.b);

                    const dist = currentPos.distanceTo(nextPos);
                    streamLength += dist;
                    streamSteps++;
                    
                    // Log first 5 steps of first streamline
                    if (i === 0 && s < 5) {
                        firstStreamlineSteps.push({
                            step: s,
                            pos: [currentPos.x.toFixed(4), currentPos.y.toFixed(4), currentPos.z.toFixed(4)],
                            vel: [v_at_pos.x.toFixed(6), v_at_pos.y.toFixed(6), v_at_pos.z.toFixed(6)],
                            speed: speed.toFixed(6)
                        });
                    }
                    
                    currentPos.copy(nextPos);
                }
                
                if (terminationReason === 'solid') solidTerminations++;
                else if (terminationReason === 'low_speed') speedTerminations++;
                else if (terminationReason === 'boundary') boundaryTerminations++;
                else maxStepTerminations++;
                
                totalTraveled += streamLength;
                totalSegments += streamSteps;
            }

            // Diagnostics
            const vertexCount = linePositions.length / 3;
            console.log(`[PostD] Streamlines: seeds=${seeds.length} stepSize=${stepSize.toFixed(4)} maxSteps=${maxSteps}`);
            console.log(`[PostD] Streamlines: totalSegments=${totalSegments} vertexCount=${vertexCount} avgLength=${(seeds.length > 0 ? totalTraveled/seeds.length : 0).toFixed(3)}m`);
            console.log(`[PostD] Terminations: solid=${solidTerminations} speed=${speedTerminations} boundary=${boundaryTerminations} maxSteps=${maxStepTerminations}`);
            if (firstStreamlineSteps.length > 0) {
                console.log(`[PostD] First streamline steps:`, firstStreamlineSteps);
            }
            if (solidTerminations > 0) {
                console.log(`[PostD] WARNING: ${solidTerminations} streamlines terminated by solid voxel contact`);
            }

            if (vertexCount === 0) {
                console.warn('[PostD] Streamlines produced ZERO geometry. Check field data and seed positions.');
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
            const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ 
                vertexColors: true, 
                transparent: true, 
                opacity: 0.7,
                depthWrite: false,
                depthTest: true
            }));
            lines.renderOrder = 2;
            lines.name = 'cfd-streamlines';
            
            // Attach diagnostics to the object for verification
            lines.userData.diagnostics = {
                seeds: seeds.length,
                totalSegments,
                vertexCount,
                avgLength: seeds.length > 0 ? totalTraveled / seeds.length : 0,
                solidTerminations,
                speedTerminations,
                boundaryTerminations,
                maxStepTerminations
            };

            return lines;
        }

        /**
         * Surface Mapping — vertex colors from field data.
         * Does NOT mutate solver state. Only sets vertex colors on the mesh geometry.
         */
        mapSurface(mesh, fieldType, colormapName, range) {
            const cm = this.getColormap(colormapName);
            const geometry = mesh.geometry;
            const positions = geometry.attributes.position.array;
            const colors = new Float32Array(positions.length);
            
            const worldPos = new THREE.Vector3();
            const matrixWorld = mesh.matrixWorld;

            let fieldMin = Infinity, fieldMax = -Infinity;

            for (let i = 0; i < positions.length; i += 3) {
                worldPos.set(positions[i], positions[i+1], positions[i+2]).applyMatrix4(matrixWorld);
                const val = this.sampleField(worldPos, fieldType);
                if (val < fieldMin) fieldMin = val;
                if (val > fieldMax) fieldMax = val;
                const t = THREE.MathUtils.clamp((val - range.min) / (range.max - range.min), 0, 1);
                const color = cm(t);
                colors[i] = color.r;
                colors[i+1] = color.g;
                colors[i+2] = color.b;
            }

            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            if (mesh.material) {
                mesh.material.vertexColors = true;
                mesh.material.needsUpdate = true;
            }
            
            console.log(`[PostD] Surface map: field=${fieldType} range=[${fieldMin.toFixed(6)}, ${fieldMax.toFixed(6)}]`);
        }
    }

    window.WindSimPost = {
        PostProcessor,
        COLORMAPS
    };

})();
