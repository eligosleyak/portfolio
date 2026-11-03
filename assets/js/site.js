(() => {
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  /* ================= Sound: a synthesised Tibetan singing bowl =================
     Everything is generated with Web Audio (no audio files):
     - strike(): fundamental + a partner 1.8 Hz above (slow beating) + two
       inharmonic bronze partials (x2.71, x4.83) that fade twice as fast.
     - sing():   a breathy rim-rub swell, used for the project wheel.
     (The clock's own sounds live in the <lotus-clock> component.)
     All of it runs through a warm low-pass, a small generated room reverb and
     a faint echo. Ambient sound is off until SOUND is pressed. */
  const sound = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    const btn = $('#sound'), state = $('#soundState');
    const ROOT = 216;
    const PENTA = [216, 243, 273, 324, 364];
    let ctx = null, master = null, bus = null, noiseBuf = null, on = false, offTimer = 0, mutedOnPurpose = false;

    function init() {
      if (ctx) return true;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.0001;
      master.connect(ctx.destination);

      const warm = ctx.createBiquadFilter();
      warm.type = 'lowpass'; warm.frequency.value = 1800; warm.Q.value = 0.4;

      // Quiet meditation room: ~3 s of decaying stereo noise as the impulse response.
      const len = Math.floor(ctx.sampleRate * 3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
      }
      const verb = ctx.createConvolver(); verb.buffer = ir;
      const dry = ctx.createGain(); dry.gain.value = 0.75;
      const wet = ctx.createGain(); wet.gain.value = 0.4;
      const echo = ctx.createDelay(1); echo.delayTime.value = 0.27;
      const feedback = ctx.createGain(); feedback.gain.value = 0.25;
      const echoOut = ctx.createGain(); echoOut.gain.value = 0.1;

      warm.connect(dry).connect(master);
      warm.connect(verb).connect(wet).connect(master);
      warm.connect(echo); echo.connect(feedback).connect(echo); echo.connect(echoOut).connect(master);
      bus = warm;

      const n = Math.floor(ctx.sampleRate * 4);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
      return true;
    }

    function voice(freq, t, attack, peak, decay) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + attack + decay + 0.1);
    }

    function strike(f0 = ROOT, peak = 0.15, decay = 7, delay = 0) {
      const t = ctx.currentTime + delay + 0.01;
      const f = f0 * (1 + (Math.random() - 0.5) * 0.004);     // no two strikes quite alike
      voice(f, t, 0.04, peak, decay);
      voice(f + 1.8, t, 0.04, peak * 0.8, decay);             // 1.8 Hz "wah-wah" beating
      voice(f * 2.71, t, 0.04, peak * 0.4, decay / 2);
      voice(f * 4.83, t, 0.04, peak * 0.22, decay / 2);
    }

    function sing(f, peak = 0.04, attack = 0.3, release = 2.5, delay = 0) {
      const t = ctx.currentTime + delay + 0.01;
      voice(f, t, attack, peak, release);
      voice(f + 1.8, t, attack, peak * 0.7, release);
      voice(f * 2.71, t, attack, peak * 0.12, release * 0.6);
      // Breath of the mallet on the rim: noise through a narrow band at the note.
      const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf;
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak * 1.4, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
      src.connect(bp).connect(g).connect(bus);
      src.start(t, Math.random() * 2);
      src.stop(t + attack + release + 0.1);
    }

    function wake() {
      clearTimeout(offTimer);
      ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.03);
    }

    function setOn(v) {
      if (v && !init()) return;
      on = v;
      mutedOnPurpose = !v;
      btn.setAttribute('aria-pressed', String(on));
      state.textContent = on ? 'On' : '—';
      if (!ctx) return;
      if (on) { wake(); strike(ROOT, 0.15, 7); }
      else {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
        clearTimeout(offTimer);
        offTimer = setTimeout(() => { if (!on) ctx.suspend(); }, 500);
      }
    }
    btn.addEventListener('click', () => { setOn(!on); document.getElementById('lotus')?.toggleAttribute('sound', on); });

    const ambient = (fn) => { if (on && ctx) fn(); };
    return {
      ROOT, PENTA,
      step(i) { ambient(() => sing(PENTA[i % PENTA.length])); },
      strike(f) { ambient(() => strike(f || ROOT, 0.12, 6)); },
      click() { ambient(() => strike(432, 0.05, 3)); },
      // Starting the timer is a gesture, so the audio can be readied for the end-of-session bell.
      prime() { if (init()) { wake(); clearTimeout(offTimer); } },
      // End of a timer session: three strikes of the bowl, unless sound was switched off on purpose.
      session() {
        if (mutedOnPurpose || !init()) return;
        wake();
        strike(ROOT, 0.2, 9); strike(ROOT, 0.17, 9, 2.6); strike(ROOT / 2, 0.12, 10, 5.2); strike(ROOT, 0.15, 9, 5.2);
        if (!on) { clearTimeout(offTimer); offTimer = setTimeout(() => { if (!on) ctx.suspend(); }, 16000); }
      },
      // The bowl in the middle answers a deliberate press even when ambient sound is off.
      bowl() {
        if (!init()) return;
        wake();
        strike(ROOT, 0.16, 8);
        if (!on) offTimer = setTimeout(() => { if (!on) ctx.suspend(); }, 9000);
      },
    };
  })();

  /* ================= Invert colour ================= */
  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : darkMQ.matches);
  $('#invert').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    store.set('theme', next);
    sound.click();
  });

  /* ================= Timer (pomodoro) state =================
     25 min focus, 5 min short break, 15 min long break after every 4th focus.
     State lives in localStorage so a refresh keeps the countdown going. */
  // The clock is the <lotus-clock> web component (assets/js/lotus-clock.js).
  const lc = $('#lotus');
  const lcReady = window.customElements ? customElements.whenDefined('lotus-clock') : new Promise(() => {});
  const inTimerView = () => root.classList.contains('timer');
  const timer = (() => {
    const MIN = 60000;
    const DUR = { focus: 25 * MIN, short: 5 * MIN, long: 15 * MIN };
    const NAME = { focus: 'Focus', short: 'Short break', long: 'Long break' };
    const ROUNDS = 4;
    const live = $('#live');
    const goBtn = $('#timerGo'), phaseBtns = $$('[data-phase]'), dots = $$('#rounds i');
    const mini = $('#miniTimer'), miniTime = $('#miniTime'), miniName = $('#miniName'), miniArc = $('#miniArc');
    const ARC = 2 * Math.PI * 5.5;
    const baseTitle = document.title;
    miniArc.style.strokeDasharray = `${ARC} ${ARC}`;

    let st = { phase: 'focus', round: 1, running: false, endAt: 0, remMs: DUR.focus };
    try {
      const saved = JSON.parse(store.get('timer') || 'null');
      if (saved && DUR[saved.phase]) st = Object.assign(st, saved);
    } catch (e) {}
    const save = () => store.set('timer', JSON.stringify(st));

    const remaining = () => (st.running ? Math.max(0, st.endAt - Date.now()) : st.remMs);
    let advanceTimer = 0;

    function ui() {
      goBtn.textContent = st.running ? 'Pause' : remaining() < DUR[st.phase] && remaining() > 0 ? 'Resume' : 'Start';
      goBtn.setAttribute('aria-pressed', String(st.running));
      phaseBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.phase === st.phase)));
      const done = st.phase === 'focus' ? st.round - 1 : st.round;   // focus sessions finished this cycle
      dots.forEach((d, i) => d.classList.toggle('on', i < done));
      $('#rounds').setAttribute('aria-label', `Round ${st.round} of ${ROUNDS}`);
      paintMini();
    }

    function setPhase(p, { round } = {}) {
      clearTimeout(advanceTimer);
      st.phase = p;
      if (round) st.round = round;
      st.running = false;
      st.remMs = DUR[p];
      save(); ui();
      syncClock(true);
    }

    function advance(announce) {
      let next;
      if (st.phase === 'focus') next = st.round % ROUNDS === 0 ? 'long' : 'short';
      else { st.round = st.phase === 'long' ? 1 : st.round + 1; next = 'focus'; }
      setPhase(next);
      if (announce) live.textContent = `${NAME[next]} next. Press start when you’re ready.`;
    }

    function start() {
      if (st.running || remaining() <= 0) return;
      st.running = true;
      st.endAt = Date.now() + st.remMs;
      sound.prime();
      save(); ui();
      syncClock(false);
    }
    function pause() {
      if (!st.running) return;
      st.remMs = remaining();
      st.running = false;
      save(); ui();
      syncClock(false);
    }

    // While the Pomodoro is open, the clock counts down with the timer.
    function syncClock(restart) {
      if (!inTimerView()) return;
      lcReady.then(() => {
        if (restart || lc.mode !== 'countdown') lc.countdown(remaining(), { autostart: st.running });
        else if (st.running) lc.start(); else lc.pause();
      });
    }

    // The countdown reached 00:00 (checked every 250 ms, whichever view is open).
    function finish() {
      st.running = false; st.remMs = 0; save(); ui();
      live.textContent = `${NAME[st.phase]} complete.`;
      // In the Pomodoro view with sound on, the clock rings its own bowl; otherwise ring ours.
      if (!(inTimerView() && lc.hasAttribute('sound'))) sound.session();
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(() => advance(true), 5200);
    }

    // A session that ended while the page was closed.
    if (st.running && Date.now() >= st.endAt) { st.running = false; st.remMs = DUR[st.phase]; advance(false); }

    // Small timer in the top-right corner while a session is on and you're elsewhere on the site.
    function paintMini() {
      if (st.running && remaining() <= 0) { finish(); return; }
      const r = remaining(), tot = Math.ceil(r / 1000);
      const txt = `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
      const inView = root.classList.contains('timer');
      const active = st.running || (r > 0 && r < DUR[st.phase]);
      mini.hidden = !active || inView;
      mini.classList.toggle('paused', !st.running);
      miniTime.textContent = txt;
      miniName.textContent = NAME[st.phase];
      miniArc.style.strokeDashoffset = (ARC * (r / DUR[st.phase])).toFixed(2);
      mini.setAttribute('aria-label', `${NAME[st.phase]} ${st.running ? '' : 'paused, '}${txt} left. Open the Pomodoro.`);
      const title = st.running || inView ? `${txt} · ${NAME[st.phase]} — Shashank Acharya` : baseTitle;
      if (document.title !== title) document.title = title;
    }
    setInterval(paintMini, 250);

    goBtn.addEventListener('click', () => (st.running ? pause() : start()));
    $('#timerReset').addEventListener('click', () => setPhase(st.phase));
    $('#timerSkip').addEventListener('click', () => advance(true));
    phaseBtns.forEach((b) => b.addEventListener('click', () => setPhase(b.dataset.phase)));
    ui();

    return {
      paint: () => paintMini(),
      sync: syncClock,
      remaining, finish,
      running: () => st.running,
      total: () => DUR[st.phase],
      name: () => NAME[st.phase],
      toggle: () => (st.running ? pause() : start()),
    };
  })();

  // Pressing the middle of the clock rings the component's own bowl (it always sounds when pressed).

  /* ================= Procedural backgrounds (WebGL) ================= */
  const bg = (() => {
    const canvas = $('#bg');
    const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }); } catch (e) {}

    if (!gl) {
      // Fallback: a static gradient per project.
      return {
        set(colors) {
          canvas.style.background = `radial-gradient(120% 90% at 30% 70%, ${colors[2]} 0%, ${colors[1]} 35%, ${colors[0]} 75%)`;
        },
        pause() {},
      };
    }

    const vs = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';
    const fs = `
      precision mediump float;
      uniform vec2 uRes; uniform float uTime; uniform float uMix;
      uniform vec3 uA0, uA1, uA2, uB0, uB1, uB2; uniform float uSA, uSB;
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
      float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= .5; } return v; }
      vec3 scene(vec2 uv, vec3 c0, vec3 c1, vec3 c2, float seed){
        vec2 p = uv * 2.2 + seed * 13.17;
        float t = uTime * .03;
        vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2, 1.3) - t));
        vec2 r = vec2(fbm(p + 3. * q + vec2(1.7, 9.2) + t * .6), fbm(p + 3. * q + vec2(8.3, 2.8)));
        float n = fbm(p + 2.4 * r);
        float B = 7.;
        float x = n * B; float fl = floor(x); float fr = fract(x);
        float s = (fl + smoothstep(.8, 1., fr)) / B;               // soft posterised bands
        vec3 col = mix(c0, c1, smoothstep(.28, .55, s));
        col = mix(col, c2, smoothstep(.55, .78, s));
        float line = 1. - smoothstep(0., .08, fr);                  // contour line at each band edge
        col = mix(col, col * .7, line * .55);
        float dots = step(.86, hash(floor(gl_FragCoord.xy / 2.)));  // fine stipple
        col *= 1. - dots * .08;
        return col;
      }
      void main(){
        vec2 uv = gl_FragCoord.xy / uRes.y;
        vec3 col = scene(uv, uA0, uA1, uA2, uSA);
        if (uMix > .001) col = mix(col, scene(uv, uB0, uB1, uB2, uSB), uMix);
        vec2 c = gl_FragCoord.xy / uRes - .5;
        col *= 1. - dot(c, c) * .9;
        col += (hash(gl_FragCoord.xy + fract(uTime) * 91.) - .5) * .05;
        gl_FragColor = vec4(col, 1.);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return { set() {}, pause() {} }; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uRes', 'uTime', 'uMix', 'uA0', 'uA1', 'uA2', 'uB0', 'uB1', 'uB2', 'uSA', 'uSB'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

    let A = null, B = null, sA = 0, sB = 0, mixStart = 0, mixing = false, paused = false, raf = 0, lastDraw = 0;
    const t0 = performance.now();
    const MIX_MS = 1000;

    function resize() {
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.55;
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    }
    function frame(now) {
      raf = 0;
      if (paused || document.hidden || !A) return;
      const still = reduceMotion.matches;
      if (now - lastDraw > 33 || mixing) {
        lastDraw = now;
        let m = 0;
        if (mixing) {
          m = clamp((now - mixStart) / MIX_MS, 0, 1);
          m = m * m * (3 - 2 * m);
          if (m >= 1) { A = B; sA = sB; mixing = false; m = 0; }
        }
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform1f(U.uTime, still ? 4.0 : (now - t0) / 1000);
        gl.uniform1f(U.uMix, m);
        gl.uniform3fv(U.uA0, A[0]); gl.uniform3fv(U.uA1, A[1]); gl.uniform3fv(U.uA2, A[2]);
        const b = B || A;
        gl.uniform3fv(U.uB0, b[0]); gl.uniform3fv(U.uB1, b[1]); gl.uniform3fv(U.uB2, b[2]);
        gl.uniform1f(U.uSA, sA); gl.uniform1f(U.uSB, sB);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (!still || mixing) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    window.addEventListener('resize', () => { resize(); kick(); });
    document.addEventListener('visibilitychange', kick);
    reduceMotion.addEventListener?.('change', kick);
    resize();

    return {
      set(colors, seed) {
        const c = colors.map(hex);
        if (!A) { A = c; sA = seed; kick(); return; }
        if (mixing && (performance.now() - mixStart) > MIX_MS / 2) { A = B; sA = sB; }
        B = c; sB = seed; mixing = true; mixStart = performance.now();
        kick();
      },
      pause(v) { paused = v; kick(); },
    };
  })();

  /* ================= Rotary project picker ================= */
  const right = $('#right');
  const cases = $$('.case');
  const items = cases.map((el) => ({
    id: el.dataset.id, cat: el.dataset.cat, title: el.dataset.short, year: el.dataset.year,
    colors: el.dataset.colors.split(','), el,
  }));

  const picker = (() => {
    const cluster = $('#cluster'), cats = $('#cats'), titles = $('#titles'), ruler = $('#ruler');
    const idxEl = $('#idx'), yearEl = $('#year'), live = $('#live'), needle = $('.needle', ruler);
    const SMALL = 0.58, TGAP = 10, NTICKS = 15;

    const mk = (parent, text, i) => {
      const e = document.createElement('span');
      e.className = 'w-item'; e.textContent = text; e.dataset.i = i;
      parent.appendChild(e); return e;
    };
    const catEls = items.map((it, i) => mk(cats, it.cat, i));
    const titleEls = items.map((it, i) => {
      const e = mk(titles, it.title, i);
      e.id = `opt-${it.id}`; e.setAttribute('role', 'option');
      return e;
    });
    const ticks = Array.from({ length: NTICKS }, () => ruler.insertBefore(document.createElement('i'), needle));

    let row = 48, pos = 0, target = 0, vel = 0, active = -1, raf = 0, last = 0;
    let drag = null;

    const readRow = () => { row = parseFloat(getComputedStyle(cluster).getPropertyValue('--row')) || 48; };

    function render() {
      items.forEach((_, i) => {
        const d = i - pos, ad = Math.abs(d);
        const op = ad < 1 ? 1 - 0.55 * ad : ad < 2 ? 0.45 * (2 - ad) : 0;
        const sc = 1 - (1 - SMALL) * Math.min(ad, 1);
        const tf = `translate3d(0, ${(d * row).toFixed(2)}px, 0) scale(${sc.toFixed(4)})`;
        catEls[i].style.transform = titleEls[i].style.transform = tf;
        catEls[i].style.opacity = titleEls[i].style.opacity = op.toFixed(3);
        catEls[i].style.visibility = titleEls[i].style.visibility = op < 0.01 ? 'hidden' : '';
      });
      const per = row / TGAP;                               // ticks per item
      const frac = (((pos * per) % 1) + 1) % 1;
      ticks.forEach((t, j) => {
        const k = j - (NTICKS - 1) / 2;
        const y = (k - frac) * TGAP;
        const a = clamp(1 - Math.abs(y) / (TGAP * 6), 0, 1);
        t.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
        t.style.opacity = (a * a * 0.6).toFixed(3);
      });
      const pulse = clamp(Math.abs(vel) * 60, 0, 14);
      needle.style.width = `${24 + pulse}px`;
      needle.style.marginLeft = `${-(24 + pulse) / 2}px`;
    }

    function setActive(i) {
      if (i === active) return;
      const first = active === -1;
      active = i;
      const it = items[i];
      idxEl.textContent = String(i + 1).padStart(2, '0');
      yearEl.textContent = it.year;
      if (!first) {
        [idxEl, yearEl].forEach((e) => { e.classList.remove('flip'); void e.offsetWidth; e.classList.add('flip'); });
        sound.step(i);
      }
      titleEls.forEach((e, j) => e.setAttribute('aria-selected', String(j === i)));
      cluster.setAttribute('aria-activedescendant', titleEls[i].id);
      live.textContent = `${it.title}, ${it.cat}, ${it.year}`;
      bg.set(it.colors, i * 1.37 + 0.4);
      // The clock takes the project's colours too (mid → bright), gliding over with the background.
      lc.style.setProperty('--proj-a', it.colors[1]);
      lc.style.setProperty('--proj-b', it.colors[2]);
    }

    function loop(now) {
      raf = 0;
      const dt = last ? Math.min(48, now - last) / 16.67 : 1;
      last = now;
      if (!drag) {
        if (reduceMotion.matches) { pos = target; vel = 0; }
        else {
          // Damped spring toward the target index.
          const force = (target - pos) * 0.11;
          vel = (vel + force * dt) * Math.pow(0.74, dt);
          pos += vel * dt;
        }
      }
      setActive(clamp(Math.round(pos), 0, items.length - 1));
      render();
      const settled = !drag && Math.abs(target - pos) < 0.0005 && Math.abs(vel) < 0.0005;
      if (settled) { pos = target; vel = 0; render(); last = 0; }
      else raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    function go(i, instant) {
      target = clamp(i, 0, items.length - 1);
      if (instant) { pos = target; vel = 0; }
      kick();
    }

    // Wheel / trackpad: one step per gesture burst.
    let acc = 0, lockUntil = 0, idle = 0;
    right.addEventListener('wheel', (e) => {
      if (right.classList.contains('has-sheet')) return;
      e.preventDefault();
      const now = performance.now();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      clearTimeout(idle);
      idle = setTimeout(() => { acc = 0; lockUntil = 0; }, 160);
      if (now < lockUntil) return;
      acc += delta;
      if (Math.abs(acc) >= 30) {
        const dir = Math.sign(acc);
        acc = 0;
        lockUntil = now + 380;
        go(target + dir);
      }
    }, { passive: false });

    // Drag / swipe
    cluster.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.details')) return;
      cluster.setPointerCapture(e.pointerId);
      drag = { y0: e.clientY, p0: pos, lastY: e.clientY, lastT: performance.now(), v: 0, moved: false, target: e.target };
      vel = 0;
    });
    cluster.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y0;
      if (Math.abs(dy) > 5) drag.moved = true;
      let p = drag.p0 - dy / row;
      const max = items.length - 1;
      if (p < 0) p = p * 0.35; else if (p > max) p = max + (p - max) * 0.35;   // rubber band at the ends
      const now = performance.now();
      drag.v = (drag.lastY - e.clientY) / row / Math.max(1, now - drag.lastT) * 16.67;
      drag.lastY = e.clientY; drag.lastT = now;
      vel = drag.v;
      pos = p;
      kick();
    });
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (!d.moved) {
        const it = d.target.closest('.w-item');
        if (it) {
          const i = +it.dataset.i;
          if (i === active && it.parentElement === titles) openCase(items[i].id);
          else go(i);
        }
        return;
      }
      go(Math.round(pos + clamp(d.v * 6, -1.5, 1.5)));
    };
    cluster.addEventListener('pointerup', end);
    cluster.addEventListener('pointercancel', end);

    $('#details').addEventListener('click', () => openCase(items[active].id));

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof Element && e.target.closest('input, textarea')) return;
      if (e.key === 'Escape' && right.classList.contains('has-sheet')) { location.hash = '#work'; return; }
      if (root.classList.contains('timer')) {
        if (e.key === 'Escape') location.hash = '#work';
        else if (e.key === ' ' && !(e.target instanceof Element && e.target.closest('button, a'))) { e.preventDefault(); timer.toggle(); }
        return;
      }
      if (right.classList.contains('has-sheet') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (['ArrowDown', 'ArrowRight', 'j', 'PageDown'].includes(e.key)) { e.preventDefault(); go(target + 1); }
      else if (['ArrowUp', 'ArrowLeft', 'k', 'PageUp'].includes(e.key)) { e.preventDefault(); go(target - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(items.length - 1); }
      else if (e.key === 'Enter' && (e.target === cluster || e.target === document.body)) { e.preventDefault(); openCase(items[active].id); }
    });

    window.addEventListener('resize', () => { readRow(); render(); });
    readRow();
    go(0, true);

    return { go, get active() { return active; }, focus: () => cluster.focus({ preventScroll: true }) };
  })();

  /* ================= Sheets + routing ================= */
  const sheets = { work: $('#sheet-work'), about: $('#sheet-about'), playground: $('#sheet-playground') };
  const navLinks = $$('[data-nav]');
  const prevLink = $('#casePrev'), nextLink = $('#caseNext');
  let openSheet = null, pauseTimer = 0, lastRoute = '', timerBgTimer = 0;

  function openCase(id) { location.hash = `#work/${id}`; }

  function showSheet(name) {
    Object.entries(sheets).forEach(([k, el]) => {
      const on = k === name;
      el.classList.toggle('open', on);
      el.setAttribute('aria-hidden', String(!on));
    });
    const has = !!name;
    right.classList.toggle('has-sheet', has);
    root.classList.toggle('lock', has && window.matchMedia('(max-width: 860px)').matches);
    $('#picker').inert = has;
    clearTimeout(pauseTimer);
    if (has) pauseTimer = setTimeout(() => bg.pause(true), 800); else bg.pause(false);
    const wasOpen = openSheet;
    openSheet = name;
    return wasOpen;
  }

  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    let view = 'work', sheet = null, anchor = null;
    if (h.startsWith('work/')) {
      const i = items.findIndex((it) => it.id === h.slice(5));
      if (i >= 0) {
        sheet = 'work';
        items.forEach((it, j) => it.el.classList.toggle('is-shown', j === i));
        const p = items[(i - 1 + items.length) % items.length], n = items[(i + 1) % items.length];
        prevLink.href = `#work/${p.id}`; prevLink.textContent = `← ${p.title}`;
        nextLink.href = `#work/${n.id}`; nextLink.textContent = `${n.title} →`;
        picker.go(i, !openSheet);
      }
    } else if (h === 'timer' || h === 'pomodoro') {
      view = 'timer';
    } else if (h === 'about' || h === 'playground') {
      view = sheet = h;
    } else if (h === 'contact') {
      view = sheet = 'about'; anchor = 'contact';
    }

    navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === view));
    const timing = view === 'timer';
    if (timing !== root.classList.contains('timer')) {
      root.classList.toggle('timer', timing);
      if (timing) timer.sync(true); else lcReady.then(() => lc.showClock());
      timer.paint();
      clearTimeout(timerBgTimer);
      if (timing) { timerBgTimer = setTimeout(() => bg.pause(true), 900); window.scrollTo(0, 0); }
      else if (!sheet) bg.pause(false);
    }
    const before = location.hash;
    const wasOpen = showSheet(sheet);
    if (sheet && (sheet !== wasOpen || before !== lastRoute)) {
      const i = items.findIndex((it) => it.el.classList.contains('is-shown'));
      sound.strike(sheet === 'work' ? sound.PENTA[Math.max(0, i) % 5] : sheet === 'about' ? 243 : 324);
    }
    lastRoute = before;

    if (sheet) {
      const el = sheets[sheet];
      if (anchor) $(`#${anchor}`, el).scrollIntoView({ block: 'start' });
      else el.scrollTop = 0;
      const heading = sheet === 'work' ? $('.case.is-shown h2', el) : $('h2', el);
      setTimeout(() => heading && heading.focus({ preventScroll: true }), wasOpen ? 0 : 350);
    } else if (wasOpen) {
      picker.focus();
    }
  }
  window.addEventListener('hashchange', route);
  // A direct link to a sheet opens it in place, without the slide-in.
  root.classList.add('no-anim');
  route();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-anim')));

  /* ================= Copy email ================= */
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(btn.dataset.copy); ok = true; } catch (e) {}
      btn.textContent = ok ? 'Copied' : 'Select & copy';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    });
  });

  /* ================= Playground: break-this-form ================= */
  (() => {
    const input = $('#phone'), suite = $('#suite'), verdict = $('#verdict'), triedEl = $('#tried');
    if (!input) return;
    const compact = (s) => s.trim().replace(/[\s-]/g, '');
    const national = (s) => compact(s).replace(/^\+977/, '');
    const tests = [
      { name: 'is not empty', run: (s) => s.trim().length > 0 },
      { name: 'uses only 0–9, spaces, - or +', run: (s) => /^[0-9\s+-]+$/.test(s.trim()) },
      { name: '“+” only as +977 prefix', run: (s) => { const c = compact(s); return !c.includes('+') || (/^\+977/.test(c) && c.lastIndexOf('+') === 0); } },
      { name: 'has exactly 10 digits', run: (s) => /^[0-9]{10}$/.test(national(s)) },
      { name: 'starts with 96, 97 or 98', run: (s) => /^9[678]/.test(national(s)) },
      { name: 'contains no markup', run: (s) => !/[<>]/.test(s) },
    ];
    const rows = tests.map((t) => {
      const li = document.createElement('li');
      const dot = document.createElement('span'); dot.className = 'dot';
      const name = document.createElement('span'); name.textContent = t.name;
      const state = document.createElement('span'); state.className = 'state'; state.textContent = '—';
      li.append(dot, name, state); suite.append(li);
      return { li, state };
    });
    const tried = new Set();
    let timer;
    const evaluate = () => {
      const s = input.value, empty = s.length === 0;
      let failed = 0;
      tests.forEach((t, i) => {
        const { li, state } = rows[i];
        li.classList.remove('pass', 'fail');
        if (empty) { state.textContent = '—'; return; }
        const ok = t.run(s);
        if (!ok) failed++;
        li.classList.add(ok ? 'pass' : 'fail');
        state.textContent = ok ? 'pass' : 'fail';
      });
      verdict.classList.remove('ok', 'bad');
      if (empty) verdict.textContent = 'Waiting for input';
      else if (!failed) { verdict.classList.add('ok'); verdict.textContent = `Accepted → ${national(s)}`; }
      else { verdict.classList.add('bad'); verdict.textContent = `Rejected · ${failed} of ${tests.length} failed`; }
      clearTimeout(timer);
      if (!empty) timer = setTimeout(() => { tried.add(s); triedEl.textContent = tried.size; }, 500);
      $$('.chip').forEach((c) => c.classList.toggle('is-on', c.dataset.case === s));
    };
    input.addEventListener('input', evaluate);
    $$('.chip').forEach((c) => c.addEventListener('click', () => { input.value = c.dataset.case; evaluate(); }));
    evaluate();
  })();
})();
