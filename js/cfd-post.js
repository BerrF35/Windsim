/**
 * WindSim CFD — Post-Processing & Visualization (Phase D)
 * 
 * Logic for field sampling, streamlines (RK4), cut-planes, and surface mapping.
 * Derived directly from solver FieldBuffers for ground-truth accuracy.
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
        constructor(res, domainAABB, fieldBuffers) {
            this.res = res; // [nx, ny, nz]
            this.aabb = domainAABB;
            this.fields = fieldBuffers;
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
         * Trilinear interpolation for field sampling
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
         * Generates a cut-plane mesh
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
            
            const tempPos = new THREE.Vector3();
            for (let i = 0; i < positions.length; i += 3) {
                tempPos.set(positions[i], positions[i+1], positions[i+2]);
                const val = this.sampleField(tempPos, fieldType);
                const t = THREE.MathUtils.clamp((val - range.min) / (range.max - range.min), 0, 1);
                const color = cm(t);
                colors[i] = color.r;
                colors[i+1] = color.g;
                colors[i+2] = color.b;
            }

            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const material = new THREE.MeshBasicMaterial({ 
                vertexColors: true, 
                side: THREE.DoubleSide, 
                transparent: true, 
                opacity: 0.4,
                depthWrite: false,
                depthTest: true
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 1;
            return mesh;
        }

        /**
         * Streamline generation via RK4
         */
        createStreamlines(seeds, settings = {}) {
            const { 
                maxSteps = 500, 
                stepSize = 0.15, 
                colormapName = 'viridis', 
                range = { min: 0, max: 0.12 },
                fieldType = 'velocity_mag'
            } = settings;

            const cm = this.getColormap(colormapName);
            const linePositions = [];
            const lineColors = [];
            
            // Dynamic Step Size: 0.5 * voxel size
            const h = Math.min(...this.vSize);
            const actualStepSize = settings.stepSize || (h * 1.0);
            
            let totalTraveled = 0;
            let totalSegments = 0;

            for (let i = 0; i < seeds.length; i++) {
                const seed = seeds[i];
                let currentPos = new THREE.Vector3().copy(seed);
                let streamLength = 0;
                let streamSteps = 0;

                for (let s = 0; s < maxSteps; s++) {
                    const v_lu = this.sampleField(currentPos, 'velocity');
                    if (v_lu.lengthSq() < 1e-10) break;

                    // Physical Scaling: Convert LBM lu/ts to m/ts by multiplying by voxel size h (m)
                    // Then multiply by integration stepSize (multiplier of ts)
                    const v1 = v_lu.clone().multiplyScalar(h).multiplyScalar(actualStepSize);
                    
                    // RK4 Integration (using scaled velocities)
                    const k1 = v1;
                    
                    const p2 = currentPos.clone().addScaledVector(k1, 0.5);
                    const k2 = this.sampleField(p2, 'velocity').multiplyScalar(h).multiplyScalar(actualStepSize);
                    
                    const p3 = currentPos.clone().addScaledVector(k2, 0.5);
                    const k3 = this.sampleField(p3, 'velocity').multiplyScalar(h).multiplyScalar(actualStepSize);
                    
                    const p4 = currentPos.clone().add(k3);
                    const k4 = this.sampleField(p4, 'velocity').multiplyScalar(h).multiplyScalar(actualStepSize);
                    
                    const delta = k1.clone().addScaledVector(k2, 2).addScaledVector(k3, 2).add(k4).multiplyScalar(1/6);
                    const nextPos = currentPos.clone().add(delta);

                    // Check boundaries
                    if (nextPos.x < this.aabb.min[0] || nextPos.x > this.aabb.max[0] ||
                        nextPos.y < this.aabb.min[1] || nextPos.y > this.aabb.max[1] ||
                        nextPos.z < this.aabb.min[2] || nextPos.z > this.aabb.max[2]) break;

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
                    currentPos.copy(nextPos);
                }
                totalTraveled += streamLength;
                totalSegments += streamSteps;
            }

            console.log(`[Phase D] Streamlines: Generated ${seeds.length} paths, Avg Length: ${(totalTraveled/seeds.length).toFixed(3)}m, Total Segments: ${totalSegments}`);

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
            const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 }));
            lines.renderOrder = 2;
            return lines;
        }

        /**
         * Surface Mapping
         */
        mapSurface(mesh, fieldType, colormapName, range) {
            const cm = this.getColormap(colormapName);
            const geometry = mesh.geometry;
            const positions = geometry.attributes.position.array;
            const colors = new Float32Array(positions.length);
            
            const worldPos = new THREE.Vector3();
            const matrixWorld = mesh.matrixWorld;

            for (let i = 0; i < positions.length; i += 3) {
                worldPos.set(positions[i], positions[i+1], positions[i+2]).applyMatrix4(matrixWorld);
                const val = this.sampleField(worldPos, fieldType);
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
        }
    }

    window.WindSimPost = {
        PostProcessor,
        COLORMAPS
    };

})();
