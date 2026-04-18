/**
 * WindSim CFD — Geometry Handling & Voxelization (Phase B)
 * 
 * Strict, deterministic geometry pipeline for mesh validation and CPU-first voxelization.
 * Prioritizes correctness and repeatability over raw performance.
 */
(function () {
    'use strict';

    const EPS = {
        VOLUME: 1e-9,
        SAT: 1e-12,
        DEDUP: 1e-8,
        WINDING: 0.5,
        DET: 1e-15 // Determinism threshold
    };

    /**
     * @typedef {Object} ValidationResult
     * @property {boolean} success
     * @property {number} volume
     * @property {string[]} warnings
     * @property {string[]} errors
     */

    /**
     * TriMesh handles raw geometry data and validation.
     */
    class TriMesh {
        constructor(positions, indices) {
            this.positions = new Float64Array(positions); // Ensure double precision
            this.indices = new Int32Array(indices);
            this.numTriangles = this.indices.length / 3;
            this.aabb = {
                min: [Infinity, Infinity, Infinity],
                max: [-Infinity, -Infinity, -Infinity]
            };
            this.calculateAABB();
        }

        calculateAABB() {
            for (let i = 0; i < this.positions.length; i += 3) {
                const x = this.positions[i];
                const y = this.positions[i + 1];
                const z = this.positions[i + 2];
                this.aabb.min[0] = Math.min(this.aabb.min[0], x);
                this.aabb.min[1] = Math.min(this.aabb.min[1], y);
                this.aabb.min[2] = Math.min(this.aabb.min[2], z);
                this.aabb.max[0] = Math.max(this.aabb.max[0], x);
                this.aabb.max[1] = Math.max(this.aabb.max[1], y);
                this.aabb.max[2] = Math.max(this.aabb.max[2], z);
            }
        }

        /**
         * Validates the mesh based on strict CFD requirements.
         * @returns {ValidationResult}
         */
        validate() {
            const results = {
                success: true,
                volume: 0,
                warnings: [],
                errors: [],
                triCount: this.numTriangles,
                vertCount: this.positions.length / 3
            };

            // 1. Check for NaNs/Infs
            for (let i = 0; i < this.positions.length; i++) {
                if (!isFinite(this.positions[i])) {
                    results.errors.push("Invalid vertex data: NaN or Infinity detected.");
                    results.success = false;
                    break;
                }
            }
            if (!results.success) return results;

            // 2. Vertex Deduplication & Degenerate Check
            let degenerateCount = 0;
            for (let i = 0; i < this.indices.length; i += 3) {
                const i0 = this.indices[i] * 3;
                const i1 = this.indices[i + 1] * 3;
                const i2 = this.indices[i + 2] * 3;

                const v0 = [this.positions[i0], this.positions[i0 + 1], this.positions[i0 + 2]];
                const v1 = [this.positions[i1], this.positions[i1 + 1], this.positions[i1 + 2]];
                const v2 = [this.positions[i2], this.positions[i2 + 1], this.positions[i2 + 2]];

                // Check for duplicate vertices within triangle (degenerate)
                if (this.isDegenerate(v0, v1, v2)) {
                    degenerateCount++;
                }
            }
            if (degenerateCount > 0) {
                results.errors.push(`Mesh contains ${degenerateCount} degenerate triangles. Rejected.`);
                results.success = false;
            }
            if (!results.success) return results;

            // 3. Signed Volume (Tetra Sum)
            let totalVol = 0;
            for (let i = 0; i < this.indices.length; i += 3) {
                const i0 = this.indices[i] * 3;
                const i1 = this.indices[i+1] * 3;
                const i2 = this.indices[i+2] * 3;
                
                const x1 = this.positions[i0], y1 = this.positions[i0+1], z1 = this.positions[i0+2];
                const x2 = this.positions[i1], y2 = this.positions[i1+1], z2 = this.positions[i1+2];
                const x3 = this.positions[i2], y3 = this.positions[i2+1], z3 = this.positions[i2+2];

                // Signed volume of tetrahedron (origin to face)
                // V = 1/6 * (V1 . (V2 x V3))
                totalVol += (x1 * (y2 * z3 - y3 * z2) - y1 * (x2 * z3 - x3 * z2) + z1 * (x2 * y3 - x3 * y2)) / 6.0;
            }
            results.volume = totalVol;

            if (Math.abs(totalVol) < EPS.VOLUME) {
                results.errors.push(`Zero-volume mesh detected (V=${totalVol.toExponential(4)}). Rejected.`);
                results.success = false;
            }

            // 4. Manifold & Edge Checks (Warnings)
            let openEdges = 0;
            let nonManifoldEdges = 0;
            let inconsistentWinding = 0;
            let badNormals = 0;

            const edgeOrientations = new Map(); // key -> [v1_v2, v2_v1, ...]
            for (let i = 0; i < this.indices.length; i += 3) {
                const i0 = this.indices[i], i1 = this.indices[i+1], i2 = this.indices[i+2];
                const tris = [[i0, i1], [i1, i2], [i2, i0]];
                
                // Normal sanity check
                const v0 = [this.positions[i0*3], this.positions[i0*3+1], this.positions[i0*3+2]];
                const v1 = [this.positions[i1*3], this.positions[i1*3+1], this.positions[i1*3+2]];
                const v2 = [this.positions[i2*3], this.positions[i2*3+1], this.positions[i2*3+2]];
                const d1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
                const d2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
                const cp = [d1[1]*d2[2]-d1[2]*d2[1], d1[2]*d2[0]-d1[0]*d2[2], d1[0]*d2[1]-d1[1]*d2[0]];
                if (!isFinite(cp[0]) || !isFinite(cp[1]) || !isFinite(cp[2])) badNormals++;

                tris.forEach(edge => {
                    const [u, v] = edge;
                    const key = u < v ? `${u}_${v}` : `${v}_${u}`;
                    if (!edgeOrientations.has(key)) edgeOrientations.set(key, []);
                    edgeOrientations.get(key).push(`${u}_${v}`);
                });
            }

            edgeOrientations.forEach((dirs, key) => {
                if (dirs.length === 1) openEdges++;
                else if (dirs.length > 2) nonManifoldEdges++;
                else if (dirs.length === 2) {
                    // Check if they are opposite (consistent)
                    if (dirs[0] === dirs[1]) inconsistentWinding++;
                }
            });

            if (openEdges > 0) results.warnings.push(`Open boundaries detected: ${openEdges} edges have only one incident face.`);
            if (nonManifoldEdges > 0) results.warnings.push(`Non-manifold geometry detected: ${nonManifoldEdges} edges have more than two incident faces.`);
            if (inconsistentWinding > 0) results.warnings.push(`Inconsistent winding detected on ${inconsistentWinding} shared edges.`);
            if (badNormals > 0) results.warnings.push(`Suspicious normals detected on ${badNormals} triangles.`);

            return results;
        }

        isDegenerate(v0, v1, v2) {
            const d10 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
            const d20 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
            // Cross product length ~ 0
            const cp = [
                d10[1] * d20[2] - d10[2] * d20[1],
                d10[2] * d20[0] - d10[0] * d20[2],
                d10[0] * d20[1] - d10[1] * d20[0]
            ];
            const area2 = cp[0]*cp[0] + cp[1]*cp[1] + cp[2]*cp[2];
            return area2 < EPS.SAT * EPS.SAT;
        }
    }

    /**
     * Simple Deterministic BVH
     */
    class BVHNode {
        constructor() {
            this.min = [Infinity, Infinity, Infinity];
            this.max = [-Infinity, -Infinity, -Infinity];
            this.children = null; // [left, right]
            this.triIndices = null; // indices of triangles in this leaf
        }
    }

    class BVH {
        constructor(mesh) {
            this.mesh = mesh;
            this.root = this.build(Array.from({length: mesh.numTriangles}, (_, i) => i));
        }

        build(triIndices) {
            const node = new BVHNode();
            
            // Calculate AABB for this set of triangles
            for (const triIdx of triIndices) {
                for (let j = 0; j < 3; j++) {
                    const vIdx = this.mesh.indices[triIdx * 3 + j] * 3;
                    for (let axis = 0; axis < 3; axis++) {
                        node.min[axis] = Math.min(node.min[axis], this.mesh.positions[vIdx + axis]);
                        node.max[axis] = Math.max(node.max[axis], this.mesh.positions[vIdx + axis]);
                    }
                }
            }

            if (triIndices.length <= 4) {
                node.triIndices = triIndices;
                return node;
            }

            // Split on longest axis
            let splitAxis = 0;
            if (node.max[1] - node.min[1] > node.max[0] - node.min[0]) splitAxis = 1;
            if (node.max[2] - node.min[2] > node.max[splitAxis] - node.min[splitAxis]) splitAxis = 2;

            // Stable sort by triangle centroid
            const centroids = triIndices.map(idx => {
                const i0 = this.mesh.indices[idx * 3] * 3;
                const i1 = this.mesh.indices[idx * 3 + 1] * 3;
                const i2 = this.mesh.indices[idx * 3 + 2] * 3;
                return {
                    idx,
                    center: (this.mesh.positions[i0 + splitAxis] + this.mesh.positions[i1 + splitAxis] + this.mesh.positions[i2 + splitAxis]) / 3
                };
            });
            centroids.sort((a, b) => a.center - b.center || a.idx - b.idx); // Tie-break for determinism

            const mid = Math.floor(centroids.length / 2);
            node.children = [
                this.build(centroids.slice(0, mid).map(c => c.idx)),
                this.build(centroids.slice(mid).map(c => c.idx))
            ];

            return node;
        }

        /**
         * Find triangles overlapping with target AABB
         */
        intersectAABB(min, max, callback) {
            const stack = [this.root];
            while (stack.length > 0) {
                const node = stack.pop();
                if (min[0] > node.max[0] || max[0] < node.min[0] ||
                    min[1] > node.max[1] || max[1] < node.min[1] ||
                    min[2] > node.max[2] || max[2] < node.min[2]) {
                    continue;
                }
                if (node.triIndices) {
                    for (const idx of node.triIndices) callback(idx);
                } else {
                    stack.push(node.children[1]);
                    stack.push(node.children[0]);
                }
            }
        }
    }

    /**
     * Voxelizer implements SAT and GWN
     */
    class Voxelizer {
        constructor(mesh, resolution, gridAABB) {
            this.mesh = mesh;
            this.res = resolution; // [nx, ny, nz]
            this.gridAABB = gridAABB;
            this.voxelSize = [
                (gridAABB.max[0] - gridAABB.min[0]) / resolution[0],
                (gridAABB.max[1] - gridAABB.min[1]) / resolution[1],
                (gridAABB.max[2] - gridAABB.min[2]) / resolution[2]
            ];
            this.bvh = new BVH(mesh);
        }

        async voxelize() {
            const [nx, ny, nz] = this.res;
            const mask = new Uint8Array(nx * ny * nz); // 0: EMPTY, 1: SURFACE, 2: INTERIOR

            // Phase 1: Surface Detection (SAT)
            for (let i = 0; i < nx; i++) {
                for (let j = 0; j < ny; j++) {
                    for (let k = 0; k < nz; k++) {
                        const idx = i + nx * (j + ny * k);
                        const vMin = [
                            this.gridAABB.min[0] + i * this.voxelSize[0],
                            this.gridAABB.min[1] + j * this.voxelSize[1],
                            this.gridAABB.min[2] + k * this.voxelSize[2]
                        ];
                        const vMax = [
                            vMin[0] + this.voxelSize[0],
                            vMin[1] + this.voxelSize[1],
                            vMin[2] + this.voxelSize[2]
                        ];

                        let isSurface = false;
                        this.bvh.intersectAABB(vMin, vMax, (triIdx) => {
                            if (isSurface) return;
                            if (this.testTriangleAABB(triIdx, vMin, vMax)) {
                                isSurface = true;
                            }
                        });

                        if (isSurface) mask[idx] = 1;

                        // Yield occasionally to prevent UI freeze
                        if (idx % 10000 === 0) await new Promise(r => setTimeout(r, 0));
                    }
                }
            }

            // Phase 2: Interior Detection (GWN)
            // Note: Only check for voxels that are not SURFACE
            for (let i = 0; i < nx; i++) {
                for (let j = 0; j < ny; j++) {
                    for (let k = 0; k < nz; k++) {
                        const idx = i + nx * (j + ny * k);
                        if (mask[idx] === 1) continue;

                        const vCenter = [
                            this.gridAABB.min[0] + (i + 0.5) * this.voxelSize[0],
                            this.gridAABB.min[1] + (j + 0.5) * this.voxelSize[1],
                            this.gridAABB.min[2] + (k + 0.5) * this.voxelSize[2]
                        ];

                        const wn = this.calculateWindingNumber(vCenter);
                        if (wn > EPS.WINDING) {
                            mask[idx] = 2; // INTERIOR
                        }

                        if (idx % 10000 === 0) await new Promise(r => setTimeout(r, 0));
                    }
                }
            }

            return mask;
        }

        /**
         * Triangle-AABB Intersection (SAT)
         */
        testTriangleAABB(triIdx, boxMin, boxMax) {
            const i0 = this.mesh.indices[triIdx * 3] * 3;
            const i1 = this.mesh.indices[triIdx * 3 + 1] * 3;
            const i2 = this.mesh.indices[triIdx * 3 + 2] * 3;

            const v0 = [this.mesh.positions[i0], this.mesh.positions[i0 + 1], this.mesh.positions[i0 + 2]];
            const v1 = [this.mesh.positions[i1], this.mesh.positions[i1 + 1], this.mesh.positions[i1 + 2]];
            const v2 = [this.mesh.positions[i2], this.mesh.positions[i2 + 1], this.mesh.positions[i2 + 2]];

            // Move AABB to origin
            const center = [(boxMin[0] + boxMax[0]) / 2, (boxMin[1] + boxMax[1]) / 2, (boxMin[2] + boxMax[2]) / 2];
            const h = [(boxMax[0] - boxMin[0]) / 2, (boxMax[1] - boxMin[1]) / 2, (boxMax[2] - boxMin[2]) / 2];

            const a = [v0[0] - center[0], v0[1] - center[1], v0[2] - center[2]];
            const b = [v1[0] - center[0], v1[1] - center[1], v1[2] - center[2]];
            const c = [v2[0] - center[0], v2[1] - center[1], v2[2] - center[2]];

            // Edges
            const e0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const e1 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
            const e2 = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];

            // 1. AABB face normals
            for (let i = 0; i < 3; i++) {
                if (Math.min(a[i], b[i], c[i]) > h[i] || Math.max(a[i], b[i], c[i]) < -h[i]) return false;
            }

            // 2. Triangle normal
            const n = [
                e0[1] * (-e2[2]) - e0[2] * (-e2[1]),
                e0[2] * (-e2[0]) - e0[0] * (-e2[2]),
                e0[0] * (-e2[1]) - e0[1] * (-e2[0])
            ];
            const nDist = Math.abs(n[0] * a[0] + n[1] * a[1] + n[2] * a[2]);
            const r = h[0] * Math.abs(n[0]) + h[1] * Math.abs(n[1]) + h[2] * Math.abs(n[2]);
            if (nDist > r) return false;

            // 3. 9 cross products between edges
            const axes = [
                [0, -e0[2], e0[1]], [e0[2], 0, -e0[0]], [-e0[1], e0[0], 0],
                [0, -e1[2], e1[1]], [e1[2], 0, -e1[0]], [-e1[1], e1[0], 0],
                [0, -e2[2], e2[1]], [e2[2], 0, -e2[0]], [-e2[1], e2[0], 0]
            ];

            for (const axis of axes) {
                const p0 = a[0] * axis[0] + a[1] * axis[1] + a[2] * axis[2];
                const p1 = b[0] * axis[0] + b[1] * axis[1] + b[2] * axis[2];
                const p2 = c[0] * axis[0] + c[1] * axis[1] + c[2] * axis[2];
                const rad = h[0] * Math.abs(axis[0]) + h[1] * Math.abs(axis[1]) + h[2] * Math.abs(axis[2]);
                if (Math.min(p0, p1, p2) > rad || Math.max(p0, p1, p2) < -rad) return false;
            }

            return true;
        }

        /**
         * Signed Solid Angle of triangle seen from P
         */
        calculateWindingNumber(P) {
            let totalSolidAngle = 0;
            for (let i = 0; i < this.mesh.numTriangles; i++) {
                const i0 = this.mesh.indices[i * 3] * 3;
                const i1 = this.mesh.indices[i * 3 + 1] * 3;
                const i2 = this.mesh.indices[i * 3 + 2] * 3;

                const v0 = [this.mesh.positions[i0] - P[0], this.mesh.positions[i0 + 1] - P[1], this.mesh.positions[i0 + 2] - P[2]];
                const v1 = [this.mesh.positions[i1] - P[0], this.mesh.positions[i1 + 1] - P[1], this.mesh.positions[i1 + 2] - P[2]];
                const v2 = [this.mesh.positions[i2] - P[0], this.mesh.positions[i2 + 1] - P[1], this.mesh.positions[i2 + 2] - P[2]];

                const r0 = Math.sqrt(v0[0]**2 + v0[1]**2 + v0[2]**2);
                const r1 = Math.sqrt(v1[0]**2 + v1[1]**2 + v1[2]**2);
                const r2 = Math.sqrt(v2[0]**2 + v2[1]**2 + v2[2]**2);

                const det = v0[0]*(v1[1]*v2[2] - v1[2]*v2[1]) - v0[1]*(v1[0]*v2[2] - v1[2]*v2[0]) + v0[2]*(v1[0]*v2[1] - v1[1]*v2[0]);
                const div = r0*r1*r2 + (v0[0]*v1[0] + v0[1]*v1[1] + v0[2]*v1[2])*r2 + (v0[0]*v2[0] + v0[1]*v2[1] + v0[2]*v2[2])*r1 + (v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2])*r0;
                
                totalSolidAngle += 2 * Math.atan2(det, div);
            }
            return totalSolidAngle / (4 * Math.PI);
        }

        async generateHash(mask, metadata) {
            const metaStr = JSON.stringify(metadata, Object.keys(metadata).sort()); // Stable sort
            const encoder = new TextEncoder();
            const metaData = encoder.encode(metaStr);
            const combined = new Uint8Array(mask.length + metaData.length);
            combined.set(mask);
            combined.set(metaData, mask.length);

            const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
    }

    // Expose to WindSim global
    window.WindSimGeometry = {
        TriMesh,
        Voxelizer,
        EPS
    };

})();
