/**
 * WindSim CFD — Observability & Persistence Module (Phase C)
 * 
 * Handles structured logging, runtime diagnostics history, and persistent session recovery.
 */
(function () {
    'use strict';

    class ObservabilityManager {
        constructor(runId) {
            this.runId = runId || this.generateRunId();
            this.logs = [];
            this.maxLogs = 500;
            this.dbName = 'WindSimCFD';
            this.storeName = 'sessions';
            this._dbPromise = this._initDB();
        }

        async _initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName);
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        generateRunId() {
            return 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
        }

        log(entry) {
            const logEntry = {
                timestamp: Date.now(),
                runId: this.runId,
                ...entry
            };
            this.logs.push(logEntry);
            if (this.logs.length > this.maxLogs) this.logs.shift();
            
            if (window.CFDEngine && window.CFDEngine.state.diagnosticMode) {
                const mode = entry.mode || 'unknown';
                const clamps = Number.isFinite(entry.tauClampCount) ? entry.tauClampCount : 0;
                const re = Number.isFinite(entry.Re_actual) ? entry.Re_actual.toFixed(1) : 'n/a';
                const regime = entry.regime ? entry.regime.classification : 'unknown';
                console.log(`[CFD-LOG] Iter:${entry.iter} Mode:${mode} Regime:${regime} MassDrift:${(entry.drift*100).toFixed(4)}% TauClamps:${clamps} Re_actual:${re}`);
            }
        }

        /**
         * Persists the entire simulation state to IndexedDB.
         * @param {Object} engineState 
         * @param {Object} solver 
         */
        async saveSession(engineState, solver) {
            const db = await this._dbPromise;
            
            const snapshot = {
                runId: this.runId,
                timestamp: Date.now(),
                engine: {
                    solver: { ...engineState.solver },
                    workflow: { ...engineState.workflow },
                    domain: { ...engineState.domain },
                    mesh: { active: engineState.mesh.active },
                    voxelHash: engineState.voxelHash
                },
                regime: engineState.regime,
                capability: engineState.capability,
                solverState: solver ? solver.getStateSnapshot() : null,
                logs: this.logs.slice(-100) 
            };

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(snapshot, 'current_session');
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || 'IDB Save Failed');
                
                if (window.CFDEngine) window.CFDEngine.state.isSaving = false;
            });
        }

        async loadSession() {
            const db = await this._dbPromise;
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get('current_session');
                
                request.onsuccess = () => {
                    const snapshot = request.result;
                    if (snapshot) {
                        this.runId = snapshot.runId;
                        this.logs = snapshot.logs || [];
                    }
                    resolve(snapshot || null);
                };
                request.onerror = () => reject(request.error || 'IDB Load Failed');
            });
        }

        async clearSession() {
            const db = await this._dbPromise;
            const transaction = db.transaction([this.storeName], 'readwrite');
            transaction.objectStore(this.storeName).delete('current_session');
        }

        exportLogAsJSON() {
            const data = {
                runId: this.runId,
                exportedAt: new Date().toISOString(),
                logs: this.logs
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            return URL.createObjectURL(blob);
        }
    }

    window.WindSimObservability = {
        ObservabilityManager
    };
})();
