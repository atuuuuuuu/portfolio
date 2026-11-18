// Motion for the page: the flow field behind the name, smooth scrolling,
// scroll reveals, the ticker, magnetic buttons and the copy-email button.
// Everything here is decoration: with reduced motion (or no JS) the page is complete and still.

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp = (a, b, t) => a + (b - a) * t;
let smooth = null;   // the Lenis instance, once smooth scrolling has loaded

/** Direction of the flow at (x, y) at time t: a few slow, overlapping waves, so it looks like wind. */
export function flowAngle(x, y, t) {
  return (Math.sin(x * 0.0021 + t * 0.25) + Math.cos(y * 0.0027 - t * 0.2) + Math.sin((x - y) * 0.0012 + t * 0.15)) * 1.6;
}

// ---------- Flow field behind the name ----------
function flowField(canvas) {
  const ctx = canvas.getContext('2d');
  const hero = canvas.parentElement;
  const css = getComputedStyle(document.documentElement);
  const field = css.getPropertyValue('--field').trim() || '#1638C9';
  let w = 0, h = 0, parts = [], t = 0, visible = true;
  const mouse = { x: -1e4, y: -1e4 };

  const spawn = (p = {}) => Object.assign(p, {
    x: Math.random() * w, y: Math.random() * h,
    life: 80 + Math.random() * 220,
    pink: Math.random() < 0.06,
  });
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = field; ctx.fillRect(0, 0, w, h);
    const n = Math.round(Math.min(1400, (w * h) / 850));
    parts = Array.from({ length: n }, () => spawn());
  }
  function step() {
    ctx.fillStyle = 'rgba(22, 56, 201, 0.075)';   // fade old strokes into trails
    ctx.fillRect(0, 0, w, h);
    const R = 160;
    const paper = new Path2D(), pink = new Path2D();
    for (const p of parts) {
      const a = flowAngle(p.x, p.y, t);
      let vx = Math.cos(a) * 1.3, vy = Math.sin(a) * 1.3;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < R && d > 0.1) {                      // swirl around the cursor and push outwards a little
        const f = 1 - d / R;
        vx += (-dy / d) * f * 4 + (dx / d) * f * 1.6;
        vy += (dx / d) * f * 4 + (dy / d) * f * 1.6;
      }
      const path = p.pink ? pink : paper;
      path.moveTo(p.x, p.y);
      p.x += vx; p.y += vy;
      path.lineTo(p.x, p.y);
      if (--p.life < 0 || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) spawn(p);
    }
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = 'rgba(243, 245, 250, 0.38)'; ctx.stroke(paper);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255, 79, 139, 0.85)'; ctx.stroke(pink);
    t += 0.004;
  }
  function loop() {
    if (visible && !document.hidden) step();
    requestAnimationFrame(loop);
  }

  resize();
  addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(hero);

  if (reduce) {                                    // a still picture of the flow, no animation
    for (let i = 0; i < 160; i++) step();
    return;
  }
  requestAnimationFrame(loop);
}

// ---------- Letters of the name rise in ----------
function splitName(el) {
  el.setAttribute('aria-label', el.textContent.trim());
  let i = 0;
  const lines = el.innerHTML.split(/<br\s*\/?>/i).map((line) => line.trim());
  el.innerHTML = lines.map((line) =>
    `<span class="line" aria-hidden="true">${[...line].map((c) => `<span class="ch" style="--i:${i++}">${c}</span>`).join('')}</span>`
  ).join('');
}

// ---------- Scroll reveals ----------
function reveals() {
  const items = document.querySelectorAll('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -4% 0px' });
  // siblings that appear together arrive one after another
  items.forEach((el) => {
    if (!el.style.getPropertyValue('--d')) {
      const siblings = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
      el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 6) * 0.04}s`);
    }
    io.observe(el);
  });
}

// ---------- Smooth scrolling, scroll progress and a ticker that speeds up as you scroll ----------
async function scrolling() {
  const bar = Object.assign(document.createElement('div'), { className: 'progress' });
  document.body.append(bar);
  const track = document.querySelector('.ticker-track');
  let ticker = null, boost = 0;

  const onScroll = (velocity = 0) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    boost = Math.max(boost, Math.min(Math.abs(velocity) / 6, 5));
  };
  (function settle() {   // the ticker eases back to its resting speed
    boost = lerp(boost, 0, 0.06);
    ticker ||= track?.getAnimations?.()[0];
    if (ticker) ticker.playbackRate = 1 + boost;
    requestAnimationFrame(settle);
  })();

  if (reduce) { addEventListener('scroll', () => onScroll(), { passive: true }); onScroll(); return; }
  try {
    const { default: Lenis } = await import('./vendor/lenis.mjs');
    smooth = new Lenis({ lerp: 0.32, wheelMultiplier: 1.15, anchors: { duration: 0.6 }, autoRaf: true });   // snappy: follows the wheel closely (0.16 felt slow)
    smooth.on('scroll', (l) => onScroll(l.velocity));
  } catch {
    let last = scrollY;     // no Lenis: native scrolling, same effects
    addEventListener('scroll', () => { onScroll(scrollY - last); last = scrollY; }, { passive: true });
  }
  onScroll();
}

// ---------- Buttons that lean towards the cursor ----------
function magnetic() {
  for (const el of document.querySelectorAll('[data-magnetic]')) {
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * 0.28;
      const y = (e.clientY - (r.top + r.height / 2)) * 0.38;
      el.style.translate = `${x}px ${y}px`;
    });
    el.addEventListener('pointerleave', () => { el.style.translate = ''; });
  }
}

// ---------- Phone menu ----------
function menu() {
  const html = document.documentElement;
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  const label = toggle.querySelector('.menu-label');
  const phone = matchMedia('(max-width: 760px)');
  // everything except the top bar, so Tab and screen readers stay inside the open menu
  const behind = [...document.body.children].filter((el) => el.tagName !== 'HEADER' && el.tagName !== 'SCRIPT')
    .concat([...document.querySelector('.hero').children].filter((el) => !el.classList.contains('topbar')));
  const set = (open) => {
    html.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', open);
    label.textContent = open ? 'Close' : 'Menu';
    for (const el of behind) el.inert = open;
    if (smooth) open ? smooth.stop() : smooth.start();
  };
  toggle.addEventListener('click', () => set(!html.classList.contains('menu-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && html.classList.contains('menu-open')) { set(false); toggle.focus(); }
  });
  phone.addEventListener('change', () => set(false));
}

// ---------- Copy email ----------
function copyEmail() {
  const button = document.querySelector('[data-copy]');
  const status = document.querySelector('.copy-status');
  if (!button) return;
  button.hidden = false;   // hidden in the HTML so it never shows as a dead button without JS
  const fallback = (text) => {   // older browsers and plain http: the old copy command
    const area = Object.assign(document.createElement('textarea'), { value: text });
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy failed');
  };
  button.addEventListener('click', async () => {
    const text = button.dataset.copy;
    clearTimeout(copyEmail.t);
    try {
      try { await navigator.clipboard.writeText(text); } catch { fallback(text); }
      status.dataset.state = 'ok';
      status.textContent = 'Email copied.';
      copyEmail.t = setTimeout(() => { status.textContent = ''; delete status.dataset.state; }, 4000);
    } catch {
      // stays up: the reader needs time to copy it by hand
      status.dataset.state = 'error';
      status.textContent = `Couldn't copy. Select the address above, or write to ${text}.`;
    }
  });
}

if (typeof document !== 'undefined') {
  document.documentElement.classList.add('fx');   // tells the fallback in index.html that the reveals are handled
  const name = document.querySelector('[data-split]');
  if (name && !reduce) splitName(name);
  const canvas = document.querySelector('.flow');
  if (canvas) flowField(canvas);
  reveals();
  magnetic();
  menu();
  copyEmail();
  for (const el of document.querySelectorAll('[data-year]')) el.textContent = new Date().getFullYear();
  scrolling();
}
