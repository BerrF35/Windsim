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
        [hudRef.current, { yPercent: -8 }]
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
  return html`
    <div className="entry-app">
      <div className="entry-overlay">
        <div className="entry-scroll">
          <div className="entry-content">
            <div className="entry-shell">
              <section className="entry-section entry-hero">
                <div className="entry-hero-copy">
                  <div className="entry-kicker"><span className="entry-kicker-dot"></span>${props.error ? 'Entry system error' : 'Preparing chamber'}</div>
                  <h1 className="entry-hero-title">${props.error ? 'WindSim could not finish booting.' : 'Preparing the chamber.'}</h1>
                  <p className="entry-hero-lead">${props.error ? props.error : 'The simulator is initializing underneath the entry flow. This stays in one app and yields directly into the live chamber.'}</p>
                </div>
                <div className="entry-preview">
                  <div className="entry-preview-grid"></div>
                  <div className="entry-preview-head">
                    <div className="entry-panel-tag">WindSim / initializing</div>
                    <div className="entry-preview-note">${props.error ? 'Refresh once if the module graph was interrupted.' : 'Loading the live simulator surface, routing state, and entry motion stack.'}</div>
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
  return html`
    <div className="entry-preview">
      <div className="entry-preview-grid"></div>
      <div className="entry-preview-head">
        <div className="entry-panel-tag">Live chamber / entry surface</div>
        <div className="entry-preview-note">${active.body}</div>
      </div>
      <div className="entry-stage">
        <svg className="entry-stage-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${PREVIEW_PATHS.map(function (path, index) {
            return html`<path key=${'path-' + index} className=${path.accent ? 'entry-stage-line is-accent' : 'entry-stage-line'} d=${path.d}></path>`;
          })}
          <path className="entry-stage-trace" d="M 14 74 C 28 62, 40 54, 54 48 S 76 36, 88 28"></path>
          ${PREVIEW_DOTS.map(function (dot, index) {
            return html`<circle key=${'dot-' + index} className=${dot.accent ? 'entry-stage-dot is-accent' : 'entry-stage-dot'} cx=${dot.x} cy=${dot.y} r=${dot.accent ? 1.45 : 1.05}></circle>`;
          })}
          <g transform="translate(51 47) rotate(-22)">
            <rect x="-4.8" y="-3.2" width="9.6" height="6.4" rx="1.5" fill="rgba(245,238,231,.22)" stroke="rgba(245,238,231,.55)"></rect>
            <line x1="-9" y1="0" x2="9" y2="0" stroke="rgba(236,114,90,.55)" strokeWidth="0.7"></line>
            <line x1="0" y1="-8.5" x2="0" y2="8.5" stroke="rgba(245,238,231,.28)" strokeWidth="0.55"></line>
          </g>
        </svg>
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
      <h4>${props.chapter.title}</h4>
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
  const storyRef = React.useRef(null);
  const modesRef = React.useRef(null);
  const storyShellRef = React.useRef(null);
  const chapterRefs = React.useRef([]);
  const fieldRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const traceRef = React.useRef(null);
  const hudRef = React.useRef(null);
  const autoSkipRef = React.useRef(false);

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
    overlayOpen: props.overlayOpen,
    reducedMotion: !!reducedMotion,
    onProgress: setStoryProgress,
    onActiveChapter: setActiveChapter
  });

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
  const previewCopy = activeInspector === 'load'
    ? {
        body: 'Built-in presets, saved scenarios, and recent runs all route back through the same simulator APIs. The entry is a front door, not a second app.'
      }
    : activeStory;
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
    { label: 'focus', value: activeStory.id === 'lab' ? 'mode routing' : activeStory.id === 'body' ? 'body + telemetry' : 'field structure' },
    { label: 'motion', value: reducedMotion ? 'reduced' : 'layered' },
    { label: 'entry mode', value: inspectorMode.title.toLowerCase() },
    { label: 'handoff', value: 'same chamber' }
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
                      <div className="entry-hero-copy">
                        <div className="entry-kicker"><span className="entry-kicker-dot"></span>${prefs.hasVisited ? 'Return to the chamber' : 'WindSim entry system'}</div>
                        <h1 className="entry-hero-title">${prefs.hasVisited ? 'Choose how you want to enter the lab.' : 'Aerodynamic simulation deserves a proper front door.'}</h1>
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
                      <${PreviewStage} active=${previewCopy} metrics=${stageMetrics} />
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
                            <div className="entry-story-visual-copy">
                              <h3>${activeStory.title}</h3>
                              <p>${activeStory.body}</p>
                            </div>
                          </div>
                        </div>

                        <div className="entry-story-steps">
                          ${STORY_CHAPTERS.map(function (chapter, index) {
                            return html`<${StoryStep} key=${chapter.id} chapter=${chapter} setRef=${function (node) { chapterRefs.current[index] = node; }} />`;
                          })}
                        </div>
                      </div>
                    </section>

                    <section className="entry-section entry-modes" ref=${modesRef}>
                      <div className="entry-section-head">
                        <div>
                          <div className="entry-section-title">Choose your path into the chamber.</div>
                          <div className="entry-section-copy">Each route lands on a real simulator state. Nothing here is decorative routing. The overlay simply decides how you enter the same live app underneath.</div>
                        </div>
                      </div>

                      <div className="entry-mode-grid">
                        ${MODE_LIBRARY.map(function (mode) {
                          return html`
                            <${ModeCard}
                              key=${mode.id}
                              mode=${mode}
                              reducedMotion=${!!reducedMotion}
                              onInspect=${setActiveInspector}
                              onLaunch=${launchMode}
                              onPreview=${previewSelection}
                            />
                          `;
                        })}
                      </div>

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
  const [overlayOpen, setOverlayOpen] = React.useState(true);
  const [catalogVersion, setCatalogVersion] = React.useState(0);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [transitionLabel, setTransitionLabel] = React.useState('Entering simulator');
  const [sessionToast, setSessionToast] = React.useState(null);
  const primedRef = React.useRef(false);
  const toastTimerRef = React.useRef(0);

  React.useEffect(function () {
    waitForSimulator(10000)
      .then(function (app) {
        setSimulator(app);
        document.body.classList.add('entry-active');
        window.history.replaceState({ windsimView: 'entry' }, '', '#entry');
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

  if (!simulator) {
    return html`<${LoadingShell} error=${error} />`;
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
