(() => {
  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------- Theme ---------- */
  const themeBtn = $('.theme-toggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : prefersDark.matches;
  themeBtn?.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  /* ---------- Kathmandu clock ---------- */
  const clock = $('#clock');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
    const tick = () => { clock.textContent = fmt.format(new Date()); };
    tick();
    setInterval(tick, 15000);
  }
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Header border on scroll ---------- */
  const header = $('.site-header');
  const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Reveal on scroll ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries
        .filter((e) => e.isIntersecting)
        .forEach((e, i) => {
          e.target.style.transitionDelay = `${Math.min(i * 70, 280)}ms`;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Active nav link ---------- */
  const navLinks = $$('[data-nav]');
  const sections = navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const navIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${e.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => navIO.observe(s));
  }

  /* ---------- Copy email ---------- */
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {}
      btn.textContent = ok ? 'Copied' : 'Press ⌘C';
      if (!ok) {
        const range = document.createRange();
        range.selectNodeContents($('.mail'));
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      }
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    });
  });

  /* ---------- Playground: break-this-form test suite ---------- */
  const input = $('#phone');
  const suite = $('#suite');
  const verdict = $('#verdict');
  const triedEl = $('#tried');
  if (!input || !suite) return;

  // Normalise: trim, then drop spaces and dashes used as separators.
  const compact = (s) => s.trim().replace(/[\s-]/g, '');
  const national = (s) => compact(s).replace(/^\+977/, '');

  const tests = [
    { name: 'is not empty',                 run: (s) => s.trim().length > 0 },
    { name: 'uses only 0–9, spaces, - or +', run: (s) => /^[0-9\s+-]+$/.test(s.trim()) },
    { name: '“+” only as +977 prefix',       run: (s) => { const c = compact(s); return !c.includes('+') || (/^\+977/.test(c) && c.lastIndexOf('+') === 0); } },
    { name: 'has exactly 10 digits',         run: (s) => /^[0-9]{10}$/.test(national(s)) },
    { name: 'starts with 96, 97 or 98',      run: (s) => /^9[678]/.test(national(s)) },
    { name: 'contains no markup',            run: (s) => !/[<>]/.test(s) },
  ];

  const rows = tests.map((t) => {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot';
    const name = document.createElement('span'); name.textContent = t.name;
    const state = document.createElement('span'); state.className = 'state'; state.textContent = '—';
    li.append(dot, name, state);
    suite.append(li);
    return { li, state };
  });

  const tried = new Set();
  let countTimer;

  const evaluate = () => {
    const s = input.value;
    const empty = s.length === 0;
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
    if (empty) {
      verdict.textContent = 'Waiting for input';
    } else if (failed === 0) {
      verdict.classList.add('ok');
      verdict.textContent = `Accepted → ${national(s)}`;
    } else {
      verdict.classList.add('bad');
      verdict.textContent = `Rejected · ${failed} of ${tests.length} failed`;
    }

    // Count distinct inputs once the user pauses.
    clearTimeout(countTimer);
    if (!empty) {
      countTimer = setTimeout(() => { tried.add(s); triedEl.textContent = tried.size; }, 500);
    }

    $$('.chip').forEach((c) => c.classList.toggle('is-on', c.dataset.case === s));
  };

  input.addEventListener('input', evaluate);
  $$('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.case;
      evaluate();
    });
  });
  evaluate();
})();
