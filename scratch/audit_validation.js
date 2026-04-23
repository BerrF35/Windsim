/**
 * WindSim Aerodynamic Coefficient Validation Suite (Final Audit Pass)
 * To be run in the browser console of cfd.html
 */
(async function() {
    console.log("%c--- WINDSIM FINAL CALIBRATION AUDIT START ---", "color: #22cded; font-weight: bold; font-size: 14px;");

    const results = [];

    async function runTest(name, config) {
        console.log(`%c[TEST] ${name}`, "color: #f59e0b; font-weight: bold;");
        
        const { meshType, resolution, inletSpeed, inletDir, iterations, angleDeg = 0 } = config;
        
        // 1. Setup Mesh
        let geometry;
        if (meshType === 'sphere') {
            geometry = new THREE.SphereGeometry(0.6, 24, 24);
        } else if (meshType === 'airfoil') {
            const shape = new THREE.Shape();
            for (let i = 0; i <= 30; i++) {
                const t = i / 30; const x = 2 * t;
                const yt = 0.12 / 0.2 * 2 * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t**2 + 0.2843 * t**3 - 0.1015 * t**4);
                if (i === 0) shape.moveTo(x - 1, yt); else shape.lineTo(x - 1, yt);
            }
            shape.lineTo(1.0, 0.0);
            for (let i = 30; i >= 0; i--) {
                const t = i / 30; const x = 2 * t;
                const yt = 0.12 / 0.2 * 2 * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t**2 + 0.2843 * t**3 - 0.1015 * t**4);
                shape.lineTo(x - 1, -yt);
            }
            shape.closePath();
            geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
            geometry.center();
            geometry.rotateX(Math.PI/2);
            if (angleDeg !== 0) {
                geometry.rotateY(angleDeg * Math.PI / 180);
            }
        }

        const pos = geometry.attributes.position.array;
        const idx = geometry.index ? geometry.index.array : new Int32Array(pos.length/3).map((_, i) => i);
        const mesh = new WindSimGeometry.TriMesh(pos, idx);
        
        const gridAABB = { min: [-3,-3,-3], max: [3,3,3] };
        const voxelizer = new WindSimGeometry.Voxelizer(mesh, resolution, gridAABB);
        const mask = await voxelizer.voxelize();

        // 2. Compute Geometry Metadata
        const meta = WindSimCoefficients.CoefficientCalculator.computeGeometryMetadata(mask, resolution, [6,6,6], inletDir, meshType);

        // 3. Setup Solver
        const solver = new WindSimSolver.LBMSolver();
        const configOptions = { 
            tau: 0.6, 
            inletSpeed, 
            inletDir, 
            meshType,
            refArea: meta.area,
            charLengthPhys: meta.charLengthPhys,
            charLengthLat: meta.charLengthLat,
            domainSize: [6, 6, 6],
            resolution: resolution,
            uLattice: inletSpeed,
            uPhysical: 10.0,
            rhoPhysical: 1.225,
            nuPhysical: 1.5e-5
        };
        solver.init([6,6,6], resolution, configOptions, mask);
        
        // 4. Run Simulation
        solver.step(iterations);

        const diag = solver.getDiagnostics();
        const testResult = {
            name,
            config,
            meta,
            final: diag
        };
        results.push(testResult);
        
        const c = diag.coefficients;
        console.log(`  Raw Forces: Fx=${diag.forceX.toFixed(6)}, Fy=${diag.forceY.toFixed(6)}, Fz=${diag.forceZ.toFixed(6)}`);
        if (c) {
            console.log(`  Mapping: ${c.mapping.drag}, ${c.mapping.lift}, ${c.mapping.side}`);
            console.log(`  Physical Forces: Drag=${c.dragForce.toFixed(6)}N, Lift=${c.liftForce.toFixed(6)}N, Side=${c.sideForce.toFixed(6)}N`);
            console.log(`  Reynolds: Target=${c.calibration.Re_target.toExponential(2)}, Actual=${c.calibration.Re_actual.toExponential(2)}`);
            console.log(`  Status: ${c.calibration.status} (${c.calibration.reason})`);
            console.log(`  Coeffs: Cd=${c.cd !== null ? c.cd.toFixed(4) : 'Unavailable'}, Cl=${c.cl !== null ? c.cl.toFixed(4) : 'Unavailable'}, Cs=${c.cs !== null ? c.cs.toFixed(4) : 'Unavailable'}`);
        }
        
        return testResult;
    }

    // --- TEST MATRIX ---
    await runTest("Sphere (+x)", { meshType: 'sphere', resolution: [48, 48, 48], inletSpeed: 0.1, inletDir: '+x', iterations: 1000 });
    await runTest("Sphere (-z)", { meshType: 'sphere', resolution: [48, 48, 48], inletSpeed: 0.1, inletDir: '-z', iterations: 1000 });
    await runTest("Airfoil 0 deg", { meshType: 'airfoil', resolution: [48, 48, 48], inletSpeed: 0.1, inletDir: '+x', iterations: 1000, angleDeg: 0 });
    await runTest("Airfoil 10 deg", { meshType: 'airfoil', resolution: [48, 48, 48], inletSpeed: 0.1, inletDir: '+x', iterations: 1000, angleDeg: 10 });
    await runTest("Sphere (+x, U=0.05)", { meshType: 'sphere', resolution: [48, 48, 48], inletSpeed: 0.05, inletDir: '+x', iterations: 1000 });

    console.log("%c--- FINAL AUDIT SUMMARY ---", "color: #22cded; font-weight: bold; font-size: 14px;");
    console.table(results.map(r => {
        const c = r.final.coefficients;
        const cal = c?.calibration;
        return {
            Name: r.name,
            Inlet: r.config.inletDir,
            "Re Target": cal?.Re_target?.toExponential(2),
            "Re Actual": cal?.Re_actual?.toExponential(2),
            "Status": cal?.status,
            "Reason": cal?.reason?.substring(0, 20) + "...",
            "Cd": c?.cd !== null ? c.cd.toFixed(4) : '—',
            "Cl": c?.cl !== null ? c.cl.toFixed(4) : '—',
            "Drag (N)": c?.dragForce?.toFixed(6),
            "Lift (N)": c?.liftForce?.toFixed(6),
            "Raw Drag": c?.rawDrag?.toFixed(6)
        };
    }));

    window.FINAL_AUDIT_RESULTS = results;
})();
