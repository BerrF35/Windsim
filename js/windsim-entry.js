import * as React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import htm from 'https://esm.sh/htm@3.1.1';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'https://esm.sh/motion@11.18.2/react?external=react,react-dom';
import { gsap } from 'https://esm.sh/gsap@3.12.7';
import { ScrollTrigger } from 'https://esm.sh/gsap@3.12.7/ScrollTrigger';
import Lenis from 'https://esm.sh/lenis@1.1.16';

gsap.registerPlugin(ScrollTrigger);

const html = htm.bind(React.createElement);

const ENTRY_PREFS_KEY = 'windsim-entry-prefs-v1';
const ENTRY_RECENTS_KEY = 'windsim-entry-recents-v1';
const TRANSITION_MS = 980;
const MAX_RECENTS = 6;

const DEFAULT_PREFS = {
  hasVisited: false,
  skipIntro: false,
  lastMode: 'quick-start'
};

const STORY_CHAPTERS = [
  {
    index: '01',
    id: 'field',
    title: 'Wind needs structure before it becomes useful.',
    body: 'The opening pass frames the chamber as an instrument, not a toy. The motion is slow, the field cues are deliberate, and the first decision is about how you want to work.',
    bullets: [
      'Flow cues stay abstract and honest. Nothing here pretends to be solved CFD.',
      'The simulator is already live underneath, so the entry never feels like a disconnected splash screen.',
      'Returning users can jump forward without killing the experience for first-time users.'
    ]
  },
  {
    index: '02',
    id: 'body',
    title: 'Objects, attitude, and telemetry stay legible under motion.',
    body: 'Instead of dropping users into a dense control wall, the landing sequence introduces the parts of the lab in a controlled order: body, field, energy, and workflow.',
    bullets: [
      'Background motion stays slow; interface motion stays medium; interaction motion stays fast.',
      'The narrative is short enough to respect real users, but rich enough to establish what WindSim actually is.',
      'Reduced-motion users get the same routing without the choreography burden.'
    ]
  },
  {
    index: '03',
    id: 'lab',
    title: 'Modes route into real workflows, not empty categories.',
    body: 'Each path lands on a concrete simulator state. Quick Start restores momentum, Guided Experiment sets up a readable aero case, Sandbox stays open-ended, and Advanced Mode goes straight into mounted analysis.',
    bullets: [
      'Selections apply real preset or scenario data through the existing simulator APIs.',
      'Recent runs are persisted as exact scenario snapshots so a restart can be fast and repeatable.',
      'The transition is one page, one app, one chamber. The overlay yields the stage instead of hard-switching it.'
    ]
  }
];

const PRESET_COPY = {
  baseline: 'Balanced chamber setup with the default soccer case.',
  crosswind: 'Forward launch with lateral wind for attitude and drift reads.',
  storm: 'High-energy gust front that stresses stability and collision behavior.',
  highalt: 'Thin-air case with shear and lower density response.',
  spinlab: 'Spin-heavy disc case for lift, yaw, and Magnus reading.',
  freight: 'Large box geometry with higher inertia and tunnel-style flow.',
  vortexlab: 'Swirl-dominant case for wake cues and flow field sampling.',
  waketest: 'Wake-biased shuttlecock case with strong directional settling.'
};

const MODE_LIBRARY = [
  {
    id: 'quick-start',
    kicker: 'Fast Entry',
    title: 'Quick Start',
    copy: 'Open the chamber with minimal friction. If you have a recent run, it comes back first. Otherwise the baseline preset is loaded immediately.',
    signature: 'baseline recovery',
    cadence: 'instant',
    focus: 'momentum',
    meta: [
      ['routing', 'recent or baseline'],
      ['pace', 'fastest path'],
      ['best for', 'repeat visits']
    ],
    launchLabel: 'Enter Fast',
    previewLabel: 'What loads'
  },
  {
    id: 'guided',
    kicker: 'Curated Path',
    title: 'Guided Experiment',
    copy: 'Launch into a readable aero case with graphing, labels, and measurement aids already turned on so the first run teaches while it moves.',
    signature: 'spinlab read',
    cadence: 'measured',
    focus: 'first analysis',
    meta: [
      ['routing', 'spinlab-based'],
      ['pace', 'guided'],
      ['best for', 'first real look']
    ],
    launchLabel: 'Start Guided',
    previewLabel: 'Preview setup'
  },
  {
    id: 'sandbox',
    kicker: 'Open Lab',
    title: 'Sandbox Mode',
    copy: 'Start from a clean baseline and shape the chamber from scratch. This keeps the simulator feeling direct for people who already know where they want to go.',
    signature: 'open chamber',
    cadence: 'freeform',
    focus: 'experimentation',
    meta: [
      ['routing', 'baseline preset'],
      ['pace', 'open-ended'],
      ['best for', 'free exploration']
    ],
    launchLabel: 'Open Sandbox',
    previewLabel: 'Preview setup'
  },
  {
    id: 'advanced',
    kicker: 'Mounted Study',
    title: 'Advanced Mode',
    copy: 'Drop into a mounted tunnel-style setup with field slice and analysis aids active. This is the shortest path to a more instrument-like workflow.',
    signature: 'mounted tunnel',
    cadence: 'instrument',
    focus: 'force study',
    meta: [
      ['routing', 'mounted tunnel'],
      ['pace', 'focused'],
      ['best for', 'analysis workflow']
    ],
    launchLabel: 'Open Advanced',
    previewLabel: 'Preview setup'
  },
  {
    id: 'load',
    kicker: 'Library',
    title: 'Load Preset / Recent Run',
    copy: 'Open the preset library, saved scenarios, or your recent launch history. This keeps the landing useful instead of decorative.',
    signature: 'state library',
    cadence: 'selective',
    focus: 'specific setup',
    meta: [
      ['routing', 'presets + saves'],
      ['pace', 'selective'],
      ['best for', 'specific setups']
    ],
    launchLabel: 'Open Library',
    previewLabel: 'Browse sources'
  }
];

const PREVIEW_DOTS = [
  { x: 18, y: 30, accent: false },
  { x: 34, y: 44, accent: false },
  { x: 51, y: 37, accent: true },
  { x: 64, y: 54, accent: false },
  { x: 78, y: 33, accent: true },
  { x: 90, y: 58, accent: false }
];

function safeReadJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (err) {
    return fallback;
  }
}

function safeWriteJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* ignore storage failures */
  }
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function titleize(value) {
  return String(value || '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\b\w/g, function (char) { return char.toUpperCase(); });
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'just now';
  const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 45) return 'just now';
  if (deltaSeconds < 3600) return Math.round(deltaSeconds / 60) + ' min ago';
  if (deltaSeconds < 86400) return Math.round(deltaSeconds / 3600) + ' hr ago';
  return Math.round(deltaSeconds / 86400) + ' day ago';
}

function waitForSimulator(maxWaitMs) {
  return new Promise(function (resolve, reject) {
    const start = performance.now();
    function tick() {
      if (window.WindSimApp) {
        resolve(window.WindSimApp);
        return;
      }
      if (performance.now() - start > maxWaitMs) {
        reject(new Error('WindSimApp did not initialize in time.'));
        return;
      }
      window.setTimeout(tick, 60);
    }
    tick();
  });
}

function makeRecentRecord(selection, simulator) {
  const snapshot = simulator && typeof simulator.getScenarioSnapshot === 'function'
    ? simulator.getScenarioSnapshot()
    : clone(selection && selection.scenario);
  if (!snapshot) return null;
  makeRecentRecord.sequence = (makeRecentRecord.sequence || 0) + 1;
  return {
    id: 'recent-' + Date.now() + '-' + makeRecentRecord.sequence,
    modeId: selection.modeId || 'quick-start',
    title: selection.recentTitle || selection.title || titleize(selection.modeId || 'run'),
    kicker: selection.recentKicker || 'Recent Run',
    copy: selection.recentCopy || selection.copy || 'Restored simulator state.',
    timestamp: Date.now(),
    scenario: snapshot,
    presetKey: selection.presetKey || '',
    savedScenarioName: selection.savedScenarioName || ''
  };
}

function buildGuidedScenario() {
  const D = window.WindSimData;
  const scenario = clone(D.PRESETS.spinlab);
  scenario.analysis = Object.assign({}, clone(D.DEFAULT_ANALYSIS), scenario.analysis || {}, {
    forceLabels: true,
    graph: true,
    ruler: true,
    markers: true,
    impacts: true
  });
  scenario.seed = 7781;
  return scenario;
}

function buildSandboxScenario() {
  return clone(window.WindSimData.PRESETS.baseline);
}

function buildAdvancedScenario() {
  const D = window.WindSimData;
  const scenario = clone(D.PRESETS.freight);
  scenario.obj = 'crate';
  scenario.surf = 'concrete';
  scenario.testMode = 'mounted';
  scenario.wind = Object.assign({}, scenario.wind || {}, {
    speed: 24,
    azim: 90,
    elev: 0,
    turb: 8,
    gust: 4,
    mode: 'tunnel',
    modeStrength: 72
  });
  scenario.launch = {
    h0: 4.5,
    vx: 0,
    vy: 0,
    vz: 0,
    omx: 0,
    omy: 0,
    omz: 0
  };
  scenario.world = Object.assign({}, scenario.world || {}, {
    ceiling: 220,
    halfWidth: 120,
    halfDepth: 120
  });
  scenario.analysis = Object.assign({}, clone(D.DEFAULT_ANALYSIS), scenario.analysis || {}, {
    forceLabels: true,
    graph: true,
    ruler: true,
    markers: true,
    impacts: true,
    flowSlice: true,
    flowSlicePlane: 'vertical_x',
    flowSliceHeight: 4.5,
    flowSliceSpan: 34
  });
  scenario.cam = Object.assign({}, scenario.cam || {}, {
    follow: false,
    distance: 20,
    yaw: -18,
    pitch: 22,
    fov: 46,
    lag: 0.04
  });
  scenario.seed = 6421;
  return scenario;
}

function summarizePresets() {
  const presets = window.WindSimData && window.WindSimData.PRESETS ? window.WindSimData.PRESETS : {};
  return Object.keys(presets).map(function (key) {
    const preset = presets[key] || {};
    return {
      id: 'preset-' + key,
      modeId: 'load',
      source: 'preset',
      presetKey: key,
      title: titleize(key),
      kicker: 'Built-in Preset',
      copy: PRESET_COPY[key] || 'Launch a built-in chamber configuration.',
      foot: (preset.obj ? titleize(preset.obj) : 'Object') + ' / ' + (preset.wind && preset.wind.mode ? titleize(preset.wind.mode) : 'wind'),
      toast: {
        kicker: 'Preset Loaded',
        title: titleize(key),
        copy: PRESET_COPY[key] || 'Built-in chamber configuration.'
      }
    };
  });
}

function buildQuickStartSelection(recents) {
  if (recents && recents.length && recents[0].scenario) {
    return {
      modeId: 'quick-start',
      source: 'recent',
      scenario: clone(recents[0].scenario),
      title: 'Quick Start',
      copy: 'Restores your most recent simulator state and gets you moving immediately.',
      recentTitle: recents[0].title || 'Recent Run',
      recentKicker: 'Recent Run',
      recentCopy: recents[0].copy || 'Restored from recent history.',
      toast: {
        kicker: 'Quick Start',
        title: recents[0].title || 'Recent Run',
        copy: recents[0].copy || 'Most recent chamber state restored.'
      }
    };
  }
  return {
    modeId: 'quick-start',
    source: 'preset',
    presetKey: 'baseline',
    title: 'Quick Start',
    copy: 'Loads the baseline chamber so the entry stays fast even without recent history.',
    toast: {
      kicker: 'Quick Start',
      title: 'Baseline',
      copy: 'Baseline chamber loaded.'
    }
  };
}

function buildModeSelection(modeId, recents) {
  if (modeId === 'quick-start') return buildQuickStartSelection(recents);
  if (modeId === 'guided') {
    return {
      modeId: 'guided',
      source: 'scenario',
      scenario: buildGuidedScenario(),
      title: 'Guided Experiment',
      copy: 'Spinlab case with analysis aids enabled.',
      toast: {
        kicker: 'Guided Experiment',
        title: 'Spinlab',
        copy: 'Readable aero case loaded with graphing and field cues.'
      }
    };
  }
  if (modeId === 'sandbox') {
    return {
      modeId: 'sandbox',
      source: 'scenario',
      scenario: buildSandboxScenario(),
      title: 'Sandbox Mode',
      copy: 'Baseline preset opened for free exploration.',
      toast: {
        kicker: 'Sandbox Mode',
        title: 'Baseline',
        copy: 'Clean chamber state loaded for open exploration.'
      }
    };
  }
  if (modeId === 'advanced') {
    return {
      modeId: 'advanced',
      source: 'scenario',
      scenario: buildAdvancedScenario(),
      title: 'Advanced Mode',
      copy: 'Mounted tunnel workflow with field slice and measurement aids.',
      toast: {
        kicker: 'Advanced Mode',
        title: 'Mounted Tunnel',
        copy: 'Mounted reduced-order analysis setup loaded.'
      }
    };
  }
  return null;
}

function buildPreviewPaths() {
  const paths = [];
  for (let index = 0; index < 8; index += 1) {
    const y = 12 + index * 10;
    let path = 'M -6 ' + y;
    for (let x = 8; x <= 106; x += 12) {
      const wave = Math.sin((x * 0.12) + index * 0.8) * (3.2 - index * 0.12) + Math.cos((x * 0.04) + index * 0.55) * 1.6;
      path += ' L ' + x + ' ' + (y + wave).toFixed(2);
    }
    paths.push({
      d: path,
      accent: index === 2 || index === 5
    });
  }
  return paths;
}

const PREVIEW_PATHS = buildPreviewPaths();

const TEXT_PRESETS = {
  blur: {
    hidden: { opacity: 0, filter: 'blur(14px)', y: 22 },
    visible: { opacity: 1, filter: 'blur(0px)', y: 0 }
  },
  slide: {
    hidden: { opacity: 0, y: 28 },
    visible: { opacity: 1, y: 0 }
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  },
  scale: {
    hidden: { opacity: 0, scale: 0.86 },
    visible: { opacity: 1, scale: 1 }
  }
};

function splitTextSegments(text, per) {
  if (per === 'line') return String(text || '').split('\n');
  if (per === 'char') return Array.from(String(text || ''));
  return String(text || '').split(/(\s+)/).filter(function (segment) { return segment.length; });
}

function TextEffect(props) {
  const per = props.per || 'word';
  const as = props.as || 'div';
  const segments = React.useMemo(function () {
    return splitTextSegments(props.children || '', per);
  }, [props.children, per]);
  const MotionTag = motion[as] || motion.div;
  const preset = TEXT_PRESETS[props.preset || 'slide'] || TEXT_PRESETS.slide;
  const stagger = per === 'char' ? 0.024 : (per === 'line' ? 0.12 : 0.055);

  return html`
    <${MotionTag}
      className=${props.className || ''}
      initial="hidden"
      animate=${props.trigger === false ? 'hidden' : 'visible'}
      variants=${{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            delayChildren: props.delay || 0,
            staggerChildren: stagger
          }
        }
      }}
    >
      ${segments.map(function (segment, index) {
        return html`
          <motion.span
            key=${per + '-' + index + '-' + segment}
            variants=${preset}
            className=${per === 'line' ? 'entry-text-line' : 'entry-text-segment'}
            transition=${{ duration: props.reducedMotion ? 0.01 : 0.72, ease: [0.22, 1, 0.36, 1] }}
            style=${{
              display: per === 'line' ? 'block' : 'inline-block',
              whiteSpace: per === 'char' ? 'pre' : 'inherit'
            }}
          >
            ${segment}
          </motion.span>
        `;
      })}
    </${MotionTag}>
  `;
}

function ShaderAnimation(props) {
  const containerRef = React.useRef(null);
  const frameRef = React.useRef(0);
  const sceneRef = React.useRef(null);

  React.useEffect(function () {
    const container = containerRef.current;
    const THREE = window.THREE;
    if (!container || !THREE) return undefined;

    const camera = new THREE.Camera();
    camera.position.z = 1;

    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);
    const uniforms = {
      time: { value: 1.0 },
      resolution: { value: new THREE.Vector2() },
      accent: { value: new THREE.Color(0xec725a) },
      glow: { value: new THREE.Color(0xf5eee7) },
      density: { value: props.variant === 'boot' ? 1.08 : 0.82 }
    };

    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        #define PI 3.14159265359
        precision highp float;

        uniform vec2 resolution;
        uniform float time;
        uniform vec3 accent;
        uniform vec3 glow;
        uniform float density;

        void main(void) {
          vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
          float t = time * 0.035;
          float radius = length(uv * vec2(1.0, 1.18));
          vec3 color = vec3(0.0);

          for (int j = 0; j < 3; j++) {
            for (int i = 0; i < 5; i++) {
              float phase = fract(t - 0.012 * float(j) + float(i) * 0.018) * 4.0;
              float band = abs(phase - radius + mod(uv.x * 0.72 + uv.y * 0.46, 0.18));
              vec3 tint = mix(accent, glow, float(j) * 0.45);
              color += tint * (0.0013 + 0.00055 * float(i * i)) / max(band, 0.022);
            }
          }

          float lattice = 0.025 / (0.06 + abs(fract((uv.x - uv.y * 0.35) * 7.0 + t) - 0.5));
          color += accent * lattice * 0.05 * density;

          float vignette = smoothstep(1.42, 0.16, radius);
          float haze = smoothstep(0.92, 0.18, abs(uv.y + 0.16));
          gl_FragColor = vec4(color * vignette * haze, clamp(vignette * 0.92, 0.0, 1.0));
        }
      `
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    function resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      uniforms.resolution.value.x = renderer.domElement.width;
      uniforms.resolution.value.y = renderer.domElement.height;
      renderer.render(scene, camera);
    }

    function renderFrame() {
      uniforms.time.value += props.reducedMotion ? 0.015 : 0.05;
      renderer.render(scene, camera);
      if (!props.reducedMotion) {
        frameRef.current = window.requestAnimationFrame(renderFrame);
      }
    }

    sceneRef.current = { renderer: renderer, geometry: geometry, material: material };
    resize();
    if (!props.reducedMotion) {
      frameRef.current = window.requestAnimationFrame(renderFrame);
    }
    window.addEventListener('resize', resize);

    return function () {
      window.removeEventListener('resize', resize);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
      renderer.forceContextLoss();
      geometry.dispose();
      material.dispose();
      sceneRef.current = null;
    };
  }, [props.reducedMotion, props.variant]);

  return html`<div ref=${containerRef} className=${props.className || 'entry-shader-surface'} aria-hidden="true"></div>`;
}

function buildFloatingPath(index, direction) {
  return `M-${380 - index * 6 * direction} -${188 + index * 7}C-${380 - index * 6 * direction} -${188 + index * 7} -${312 - index * 5 * direction} ${214 - index * 5} ${152 - index * 6 * direction} ${340 - index * 5}C${616 - index * 4 * direction} ${468 - index * 5} ${684 - index * 4 * direction} ${876 - index * 6} ${684 - index * 4 * direction} ${876 - index * 6}`;
}

function FloatingPaths(props) {
  const paths = React.useMemo(function () {
    return Array.from({ length: props.count || 18 }, function (_, index) {
      return {
        id: (props.direction || 1) + '-' + index,
        d: buildFloatingPath(index, props.direction || 1),
        opacity: 0.05 + index * 0.018,
        width: 0.55 + index * 0.036,
        duration: 16 + index * 0.55
      };
    });
  }, [props.count, props.direction]);

  return html`
    <div className=${props.className || 'entry-floating-paths'} aria-hidden="true">
      <svg className="entry-floating-svg" viewBox="0 0 696 316" fill="none">
        ${paths.map(function (path) {
          return html`
            <motion.path
              key=${path.id}
              d=${path.d}
              className="entry-floating-path"
              strokeWidth=${path.width}
              strokeOpacity=${path.opacity}
              initial=${{ pathLength: 0.3, opacity: path.opacity * 0.65 }}
              animate=${props.reducedMotion ? { pathLength: 1, opacity: path.opacity * 0.85 } : {
                pathLength: 1,
                opacity: [path.opacity * 0.45, path.opacity, path.opacity * 0.45],
                pathOffset: [0, 1, 0]
              }}
              transition=${{
                duration: props.reducedMotion ? 0.01 : path.duration,
                repeat: props.reducedMotion ? 0 : Infinity,
                ease: 'linear'
              }}
            ></motion.path>
          `;
        })}
      </svg>
    </div>
  `;
}

function BackgroundPaths(props) {
  return html`
    <div className=${props.className || 'entry-background-paths'} aria-hidden="true">
      <${FloatingPaths} direction=${1} reducedMotion=${props.reducedMotion} />
      <${FloatingPaths} direction=${-1} reducedMotion=${props.reducedMotion} />
    </div>
  `;
}

function Waves(props) {
  const containerRef = React.useRef(null);
  const svgRef = React.useRef(null);
  const pathsRef = React.useRef([]);
  const pointerRef = React.useRef({ x: 0.5, y: 0.5, active: false });
  const frameRef = React.useRef(0);
  const sizeRef = React.useRef({ width: 0, height: 0 });

  React.useEffect(function () {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return undefined;

    function createPaths() {
      const rect = container.getBoundingClientRect();
      sizeRef.current = { width: rect.width, height: rect.height };
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      pathsRef.current = [];
      const lineCount = Math.max(10, Math.min(18, Math.round(rect.width / 74)));
      for (let index = 0; index < lineCount; index += 1) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', props.strokeColor || 'rgba(245,238,231,0.54)');
        path.setAttribute('stroke-width', index % 3 === 0 ? '1.2' : '0.9');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-opacity', (0.18 + index * 0.028).toFixed(3));
        svg.appendChild(path);
        pathsRef.current.push(path);
      }
      container.style.setProperty('--entry-wave-x', '50%');
      container.style.setProperty('--entry-wave-y', '50%');
    }

    function updatePointer(clientX, clientY) {
      const rect = container.getBoundingClientRect();
      const normalizedX = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
      const normalizedY = clamp((clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
      pointerRef.current = { x: normalizedX, y: normalizedY, active: true };
      container.style.setProperty('--entry-wave-x', (normalizedX * 100).toFixed(2) + '%');
      container.style.setProperty('--entry-wave-y', (normalizedY * 100).toFixed(2) + '%');
    }

    function handleMove(event) {
      updatePointer(event.clientX, event.clientY);
    }

    function handleLeave() {
      pointerRef.current.active = false;
    }

    function draw(time) {
      const width = sizeRef.current.width;
      const height = sizeRef.current.height;
      if (!width || !height) {
        frameRef.current = window.requestAnimationFrame(draw);
        return;
      }
      pathsRef.current.forEach(function (path, index) {
        const count = Math.max(pathsRef.current.length - 1, 1);
        const baseX = width * (index / count);
        let d = 'M ' + baseX.toFixed(2) + ' -24';
        for (let step = 0; step <= 16; step += 1) {
          const y = (height + 48) * (step / 16) - 24;
          const phase = (time * 0.00035) + index * 0.24;
          const oscillation = Math.sin(y * 0.014 + phase) * 16 + Math.cos(y * 0.008 - phase * 0.8) * 6;
          const pointerDx = baseX - pointerRef.current.x * width;
          const pointerDy = y - pointerRef.current.y * height;
          const distance = Math.hypot(pointerDx, pointerDy);
          const influence = pointerRef.current.active ? Math.max(0, 1 - distance / 220) : 0;
          const displacement = oscillation + influence * 42 * Math.sign(pointerDx || 1);
          d += ' L ' + (baseX + displacement).toFixed(2) + ' ' + y.toFixed(2);
        }
        path.setAttribute('d', d);
      });
      if (!props.reducedMotion) {
        frameRef.current = window.requestAnimationFrame(draw);
      }
    }

    function handleResize() {
      createPaths();
      if (props.reducedMotion) draw(0);
    }

    createPaths();
    if (props.reducedMotion) draw(0);
    else frameRef.current = window.requestAnimationFrame(draw);

    window.addEventListener('resize', handleResize);
    container.addEventListener('pointermove', handleMove);
    container.addEventListener('pointerleave', handleLeave);

    return function () {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointermove', handleMove);
      container.removeEventListener('pointerleave', handleLeave);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [props.reducedMotion, props.strokeColor]);

  return html`
    <div ref=${containerRef} className=${props.className || 'entry-waves'} aria-hidden="true">
      <svg ref=${svgRef} className="entry-waves-svg" xmlns="http://www.w3.org/2000/svg"></svg>
      <div className="entry-waves-pointer"></div>
    </div>
  `;
}

function useHeroExpansion(options) {
  const { wrapperRef, heroRef, previewRef, overlayOpen, reducedMotion } = options;

  React.useLayoutEffect(function () {
    if (!overlayOpen || !wrapperRef.current || !heroRef.current || !previewRef.current) return undefined;
    const target = previewRef.current;
    target.style.setProperty('--entry-preview-expand', '0');
    if (reducedMotion) return undefined;

    const trigger = ScrollTrigger.create({
      trigger: heroRef.current,
      scroller: wrapperRef.current,
      start: 'top top',
      end: 'bottom top',
      scrub: 0.55,
      onUpdate: function (self) {
        target.style.setProperty('--entry-preview-expand', self.progress.toFixed(3));
      }
    });

    return function () {
      target.style.removeProperty('--entry-preview-expand');
      trigger.kill();
    };
  }, [heroRef, overlayOpen, previewRef, reducedMotion, wrapperRef]);
}

function chapterFill(progress, index) {
  const scaled = progress * STORY_CHAPTERS.length - index;
  return clamp(scaled, 0, 1);
}

function useLenis(wrapperRef, contentRef, enabled) {
  const lenisRef = React.useRef(null);

  React.useEffect(function () {
    if (!enabled || !wrapperRef.current || !contentRef.current) return undefined;
    const lenis = new Lenis({
      wrapper: wrapperRef.current,
      content: contentRef.current,
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.9,
      duration: 1.05
    });
    lenisRef.current = lenis;

    function onTick(time) {
      lenis.raf(time * 1000);
    }

    function onScroll() {
      ScrollTrigger.update();
    }

    lenis.on('scroll', onScroll);
    gsap.ticker.add(onTick);

    return function () {
      gsap.ticker.remove(onTick);
      lenis.off('scroll', onScroll);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [contentRef, enabled, wrapperRef]);

  return lenisRef;
}

function useStoryChoreography(options) {
  const {
    wrapperRef,
    storyRef,
    chapterRefs,
    shellRef,
    fieldRef,
    bodyRef,
    traceRef,
    hudRef,
    visualCopyRef,
    overlayOpen,
    reducedMotion,
    onProgress,
    onActiveChapter
  } = options;

  React.useLayoutEffect(function () {
    if (!overlayOpen || !wrapperRef.current || !storyRef.current) return undefined;

    const ctx = gsap.context(function () {
      ScrollTrigger.create({
        trigger: storyRef.current,
        scroller: wrapperRef.current,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: function (self) {
          onProgress(self.progress);
          if (shellRef.current) {
            shellRef.current.style.setProperty('--entry-story-progress', self.progress.toFixed(3));
          }
        }
      });

      chapterRefs.current.forEach(function (step, index) {
        if (!step) return;
        ScrollTrigger.create({
          trigger: step,
          scroller: wrapperRef.current,
          start: 'top center',
          end: 'bottom center',
          onToggle: function (self) {
            if (self.isActive) onActiveChapter(index);
          }
        });
      });

      if (reducedMotion) return;

      [
        [fieldRef.current, { xPercent: -5, yPercent: -4, rotate: -6 }],
        [bodyRef.current, { xPercent: 8, yPercent: -10, rotate: 10 }],
        [traceRef.current, { xPercent: 5, yPercent: -5, rotate: -2 }],
        [hudRef.current, { yPercent: -8 }],
        [visualCopyRef.current, { yPercent: -12 }]
      ].forEach(function (entry) {
        if (!entry[0]) return;
        gsap.to(entry[0], Object.assign({}, entry[1], {
          ease: 'none',
          scrollTrigger: {
            trigger: storyRef.current,
            scroller: wrapperRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6
          }
        }));
      });
    }, storyRef.current);

    return function () {
      ctx.revert();
    };
  }, [chapterRefs, fieldRef, bodyRef, traceRef, hudRef, onActiveChapter, onProgress, overlayOpen, reducedMotion, shellRef, storyRef, wrapperRef]);
}

function LoadingShell(props) {
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return html`
    <div className="entry-app">
      <div className="entry-overlay">
        <div className="entry-scroll">
          <div className="entry-content">
            <div className="entry-shell">
              <section className="entry-section entry-hero">
                <div className="entry-hero-copy">
                  <div className="entry-kicker"><span className="entry-kicker-dot"></span>${props.error ? 'Entry system error' : (props.ready ? 'Boot complete' : 'Initializing simulator')}</div>
                  <${TextEffect}
                    as="h1"
                    per="line"
                    preset="blur"
                    className="entry-hero-title"
                    reducedMotion=${prefersReducedMotion}
                  >
                    ${props.error ? 'WindSim could not\nfinish booting.' : (props.ready ? 'Handing off to\nthe entry experience.' : 'Preparing\nthe chamber.')}
                  </${TextEffect}>
                  <p className="entry-hero-lead">${props.error ? props.error : (props.ready ? 'Core systems are up. Finalizing the first-load experience before opening the lab.' : 'Loading the simulator, renderer, saved state, and entry routing before the front door opens.')}</p>
                  <div className="entry-boot-row">
                    <div className="entry-boot-label">${props.error ? 'status' : (props.ready ? 'stage' : 'boot')}</div>
                    <div className="entry-boot-track"><div className=${props.error ? 'entry-boot-fill is-error' : (props.ready ? 'entry-boot-fill is-ready' : 'entry-boot-fill')}></div></div>
                  </div>
                </div>
                <div className="entry-preview">
                  <${ShaderAnimation} className="entry-stage-shader is-boot" variant="boot" reducedMotion=${prefersReducedMotion} />
                  <${BackgroundPaths} className="entry-background-paths is-boot" reducedMotion=${prefersReducedMotion} />
                  <div className="entry-preview-grid"></div>
                  <div className="entry-preview-head">
                    <div className="entry-panel-tag">WindSim / boot</div>
                    <div className="entry-preview-note">${props.error ? 'Refresh once if the module graph was interrupted.' : (props.ready ? 'Simulator live. Opening the entry flow next.' : 'Waiting for the live simulator surface, module graph, and launch routing to settle.')}</div>
                  </div>
                  <div className="entry-stage">
                    <div className="entry-boot-grid" aria-hidden="true"></div>
                    <div className="entry-boot-pulse"></div>
                    <div className="entry-stage-hud">
                      <div className="entry-stage-hud-card"><div className="entry-stage-hud-label">renderer</div><div className="entry-stage-hud-value">${props.error ? 'halted' : (props.ready ? 'ready' : 'syncing')}</div></div>
                      <div className="entry-stage-hud-card"><div className="entry-stage-hud-label">routing</div><div className="entry-stage-hud-value">${props.error ? 'check' : (props.ready ? 'armed' : 'mounting')}</div></div>
                      <div className="entry-stage-hud-card"><div className="entry-stage-hud-label">handoff</div><div className="entry-stage-hud-value">${props.error ? 'retry' : (props.ready ? 'opening' : 'holding')}</div></div>
                      <div className="entry-stage-hud-card"><div className="entry-stage-hud-label">destination</div><div className="entry-stage-hud-value">entry</div></div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function PreviewStage(props) {
  const active = props.active || STORY_CHAPTERS[0];
  const mode = props.mode || MODE_LIBRARY[0];
  const [pointer, setPointer] = React.useState({ x: 0, y: 0 });

  function handlePointerMove(event) {
    if (props.reducedMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const normalizedY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    setPointer({
      x: clamp(normalizedX, -1, 1),
      y: clamp(normalizedY, -1, 1)
    });
  }

  function handlePointerLeave() {
    setPointer({ x: 0, y: 0 });
  }

  return html`
    <div className="entry-preview entry-preview-immersive" ref=${props.previewRef}>
      <${ShaderAnimation} className="entry-stage-shader" variant="hero" reducedMotion=${props.reducedMotion} />
      <${BackgroundPaths} className="entry-background-paths" reducedMotion=${props.reducedMotion} />
      <div className="entry-preview-grid"></div>
      <div className="entry-preview-head">
        <div className="entry-panel-tag">Live chamber / ${mode.signature}</div>
        <div className="entry-preview-note">${mode.kicker} / ${mode.focus} / ${mode.cadence}</div>
      </div>
      <div className="entry-stage" onPointerMove=${handlePointerMove} onPointerLeave=${handlePointerLeave}>
        <motion.div className="entry-stage-depth" animate=${props.reducedMotion ? { rotateX: 0, rotateY: 0 } : { rotateX: pointer.y * -3, rotateY: pointer.x * 4 }} transition=${{ type: 'spring', stiffness: 110, damping: 16 }}></motion.div>
        <motion.div className="entry-stage-glow" animate=${props.reducedMotion ? { x: 0, y: 0 } : { x: pointer.x * 36, y: pointer.y * 24 }} transition=${{ type: 'spring', stiffness: 110, damping: 18 }}></motion.div>
        <motion.div className="entry-stage-grid-sweep" animate=${props.reducedMotion ? { x: 0 } : { x: pointer.x * 20 }} transition=${{ type: 'spring', stiffness: 80, damping: 18 }}></motion.div>
        <motion.div className="entry-stage-arc" animate=${props.reducedMotion ? { rotate: 0, scale: 1 } : { rotate: pointer.x * 7, scale: 1 + Math.abs(pointer.y) * 0.02 }} transition=${{ type: 'spring', stiffness: 90, damping: 17 }}></motion.div>
        <motion.div className="entry-stage-field" animate=${props.reducedMotion ? { x: 0, y: 0 } : { x: pointer.x * -14, y: pointer.y * -10 }} transition=${{ type: 'spring', stiffness: 90, damping: 18 }}>
          <svg className="entry-stage-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            ${PREVIEW_PATHS.map(function (path, index) {
              return html`<path key=${'path-' + index} className=${path.accent ? 'entry-stage-line is-accent' : 'entry-stage-line'} d=${path.d}></path>`;
            })}
            <path className="entry-stage-trace" d="M 14 74 C 28 62, 40 54, 54 48 S 76 36, 88 28"></path>
            ${PREVIEW_DOTS.map(function (dot, index) {
              return html`<circle key=${'dot-' + index} className=${dot.accent ? 'entry-stage-dot is-accent' : 'entry-stage-dot'} cx=${dot.x} cy=${dot.y} r=${dot.accent ? 1.45 : 1.05}></circle>`;
            })}
          </svg>
        </motion.div>
        <motion.div className="entry-stage-object-shell" animate=${props.reducedMotion ? { x: 0, y: 0, rotate: 0 } : { x: pointer.x * 16, y: pointer.y * 12, rotate: pointer.x * 5 }} transition=${{ type: 'spring', stiffness: 120, damping: 20 }}>
          <div className="entry-stage-object">
            <div className="entry-stage-object-core"></div>
            <div className="entry-stage-object-axis is-x"></div>
            <div className="entry-stage-object-axis is-y"></div>
          </div>
        </motion.div>
        <div className="entry-stage-strata">
          <span></span><span></span><span></span>
        </div>
        <div className="entry-stage-mode-band">
          ${MODE_LIBRARY.map(function (entry) {
            return html`<div key=${entry.id} className=${entry.id === mode.id ? 'entry-stage-mode-chip is-active' : 'entry-stage-mode-chip'}>${entry.title}</div>`;
          })}
        </div>
        <div className="entry-stage-callout">
          <div className="entry-stage-callout-kicker">${mode.kicker}</div>
          <${TextEffect} as="div" per="word" preset="slide" className="entry-stage-callout-title" reducedMotion=${props.reducedMotion}>${mode.title}</${TextEffect}>
          <div className="entry-stage-callout-copy">${active.body}</div>
        </div>
        <div className="entry-stage-hud">
          ${props.metrics.map(function (metric) {
            return html`
              <div key=${metric.label} className="entry-stage-hud-card">
                <div className="entry-stage-hud-label">${metric.label}</div>
                <div className="entry-stage-hud-value">${metric.value}</div>
              </div>
            `;
          })}
        </div>
      </div>
    </div>
  `;
}

function circularOffset(index, activeIndex, length) {
  let offset = index - activeIndex;
  if (offset > length / 2) offset -= length;
  if (offset < -length / 2) offset += length;
  return offset;
}

function ModeTheater(props) {
  const activeMode = props.activeMode;
  const count = MODE_LIBRARY.length;
  return html`
    <div className="entry-mode-theater">
      <div className="entry-mode-orbit">
        <${Waves} className="entry-mode-waves" reducedMotion=${props.reducedMotion} strokeColor="rgba(245,238,231,0.46)" />
        <div className="entry-mode-orbit-gradient"></div>
        ${MODE_LIBRARY.map(function (mode, index) {
          const offset = circularOffset(index, props.activeIndex, count);
          const distance = Math.abs(offset);
          const visible = distance <= 1;
          const x = offset * (props.isMobile ? 184 : 336);
          const y = distance === 0 ? 14 : 42;
          const scale = distance === 0 ? 1 : 0.82;
          return html`
            <motion.button
              key=${mode.id}
              className=${activeMode.id === mode.id ? 'entry-mode-orbit-card is-active' : 'entry-mode-orbit-card'}
              initial=${false}
              animate=${{
                x: x,
                y: y,
                scale: props.reducedMotion ? 1 : scale,
                opacity: visible ? (distance === 0 ? 1 : 0.34) : 0,
                filter: distance === 0 ? 'blur(0px)' : 'blur(1.2px)'
              }}
              transition=${{ duration: props.reducedMotion ? 0.12 : 0.48, ease: [0.22, 1, 0.36, 1] }}
              style=${{ zIndex: 10 - distance, pointerEvents: visible ? 'auto' : 'none' }}
              onMouseEnter=${function () { props.onSelect(mode.id); }}
              onFocus=${function () { props.onSelect(mode.id); }}
              onClick=${function () { props.onSelect(mode.id); }}
            >
              <div className="entry-mode-orbit-index">${String(index + 1).padStart(2, '0')}</div>
              <div className="entry-mode-orbit-title">${distance === 0 ? mode.title : mode.kicker}</div>
              <div className="entry-mode-orbit-copy">${distance === 0 ? mode.signature : mode.focus}</div>
              <div className="entry-mode-orbit-foot">${distance === 0 ? mode.cadence : 'inspect'}</div>
            </motion.button>
          `;
        })}
      </div>

      <AnimatePresence mode="wait" initial=${false}>
        <motion.div
          key=${activeMode.id}
          className="entry-mode-focus"
          initial=${{ opacity: 0, y: 10 }}
          animate=${{ opacity: 1, y: 0 }}
          exit=${{ opacity: 0, y: -10 }}
          transition=${{ duration: props.reducedMotion ? 0.12 : 0.34, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="entry-mode-focus-head">
            <div>
              <div className="entry-mode-focus-kicker">${activeMode.kicker}</div>
              <${TextEffect} as="div" per="word" preset="blur" className="entry-mode-focus-title" reducedMotion=${props.reducedMotion}>${activeMode.title}</${TextEffect}>
              <${TextEffect} as="div" per="word" preset="fade" className="entry-mode-focus-copy" reducedMotion=${props.reducedMotion}>${activeMode.copy}</${TextEffect}>
            </div>
            <div className="entry-mode-nav">
              <button className="entry-chip-btn" onClick=${function () { props.onShift(-1); }}>Prev</button>
              <button className="entry-chip-btn" onClick=${function () { props.onShift(1); }}>Next</button>
            </div>
          </div>
          <div className="entry-mode-focus-grid">
            <div className="entry-mode-focus-stack">
              ${activeMode.meta.map(function (row) {
                return html`
                  <div key=${activeMode.id + '-' + row[0]} className="entry-mode-focus-row">
                    <span>${row[0]}</span>
                    <strong>${row[1]}</strong>
                  </div>
                `;
              })}
            </div>
            <div className="entry-mode-focus-stack">
              <div className="entry-mode-focus-row"><span>signature</span><strong>${activeMode.signature}</strong></div>
              <div className="entry-mode-focus-row"><span>cadence</span><strong>${activeMode.cadence}</strong></div>
              <div className="entry-mode-focus-row"><span>focus</span><strong>${activeMode.focus}</strong></div>
            </div>
          </div>
          <div className="entry-mode-focus-actions">
            <button className="entry-primary-btn" onClick=${function () { props.onLaunch(activeMode.id); }}>${activeMode.launchLabel}</button>
            <button className="entry-ghost-btn" onClick=${function () { props.onPreview(activeMode.id); }}>${activeMode.previewLabel}</button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  `;
}

function StoryStep(props) {
  return html`
    <motion.article
      ref=${props.setRef}
      className="entry-story-step"
      initial=${{ opacity: 0.55, y: 20 }}
      whileInView=${{ opacity: 1, y: 0 }}
      viewport=${{ amount: 0.4, once: true }}
      transition=${{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="entry-story-step-index">${props.chapter.index}</div>
      <${TextEffect} as="h4" per="line" preset="blur" className="" reducedMotion=${props.reducedMotion}>${props.chapter.title}</${TextEffect}>
      <p>${props.chapter.body}</p>
      <div className="entry-story-bullets">
        ${props.chapter.bullets.map(function (bullet, index) {
          return html`<div key=${props.chapter.id + '-' + index} className="entry-story-bullet">${bullet}</div>`;
        })}
      </div>
    </motion.article>
  `;
}

function ModeCard(props) {
  const mode = props.mode;
  return html`
    <motion.article
      className="entry-mode-card"
      initial=${{ opacity: 0, y: 18 }}
      whileInView=${{ opacity: 1, y: 0 }}
      whileHover=${props.reducedMotion ? null : { y: -4 }}
      viewport=${{ once: true, amount: 0.2 }}
      transition=${{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter=${function () { props.onInspect(mode.id); }}
    >
      <div className="entry-mode-top">
        <div className="entry-mode-kicker">${mode.kicker}</div>
        <div className="entry-mode-title">${mode.title}</div>
        <div className="entry-mode-copy">${mode.copy}</div>
      </div>
      <div className="entry-mode-meta">
        ${mode.meta.map(function (row) {
          return html`
            <div key=${mode.id + '-' + row[0]} className="entry-mode-meta-row">
              <span>${row[0]}</span>
              <span>${row[1]}</span>
            </div>
          `;
        })}
      </div>
      <div className="entry-mode-actions">
        <button className="entry-primary-btn" onClick=${function () { props.onLaunch(mode.id); }}>${mode.launchLabel}</button>
        <button className="entry-chip-btn" onClick=${function () { props.onPreview(mode.id); }}>${mode.previewLabel}</button>
      </div>
    </motion.article>
  `;
}

function LaunchDrawer(props) {
  const tabs = [
    ['presets', 'Built-in Presets'],
    ['saved', 'Saved Scenarios'],
    ['recents', 'Recent Runs']
  ];

  function renderItems() {
    if (props.view === 'presets') {
      const presets = summarizePresets();
      return html`
        <div className="entry-launch-list">
          ${presets.map(function (item) {
            return html`
              <div key=${item.id} className="entry-launch-item">
                <div className="entry-launch-kicker">${item.kicker}</div>
                <div className="entry-launch-title">${item.title}</div>
                <div className="entry-launch-copy">${item.copy}</div>
                <div className="entry-launch-footer">
                  <span className="entry-launch-kicker">${item.foot}</span>
                  <button className="entry-chip-btn" onClick=${function () { props.onLaunch(item); }}>Launch</button>
                </div>
              </div>
            `;
          })}
        </div>
      `;
    }

    if (props.view === 'saved') {
      if (!props.savedScenarios.length) {
        return html`<div className="entry-empty">No saved scenarios yet. Save a chamber state from inside the simulator and it will show up here.</div>`;
      }
      return html`
        <div className="entry-launch-list">
          ${props.savedScenarios.map(function (entry, index) {
            return html`
              <div key=${entry.name + '-' + index} className="entry-launch-item">
                <div className="entry-launch-kicker">Saved Scenario</div>
                <div className="entry-launch-title">${entry.name}</div>
                <div className="entry-launch-copy">Loads the exact saved scenario snapshot, including wind, chamber, object, camera, and seed values.</div>
                <div className="entry-launch-footer">
                  <span className="entry-launch-kicker">${entry.scenario && entry.scenario.obj ? titleize(entry.scenario.obj) : 'Scenario snapshot'}</span>
                  <button
                    className="entry-chip-btn"
                    onClick=${function () {
                      props.onLaunch({
                        modeId: 'load',
                        source: 'saved',
                        savedScenarioName: entry.name,
                        title: entry.name,
                        copy: 'Saved scenario restored.',
                        toast: {
                          kicker: 'Saved Scenario',
                          title: entry.name,
                          copy: 'Exact saved simulator state restored.'
                        }
                      });
                    }}
                  >
                    Launch
                  </button>
                </div>
              </div>
            `;
          })}
        </div>
      `;
    }

    if (!props.recents.length) {
      return html`<div className="entry-empty">No recent launches yet. Once you enter the simulator from here, recent runs will be captured as exact scenario snapshots for fast return.</div>`;
    }

    return html`
      <div className="entry-launch-list">
        ${props.recents.map(function (entry) {
          return html`
            <div key=${entry.id} className="entry-launch-item">
              <div className="entry-launch-kicker">${entry.kicker || 'Recent Run'}</div>
              <div className="entry-launch-title">${entry.title}</div>
              <div className="entry-launch-copy">${entry.copy}</div>
              <div className="entry-launch-footer">
                <span className="entry-launch-kicker">${formatTimeAgo(entry.timestamp)}</span>
                <button
                  className="entry-chip-btn"
                  onClick=${function () {
                    props.onLaunch({
                      modeId: 'quick-start',
                      source: 'recent',
                      scenario: clone(entry.scenario),
                      title: entry.title,
                      copy: entry.copy,
                      recentTitle: entry.title,
                      recentKicker: entry.kicker || 'Recent Run',
                      recentCopy: entry.copy,
                      toast: {
                        kicker: entry.kicker || 'Recent Run',
                        title: entry.title,
                        copy: entry.copy
                      }
                    });
                  }}
                >
                  Restore
                </button>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  return html`
    <motion.div
      className="entry-drawer"
      initial=${{ opacity: 0, y: 12 }}
      animate=${{ opacity: 1, y: 0 }}
      exit=${{ opacity: 0, y: -8 }}
      transition=${{ duration: props.reducedMotion ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="entry-drawer-tabs">
        ${tabs.map(function (tab) {
          return html`
            <button
              key=${tab[0]}
              className=${props.view === tab[0] ? 'entry-drawer-tab is-active' : 'entry-drawer-tab'}
              onClick=${function () { props.onChangeView(tab[0]); }}
            >
              ${tab[1]}
            </button>
          `;
        })}
      </div>
      ${renderItems()}
    </motion.div>
  `;
}

function EntryApp(props) {
  const reducedMotion = useReducedMotion();
  const wrapperRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const heroRef = React.useRef(null);
  const previewRef = React.useRef(null);
  const storyRef = React.useRef(null);
  const modesRef = React.useRef(null);
  const storyShellRef = React.useRef(null);
  const chapterRefs = React.useRef([]);
  const fieldRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const traceRef = React.useRef(null);
  const hudRef = React.useRef(null);
  const visualCopyRef = React.useRef(null);
  const autoSkipRef = React.useRef(false);
  const [isMobile, setIsMobile] = React.useState(function () {
    return window.innerWidth < 821;
  });

  const [prefs, setPrefs] = React.useState(function () {
    return Object.assign({}, DEFAULT_PREFS, safeReadJson(ENTRY_PREFS_KEY, DEFAULT_PREFS));
  });
  const [recents, setRecents] = React.useState(function () {
    const stored = safeReadJson(ENTRY_RECENTS_KEY, []);
    return Array.isArray(stored) ? stored.filter(function (entry) { return entry && entry.scenario; }).slice(0, MAX_RECENTS) : [];
  });
  const [drawerView, setDrawerView] = React.useState(null);
  const [activeChapter, setActiveChapter] = React.useState(0);
  const [storyProgress, setStoryProgress] = React.useState(0);
  const [activeInspector, setActiveInspector] = React.useState('quick-start');

  const lenisRef = useLenis(wrapperRef, contentRef, props.overlayOpen && !reducedMotion);

  useStoryChoreography({
    wrapperRef: wrapperRef,
    storyRef: storyRef,
    chapterRefs: chapterRefs,
    shellRef: storyShellRef,
    fieldRef: fieldRef,
    bodyRef: bodyRef,
    traceRef: traceRef,
    hudRef: hudRef,
    visualCopyRef: visualCopyRef,
    overlayOpen: props.overlayOpen,
    reducedMotion: !!reducedMotion,
    onProgress: setStoryProgress,
    onActiveChapter: setActiveChapter
  });

  useHeroExpansion({
    wrapperRef: wrapperRef,
    heroRef: heroRef,
    previewRef: previewRef,
    overlayOpen: props.overlayOpen,
    reducedMotion: !!reducedMotion
  });

  React.useEffect(function () {
    function handleResize() {
      setIsMobile(window.innerWidth < 821);
    }
    window.addEventListener('resize', handleResize);
    return function () {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const liveSavedScenarios = props.catalogVersion >= 0 && props.simulator && typeof props.simulator.getSavedScenarioList === 'function'
    ? props.simulator.getSavedScenarioList()
    : [];

  React.useEffect(function () {
    if (!props.overlayOpen) {
      autoSkipRef.current = false;
      return;
    }
    if (!prefs.skipIntro || autoSkipRef.current || !modesRef.current) return;
    autoSkipRef.current = true;
    const timer = window.setTimeout(function () {
      if (lenisRef.current) lenisRef.current.scrollTo(modesRef.current, { offset: -24 });
      else if (wrapperRef.current) wrapperRef.current.scrollTo({ top: Math.max(0, modesRef.current.offsetTop - 24), behavior: reducedMotion ? 'auto' : 'smooth' });
    }, reducedMotion ? 0 : 180);
    return function () {
      window.clearTimeout(timer);
    };
  }, [drawerView, lenisRef, modesRef, prefs.skipIntro, props.overlayOpen, reducedMotion]);

  React.useEffect(function () {
    function onHashChange() {
      if (window.location.hash === '#entry' && !props.overlayOpen) props.onRequestOpen();
    }
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return function () {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, [props.onRequestOpen, props.overlayOpen]);

  function scrollToRef(ref) {
    if (!ref || !ref.current || !wrapperRef.current) return;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(ref.current, { offset: -24 });
      return;
    }
    wrapperRef.current.scrollTo({
      top: Math.max(0, ref.current.offsetTop - 24),
      behavior: reducedMotion ? 'auto' : 'smooth'
    });
  }

  function inspectMode(modeId) {
    setActiveInspector(modeId);
    if (modeId !== 'load') setDrawerView(null);
  }

  function previewSelection(modeId) {
    setActiveInspector(modeId);
    if (modeId === 'load') {
      setDrawerView(function (current) { return current || 'presets'; });
      scrollToRef(modesRef);
      return;
    }
    setDrawerView(null);
  }

  function updatePrefs(nextPrefs) {
    setPrefs(nextPrefs);
    safeWriteJson(ENTRY_PREFS_KEY, nextPrefs);
  }

  function persistRecent(selection) {
    const record = makeRecentRecord(selection, props.simulator);
    if (!record) return;
    const nextRecents = [record].concat(recents.filter(function (entry) {
      return JSON.stringify(entry.scenario) !== JSON.stringify(record.scenario);
    })).slice(0, MAX_RECENTS);
    setRecents(nextRecents);
    safeWriteJson(ENTRY_RECENTS_KEY, nextRecents);
  }

  function finishLaunch(selection) {
    const nextPrefs = Object.assign({}, prefs, {
      hasVisited: true,
      lastMode: selection.modeId || 'quick-start'
    });
    updatePrefs(nextPrefs);
    persistRecent(selection);
    window.history.pushState({ windsimView: 'sim' }, '', '#sim');
    props.onLaunchStart(selection.toast ? selection.toast.title : selection.title);
    window.setTimeout(function () {
      props.onLaunchComplete(selection.toast || {
        kicker: 'WindSim',
        title: selection.title || 'Simulator Ready',
        copy: selection.copy || 'Chamber state loaded.'
      });
    }, TRANSITION_MS);
  }

  function launchSelection(selection) {
    if (!selection || !props.simulator) return;
    document.body.classList.add('entry-entering');
    let applied = true;
    if (selection.savedScenarioName) {
      applied = props.simulator.loadSavedScenario(selection.savedScenarioName);
    } else if (selection.presetKey) {
      props.simulator.applyPreset(selection.presetKey);
    } else if (selection.scenario) {
      props.simulator.applyScenario(selection.scenario);
    }
    if (!applied) {
      document.body.classList.remove('entry-entering');
      window.alert('That saved scenario could not be restored.');
      return;
    }
    props.simulator.setPausedState(false);
    finishLaunch(selection);
  }

  function launchMode(modeId) {
    if (modeId === 'load') {
      previewSelection('load');
      return;
    }
    const selection = buildModeSelection(modeId, recents);
    if (selection) launchSelection(selection);
  }

  function shiftInspector(step) {
    const currentIndex = MODE_LIBRARY.findIndex(function (mode) { return mode.id === activeInspector; });
    const nextIndex = (currentIndex + step + MODE_LIBRARY.length) % MODE_LIBRARY.length;
    inspectMode(MODE_LIBRARY[nextIndex].id);
  }

  function resumeCurrentRun() {
    if (!props.simulator) return;
    const nextPrefs = Object.assign({}, prefs, { hasVisited: true });
    updatePrefs(nextPrefs);
    props.simulator.setPausedState(false);
    window.history.pushState({ windsimView: 'sim' }, '', '#sim');
    props.onLaunchStart('Resume current');
    window.setTimeout(function () {
      props.onLaunchComplete({
        kicker: 'Resume',
        title: 'Current session',
        copy: 'Returned to the live chamber without changing the scenario.'
      });
    }, TRANSITION_MS);
  }

  const activeStory = STORY_CHAPTERS[clamp(activeChapter, 0, STORY_CHAPTERS.length - 1)];
  const inspectorMode = MODE_LIBRARY.find(function (mode) { return mode.id === activeInspector; }) || MODE_LIBRARY[0];
  const activeModeIndex = MODE_LIBRARY.findIndex(function (mode) { return mode.id === inspectorMode.id; });
  const previewCopy = {
    title: activeInspector === 'load' ? 'One front door, several real states.' : inspectorMode.title,
    body: activeInspector === 'load'
      ? 'Built-in presets, saved scenarios, and recent runs all route through the same simulator APIs. The entry stays operational instead of ornamental.'
      : inspectorMode.copy
  };
  const heroMetrics = [
    {
      label: 'presets',
      value: String(Object.keys((window.WindSimData && window.WindSimData.PRESETS) || {}).length),
      note: 'Real launch states ready from the first interaction.'
    },
    {
      label: 'validation cases',
      value: String(Object.keys((window.WindSimData && window.WindSimData.VALIDATION_CASES) || {}).length),
      note: 'Existing regression scenarios remain available inside the lab.'
    },
    {
      label: 'return pace',
      value: prefs.skipIntro ? 'fast' : (prefs.hasVisited ? 'normal' : 'full'),
      note: prefs.skipIntro ? 'Auto-jumps toward mode selection on return.' : 'Full cinematic flow stays visible by default.'
    }
  ];
  const stageMetrics = [
    { label: 'focus', value: inspectorMode.focus },
    { label: 'motion', value: reducedMotion ? 'reduced' : 'layered' },
    { label: 'entry mode', value: inspectorMode.title.toLowerCase() },
    { label: 'cadence', value: inspectorMode.cadence }
  ];

  return html`
    <MotionConfig reducedMotion="user">
      <div className="entry-app">
        <AnimatePresence initial=${false}>
          ${props.overlayOpen && html`
            <motion.div
              key="entry-overlay"
              className="entry-overlay"
              initial=${{ opacity: 0 }}
              animate=${{ opacity: 1 }}
              exit=${{ opacity: 0 }}
              transition=${{ duration: reducedMotion ? 0.18 : 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="entry-scroll" ref=${wrapperRef}>
                <div className="entry-content" ref=${contentRef}>
                  <div className="entry-shell">
                    <nav className="entry-nav">
                      <div className="entry-brand">
                        <div className="entry-brand-mark">WindSim</div>
                        <div className="entry-brand-sub">3D aerodynamic lab</div>
                      </div>
                      <div className="entry-nav-actions">
                        <button className="entry-pill-btn" onClick=${function () { scrollToRef(heroRef); }}>Intro</button>
                        <button className="entry-pill-btn" onClick=${function () { scrollToRef(modesRef); }}>Modes</button>
                        ${prefs.skipIntro && html`<button className="entry-pill-btn" onClick=${function () { if (wrapperRef.current) wrapperRef.current.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }); }}>View Full Intro</button>`}
                        ${prefs.hasVisited && html`<button className="entry-ghost-btn" onClick=${resumeCurrentRun}>Resume Current</button>`}
                      </div>
                    </nav>

                    <section className="entry-section entry-hero" ref=${heroRef}>
                      <div className="entry-hero-atmosphere">
                        <${BackgroundPaths} reducedMotion=${!!reducedMotion} />
                      </div>
                      <div className="entry-hero-copy">
                        <div className="entry-kicker"><span className="entry-kicker-dot"></span>${prefs.hasVisited ? 'Return to the chamber' : 'WindSim entry system'}</div>
                        <${TextEffect}
                          as="h1"
                          per="line"
                          preset="blur"
                          className="entry-hero-title"
                          reducedMotion=${!!reducedMotion}
                        >
                          ${prefs.hasVisited ? 'Choose how you want\nto enter the lab.' : 'Aerodynamic simulation\nneeds a better first contact.'}
                        </${TextEffect}>
                        <p className="entry-hero-lead">${prefs.hasVisited ? 'Your simulator is already live underneath. Jump straight to a mode, restore a recent run, or roll through the short intro again.' : 'This first-load flow frames the chamber before the controls arrive. It sets the pace, explains the modes, and yields directly into the live simulator without a hard page switch.'}</p>
                        <div className="entry-hero-actions">
                          <button className="entry-primary-btn" onClick=${function () { launchSelection(buildQuickStartSelection(recents)); }}>Quick Start</button>
                          <button className="entry-ghost-btn" onClick=${function () { scrollToRef(modesRef); }}>${prefs.skipIntro ? 'Jump to Modes' : 'Choose Mode'}</button>
                        </div>
                        <div className="entry-hero-meta">
                          ${heroMetrics.map(function (metric) {
                            return html`
                              <div key=${metric.label} className="entry-stat">
                                <div className="entry-stat-label">${metric.label}</div>
                                <div className="entry-stat-value">${metric.value}</div>
                                <div className="entry-stat-note">${metric.note}</div>
                              </div>
                            `;
                          })}
                        </div>
                        <div className="entry-scroll-hint"><span className="entry-scroll-line"></span>Scroll for the short lab narrative</div>
                      </div>
                      <${PreviewStage} active=${previewCopy} mode=${inspectorMode} metrics=${stageMetrics} reducedMotion=${!!reducedMotion} previewRef=${previewRef} />
                    </section>

                    <section className="entry-section entry-story" ref=${storyRef}>
                      <div className="entry-story-grid">
                        <div className="entry-story-rail">
                          <div className="entry-story-shell" ref=${storyShellRef}>
                            <svg className="entry-stage-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                              <g ref=${fieldRef}>
                                ${PREVIEW_PATHS.map(function (path, index) {
                                  return html`<path key=${'story-path-' + index} className=${path.accent ? 'entry-stage-line is-accent' : 'entry-stage-line'} d=${path.d}></path>`;
                                })}
                              </g>
                              <g ref=${traceRef}>
                                <path className="entry-stage-trace" d="M 18 72 C 30 64, 42 48, 56 44 S 74 38, 84 22"></path>
                              </g>
                              <g ref=${bodyRef} transform="translate(58 44) rotate(-18)">
                                <rect x="-6" y="-3.8" width="12" height="7.6" rx="1.7" fill="rgba(245,238,231,.18)" stroke="rgba(245,238,231,.48)"></rect>
                                <line x1="-11" y1="0" x2="11" y2="0" stroke="rgba(236,114,90,.72)" strokeWidth="0.8"></line>
                                <line x1="0" y1="-10" x2="0" y2="10" stroke="rgba(245,238,231,.22)" strokeWidth="0.55"></line>
                              </g>
                            </svg>
                            <div className="entry-story-progress">
                              ${STORY_CHAPTERS.map(function (chapter, index) {
                                return html`
                                  <div key=${chapter.id} className="entry-story-progress-pill">
                                    <motion.div className="entry-story-progress-fill" animate=${{ scaleY: chapterFill(storyProgress, index) }} transition=${{ duration: reducedMotion ? 0.1 : 0.25 }}></motion.div>
                                  </div>
                                `;
                              })}
                            </div>
                            <div className="entry-stage-hud" ref=${hudRef}>
                              <div className="entry-stage-hud-card">
                                <div className="entry-stage-hud-label">chapter</div>
                                <div className="entry-stage-hud-value">${activeStory.index}</div>
                              </div>
                              <div className="entry-stage-hud-card">
                                <div className="entry-stage-hud-label">focus</div>
                                <div className="entry-stage-hud-value">${activeStory.id}</div>
                              </div>
                              <div className="entry-stage-hud-card">
                                <div className="entry-stage-hud-label">scroll</div>
                                <div className="entry-stage-hud-value">${Math.round(storyProgress * 100)}%</div>
                              </div>
                              <div className="entry-stage-hud-card">
                                <div className="entry-stage-hud-label">handoff</div>
                                <div className="entry-stage-hud-value">sim ready</div>
                              </div>
                            </div>
                            <div className="entry-story-visual-copy" ref=${visualCopyRef}>
                              <${TextEffect} as="h3" per="line" preset="slide" reducedMotion=${!!reducedMotion}>${activeStory.title}</${TextEffect}>
                              <p>${activeStory.body}</p>
                            </div>
                          </div>
                        </div>

                        <div className="entry-story-steps">
                          ${STORY_CHAPTERS.map(function (chapter, index) {
                            return html`<${StoryStep} key=${chapter.id} chapter=${chapter} reducedMotion=${!!reducedMotion} setRef=${function (node) { chapterRefs.current[index] = node; }} />`;
                          })}
                        </div>
                      </div>
                    </section>

                    <section className="entry-section entry-modes" ref=${modesRef}>
                      <div className="entry-section-head">
                        <div>
                          <div className="entry-section-kicker">Routing / workflow / handoff</div>
                          <${TextEffect} as="div" per="line" preset="blur" className="entry-section-title" reducedMotion=${!!reducedMotion}>Choose your path\ninto the chamber.</${TextEffect}>
                          <div className="entry-section-copy">Each route lands on a real simulator state. Nothing here is decorative routing. The overlay simply decides how you enter the same live app underneath.</div>
                        </div>
                      </div>

                      <${ModeTheater}
                        activeMode=${inspectorMode}
                        activeIndex=${activeModeIndex}
                        reducedMotion=${!!reducedMotion}
                        isMobile=${isMobile}
                        onSelect=${inspectMode}
                        onShift=${shiftInspector}
                        onLaunch=${launchMode}
                        onPreview=${previewSelection}
                      />

                      <AnimatePresence initial=${false}>
                        ${drawerView && html`
                          <${LaunchDrawer}
                            key=${drawerView}
                            view=${drawerView}
                            savedScenarios=${liveSavedScenarios}
                            recents=${recents}
                            reducedMotion=${!!reducedMotion}
                            onChangeView=${setDrawerView}
                            onLaunch=${launchSelection}
                          />
                        `}
                      </AnimatePresence>

                      <div className="entry-preference-bar">
                        <div className="entry-preference-copy">
                          Returning users can move faster without deleting the full intro. When enabled, the entry opens and moves straight toward mode selection, while the full narrative remains one click away.
                        </div>
                        <label className="entry-toggle">
                          <input
                            type="checkbox"
                            checked=${!!prefs.skipIntro}
                            onChange=${function (event) {
                              updatePrefs(Object.assign({}, prefs, { skipIntro: event.target.checked, hasVisited: true }));
                            }}
                          />
                          <span className="entry-toggle-track"></span>
                          <span>Skip to mode selection on return</span>
                        </label>
                      </div>
                    </section>

                    <div className="entry-footer-space"></div>
                  </div>
                </div>
              </div>
            </motion.div>
          `}
        </AnimatePresence>

        <AnimatePresence initial=${false}>
          ${props.isTransitioning && html`
            <motion.div
              key="entry-transition"
              className="entry-transition-veil"
              initial=${{ opacity: 0 }}
              animate=${{ opacity: 1 }}
              exit=${{ opacity: 0 }}
              transition=${{ duration: reducedMotion ? 0.1 : 0.26 }}
            >
              <div className="entry-transition-badge">${props.transitionLabel || 'Entering simulator'}</div>
            </motion.div>
          `}
        </AnimatePresence>

        <AnimatePresence initial=${false}>
          ${props.sessionToast && !props.overlayOpen && !props.isTransitioning && html`
            <motion.div
              key=${props.sessionToast.title + props.sessionToast.kicker}
              className="entry-session-toast"
              initial=${{ opacity: 0, y: -12 }}
              animate=${{ opacity: 1, y: 0 }}
              exit=${{ opacity: 0, y: -8 }}
              transition=${{ duration: reducedMotion ? 0.14 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="entry-session-kicker">${props.sessionToast.kicker}</div>
              <div className="entry-session-title">${props.sessionToast.title}</div>
              <div className="entry-session-copy">${props.sessionToast.copy}</div>
            </motion.div>
          `}
        </AnimatePresence>
      </div>
    </MotionConfig>
  `;
}

function EntryRoot() {
  const [simulator, setSimulator] = React.useState(null);
  const [error, setError] = React.useState('');
  const [bootReady, setBootReady] = React.useState(false);
  const [overlayOpen, setOverlayOpen] = React.useState(true);
  const [catalogVersion, setCatalogVersion] = React.useState(0);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [transitionLabel, setTransitionLabel] = React.useState('Entering simulator');
  const [sessionToast, setSessionToast] = React.useState(null);
  const primedRef = React.useRef(false);
  const toastTimerRef = React.useRef(0);
  const bootTimerRef = React.useRef(0);

  React.useEffect(function () {
    waitForSimulator(10000)
      .then(function (app) {
        const storedPrefs = Object.assign({}, DEFAULT_PREFS, safeReadJson(ENTRY_PREFS_KEY, DEFAULT_PREFS));
        const bootHoldMs = storedPrefs.skipIntro ? 120 : (storedPrefs.hasVisited ? 240 : 420);
        setSimulator(app);
        document.body.classList.add('entry-active');
        bootTimerRef.current = window.setTimeout(function () {
          setBootReady(true);
          window.history.replaceState({ windsimView: 'entry' }, '', '#entry');
        }, bootHoldMs);
      })
      .catch(function (err) {
        setError(err && err.message ? err.message : 'Simulator bootstrap failed.');
      });
  }, []);

  React.useEffect(function () {
    if (!simulator) return;
    if (overlayOpen) {
      document.body.classList.add('entry-active');
      if (!primedRef.current) {
        primedRef.current = true;
        simulator.resetObject();
      }
      simulator.setPausedState(true);
    } else {
      document.body.classList.remove('entry-active');
    }
  }, [overlayOpen, simulator]);

  React.useEffect(function () {
    return function () {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (bootTimerRef.current) window.clearTimeout(bootTimerRef.current);
    };
  }, []);

  function handleLaunchStart(label) {
    setTransitionLabel(label || 'Entering simulator');
    setIsTransitioning(true);
    setSessionToast(null);
  }

  function handleLaunchComplete(toast) {
    document.body.classList.remove('entry-entering');
    setOverlayOpen(false);
    setIsTransitioning(false);
    setCatalogVersion(function (value) { return value + 1; });
    setSessionToast(toast || null);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(function () {
      setSessionToast(null);
    }, 2800);
  }

  function reopenOverlay() {
    if (!simulator) return;
    setSessionToast(null);
    setOverlayOpen(true);
    setCatalogVersion(function (value) { return value + 1; });
    window.history.replaceState({ windsimView: 'entry' }, '', '#entry');
  }

  if (!simulator || !bootReady) {
    return html`<${LoadingShell} error=${error} ready=${!!simulator && !error} />`;
  }

  return html`
    <${EntryApp}
      simulator=${simulator}
      overlayOpen=${overlayOpen}
      catalogVersion=${catalogVersion}
      isTransitioning=${isTransitioning}
      transitionLabel=${transitionLabel}
      sessionToast=${sessionToast}
      onLaunchStart=${handleLaunchStart}
      onLaunchComplete=${handleLaunchComplete}
      onRequestOpen=${reopenOverlay}
    />
  `;
}

const mountNode = document.getElementById('entry-root');
if (mountNode) {
  createRoot(mountNode).render(html`<${EntryRoot} />`);
}
