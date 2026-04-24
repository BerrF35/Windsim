/**
 * WindSim CFD — Phase C Deterministic Validation Suite
 */
async function runPhaseCValidation() {
    console.log("%c Starting Phase C Deterministic Validation... ", "background: #1e293b; color: #35d1ff; font-weight: bold; padding: 4px;");
    
    const results = {
        bitwiseIdenticality: { pass: false, hashes: [] },
        pauseResumeEquivalence: { pass: false, diff: null },
        solverModes: { pass: false, laminarMode: null, lesMode: null, lesHashA: null, lesHashB: null },
        massDrift: { max: 0, steps: [] },
        residualHistory: { steps: [], formula: "MADD: Mean Absolute Density Deviation" },
        symmetryError: { xy: 0, xz: 0, yz: 0 },
        divergenceHalt: { pass: false, iteration: 0 }
    };

    const engine = window.CFDEngine;
    const solver = window.WindSimSolver;

    // Helper: Reset engine to clean state
    function resetEngine() {
        engine.state.workflow = { geometry: false, domain: false, boundary: false, solver: false, run: false, inspect: false };
        engine.state.solver.iteration = 0;
        engine.state.solver.running = false;
        engine.state.logs = [];
        engine.state.diagnosticMode = true;
    }

    // --- CASE 1: Bitwise Identicality ---
    console.log("Case 1: Checking Bitwise Identicality (3 runs)...");
    const hashes = [];
    for (let i = 0; i < 3; i++) {
        const s = new solver.LBMSolver();
        // Init 32^3 domain for speed
        s.init([6,6,6], [32,32,32], { tau: 0.6, inletSpeed: 0.08, inletDir: '+x' }, null);
        s.step(50);
        const h = await s.getBufferHash();
        hashes.push(h);
    }
    results.bitwiseIdenticality.hashes = hashes;
    results.bitwiseIdenticality.pass = hashes.every(h => h === hashes[0]);
    console.log(`- Success: ${results.bitwiseIdenticality.pass} (Hash: ${hashes[0]})`);

    // --- CASE 2: Pause/Resume Equivalence ---
    console.log("Case 2: Checking Pause/Resume Equivalence...");
    const s_cont = new solver.LBMSolver();
    s_cont.init([6,6,6], [32,32,32], { tau: 0.6, inletSpeed: 0.08, inletDir: '+x' }, null);
    s_cont.step(50);
    s_cont.step(50);
    const hash_cont = await s_cont.getBufferHash();

    const s_pr = new solver.LBMSolver();
    s_pr.init([6,6,6], [32,32,32], { tau: 0.6, inletSpeed: 0.08, inletDir: '+x' }, null);
    s_pr.step(50);
    const snap = s_pr.getStateSnapshot(); 
    s_pr.reset(); // Simulate clear
    s_pr.loadStateSnapshot(snap);
    s_pr.step(50);
    const hash_pr = await s_pr.getBufferHash();

    results.pauseResumeEquivalence.pass = (hash_cont === hash_pr);
    console.log(`- Success: ${results.pauseResumeEquivalence.pass}`);

    // --- CASE 2B: Solver Mode Routing & LES Determinism ---
    console.log("Case 2B: Checking solver mode routing and deterministic LES...");
    const s_laminar = new solver.LBMSolver();
    s_laminar.init([6,6,6], [24,24,24], { tau: 0.6, inletSpeed: 0.08, inletDir: '+x', solverMode: 'laminar' }, null);
    s_laminar.step(20);
    const lamDiag = s_laminar.getDiagnostics();

    const s_les_a = new solver.LBMSolver();
    s_les_a.init([6,6,6], [24,24,24], { tau: 0.6, inletSpeed: 0.08, inletDir: '+x', solverMode: 'les' }, null);
    s_les_a.step(20);
    const lesDiagA = s_les_a.getDiagnostics();
    const lesHashA = await s_les_a.getBufferHash();

    const s_les_b = new solver.LBMSolver();
    s_les_b.init([6,6,6], [24,24,24], { tau: 0.6, inletSpeed: 0.08, inletDir: '+x', solverMode: 'les' }, null);
    s_les_b.step(20);
    const lesDiagB = s_les_b.getDiagnostics();
    const lesHashB = await s_les_b.getBufferHash();

    results.solverModes.laminarMode = lamDiag.mode;
    results.solverModes.lesMode = lesDiagA.mode;
    results.solverModes.lesHashA = lesHashA;
    results.solverModes.lesHashB = lesHashB;
    results.solverModes.pass = (
        lamDiag.mode === 'laminar' &&
        lesDiagA.mode === 'les' &&
        lesHashA === lesHashB &&
        lesDiagA.effectiveViscosity.nuMax >= lesDiagA.effectiveViscosity.nuMin &&
        lesDiagB.effectiveViscosity.nuMean === lesDiagA.effectiveViscosity.nuMean
    );
    console.log(`- Success: ${results.solverModes.pass} (LES Hash: ${lesHashA})`);

    // --- CASE 3 & 4: Mass & Residual (Per-Step) ---
    console.log("Case 3/4: Collecting high-frequency Mass & Residual data...");
    const s_diag = new solver.LBMSolver();
    s_diag.init([6,6,6], [32,32,32], { tau: 0.6, inletSpeed: 0.08, inletDir: '+x' }, null);
    for (let i = 0; i < 50; i++) {
        s_diag.step(1);
        const d = s_diag.getDiagnostics();
        results.massDrift.steps.push(d.massDrift);
        results.residualHistory.steps.push(d.maxResidual);
        results.massDrift.max = Math.max(results.massDrift.max, d.massDrift);
    }

    // --- CASE 5: Symmetry Test ---
    console.log("Case 5: Measuring Symmetry (centered empty domain)...");
    const s_sym = new solver.LBMSolver();
    // Resolve at 32x32x32
    s_sym.init([6,6,6], [32,32,32], { tau: 0.6, inletSpeed: 0.08, inletDir: '+x' }, null);
    s_sym.step(50);
    const fields = s_sym.getFieldBuffers();
    const rho = fields.mass;
    const [nx, ny, nz] = [32, 32, 32];
    
    let errY = 0, errZ = 0;
    for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny/2; y++) {
            for (let z = 0; z < nz; z++) {
                const i1 = x + nx * (y + ny * z);
                const i2 = x + nx * ((ny-1-y) + ny * z);
                errY += Math.abs(rho[i1] - rho[i2]);
            }
        }
        for (let y = 0; y < ny; y++) {
            for (let z = 0; z < nz/2; z++) {
                const i1 = x + nx * (y + ny * z);
                const i2 = x + nx * (y + ny * (nz-1-z));
                errZ += Math.abs(rho[i1] - rho[i2]);
            }
        }
    }
    results.symmetryError.yz = errY / (nx * ny * nz); // Symmetry across XZ plane (Y axis)
    results.symmetryError.xz = errZ / (nx * ny * nz); // Symmetry across XY plane (Z axis)
    console.log(`- Symmetry Error (Y-sym): ${results.symmetryError.yz.toExponential(4)}`);
    console.log(`- Symmetry Error (Z-sym): ${results.symmetryError.xz.toExponential(4)}`);

    // --- CASE 6: Divergence Handling ---
    console.log("Case 6: Testing Divergence Flag Handling...");
    const s_div = new solver.LBMSolver();
    s_div.init([6,6,6], [32,32,32], { tau: 0.501, inletSpeed: 0.15, inletDir: '+x' }, null);
    s_div.step(1);
    s_div.stats.mass = NaN;
    const divDiag = s_div.getDiagnostics();
    results.divergenceHalt.iteration = divDiag.iteration;
    results.divergenceHalt.pass = divDiag.isDiverged === true;
    console.log(`- Divergence flag success: ${results.divergenceHalt.pass}`);

    console.log("%c Phase C Validation Complete ", "background: #10b981; color: white; padding: 4px;");
    console.table({
        "Bitwise Identical": results.bitwiseIdenticality.pass ? "YES" : "NO",
        "Pause/Resume Equiv": results.pauseResumeEquivalence.pass ? "YES" : "NO",
        "Mode Routing + LES": results.solverModes.pass ? "YES" : "NO",
        "Max Mass Drift %": (results.massDrift.max * 100).toFixed(6),
        "Y-Symmetry Error": results.symmetryError.yz.toExponential(4),
        "Z-Symmetry Error": results.symmetryError.xz.toExponential(4),
        "Divergence Halt": results.divergenceHalt.pass ? "YES" : "NO"
    });

    window.PhaseCValidationResults = results;
    return results;
}
