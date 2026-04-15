(function () {
  'use strict';

  var S = window.WindSimSolvers;
  var D = window.WindSimData;
  var P = window.WindSimPhysics;
  var V3 = THREE.Vector3;

  function createGridSolver() {
    var size = 64;
    var iter = 10;
    var N = size;
    var ds = 1.0; 

    // Fluid fields
    var u = new Float32Array((N + 2) * (N + 2));
    var v = new Float32Array((N + 2) * (N + 2));
    var u_prev = new Float32Array((N + 2) * (N + 2));
    var v_prev = new Float32Array((N + 2) * (N + 2));
    var dens = new Float32Array((N + 2) * (N + 2));
    var dens_prev = new Float32Array((N + 2) * (N + 2));
    
    // Bounds tracking
    var boundMinX = -20;
    var boundMaxX = 20;
    var boundMinZ = -20;
    var boundMaxZ = 20;

    function IX(x, y) {
      x = Math.max(0, Math.min(x, N + 1));
      y = Math.max(0, Math.min(y, N + 1));
      return x + (N + 2) * y;
    }

    function addSource(x, s, dt) {
      for (var i = 0; i < x.length; i++) {
        x[i] += dt * s[i];
      }
    }

    function setBnd(b, x) {
      for (var i = 1; i <= N; i++) {
        x[IX(0, i)] = b === 1 ? -x[IX(1, i)] : x[IX(1, i)];
        x[IX(N + 1, i)] = b === 1 ? -x[IX(N, i)] : x[IX(N, i)];
        x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
        x[IX(i, N + 1)] = b === 2 ? -x[IX(i, N)] : x[IX(i, N)];
      }
      x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
      x[IX(0, N + 1)] = 0.5 * (x[IX(1, N + 1)] + x[IX(0, N)]);
      x[IX(N + 1, 0)] = 0.5 * (x[IX(N, 0)] + x[IX(N + 1, 1)]);
      x[IX(N + 1, N + 1)] = 0.5 * (x[IX(N, N + 1)] + x[IX(N + 1, N)]);
    }

    function linSolve(b, x, x0, a, c) {
      for (var k = 0; k < iter; k++) {
        for (var j = 1; j <= N; j++) {
          for (var i = 1; i <= N; i++) {
            x[IX(i, j)] = (x0[IX(i, j)] + a * (x[IX(i - 1, j)] + x[IX(i + 1, j)] + x[IX(i, j - 1)] + x[IX(i, j + 1)])) / c;
          }
        }
        setBnd(b, x);
      }
    }

    function diffuse(b, x, x0, diff, dt) {
      var a = dt * diff * N * N;
      linSolve(b, x, x0, a, 1 + 4 * a);
    }

    function advect(b, d, d0, u, v, dt) {
      var i0, j0, i1, j1;
      var x, y, s0, t0, s1, t1;
      var dt0 = dt * N;

      for (var j = 1; j <= N; j++) {
        for (var i = 1; i <= N; i++) {
          x = i - dt0 * u[IX(i, j)];
          y = j - dt0 * v[IX(i, j)];

          if (x < 0.5) x = 0.5;
          if (x > N + 0.5) x = N + 0.5;
          i0 = Math.floor(x);
          i1 = i0 + 1;

          if (y < 0.5) y = 0.5;
          if (y > N + 0.5) y = N + 0.5;
          j0 = Math.floor(y);
          j1 = j0 + 1;

          s1 = x - i0;
          s0 = 1.0 - s1;
          t1 = y - j0;
          t0 = 1.0 - t1;

          d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
                        s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
        }
      }
      setBnd(b, d);
    }

    function project(u, v, p, div) {
      var h = 1.0 / N;
      for (var j = 1; j <= N; j++) {
        for (var i = 1; i <= N; i++) {
          div[IX(i, j)] = -0.5 * h * (u[IX(i + 1, j)] - u[IX(i - 1, j)] + v[IX(i, j + 1)] - v[IX(i, j - 1)]);
          p[IX(i, j)] = 0;
        }
      }
      setBnd(0, div);
      setBnd(0, p);
      linSolve(0, p, div, 1, 4);

      for (var j = 1; j <= N; j++) {
        for (var i = 1; i <= N; i++) {
          u[IX(i, j)] -= 0.5 * (p[IX(i + 1, j)] - p[IX(i - 1, j)]) / h;
          v[IX(i, j)] -= 0.5 * (p[IX(i, j + 1)] - p[IX(i, j - 1)]) / h;
        }
      }
      setBnd(1, u);
      setBnd(2, v);
    }

    function velStep(u, v, u0, v0, dt) {
      addSource(u, u0, dt);
      addSource(v, v0, dt);
      
      var temp = u0; u0 = u; u = temp;
      var temp2 = v0; v0 = v; v = temp2;
      
      diffuse(1, u, u0, 0.0001, dt);
      diffuse(2, v, v0, 0.0001, dt);
      
      project(u, v, u0, v0);
      
      temp = u0; u0 = u; u = temp;
      temp2 = v0; v0 = v; v = temp2;
      
      advect(1, u, u0, u0, v0, dt);
      advect(2, v, v0, u0, v0, dt);
      
      project(u, v, u0, v0);
    }

    var _tmpWind = new V3();

    return {
      key: 'grid_2d',
      getProfile: function () { return D.SOLVER_PROFILES.grid_2d; },
      
      resetSimulationState: function (app, hard) {
        if (hard) {
          app.state.body = P.initBodyState(app.cfg);
          for (var i = 0; i < u.length; i++) {
            u[i] = 0; v[i] = 0; u_prev[i] = 0; v_prev[i] = 0;
            dens[i] = 0; dens_prev[i] = 0;
          }
        }
        app.state.time = 0;
      },

      step: function (app, dt) {
        // Feed ambient wind
        var dir = app.cfg.wind.azim;
        var spd = app.cfg.wind.speed;
        var envX = Math.cos(dir) * spd;
        var envZ = Math.sin(dir) * spd;
        
        for (var i = 0; i < u_prev.length; i++) { u_prev[i] = 0; v_prev[i] = 0; }
        
        // Inject wind source at the boundaries depending on direction
        for(var i=1; i<=N; i++) {
          u_prev[IX(1, i)] = envX * 10; 
          v_prev[IX(1, i)] = envZ * 10;
        }

        velStep(u, v, u_prev, v_prev, dt);
        
        // Temporarily couple Sandbox physics to move the body
        P.substepIntegrate(app.state.body, app.cfg, dt, function(time, pos) {
          _tmpWind.set(envX, 0, envZ); // Fallback to analytic wind for now to prevent breaking app
          return _tmpWind;
        }, app.state.experiment.sweepActive);
        
        app.state.time += dt;
      },

      sampleWindAt: function (app, pos) {
        var hw = app.cfg.world.halfWidth;
        var hd = app.cfg.world.halfDepth;
        var gridX = ((pos.x + hw) / (hw * 2)) * N;
        var gridZ = ((pos.z + hd) / (hd * 2)) * N;

        if (gridX > 0.5 && gridX < N + 0.5 && gridZ > 0.5 && gridZ < N + 0.5) {
          var x0 = Math.floor(gridX);
          var x1 = x0 + 1;
          var y0 = Math.floor(gridZ);
          var y1 = y0 + 1;

          var s1 = gridX - x0;
          var s0 = 1.0 - s1;
          var t1 = gridZ - y0;
          var t0 = 1.0 - t1;

          var sampU = s0 * (t0 * u[IX(x0, y0)] + t1 * u[IX(x0, y1)]) + s1 * (t0 * u[IX(x1, y0)] + t1 * u[IX(x1, y1)]);
          var sampV = s0 * (t0 * v[IX(x0, y0)] + t1 * v[IX(x0, y1)]) + s1 * (t0 * v[IX(x1, y0)] + t1 * v[IX(x1, y1)]);
          
          _tmpWind.set(sampU, 0, sampV);
        } else {
          var dir = app.cfg.wind.azim;
          var spd = app.cfg.wind.speed;
          _tmpWind.set(Math.cos(dir) * spd, 0, Math.sin(dir) * spd);
        }
        return _tmpWind;
      },

      makeConfigFromPreset: function (presetKey, currentCfg) {
        return P.makeConfigFromPreset(presetKey, currentCfg); // Proxy to physics for now
      },

      defaultScenarioSnapshot: function () {
        return P.defaultScenarioSnapshot();
      },

      resolveObjectDef: function (cfg) {
        return P.resolveObjectDef(cfg);
      },

      startValidation: function (app, caseDef) {
        app.setPausedState(true);
      }
    };
  }

  S.registerSolver(createGridSolver());
}());
