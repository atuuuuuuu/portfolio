// End-to-end check in headless Chrome: motion, content rules, layout and screenshots.
// Run (with the site served on :4321):  node test/browser.mjs [outdir]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const URL = process.env.SITE || 'http://127.0.0.1:4321/';
const OUT = process.argv[2] || mkdtempSync(join(tmpdir(), 'portfolio-'));
const PORT = 9333;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--no-first-run',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'chrome-'))}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) { pending.get(d.id)?.(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shot = async (name, full = false) => {
  if (full) {   // a full-page capture never scrolls: load lazy images and play every scroll reveal first
    await js('Promise.all([...document.images].map((i) => { i.loading = "eager"; return i.decode().catch(() => {}); })).then(() => true)');
    await js('document.querySelectorAll("[data-reveal]").forEach((e) => e.classList.add("is-in")), true');
    await sleep(900);
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
};
async function load(width, height, { dark = false, mobile = false, reduce = false } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
    { name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' },
  ] });
  await send('Page.navigate', { url: URL });
  for (let i = 0; i < 50; i++) { await sleep(100); if ((await js('document.readyState')) === 'complete') break; }
  await js('document.fonts.ready.then(() => true)');
  await sleep(reduce ? 300 : 1200);   // let the name's letters finish rising
}
// a rough fingerprint of what the flow canvas shows right now
const canvasPrint = () => js(`(() => {
  const c = document.querySelector('.flow'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set(); let sum = 0;
  for (let i = 0; i < d.length; i += 4 * 997) { seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); sum += d[i] + d[i + 1] + d[i + 2]; }
  return [seen.size, sum];
})()`);
const mouse = (type, x, y, modifiers = 0) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, modifiers });
const SHIFT = 8;

await send('Page.enable');
await send('Runtime.enable');
const errors = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });

try {
  // Desktop: hero, full page, dark mode
  await load(1440, 900);
  await shot('desktop-hero');
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'no horizontal scroll on desktop');
  const [colours, before] = await canvasPrint();
  assert.ok(colours > 3, 'the flow field draws strokes');
  await sleep(500);
  assert.notEqual((await canvasPrint())[1], before, 'the flow field is moving');
  assert.equal(await js('!!window.lenis'), true, 'smooth scrolling (Lenis) is running');
  assert.equal(await js('document.querySelector(".email").textContent.trim()'), 'idertsogusukhbayar@gmail.com', 'email is shown');
  assert.equal(await js('document.querySelector(".email").getAttribute("href")'), 'mailto:idertsogusukhbayar@gmail.com', 'email is a mailto link');
  assert.equal(await js('document.querySelectorAll(".socials a").length'), 2, 'GitHub and dev.to links');
  assert.equal(await js('document.documentElement.outerHTML.toLowerCase().includes("facebook")'), false, 'no Facebook anywhere (it is private)');
  assert.equal(await js('document.body.innerText.includes("The hard part")'), false, 'no "hard part" paragraphs');
  assert.equal(await js('!document.querySelector("[data-file], .wheel")'), true, 'no file chip or wheel in the hero');
  assert.equal(await js('document.querySelector(".hero-cta").getAttribute("href")'), 'mailto:idertsogusukhbayar@gmail.com', 'hero email button');
  assert.equal(await js('document.querySelector(".hero-ghost").getAttribute("href")'), '#work', 'hero "See my work" button');
  await shot('desktop-full', true);

  await load(1440, 900, { dark: true });
  await shot('desktop-dark-full', true);

  // Phone
  assert.equal(await js('document.querySelector(".logo").getAttribute("href")'), '#top', 'logo goes back to the top');
  assert.equal(await js('getComputedStyle(document.querySelector(".menu-toggle")).display'), 'none', 'no menu button on desktop');
  assert.equal(await js('document.querySelector(".copy").hidden'), false, 'copy button shown once JS runs');
  assert.equal(await js('document.querySelector("[data-year]").textContent'), String(new Date().getFullYear()), 'copyright year');
  assert.equal(await js('document.documentElement.outerHTML.includes("your-domain")'), false, 'no placeholder domain');

  await load(390, 844, { mobile: true });
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'no horizontal scroll on a phone');
  assert.equal(await js('getComputedStyle(document.querySelector(".site-nav")).visibility'), 'hidden', 'phone menu starts closed');
  await js('document.querySelector(".menu-toggle").click()');
  await sleep(400);
  assert.equal(await js('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'true', 'menu opens');
  assert.equal(await js('getComputedStyle(document.querySelector(".site-nav")).visibility'), 'visible', 'menu links visible');
  assert.equal(await js('document.querySelector("main").inert'), true, 'page behind the menu is inert');
  await shot('phone-menu');
  await js('document.querySelector(".site-nav a[href=\'#contact\']").click()');
  await sleep(400);
  assert.equal(await js('document.documentElement.classList.contains("menu-open")'), false, 'tapping a link closes the menu');
  assert.equal(await js('document.querySelector("main").inert'), false, 'page usable again');
  for (const w of [320, 360, 414]) {
    await load(w, 740, { mobile: true });
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, `no horizontal scroll at ${w}px`);
  }
  // Custom 404 page fits a small phone
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: URL + '404.html' });
  await sleep(1500);
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'no horizontal scroll on the 404 page');
  assert.equal(await js('document.querySelector(".btn.primary").href'), 'https://atuuuuuuu.github.io/portfolio/', '404 links home');
  await shot('404-phone');

  await load(390, 844, { mobile: true });
  await shot('phone-hero');
  await shot('phone-full', true);

  // Reduced motion: a still page, everything visible at once
  await load(1440, 900, { reduce: true });
  assert.equal(await js('[...document.querySelectorAll("[data-reveal]")].every((e) => getComputedStyle(e).opacity === "1")'), true, 'all content visible');
  assert.equal(await js('document.querySelectorAll(".name .ch").length'), 0, 'name not split into moving letters');
  assert.equal(await js('!!document.querySelector(".cursor-ring") || !!window.lenis'), false, 'no custom cursor, no smooth scrolling');
  const still = (await canvasPrint())[1];
  await sleep(400);
  assert.equal((await canvasPrint())[1], still, 'flow field is a still picture');
  await shot('reduced-motion-hero');

  // Link preview (og:image), 1200 x 630
  await load(1200, 630);
  await shot('og');

  assert.deepEqual(errors, [], 'no script errors');
  console.log(`browser: all checks passed. Screenshots in ${OUT}`);
} finally {
  ws.close();
  chrome.kill();
}
