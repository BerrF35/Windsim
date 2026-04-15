(function () {
  'use strict';

  var D = window.WindSimData;

  /* ---- shared colour / seed utilities ---- */

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function hex(h) { return '#' + h.toString(16).padStart(6, '0'); }

  function seedFromText(text) {
    var hash = 2166136261 >>> 0;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function rgbFromHex(hexValue) {
    return {
      r: (hexValue >> 16) & 255,
      g: (hexValue >> 8) & 255,
      b: hexValue & 255
    };
  }

  function mixRgb(a, b, t) {
    return {
      r: Math.round(THREE.MathUtils.lerp(a.r, b.r, t)),
      g: Math.round(THREE.MathUtils.lerp(a.g, b.g, t)),
      b: Math.round(THREE.MathUtils.lerp(a.b, b.b, t))
    };
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
  }

  /* ---- constants ---- */

  var SURFACE_WORLD_TILE = 32;
  var GRID_WORLD_TILE = 40;

  /* ---- texture caches ---- */

  var _renderer = null;
  var _surfaceCache = new Map();
  var _objectCache = new Map();

  function init(renderer) {
    _renderer = renderer;
  }

  /* ---- texture generation engine ---- */

  function makeCanvasTexture(cache, key, painter) {
    if (cache.has(key)) return cache.get(key);
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    var ctx = canvas.getContext('2d');
    painter(ctx, 512);
    var texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(8, _renderer ? _renderer.capabilities.getMaxAnisotropy() : 4);
    cache.set(key, texture);
    return texture;
  }

  function drawNoiseDots(ctx, size, rng, count, color, alphaMin, alphaMax, radius) {
    for (var i = 0; i < count; i += 1) {
      ctx.globalAlpha = alphaMin + rng() * (alphaMax - alphaMin);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, radius * (0.45 + rng() * 0.9), 0, D.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function layeredNoise(u, v, seed) {
    var phase = (seed % 997) * 0.013;
    var n1 = Math.sin(D.TAU * (u + v * 0.35) + phase);
    var n2 = Math.cos(D.TAU * (u * 2 - v * 3) - phase * 1.7);
    var n3 = Math.sin(D.TAU * ((u + v) * 5) + phase * 0.6);
    var n4 = Math.cos(D.TAU * (u * 9 - v * 7) + phase * 2.3);
    return clamp(0.5 + 0.5 * (n1 * 0.42 + n2 * 0.28 + n3 * 0.20 + n4 * 0.10), 0, 1);
  }

  function surfaceMaterialProps(type) {
    switch (type) {
      case 'hardwood':
        return { roughness: 0.78, metalness: 0.04 };
      case 'ice':
        return { roughness: 0.18, metalness: 0.08 };
      case 'water':
        return { roughness: 0.12, metalness: 0.18 };
      case 'sand':
        return { roughness: 1.0, metalness: 0.0 };
      case 'grass':
        return { roughness: 0.98, metalness: 0.01 };
      default:
        return { roughness: 0.94, metalness: 0.02 };
    }
  }

  function getSurfaceTexture(type) {
    var surf = D.SURFACES[type];
    var texture = makeCanvasTexture(_surfaceCache, 'surface-' + type, function (ctx, size) {
      var base = rgbFromHex(surf.tint);
      var accent = rgbFromHex(surf.accent);
      var light = mixRgb(base, { r: 238, g: 243, b: 248 }, 0.16);
      var dark = mixRgb(base, { r: 10, g: 12, b: 16 }, 0.28);
      var seed = seedFromText('surface:' + type);
      var image = ctx.createImageData(size, size);
      var data = image.data;

      for (var y = 0; y < size; y += 1) {
        var v = y / (size - 1);
        for (var x = 0; x < size; x += 1) {
          var u = x / (size - 1);
          var coarse = layeredNoise(u, v, seed);
          var fine = layeredNoise(u, v, seed + 73);
          var ridge = 0.5 + 0.5 * Math.sin(D.TAU * (u * 6 - v * 4) + fine * 2.8);
          var rgb = base;

          switch (type) {
            case 'grass':
              rgb = mixRgb(dark, accent, clamp(0.08 + coarse * 0.18 + ridge * 0.05, 0, 1));
              break;
            case 'concrete':
              rgb = mixRgb(mixRgb(base, light, 0.12), { r: 222, g: 228, b: 236 }, clamp(0.04 + coarse * 0.14 + fine * 0.08, 0, 0.22));
              break;
            case 'hardwood': {
              var board = Math.floor(u * 8) % 2;
              var boardTone = board ? 0.18 : 0.06;
              rgb = mixRgb(dark, light, clamp(boardTone + coarse * 0.30 + ridge * 0.10, 0, 1));
              break;
            }
            case 'sand':
              rgb = mixRgb(dark, light, clamp(0.20 + coarse * 0.42 + ridge * 0.20, 0, 1));
              break;
            case 'ice': {
              var frost = clamp(0.28 + coarse * 0.28 + fine * 0.18, 0, 1);
              rgb = mixRgb(base, { r: 201, g: 231, b: 246 }, frost);
              break;
            }
            case 'water': {
              var ripple = 0.5 + 0.5 * Math.sin(D.TAU * (u * 7 + v * 2) + fine * 3.4);
              rgb = mixRgb(dark, accent, clamp(0.16 + coarse * 0.30 + ripple * 0.24, 0, 1));
              break;
            }
            default:
              rgb = mixRgb(base, accent, coarse * 0.35);
              break;
          }

          var idx = (y * size + x) * 4;
          data[idx] = rgb.r;
          data[idx + 1] = rgb.g;
          data[idx + 2] = rgb.b;
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (type === 'grass') {
        ctx.strokeStyle = rgba(mixRgb(accent, light, 0.10), 0.02);
        ctx.lineWidth = 1.0;
        for (var i = 0; i < 22; i += 1) {
          var x0 = i * size / 22;
          ctx.beginPath();
          for (var sy = 0; sy <= size; sy += 18) {
            var px = x0 + Math.sin((sy / size) * D.TAU * 2 + i * 0.7) * 8;
            if (sy === 0) ctx.moveTo(px, sy);
            else ctx.lineTo(px, sy);
          }
          ctx.stroke();
        }
      } else if (type === 'concrete') {
        ctx.strokeStyle = 'rgba(230,236,242,0.08)';
        ctx.lineWidth = 2.4;
        [0.28, 0.67].forEach(function (baseLine, index) {
          ctx.beginPath();
          for (var cx = 0; cx <= size; cx += 12) {
            var cy = size * (baseLine + 0.035 * Math.sin(D.TAU * (cx / size) * (index + 1)) + 0.012 * Math.sin(D.TAU * (cx / size) * 5));
            if (cx === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        });
      } else if (type === 'hardwood') {
        ctx.strokeStyle = 'rgba(248,235,214,0.14)';
        ctx.lineWidth = 3;
        for (var hx = 0; hx <= size; hx += size / 8) {
          ctx.beginPath();
          ctx.moveTo(hx, 0);
          ctx.lineTo(hx, size);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(72,42,18,0.16)';
        ctx.lineWidth = 1.6;
        for (var row = 0; row < 7; row += 1) {
          var hy0 = (row + 0.5) * size / 8;
          ctx.beginPath();
          for (var hx2 = 0; hx2 <= size; hx2 += 14) {
            var hy = hy0 + Math.sin(D.TAU * (hx2 / size) * 3 + row * 0.8) * 6;
            if (hx2 === 0) ctx.moveTo(hx2, hy);
            else ctx.lineTo(hx2, hy);
          }
          ctx.stroke();
        }
      } else if (type === 'sand') {
        ctx.strokeStyle = 'rgba(255,235,200,0.09)';
        ctx.lineWidth = 1.8;
        for (var srow = 0; srow < 18; srow += 1) {
          var sy0 = srow * size / 18;
          ctx.beginPath();
          for (var sx = 0; sx <= size; sx += 12) {
            var sy2 = sy0 + Math.sin(D.TAU * (sx / size) * 2 + srow * 0.4) * 3.8;
            if (sx === 0) ctx.moveTo(sx, sy2);
            else ctx.lineTo(sx, sy2);
          }
          ctx.stroke();
        }
      } else if (type === 'ice') {
        ctx.strokeStyle = 'rgba(248,252,255,0.14)';
        ctx.lineWidth = 2;
        for (var crack = 0; crack < 5; crack += 1) {
          var ix0 = crack * size / 5;
          ctx.beginPath();
          for (var iy = 0; iy <= size; iy += 14) {
            var ix = ix0 + Math.sin(D.TAU * (iy / size) * 2 + crack) * 18 + Math.cos(D.TAU * (iy / size) * 4) * 6;
            if (iy === 0) ctx.moveTo(ix, iy);
            else ctx.lineTo(ix, iy);
          }
          ctx.stroke();
        }
      } else if (type === 'water') {
        ctx.strokeStyle = 'rgba(240,248,255,0.13)';
        ctx.lineWidth = 1.8;
        for (var wrow = 0; wrow < 14; wrow += 1) {
          var wy0 = wrow * size / 14;
          ctx.beginPath();
          for (var wx = 0; wx <= size; wx += 10) {
            var wy = wy0 + Math.sin(D.TAU * (wx / size) * 3 + wrow * 0.45) * 5 + Math.sin(D.TAU * (wx / size) * 9 + wrow) * 1.5;
            if (wx === 0) ctx.moveTo(wx, wy);
            else ctx.lineTo(wx, wy);
          }
          ctx.stroke();
        }
      }
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(D.FLOOR_SIZE / SURFACE_WORLD_TILE, D.FLOOR_SIZE / SURFACE_WORLD_TILE);
    return texture;
  }

  function getGridOverlayTexture() {
    var texture = makeCanvasTexture(_surfaceCache, 'surface-overlay', function (ctx, size) {
      ctx.clearRect(0, 0, size, size);
      for (var i = 0; i <= 8; i += 1) {
        var p = i * size / 8;
        var major = i % 4 === 0;
        ctx.strokeStyle = major ? 'rgba(172,187,203,0.12)' : 'rgba(123,138,153,0.07)';
        ctx.lineWidth = major ? 2.0 : 1.0;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.stroke();
      }
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(D.FLOOR_SIZE / GRID_WORLD_TILE, D.FLOOR_SIZE / GRID_WORLD_TILE);
    return texture;
  }

  function getObjectTexture(name, baseColor) {
    return makeCanvasTexture(_objectCache, 'object-' + name, function (ctx, size) {
      var rng = makeRng(seedFromText('object:' + name));
      switch (name) {
        case 'soccer':
          ctx.fillStyle = '#f7fafc';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = '#14181d';
          [[128, 116], [260, 72], [388, 124], [106, 286], [260, 246], [408, 304], [210, 408], [334, 426]].forEach(function (pt) {
            ctx.beginPath();
            for (var i = 0; i < 5; i += 1) {
              var ang = -Math.PI / 2 + i * D.TAU / 5;
              var px = pt[0] + Math.cos(ang) * 34;
              var py = pt[1] + Math.sin(ang) * 34;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          });
          break;
        case 'tennis':
          ctx.fillStyle = '#b8f45d';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.arc(size * 0.22, size * 0.45, size * 0.42, -0.5, 1.55);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(size * 0.78, size * 0.55, size * 0.42, 2.64, 4.7);
          ctx.stroke();
          drawNoiseDots(ctx, size, rng, 1400, '#f0fdf4', 0.02, 0.06, 1.1);
          break;
        case 'basketball':
          ctx.fillStyle = '#e56f10';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#2a1409';
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.moveTo(size * 0.5, 0);
          ctx.lineTo(size * 0.5, size);
          ctx.moveTo(0, size * 0.5);
          ctx.lineTo(size, size * 0.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(size * 0.1, size * 0.5, size * 0.48, -0.9, 0.9);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(size * 0.9, size * 0.5, size * 0.48, 2.24, 4.05);
          ctx.stroke();
          break;
        case 'cricket':
          ctx.fillStyle = '#b91c1c';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(size * 0.18, size * 0.42);
          ctx.bezierCurveTo(size * 0.35, size * 0.30, size * 0.65, size * 0.30, size * 0.82, size * 0.42);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(size * 0.18, size * 0.58);
          ctx.bezierCurveTo(size * 0.35, size * 0.70, size * 0.65, size * 0.70, size * 0.82, size * 0.58);
          ctx.stroke();
          break;
        case 'baseball':
          ctx.fillStyle = '#fef7df';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 7;
          for (var bi = 0; bi < 18; bi += 1) {
            var by = 80 + bi * 18;
            ctx.beginPath();
            ctx.arc(size * 0.22, by, 10, Math.PI * 0.2, Math.PI * 1.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(size * 0.78, by, 10, -Math.PI * 0.2, Math.PI * 0.8);
            ctx.stroke();
          }
          break;
        case 'pingpong':
          ctx.fillStyle = '#fcfdff';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = 'rgba(202,138,4,0.28)';
          ctx.font = 'bold 72px Barlow, sans-serif';
          ctx.fillText('40', size * 0.36, size * 0.56);
          break;
        case 'golf':
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, size, size);
          for (var gy = 18; gy < size; gy += 24) {
            for (var gx = 18 + ((gy / 24) % 2) * 12; gx < size; gx += 24) {
              ctx.fillStyle = 'rgba(148,163,184,0.18)';
              ctx.beginPath();
              ctx.arc(gx, gy, 6, 0, D.TAU);
              ctx.fill();
            }
          }
          break;
        case 'volleyball':
          ctx.fillStyle = '#fff3c4';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#1d4ed8';
          ctx.lineWidth = 30;
          ctx.beginPath();
          ctx.arc(size * 0.2, size * 0.5, size * 0.55, -0.9, 0.9);
          ctx.stroke();
          ctx.strokeStyle = '#d97706';
          ctx.beginPath();
          ctx.arc(size * 0.78, size * 0.45, size * 0.45, 2.1, 4.05);
          ctx.stroke();
          break;
        case 'rugby':
          ctx.fillStyle = '#6f4625';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(size * 0.44, size * 0.42, size * 0.12, size * 0.16);
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 5;
          for (var ri = 0; ri < 8; ri += 1) {
            var rx = size * 0.46 + ri * 10;
            ctx.beginPath();
            ctx.moveTo(rx, size * 0.41);
            ctx.lineTo(rx, size * 0.59);
            ctx.stroke();
          }
          break;
        case 'cannonball': {
          var steel = ctx.createRadialGradient(size * 0.34, size * 0.32, size * 0.04, size * 0.5, size * 0.5, size * 0.72);
          steel.addColorStop(0, '#9aa3b2');
          steel.addColorStop(1, '#29303a');
          ctx.fillStyle = steel;
          ctx.fillRect(0, 0, size, size);
          drawNoiseDots(ctx, size, rng, 900, '#e5e7eb', 0.02, 0.08, 1.8);
          break;
        }
        case 'paper':
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = 'rgba(59,130,246,0.16)';
          ctx.lineWidth = 3;
          for (var pi = 0; pi < 18; pi += 1) {
            ctx.beginPath();
            ctx.moveTo(rng() * size, rng() * size);
            ctx.lineTo(rng() * size, rng() * size);
            ctx.stroke();
          }
          break;
        case 'leaf':
          ctx.clearRect(0, 0, size, size);
          ctx.fillStyle = '#fb923c';
          ctx.beginPath();
          ctx.moveTo(size * 0.5, size * 0.06);
          ctx.bezierCurveTo(size * 0.18, size * 0.22, size * 0.08, size * 0.54, size * 0.48, size * 0.92);
          ctx.bezierCurveTo(size * 0.92, size * 0.56, size * 0.82, size * 0.22, size * 0.5, size * 0.06);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#7c2d12';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(size * 0.5, size * 0.1);
          ctx.lineTo(size * 0.48, size * 0.88);
          ctx.stroke();
          break;
        case 'feather':
          ctx.clearRect(0, 0, size, size);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(size * 0.5, size * 0.06);
          ctx.lineTo(size * 0.5, size * 0.92);
          ctx.stroke();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 4;
          for (var fi = 0; fi < 22; fi += 1) {
            var fy = size * (0.12 + fi * 0.033);
            var flen = size * (0.10 + (1 - Math.abs(fi - 11) / 11) * 0.22);
            ctx.beginPath();
            ctx.moveTo(size * 0.5, fy);
            ctx.lineTo(size * 0.5 - flen, fy + 10);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(size * 0.5, fy);
            ctx.lineTo(size * 0.5 + flen * 0.55, fy + 8);
            ctx.stroke();
          }
          break;
        case 'umbrella': {
          var umb = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.08, size * 0.5, size * 0.5, size * 0.5);
          umb.addColorStop(0, '#f5ede1');
          umb.addColorStop(1, '#5b7690');
          ctx.fillStyle = umb;
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = 'rgba(255,255,255,0.30)';
          ctx.lineWidth = 6;
          for (var ui = 0; ui < 8; ui += 1) {
            var uang = ui * D.TAU / 8;
            ctx.beginPath();
            ctx.moveTo(size * 0.5, size * 0.5);
            ctx.lineTo(size * 0.5 + Math.cos(uang) * size * 0.46, size * 0.5 + Math.sin(uang) * size * 0.46);
            ctx.stroke();
          }
          break;
        }
        case 'shuttlecock':
          ctx.fillStyle = '#fefce8';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = 'rgba(148,163,184,0.22)';
          ctx.lineWidth = 5;
          for (var si = 0; si < 12; si += 1) {
            var sx = 34 + si * 38;
            ctx.beginPath();
            ctx.moveTo(sx, 18);
            ctx.lineTo(size * 0.5, size - 22);
            ctx.stroke();
          }
          ctx.fillStyle = '#d97706';
          ctx.fillRect(0, size * 0.05, size, size * 0.08);
          break;
        case 'frisbee':
          ctx.fillStyle = '#4da4d8';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#10212f';
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.arc(size * 0.5, size * 0.5, size * 0.34, 0, D.TAU);
          ctx.stroke();
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(size * 0.5, size * 0.5, size * 0.17, 0, D.TAU);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.72)';
          ctx.fillRect(size * 0.16, size * 0.44, size * 0.68, size * 0.08);
          break;
        case 'crate':
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          for (var ci = 0; ci < 5; ci += 1) ctx.fillRect(0, ci * size / 5 + 12, size, 8);
          ctx.strokeStyle = '#5b3717';
          ctx.lineWidth = 16;
          ctx.strokeRect(22, 22, size - 44, size - 44);
          ctx.beginPath();
          ctx.moveTo(40, 40);
          ctx.lineTo(size - 40, size - 40);
          ctx.moveTo(size - 40, 40);
          ctx.lineTo(40, size - 40);
          ctx.stroke();
          break;
        case 'brick':
          ctx.fillStyle = '#b45309';
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = '#f5d7b2';
          ctx.lineWidth = 8;
          for (var bry = 0; bry <= size; bry += 96) {
            ctx.beginPath();
            ctx.moveTo(0, bry);
            ctx.lineTo(size, bry);
            ctx.stroke();
          }
          for (var bry2 = 0; bry2 < size; bry2 += 96) {
            var boff = (bry2 / 96) % 2 ? 0 : 64;
            for (var brx = boff; brx <= size; brx += 128) {
              ctx.beginPath();
              ctx.moveTo(brx, bry2);
              ctx.lineTo(brx, Math.min(size, bry2 + 96));
              ctx.stroke();
            }
          }
          break;
        default:
          ctx.fillStyle = hex(baseColor);
          ctx.fillRect(0, 0, size, size);
          drawNoiseDots(ctx, size, rng, 220, '#ffffff', 0.03, 0.08, 2.1);
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 2;
          ctx.strokeRect(10, 10, size - 20, size - 20);
          break;
      }
    });
  }

  /* ---- public API ---- */

  window.WindSimTextures = {
    SURFACE_WORLD_TILE: SURFACE_WORLD_TILE,
    GRID_WORLD_TILE: GRID_WORLD_TILE,
    seedFromText: seedFromText,
    makeRng: makeRng,
    rgbFromHex: rgbFromHex,
    mixRgb: mixRgb,
    rgba: rgba,
    init: init,
    surfaceMaterialProps: surfaceMaterialProps,
    getSurfaceTexture: getSurfaceTexture,
    getGridOverlayTexture: getGridOverlayTexture,
    getObjectTexture: getObjectTexture
  };
}());
