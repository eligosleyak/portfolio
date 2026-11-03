/* Vendored from https://github.com/Sagunnn/lotus-clock (v1.2.0). Update by copying a newer release. */
/*!
 * <lotus-clock> — a kinetic clock web component.
 * Straight lines that curl as the minute turns, then fold into a crown lotus.
 * MIT License · https://github.com/Sagunnn/lotus-clock
 */

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => 1 - Math.pow(1 - t, 3);
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smoothstep = (x) => x * x * (3 - 2 * x);
const pad = (n) => String(n).padStart(2, '0');
const reduceMotion = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false, addEventListener() {} };

/* Tuning */
const GROW_MS = 800;          // a new line grows out from the centre
const RETRACT_MS = 750;       // lines draw back in (mode change, or finale off)
const STEP_MS = 650;          // the dial steps one place each second
const STEP = -TAU / 60;       // …counterclockwise
const INHALE_FROM = 55000;    // :55–:59, the lotus draws in a little each tick
const SPIN_FROM = 56000;      // final full turn starts at :56
const CONVERGE_FROM = 58200;  // rings close in on the digits
const GLOW_MS = 1700;         // ripple of light through the digits
const BLOOM_MS = 950;         // :00, petals spring outward and dissolve
const SHOCK_MS = 1100;        // radial shockwave across the rings
const TREMOR_MS = 1500;       // hub micro-tremor after a strike
const TREMOR_PX = 2.5;
const TWIST_K = 0.26;         // twist a line keeps per radian the dial turns
const LAG_K = 250;            // extra trail while the dial moves (rad per rad/ms)
const SAMPLES = 40;
// In the final turn every line folds into its own lotus petal, pointing at its second.
// Line s joins ring s % 3 (0 inner … 2 outer), so 60 lines make three rings of 20 petals.
// Values are shares of the space between the digits and the dial.
const RINGS = 3;
const RING_BASE = [-0.02, 0.17, 0.36];
const RING_LEN = [0.46, 0.52, 0.64];
const RING_FILL = [0.55, 0.4, 0.28];
const petalShape = (v) => Math.pow(Math.sin(Math.PI * v), 0.8) * (1 - 0.38 * v) * 1.25;   // onion dome

/* ---------------------------------------------------------------------------
 * Sound: a physically-inspired Tibetan singing bowl and a softly intoned mantra,
 * shared by every clock.
 * Web Audio only, no files. Browsers need a user gesture before audio can play,
 * so the context is created on the first click/keypress after sound is wanted.
 * ------------------------------------------------------------------------- */
const bowl = (() => {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  const ROOT = 216;
  // Modal partials of a spun brass bowl. Each sounds as a pair of sines, the second detuned by
  // `beat` Hz, so their phases drift in and out: the bowl's warm pulsing, with no LFO.
  const PARTIALS = [
    { ratio: 1.0, beat: 1.4, decay: 9.0, gain: 1.0 },
    { ratio: 2.756, beat: 2.8, decay: 5.5, gain: 0.42 },
    { ratio: 5.404, beat: 4.2, decay: 2.2, gain: 0.2 },
  ];
  // "Om · Ma · Ni · Pad · Me · Hum": one syllable per second, so the mantra cycles 10 times a
  // minute. Each has a pitch on a calm contour round ROOT, a length, and two formants (F1, F2)
  // that glide from `from` to `to` to colour the vowel. `glide` = share of the syllable spent gliding.
  const MANTRA = [
    { name: 'Om',  f: 216, dur: 0.65, from: [450, 800],  to: [280, 900],   glide: 0.75, attack: 0.12 },  // open O → closed nasal M
    { name: 'Ma',  f: 243, dur: 0.42, from: [280, 900],  to: [720, 1150],  glide: 0.18, attack: 0.05 },  // nasal onset → open Ah
    { name: 'Ni',  f: 270, dur: 0.42, from: [320, 1900], to: [300, 2150],  glide: 0.25, attack: 0.05 },  // bright front Ee
    { name: 'Pad', f: 243, dur: 0.40, from: [600, 1050], to: [620, 1100],  glide: 0.3,  attack: 0.008, plosive: true },
    { name: 'Me',  f: 216, dur: 0.45, from: [300, 1600], to: [460, 1850],  glide: 0.25, attack: 0.05 },  // Eh / Ay
    { name: 'Hum', f: 162, dur: 0.80, from: [350, 750],  to: [260, 850],   glide: 0.7,  attack: 0.1 },   // Oo → deep closed M
  ];
  let ctx = null, bus = null, noise = null, armed = false, drone = null;

  function init() {
    if (ctx) return true;
    if (!AC) return false;
    ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 2400; warm.Q.value = 0.4;
    // A quiet room: ~3 s of decaying stereo noise as the impulse response, plus a faint echo.
    const len = Math.floor(ctx.sampleRate * 3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
    }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    const dry = ctx.createGain(); dry.gain.value = 0.75;
    const wet = ctx.createGain(); wet.gain.value = 0.38;
    const echo = ctx.createDelay(1); echo.delayTime.value = 0.27;
    const fb = ctx.createGain(); fb.gain.value = 0.22;
    const echoOut = ctx.createGain(); echoOut.gain.value = 0.09;
    warm.connect(dry).connect(master);
    warm.connect(verb).connect(wet).connect(master);
    warm.connect(echo); echo.connect(fb).connect(echo); echo.connect(echoOut).connect(master);
    bus = warm;
    const n = Math.floor(ctx.sampleRate * 2);
    noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
    return true;
  }

  // Create/resume the audio context on the first user gesture (autoplay rules).
  function arm() {
    if (armed || typeof window === 'undefined') return;
    armed = true;
    const unlock = () => { if (init()) ctx.resume(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  // Sounds are scheduled once a context exists; a suspended one plays them when it resumes.
  const ok = () => !!ctx && ctx.state !== 'closed';

  // A beating pair (f and f + beat) into `dest`; nodes disconnect themselves when they stop.
  function pair(freq, beat, t, end, dest, onDone) {
    let alive = 2;
    [0, beat].forEach((det) => {
      const o = ctx.createOscillator(), h = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq + det;
      h.gain.value = 0.5;
      o.connect(h).connect(dest);
      o.start(t); o.stop(end);
      o.onended = () => { o.disconnect(); h.disconnect(); if (--alive === 0 && onDone) onDone(); };
    });
  }

  // A mallet strike: three modal partials with a 15 ms attack and tiered decays, plus 25 ms of
  // low-passed noise for the wooden mallet's contact. Strikes layer polyphonically.
  function strike(f0 = ROOT, peak = 0.16, delay = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + delay + 0.01;
    const f = f0 * (1 + (Math.random() - 0.5) * 0.003);
    PARTIALS.forEach((p) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak * p.gain, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.015 + p.decay);
      g.connect(bus);
      pair(f * p.ratio, p.beat, t, t + 0.015 + p.decay + 0.05, g, () => g.disconnect());
    });
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ng = ctx.createGain();
    src.buffer = noise;
    lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.7;
    ng.gain.setValueAtTime(peak * 0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    src.connect(lp).connect(ng).connect(bus);
    src.start(t, Math.random()); src.stop(t + 0.03);
    src.onended = () => { src.disconnect(); lp.disconnect(); ng.disconnect(); };
  }

  // A rim-rub swell (used as the dial turns into the minute): the two lower beating partials.
  function sing(f = ROOT, peak = 0.05, attack = 0.3, release = 2.5) {
    if (!ok()) return;
    const t = ctx.currentTime + 0.01;
    [[1.0, 1.4, 1], [2.756, 2.8, 0.3]].forEach(([r, beat, gm]) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak * gm, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
      g.connect(bus);
      pair(f * r, beat, t, t + attack + release + 0.05, g, () => g.disconnect());
    });
  }

  // One mantra syllable: a soft sine bell at the syllable's pitch, plus a quiet sub-octave
  // sawtooth "voice" shaped by two parallel band-pass formant filters that glide through the
  // vowel. Tiny random variations in pitch, level and length keep it from sounding mechanical.
  function mantra(step, delay = 0) {
    if (!ok()) return;
    const sy = MANTRA[((step % 6) + 6) % 6];
    const t = ctx.currentTime + delay + 0.01;
    const vary = (x, amt) => x * (1 + (Math.random() - 0.5) * amt);
    const dur = vary(sy.dur, 0.08), peak = vary(0.045, 0.12), f = vary(sy.f, 0.004);
    const end = t + dur;
    const nodes = [];
    const keep = (n) => { nodes.push(n); return n; };

    // Syllable envelope for the voice.
    const voice = keep(ctx.createGain());
    voice.gain.setValueAtTime(0.0001, t);
    voice.gain.linearRampToValueAtTime(peak, t + sy.attack);
    voice.gain.setValueAtTime(peak, Math.max(t + sy.attack, end - dur * 0.45));
    voice.gain.exponentialRampToValueAtTime(0.0001, end);
    voice.connect(bus);

    // Glottal source an octave down: rich in harmonics for the formants to pick from.
    const src = keep(ctx.createOscillator());
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f / 2, t);
    src.frequency.exponentialRampToValueAtTime((f / 2) * 0.994, end);   // a breath of downward drift
    const drive = keep(ctx.createGain()); drive.gain.value = 1;
    src.connect(drive);
    [[0, 7, 2.2], [1, 8.5, 1.3]].forEach(([k, q, gain]) => {
      const bp = keep(ctx.createBiquadFilter());
      bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(sy.from[k], t);
      bp.frequency.exponentialRampToValueAtTime(sy.to[k], t + Math.max(0.02, dur * sy.glide));
      const g = keep(ctx.createGain()); g.gain.value = gain;
      drive.connect(bp).connect(g).connect(voice);
    });
    src.start(t); src.stop(end + 0.05);

    // Soft bell at the syllable's pitch, with a hint of the bowl's first overtone.
    [[1, 0.8, 1.8], [2.756, 0.12, 0.9]].forEach(([ratio, lvl, len]) => {
      const o = keep(ctx.createOscillator()), g = keep(ctx.createGain());
      o.type = 'sine'; o.frequency.value = f * ratio;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak * lvl, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * len);
      o.connect(g).connect(bus);
      o.start(t); o.stop(t + dur * len + 0.05);
    });

    // "Pad": a soft lip plosive, 8 ms of low-passed noise.
    if (sy.plosive) {
      const n = keep(ctx.createBufferSource()), lp = keep(ctx.createBiquadFilter()), g = keep(ctx.createGain());
      n.buffer = noise;
      lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(peak * 0.9, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.008);
      n.connect(lp).connect(g).connect(bus);
      n.start(t, Math.random()); n.stop(t + 0.012);
    }

    // Tidy up once the longest voice (the bell) has finished.
    setTimeout(() => nodes.forEach((n) => n.disconnect()), (delay + dur * 1.8 + 0.3) * 1000);
  }

  // Rim-rubbing drone: a sustained 1.0 + 2.756 beating pair whose level and brightness follow
  // the player's angular speed. Built on first use, torn down after a few quiet seconds.
  function droneLevel(level, bright) {
    if (!ok()) return;
    const t = ctx.currentTime;
    if (!drone) {
      if (level < 0.01) return;
      const out = ctx.createGain(); out.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.5;
      out.connect(lp).connect(bus);
      const parts = [[1.0, 1.4, 1], [2.756, 2.8, 0.25]].map(([r, beat, gv]) => {
        const g = ctx.createGain(); g.gain.value = gv; g.connect(out);
        const oscs = [0, beat].map((det) => {
          const o = ctx.createOscillator(), h = ctx.createGain();
          o.type = 'sine'; o.frequency.value = ROOT * r + det; h.gain.value = 0.5;
          o.connect(h).connect(g); o.start();
          return { o, h };
        });
        return { g, oscs };
      });
      drone = { out, lp, parts, level: 0, quietAt: 0 };
    }
    drone.out.gain.setTargetAtTime(level * 0.12, t, level > drone.level ? 0.25 : 0.9);
    drone.parts[1].g.gain.setTargetAtTime(0.2 + 0.6 * bright, t, 0.3);
    drone.lp.frequency.setTargetAtTime(650 + 1900 * bright, t, 0.3);
    drone.level = level;
    if (level >= 0.01) drone.quietAt = 0;
    else if (!drone.quietAt) drone.quietAt = t;
    else if (t - drone.quietAt > 5) {
      drone.parts.forEach((p) => { p.oscs.forEach(({ o, h }) => { o.stop(); o.disconnect(); h.disconnect(); }); p.g.disconnect(); });
      drone.out.disconnect(); drone.lp.disconnect();
      drone = null;
    }
  }

  return {
    ROOT, arm, strike, sing, mantra, droneLevel,
    SYLLABLES: MANTRA.map((m) => m.name),
    // A deliberate press can start audio itself (it is a gesture).
    wake() { if (init()) ctx.resume(); },
  };
})();

/* ---------------------------------------------------------------------------
 * Styles (inside the shadow root). Theme with the --lc-* custom properties.
 * ------------------------------------------------------------------------- */
const STYLES = `
:host {
  --_ink: var(--lc-ink, currentColor);
  --_line: var(--lc-line, color-mix(in srgb, var(--_ink) 20%, transparent));
  --_accent: var(--lc-accent, #8a4fd6);
  --_glow: var(--lc-glow, color-mix(in srgb, var(--_accent) 35%, transparent));
  display: block; position: relative; aspect-ratio: 1 / 1; min-width: 200px; min-height: 200px;
  color: var(--_ink); background: var(--lc-paper, transparent);
  font-family: var(--lc-font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  contain: layout paint; -webkit-user-select: none; user-select: none;
}
:host([hidden]) { display: none; }
.stage { position: absolute; inset: 0; --_inhale: 0; --_cx: 50%; --_cy: 50%; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }

/* Lines / petals. --ring-index (0 inner … 2 outer) and --petal-index (0–19) drive the staggers.
   From :55 the stroke warms toward the accent with --_inhale. */
.line {
  fill: var(--_accent); fill-opacity: 0;
  stroke: color-mix(in srgb, var(--_accent) calc(var(--_inhale) * 60%), var(--_line));
  stroke-width: .75; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke;
}
.line.formed { stroke: var(--_accent); stroke-opacity: .85; }
.line.now { stroke: var(--_accent); stroke-opacity: .9; }
/* Radial shockwave: hub → inner → middle → outer ring. */
.line.shock { animation: lc-shock ${SHOCK_MS}ms cubic-bezier(.2, .7, .2, 1) calc(var(--ring-index) * 65ms); }
@keyframes lc-shock {
  0% { stroke: var(--_accent); stroke-opacity: 1; stroke-width: 2.6px; }
  35% { stroke-width: 1.4px; }
}
/* :00 bloom: petals spring outward from the drawn-in pose and dissolve, staggered round the flower. */
.line.bloom {
  transform-box: view-box; transform-origin: var(--_cx) var(--_cy);
  animation: lc-bloom ${BLOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--petal-index) * 8ms) both;
}
.line.bloom.shock {
  animation: lc-bloom ${BLOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--petal-index) * 8ms) both,
             lc-shock ${SHOCK_MS}ms cubic-bezier(.2, .7, .2, 1) calc(var(--ring-index) * 65ms);
}
@keyframes lc-bloom { from { transform: scale(.95); } to { transform: scale(1.16); opacity: 0; } }

text {
  font-family: inherit; font-size: 10px; letter-spacing: .04em; font-variant-numeric: tabular-nums;
  fill: currentColor; text-anchor: middle; dominant-baseline: central; opacity: 0; transition: opacity .5s;
}
text.on { opacity: .42; }
text.now { opacity: 1; font-weight: 600; }
.ripple { fill: none; stroke: currentColor; stroke-opacity: .5; stroke-width: .75; vector-effect: non-scaling-stroke; }
.ripple.big { stroke: var(--_accent); stroke-opacity: .55; }
.converge { fill: none; stroke: var(--_accent); stroke-opacity: .75; stroke-width: .9; vector-effect: non-scaling-stroke; opacity: 0; }
.aura {
  position: absolute; inset: -6%; pointer-events: none; opacity: 0;
  background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--_accent) 34%, transparent) 0%, color-mix(in srgb, var(--_accent) 14%, transparent) 42%, transparent 68%);
}
.disc { opacity: 0; }
.disc .face { fill: var(--lc-paper-solid, Canvas); }
.disc .tint { fill: var(--_accent); fill-opacity: .12; stroke: var(--_accent); stroke-opacity: .55; stroke-width: 1; vector-effect: non-scaling-stroke; }
.disc .inner { fill: none; stroke: var(--_accent); stroke-opacity: .4; stroke-width: .75; vector-effect: non-scaling-stroke; }
.disc .rosette circle { fill: none; stroke: var(--_accent); stroke-opacity: .45; stroke-width: .7; vector-effect: non-scaling-stroke; }
.clock {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  display: flex; align-items: baseline; white-space: nowrap;
  font-family: var(--lc-font-display, "Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif);
  font-weight: var(--lc-font-weight, 700); line-height: 1; letter-spacing: -0.045em; font-variant-numeric: tabular-nums;
  transition: opacity .4s;
}
.clock.paused { opacity: .5; }
.colon { margin: 0 .16em; transform: translateY(-.06em); transition: opacity .25s linear; }
.colon.dim { opacity: .3; }
.roll { display: inline-block; animation: roll .7s cubic-bezier(.2, .75, .1, 1); }
@keyframes roll { from { opacity: 0; transform: translateY(.35em); filter: blur(4px); } }
.glow {
  color: var(--_accent); pointer-events: none; opacity: 0;
  text-shadow: 0 0 6px var(--_glow), 0 0 18px var(--_glow);
  -webkit-mask-image: radial-gradient(circle closest-side, transparent 58%, #000 74%, transparent 90%), radial-gradient(circle closest-side, transparent 58%, #000 74%, transparent 90%);
          mask-image: radial-gradient(circle closest-side, transparent 58%, #000 74%, transparent 90%), radial-gradient(circle closest-side, transparent 58%, #000 74%, transparent 90%);
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-size: 0 0, 0 0; mask-size: 0 0, 0 0;
}
.bowl {
  position: absolute; z-index: 2; border: 0; padding: 0; border-radius: 50%;
  background: transparent; cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent;
}
.bowl:focus-visible { outline: 1.5px solid var(--_accent); outline-offset: 4px; }
:host([interactive="false"]) .bowl { display: none; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; animation-delay: 0s !important; }
}
`;

/** Parse "25:00", "1:30:00", "90" (seconds) or a number of milliseconds. */
function parseDuration(v) {
  if (typeof v === 'number') return Math.max(0, v);
  const s = String(v || '').trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) * 1000;
  const parts = s.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0) * 1000;
}

export class LotusClock extends HTMLElement {
  static get observedAttributes() {
    return ['time-zone', 'hour12', 'labels', 'finale', 'sound', 'countdown', 'autostart'];
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLES}</style>
      <div class="stage" part="stage">
        <div class="aura" aria-hidden="true"></div>
        <svg aria-hidden="true"></svg>
        <div class="clock" part="time" role="timer" aria-live="off"><span class="hh">--</span><span class="colon">:</span><span class="mm">--</span></div>
        <div class="clock glow" aria-hidden="true"></div>
        <button class="bowl" part="bowl" type="button" aria-label="Ring the singing bowl"></button>
      </div>`;
    this._el = {
      stage: root.querySelector('.stage'),
      aura: root.querySelector('.aura'),
      svg: root.querySelector('svg'),
      clock: root.querySelector('.clock:not(.glow)'),
      glow: root.querySelector('.glow'),
      hh: root.querySelector('.hh'),
      mm: root.querySelector('.mm'),
      colon: root.querySelector('.clock:not(.glow) .colon'),
      bowl: root.querySelector('.bowl'),
    };

    // Countdown state.
    this._cd = { total: 0, remMs: 0, endAt: 0, running: false };
    this._mode = 'clock';
    this._buildSvg();
    this._relabel();

    // Animation state.
    this._lines = []; this._ripples = [];
    this._current = -1; this._minuteKey = null;
    this._geo = null; this._raf = 0; this._tickTimer = 0;
    this._rot = 0; this._placedRot = null; this._glowAt = -1;
    this._rotFrom = 0; this._rotTo = 0; this._rotAt = 0; this._rotStep = 0; this._steps = 0;
    this._rolledAt = -1e9; this._angVel = 0; this._lastRot = 0; this._lastFrame = 0;
    this._form = 0; this._inhale = -1; this._tremorAt = -1e9; this._lastTf = '';
    this._shockTimer = 0;
    this._onScreen = true;
    // Rim rubbing: angular speed round the hub, smoothed, and how loudly the bowl sings.
    this._rub = { omega: 0, level: 0, lastAngle: null, lastMove: 0, down: false, travel: 0, active: false, sentAt: 0, buzzAt: 0, rippleAt: 0 };

    this._frame = this._frame.bind(this);
    this._tick = this._tick.bind(this);
    this._remeasure = () => { this._measure(); this._kick(); };
    this._onVisibility = () => { this._tick(); this._kick(); };
    this._onPointer = this._onPointer.bind(this);
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave'].forEach((t) => this._el.stage.addEventListener(t, this._onPointer));
    this._el.bowl.addEventListener('click', () => {
      // A circle drawn round the hub shouldn't also count as a tap on it.
      if (this._rub.travel > 1.2) { this._rub.travel = 0; return; }
      this.ring();
    });
  }

  /* ----- public API ----------------------------------------------------- */

  /** 'clock' or 'countdown'. */
  get mode() { return this._mode; }
  /** Milliseconds left in countdown mode (0 in clock mode). */
  get remaining() { return this._mode === 'countdown' ? this._remaining() : 0; }
  /** Whether a countdown is running. */
  get running() { return this._mode === 'countdown' && this._cd.running; }

  /** Switch to countdown mode. `duration`: ms number, "25:00", "1:30:00" or seconds as a string. */
  countdown(duration, { autostart = true } = {}) {
    const ms = parseDuration(duration);
    this._cd = { total: ms, remMs: ms, endAt: 0, running: false };
    this._setMode('countdown');
    if (autostart) this.start();
    return this;
  }
  start() {
    const c = this._cd;
    if (this._mode !== 'countdown' || c.running || c.remMs <= 0) return this;
    c.running = true; c.endAt = Date.now() + c.remMs;
    this._emit('start');
    this._tick();
    return this;
  }
  pause() {
    const c = this._cd;
    if (this._mode !== 'countdown' || !c.running) return this;
    c.remMs = this._remaining(); c.running = false;
    this._emit('pause');
    this._tick();
    return this;
  }
  resume() { return this.start(); }
  toggle() { return this._cd.running ? this.pause() : this.start(); }
  /** Back to the full countdown duration, paused. */
  reset() {
    if (this._mode !== 'countdown') return this;
    this._cd.running = false; this._cd.remMs = this._cd.total;
    this._restart();
    return this;
  }
  /** Leave countdown mode and show the time of day again. */
  showClock() { this._setMode('clock'); return this; }

  /** Strike the bowl: a mallet strike, a shockwave across the rings, a tremor in the hub,
   *  ripples and a glow through the digits. */
  ring() {
    // A deliberate press always sounds the bowl (it is a user gesture, so audio may start).
    bowl.wake(); bowl.strike(bowl.ROOT, 0.18);
    const g = this._geo;
    if (g) {
      const now = performance.now();
      for (let k = 0; k < 4; k++) this._addRipple(g.cx, g.cy, now + k * 260, 2200, 4, g.R + 40, true);
      this._highlight(this._el.hh.textContent, this._el.mm.textContent);
      this._shock(now);
      this._lines.forEach((st) => {
        if (st.retractAt !== null) return;
        st.pluckAt = now + 120 + st.ring * 65 + 400 * Math.random();
        st.pluckAmp = rand(5, 9);
      });
      this._kick();
    }
    this._emit('bowl');
  }

  /* ----- lifecycle ------------------------------------------------------ */

  connectedCallback() {
    this._makeFormatter();
    if (this.hasAttribute('sound')) bowl.arm();
    if (this.hasAttribute('countdown') && this._mode !== 'countdown') {
      this.countdown(this.getAttribute('countdown'), { autostart: this.hasAttribute('autostart') });
    }
    this._ro = new ResizeObserver(this._remeasure);
    this._ro.observe(this);
    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver(([e]) => { this._onScreen = e.isIntersecting; if (this._onScreen) this._kick(); });
      this._io.observe(this);
    }
    document.addEventListener('visibilitychange', this._onVisibility);
    reduceMotion.addEventListener?.('change', this._remeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.isConnected && this._remeasure());
    this._measure();
    this._tick();
  }

  disconnectedCallback() {
    clearTimeout(this._tickTimer);
    clearTimeout(this._shockTimer);
    cancelAnimationFrame(this._raf); this._raf = 0;
    this._ro && this._ro.disconnect();
    this._io && this._io.disconnect();
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this._rub.level > 0) { this._rub.level = 0; bowl.droneLevel(0, 0); }
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV || !this._el) return;
    if (name === 'time-zone' || name === 'hour12') { this._makeFormatter(); if (this._mode === 'clock' && this.isConnected) this._restart(); }
    else if (name === 'labels') this._paintLabels();
    else if (name === 'sound') { if (newV !== null) bowl.arm(); else bowl.droneLevel(0, 0); }
    else if (name === 'countdown' && this.isConnected) {
      if (newV === null) this.showClock();
      else this.countdown(newV, { autostart: this.hasAttribute('autostart') });
    }
  }

  /* ----- internals: time sources ---------------------------------------- */

  _makeFormatter() {
    const tz = this.getAttribute('time-zone') || undefined;
    const h12 = this.hasAttribute('hour12');
    try {
      this._fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: h12 ? 'h12' : 'h23' });
    } catch (e) {
      console.warn(`<lotus-clock>: unknown time-zone "${tz}", using local time.`);
      this._fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: h12 ? 'h12' : 'h23' });
    }
  }

  _remaining() { const c = this._cd; return c.running ? Math.max(0, c.endAt - Date.now()) : c.remMs; }

  // What to show: a = left digits, b = right digits, slot = 0–59 position, key changes each minute.
  _read() {
    if (this._mode === 'countdown') {
      const r = this._remaining();
      const tot = Math.ceil(r / 1000), m = Math.floor(tot / 60), s = tot % 60;
      return { a: pad(m), b: pad(s), slot: (60 - s) % 60, key: String(Math.ceil(r / 60000)), aria: `${m} minutes ${s} seconds left` };
    }
    const p = {};
    this._fmt.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { a: p.hour, b: p.minute, slot: +p.second, key: p.hour + p.minute, aria: `${p.hour}:${p.minute}` };
  }

  // Milliseconds into the current minute (drives the finale).
  _msm() {
    if (this._mode === 'countdown') {
      const r = this._remaining(), k = Math.ceil(r / 60000);
      return 60000 - (r - (k - 1) * 60000);
    }
    // Clock mode: lock to the second the dial is showing, so :59's finale maths can't leak into
    // :00 (or the reverse) in the few ms between the real second changing and _tick() catching up.
    const now = Date.now();
    if (this._current < 0) return now % 60000;
    const wallSec = Math.floor(now / 1000) % 60;    // every zone today is a whole-minute offset from UTC
    return this._current * 1000 + (wallSec === this._current ? now % 1000 : 999);
  }

  _label(k) { return this._mode === 'countdown' ? pad((60 - k) % 60) : pad(k); }

  _setMode(mode) {
    if (mode === this._mode && mode === 'clock') return;
    this._mode = mode;
    this._restart();
  }

  /* ----- internals: drawing -------------------------------------------- */

  _mk(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }

  _buildSvg() {
    const svg = this._el.svg;
    this._gLabels = this._mk('g', { class: 'labels' }, svg);
    // Lines in three ring groups, outer ring first so inner petals sit on top.
    this._gLines = this._mk('g', { class: 'lines' }, svg);
    this._ringGroups = [];
    [2, 1, 0].forEach((r) => { this._ringGroups[r] = this._mk('g', { class: `ring r${r}` }, this._gLines); });
    // The hub: a disc behind the time with a rosette of circles.
    this._gDisc = this._mk('g', { class: 'disc' }, svg);
    this._discFace = this._mk('circle', { class: 'face' }, this._gDisc);
    this._discTint = this._mk('circle', { class: 'tint' }, this._gDisc);
    this._discInner = this._mk('circle', { class: 'inner' }, this._gDisc);
    this._rosette = this._mk('g', { class: 'rosette' }, this._gDisc);
    this._rosetteCircles = Array.from({ length: 18 }, () => this._mk('circle', {}, this._rosette));
    this._gRipples = this._mk('g', { class: 'ripples' }, svg);
    this._converge = [0, 1, 2].map(() => this._mk('circle', { class: 'converge' }, this._gRipples));
    this._labels = Array.from({ length: 60 }, () => this._mk('text', {}, this._gLabels));
  }

  _relabel() { this._labels.forEach((t, k) => { t.textContent = this._label(k); }); }

  // The newest second lands just below the right-hand side; older ones travel counterclockwise.
  _angle(s) { return 0.14 + s * (Math.PI / 30); }

  _measure() {
    const host = this.getBoundingClientRect();
    if (!host.width || !host.height) return;
    const showLabels = this.getAttribute('labels') !== 'off';
    const size = Math.min(host.width, host.height);
    this._el.clock.style.fontSize = this._el.glow.style.fontSize = `${clamp(size * 0.105, 20, 120).toFixed(1)}px`;
    const k = this._el.clock.getBoundingClientRect();
    const cx = k.left - host.left + k.width / 2, cy = k.top - host.top + k.height / 2;
    const R = Math.max(50, size / 2 - (showLabels ? 26 : 8));
    const rIn = Math.min(R - 20, k.width / 2 + 16);
    this._geo = { cx, cy, R, rIn, sparse: (TAU * R) / 60 < 22 };
    this._el.svg.setAttribute('viewBox', `0 0 ${host.width} ${host.height}`);
    this._el.stage.style.setProperty('--_cx', `${cx.toFixed(1)}px`);
    this._el.stage.style.setProperty('--_cy', `${cy.toFixed(1)}px`);
    Object.assign(this._el.bowl.style, { left: `${cx - rIn}px`, top: `${cy - rIn}px`, width: `${rIn * 2}px`, height: `${rIn * 2}px` });
    // Hub disc and rosette (circles through the centre, like a spirograph), drawn around (0, 0).
    const dr = rIn - 3;
    [[this._discFace, dr], [this._discTint, dr], [this._discInner, dr * 0.84]].forEach(([c, r]) => { c.setAttribute('cx', 0); c.setAttribute('cy', 0); c.setAttribute('r', r.toFixed(1)); });
    const rr = dr * 0.4;
    this._rosetteCircles.forEach((c, i) => {
      const a = (i / this._rosetteCircles.length) * TAU;
      c.setAttribute('cx', (Math.cos(a) * rr).toFixed(1)); c.setAttribute('cy', (Math.sin(a) * rr).toFixed(1)); c.setAttribute('r', rr.toFixed(1));
    });
    this._placedRot = null;
    this._placeLabels();
    this._paintLabels();
  }

  _placeLabels() {
    const g = this._geo;
    if (!g || this._placedRot === this._rot) return;
    this._placedRot = this._rot;
    this._labels.forEach((t, s) => {
      const th = this._angle(s) + this._rot;
      t.setAttribute('x', (g.cx + Math.cos(th) * (g.R + 13)).toFixed(1));
      t.setAttribute('y', (g.cy + Math.sin(th) * (g.R + 13)).toFixed(1));
    });
  }

  _live(s) { return this._lines.some((st) => st.s === s && st.retractAt === null); }

  _paintLabels() {
    const g = this._geo;
    if (!g) return;
    const show = this.getAttribute('labels') !== 'off';
    this._labels.forEach((t, s) => {
      const isNow = s === this._current;
      t.classList.toggle('on', show && (isNow || (this._live(s) && (!g.sparse || s % 5 === 0))));
      t.classList.toggle('now', show && isNow);
    });
  }

  _still() { return reduceMotion.matches; }

  // A line arrives straight; every step of the dial leaves a little twist, so older lines curve.
  _addLine(s, now, delay, age) {
    const drag = s % 2 ? rand(1.05, 1.5) : rand(0.5, 0.95);
    const ring = s % RINGS;
    const path = this._mk('path', { class: 'line', part: 'petal' }, this._ringGroups[ring]);
    path.style.setProperty('--ring-index', ring);
    path.style.setProperty('--petal-index', Math.floor(s / RINGS));
    this._lines.push({
      s, th: this._angle(s), drag, ring,
      twist: age * Math.abs(STEP) * TWIST_K * drag,
      f: rand(1, 2.4), w: rand(1.2, 2.8), phi: rand(0, TAU),
      born: now + delay, pluckAt: now + delay + GROW_MS * 0.75, pluckAmp: rand(5, 9),
      retractAt: null, bloomAt: null, mFix: null,
      path,
    });
  }

  _addRipple(x, y, t0, dur, r0, r1, big) {
    this._ripples.push({ x, y, t0, dur, r0, r1, c: this._mk('circle', { class: big ? 'ripple big' : 'ripple' }, this._gRipples) });
  }

  _pluck(s, now) {
    const g = this._geo, th = this._angle(s) + this._rot;
    const x = g.cx + Math.cos(th) * g.R, y = g.cy + Math.sin(th) * g.R;
    this._addRipple(x, y, now, 1100, 0, 30, false);
    this._addRipple(x, y, now + 160, 1100, 0, 18, false);
    this._lines.forEach((st) => {
      if (st.s === s || st.retractAt !== null) return;
      let d = Math.abs(st.s - s); d = Math.min(d, 60 - d);
      const strength = 8 * Math.exp(-d / 5);
      if (strength < 0.4) return;
      st.pluckAt = now + d * 45;
      st.pluckAmp = strength;
    });
  }

  _highlight(h, m) {
    this._el.glow.innerHTML = `<span>${h}</span><span class="colon">:</span><span>${m}</span>`;
    this._glowAt = performance.now();
  }

  // Radial shockwave across the rings (CSS, staggered by --ring-index) and a hub tremor.
  _shock(now) {
    this._tremorAt = now;
    if (this._still()) return;
    const paths = this._lines.filter((st) => st.retractAt === null || st.bloomAt !== null).map((st) => st.path);
    paths.forEach((p) => p.classList.remove('shock'));
    void this._el.svg.getBoundingClientRect();   // restart the animation
    paths.forEach((p) => p.classList.add('shock'));
    clearTimeout(this._shockTimer);
    this._shockTimer = setTimeout(() => paths.forEach((p) => p.classList.remove('shock')), SHOCK_MS + 3 * 65 + 50);
  }

  // Lines leave by drawing back into the centre (used on a mode change).
  _pullIn(now) {
    this._lines
      .filter((st) => st.retractAt === null)
      .sort((a, b) => a.s - b.s)
      .forEach((st, i) => { st.retractAt = now + i * 9; st.mFix = 0; });
    this._form = 0;
  }

  // The minute turns over. With the finale, the drawn-in lotus blooms outward and dissolves
  // (spring easing, staggered round the flower) as the bowl is struck; otherwise lines draw back in.
  _startOver(now, key) {
    this._rolledAt = now;
    const g = this._geo;
    const finale = this.getAttribute('finale') !== 'off';
    const bloom = finale && !this._still() && this._form > 0.05;
    if (bloom) {
      this._lines.filter((st) => st.retractAt === null).forEach((st) => {
        st.retractAt = now; st.bloomAt = now; st.mFix = this._form;
        st.path.classList.add('bloom');
      });
      this._form = 0;
      this._shock(now);
    } else {
      this._pullIn(now);
      if (finale) this._shock(now);
    }
    if (g && finale) for (let k = 0; k < 3; k++) this._addRipple(g.cx, g.cy, now + k * 200, 1500, g.rIn, g.R + 30, true);
    const sound = this.hasAttribute('sound');
    if (this._mode === 'countdown' && key === '0') {
      this._cd.running = false; this._cd.remMs = 0;
      if (sound) { bowl.strike(bowl.ROOT, 0.22); bowl.strike(bowl.ROOT, 0.17, 2.6); bowl.strike(bowl.ROOT, 0.15, 5.2); }
      this._emit('complete');
    } else {
      if (sound) bowl.strike(bowl.ROOT, 0.22);
      this._emit('minute', { value: this._read() });
    }
  }

  _stepTo(n, now, instant) {
    this._steps = n;
    this._rotFrom = instant ? n * STEP : this._rotStep;
    this._rotTo = n * STEP;
    this._rotAt = now;
  }

  /* ----- internals: rim rubbing ---------------------------------------- */

  _onPointer(e) {
    const g = this._geo, rub = this._rub;
    if (!g) return;
    if (e.type === 'pointerup' || e.type === 'pointercancel') { rub.down = false; rub.lastAngle = null; return; }
    if (e.type === 'pointerleave') { rub.lastAngle = null; return; }
    const box = this.getBoundingClientRect();
    const x = e.clientX - box.left - g.cx, y = e.clientY - box.top - g.cy;
    const dist = Math.hypot(x, y);
    if (e.type === 'pointerdown') {
      rub.travel = 0;
      rub.down = dist < g.rIn * 1.15;          // touch and pen: drag from the hub
      rub.lastAngle = null;
      // A drag round the rim suppresses the click, so wake the audio here (this is a gesture).
      if (rub.down) bowl.wake();
      return;
    }
    // pointermove: track the angle round the hub while dragging, or while a mouse circles it.
    const inZone = dist > g.rIn * 0.3 && dist < g.rIn * 2.1;
    if (!(rub.down || (e.pointerType === 'mouse' && inZone))) { rub.lastAngle = null; return; }
    const a = Math.atan2(y, x), now = performance.now();
    if (rub.lastAngle !== null) {
      let da = a - rub.lastAngle;
      da -= TAU * Math.round(da / TAU);
      const w = da / (Math.max(8, now - rub.lastMove) / 1000);   // rad/s
      rub.omega += (clamp(w, -40, 40) - rub.omega) * 0.25;
      if (rub.down) rub.travel += Math.abs(da);
      // Circling detected: make sure the audio is awake. Only after a real gesture on the page
      // (a drag, or any earlier click/tap), since browsers refuse to start audio from a mouse hover.
      if (Math.abs(rub.omega) > 2.2 && (rub.down || navigator.userActivation?.hasBeenActive)) bowl.wake();
    }
    rub.lastAngle = a; rub.lastMove = now;
    this._kick();
  }

  // Called every frame: how strongly the bowl sings follows a steady circular motion.
  _updateRub(now) {
    const rub = this._rub;
    if (now - rub.lastMove > 80) rub.omega *= 0.9;                // they've stopped moving
    const speed = Math.abs(rub.omega);
    const target = clamp((speed - 2.2) / 6, 0, 1);               // ~1 turn per 3 s starts it singing
    rub.level += (target - rub.level) * (target > rub.level ? 0.06 : 0.04);
    if (rub.level < 0.002) rub.level = 0;
    // Rubbing is deliberate, so the drone sings whether or not ambient `sound` is on.
    if (now - rub.sentAt > 60 && (rub.level > 0 || rub.active)) {
      rub.sentAt = now;
      bowl.droneLevel(rub.level, clamp(speed / 12, 0, 1));
    }
    // A light buzz under the finger on phones while the rim is being rubbed.
    if (rub.down && rub.level > 0.15 && now - rub.buzzAt > 180) {
      rub.buzzAt = now;
      try { navigator.vibrate?.(12); } catch (e) {}
    }
    if (!rub.active && rub.level > 0.15) { rub.active = true; this._emit('rubstart', { speed }); }
    else if (rub.active && rub.level < 0.02) { rub.active = false; this._emit('rubend'); }
    return rub.level;
  }

  /* ----- internals: the frame ------------------------------------------ */

  _frame(now) {
    this._raf = 0;
    const g = this._geo;
    if (!g) return;
    const still = this._still();
    const finale = this.getAttribute('finale') !== 'off';
    const t = still ? 0 : now / 1000;
    const { cx, cy, R } = g;
    const msm = this._msm();
    const stage = this._el.stage;

    // Step the dial; then one extra full turn at the end of the minute.
    const sp = still ? 1 : clamp((now - this._rotAt) / STEP_MS, 0, 1);
    this._rotStep = this._rotFrom + (this._rotTo - this._rotFrom) * inOut(sp);
    const turn = still || !finale ? 0 : clamp((msm - SPIN_FROM) / (60000 - SPIN_FROM), 0, 1);
    const spin = -TAU * inOut(turn);
    this._rot = this._rotStep + spin;

    // How fast the dial is turning; lines keep a twist from every bit of turning.
    let dr = 0;
    if (!still && this._lastFrame) {
      dr = this._rot - this._lastRot;
      dr -= TAU * Math.round(dr / TAU);
      const v = clamp(dr / Math.max(1, now - this._lastFrame), -0.008, 0.008);
      this._angVel += (v - this._angVel) * 0.3;
    } else this._angVel = 0;
    this._lastRot = this._rot; this._lastFrame = now;

    // :55–:59, the inhalation: each tick draws the lotus in a little and warms its colour.
    let inhale = 0;
    if (!still && finale && msm >= INHALE_FROM) {
      const k = msm - INHALE_FROM;
      inhale = clamp((Math.floor(k / 1000) + ease(clamp((k % 1000) / 380, 0, 1))) / 5, 0, 1);
    }
    if (Math.abs(inhale - this._inhale) > 0.002) { stage.style.setProperty('--_inhale', inhale.toFixed(3)); this._inhale = inhale; }
    const drawIn = 1 - 0.05 * inhale;

    // How far the lines have folded into the lotus (only during the final turn).
    const form = still || !finale ? 0 : smoothstep(clamp(turn * 1.3, 0, 1));
    if (turn > 0) this._form = form;   // remembered past :00 for the bloom

    // The hub's micro-tremor: after a strike, and while the rim is being rubbed.
    const rubLevel = this._updateRub(now);
    const tp = (now - this._tremorAt) / TREMOR_MS;
    const amp = Math.max(tp >= 0 && tp < 1 ? TREMOR_PX * (1 - tp) ** 2 : 0, rubLevel * 1.8);
    let jx = 0, jy = 0;
    if (!still && amp > 0.02) {
      jx = amp * Math.sin(now * 0.113) * Math.cos(now * 0.029);
      jy = amp * Math.sin(now * 0.097 + 1.3);
    }
    const tf = `translate(-50%, -50%) translate(${jx.toFixed(2)}px, ${jy.toFixed(2)}px)`;
    if (tf !== this._lastTf) { this._el.clock.style.transform = this._el.glow.style.transform = tf; this._lastTf = tf; }

    // The hub disc, rosette and glow: with the bloom, fading after :00.
    let bloomVis = form;
    if (turn <= 0 && !still && finale && now - this._rolledAt < 900) bloomVis = 1 - smoothstep((now - this._rolledAt) / 900);
    this._el.aura.style.opacity = (bloomVis * 0.95).toFixed(3);
    this._gDisc.style.opacity = bloomVis.toFixed(3);
    if (bloomVis > 0.001) {
      const deg = (this._rot * 180) / Math.PI;
      this._gDisc.setAttribute('transform', `translate(${(cx + jx).toFixed(1)} ${(cy + jy).toFixed(1)})`);
      this._rosette.setAttribute('transform', `rotate(${(-deg * 1.5).toFixed(2)}) scale(${(0.6 + 0.4 * bloomVis).toFixed(3)})`);
    }
    this._placeLabels();

    // While the rim sings, small ripples keep leaving the hub's edge.
    if (!still && rubLevel > 0.25 && now - this._rub.rippleAt > 380) {
      this._rub.rippleAt = now;
      this._addRipple(cx, cy, now, 1100, g.rIn, g.rIn + 22 + 40 * rubLevel, false);
    }

    const span = R - g.rIn;
    const half = Math.PI / 20;                          // half the angle between petals in one ring

    // Lines.
    this._lines = this._lines.filter((st) => {
      const m = st.mFix === null ? form : st.mFix;
      let end = 1;
      if (st.bloomAt !== null) {
        // Blooming: CSS springs it outward and fades it; just keep its shape, then let it go.
        if (now - st.bloomAt > BLOOM_MS + 20 * 8 + 120 || still) { st.path.remove(); return false; }
      } else if (st.retractAt !== null) {
        const r = still ? 1 : clamp((now - st.retractAt) / RETRACT_MS, 0, 1);
        if (r >= 1) { st.path.remove(); return false; }
        end = 1 - ease(r);
      }
      if (!still) end = Math.min(end, ease(clamp((now - st.born) / GROW_MS, 0, 1)));
      if (end < 0.005) { st.path.setAttribute('d', ''); return true; }
      const blooming = st.bloomAt !== null;

      const th = st.th + this._rot;
      const dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
      if (!blooming) st.twist -= dr * TWIST_K * st.drag;
      const trail = blooming ? st.twist : st.twist - this._angVel * LAG_K * st.drag;
      // Ripples, strikes and rim-rubbing make the line tremble; the wave travels outward.
      const A = (!still && now >= st.pluckAt ? st.pluckAmp * Math.exp(-(now - st.pluckAt) / 480) : 0) + rubLevel * 3.2;

      // Its petal: from the ring's base out to a point, aimed at the line's own second.
      let base = 0, L = 0, W = 0;
      if (m > 0.001) {
        base = g.rIn + span * RING_BASE[st.ring];
        L = span * RING_LEN[st.ring];
        W = Math.min(L * 0.42, (base + L * 0.4) * Math.sin(half) * 1.3);
      }
      const k = blooming ? 1 : drawIn;   // the bloom's CSS takes over the draw-in from 0.95

      let d = '';
      for (let i = 0; i <= SAMPLES; i++) {
        const u = end * (i / SAMPLES);
        const x = R * u;
        const y = A ? A * Math.sin(2 * Math.PI * st.f * u - st.w * t + st.phi) * Math.sin(Math.PI * u) : 0;
        let px = dx * x + nx * y, py = dy * x + ny * y;
        if (Math.abs(trail) > 0.0005) {
          const lag = trail * (1 - u) ** 1.3;
          const cl = Math.cos(lag), sl = Math.sin(lag);
          [px, py] = [px * cl - py * sl, px * sl + py * cl];
        }
        if (m > 0.001) {
          // Trace the petal: first half up one edge to the tip, second half back down the other.
          const v = u <= 0.5 ? u * 2 : (1 - u) * 2;
          const side = u <= 0.5 ? -1 : 1;
          const qx = base + L * v, qy = side * W * petalShape(v);
          px += (dx * qx + nx * qy - px) * m;
          py += (dy * qx + ny * qy - py) * m;
        }
        d += `${i ? 'L' : 'M'}${(cx + px * k).toFixed(1)},${(cy + py * k).toFixed(1)}`;
      }
      st.path.setAttribute('d', m > 0.5 ? d + 'Z' : d);
      st.path.style.fillOpacity = m > 0.001 ? Math.min(0.85, m * m * RING_FILL[st.ring] * (1 + 0.6 * inhale)).toFixed(3) : '0';
      st.path.classList.toggle('formed', m > 0.4);
      st.path.classList.toggle('now', st.s === this._current && st.retractAt === null && m < 0.4);
      return true;
    });

    // Rings close in on the digits before :00.
    const cv = still || !finale ? 0 : clamp((msm - CONVERGE_FROM) / (60000 - CONVERGE_FROM), 0, 1);
    this._converge.forEach((el, i) => {
      const p = clamp(cv - i * 0.12, 0, 1);
      if (p <= 0) { el.style.opacity = '0'; return; }
      el.setAttribute('cx', cx.toFixed(1)); el.setAttribute('cy', cy.toFixed(1));
      el.setAttribute('r', (R + (g.rIn - R) * p * p * p).toFixed(1));
      el.style.opacity = (Math.min(1, p * 4) * (0.7 - i * 0.2)).toFixed(3);
    });

    // Ripple of light through the digits.
    const glow = this._el.glow;
    if (this._glowAt >= 0) {
      const gp = (now - this._glowAt) / GLOW_MS;
      if (gp >= 1 || still) { glow.style.opacity = '0'; this._glowAt = -1; }
      else {
        const spanPx = Math.max(260, (this._el.clock.offsetWidth / 2) / 0.28);
        const a = smoothstep(gp) * spanPx, b = smoothstep(clamp((gp - 0.18) / 0.82, 0, 1)) * spanPx;
        const size = `${a.toFixed(0)}px ${a.toFixed(0)}px, ${b.toFixed(0)}px ${b.toFixed(0)}px`;
        glow.style.webkitMaskSize = size; glow.style.maskSize = size; glow.style.opacity = '1';
      }
    }

    this._ripples = this._ripples.filter((rp) => {
      const p = (now - rp.t0) / rp.dur;
      if (p >= 1 || still) { rp.c.remove(); return false; }
      if (p < 0) { rp.c.style.opacity = '0'; return true; }
      rp.c.setAttribute('cx', rp.x.toFixed(1)); rp.c.setAttribute('cy', rp.y.toFixed(1));
      rp.c.setAttribute('r', (rp.r0 + ease(p) * (rp.r1 - rp.r0)).toFixed(1));
      rp.c.style.opacity = ((1 - p) * (1 - p)).toFixed(3);
      return true;
    });

    if (!still && this._onScreen && !document.hidden && this.isConnected) this._raf = requestAnimationFrame(this._frame);
  }

  _kick() { if (!this._raf && this.isConnected) this._raf = requestAnimationFrame(this._frame); }

  _tick() {
    clearTimeout(this._tickTimer);
    if (!this.isConnected) return;
    const now = performance.now();
    const p = this._read();
    const sec = p.slot, key = p.key;
    const { hh, mm, colon, clock } = this._el;
    if (sec !== this._current || key !== this._minuteKey) {
      const first = this._current === -1;
      const rolled = !first && key !== this._minuteKey;
      if (rolled && this._geo) this._startOver(now, key);
      for (let s = 0; s <= sec; s++) {
        if (this._live(s)) continue;
        const delay = first ? s * 22 : rolled ? 380 + s * 12 : 0;
        this._addLine(s, now, this._still() ? 0 : delay, sec - s);
      }
      this._stepTo(first ? sec : this._steps + ((sec - this._current + 60) % 60), now, first);
      this._current = sec; this._minuteKey = key;
      const sound = this.hasAttribute('sound');
      if (!first && this._geo && !this._still()) this._pluck(sec, now + (rolled ? 380 : 0) + GROW_MS * 0.75);
      if (!first && sound) bowl.mantra(sec % 6, (GROW_MS * 0.75) / 1000);   // Om · Ma · Ni · Pad · Me · Hum
      if (!first && sec === 56 && sound && this.getAttribute('finale') !== 'off') bowl.sing(bowl.ROOT, 0.05, Math.max(0.5, (60000 - this._msm()) / 1000), 3.5);
      if (rolled && !this._still() && this.getAttribute('finale') !== 'off') {
        if (mm.textContent !== p.b) { mm.classList.remove('roll'); void mm.offsetWidth; mm.classList.add('roll'); }
        if (hh.textContent !== p.a) { hh.classList.remove('roll'); void hh.offsetWidth; hh.classList.add('roll'); }
        this._highlight(p.a, p.b);
      }
      hh.textContent = p.a;
      mm.textContent = p.b;
      clock.setAttribute('aria-label', p.aria);
      colon.classList.remove('dim');
      setTimeout(() => colon.classList.add('dim'), 500);
      this._paintLabels();
      if (!first) this._emit('second', { value: p, syllable: bowl.SYLLABLES[sec % 6] });
      this._kick();
    }
    const counting = this._mode === 'countdown';
    clock.classList.toggle('paused', counting && !this._cd.running);
    const next = counting
      ? (this._cd.running ? (this._remaining() % 1000) + 5 : 250)
      : 1000 - (Date.now() % 1000) + 5;
    this._tickTimer = setTimeout(this._tick, next);
  }

  // Start the dial over (new mode, new time zone, reset).
  _restart() {
    this._pullIn(performance.now());
    this._current = -1; this._minuteKey = null;
    this._relabel();
    if (this.isConnected) { this._measure(); this._tick(); }
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail: { mode: this._mode, ...detail }, bubbles: true, composed: true }));
  }
}

if (typeof window !== 'undefined' && window.customElements && !customElements.get('lotus-clock')) {
  customElements.define('lotus-clock', LotusClock);
}

export default LotusClock;
