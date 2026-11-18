// End-to-end check of the 3D world page (world/) in headless Chrome: walking, plazas, windows, tour, layout.
// Run (with the site served on :4321):  node test/browser.mjs [outdir]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const URL = process.env.SITE || 'http://127.0.0.1:4321/';
const WORLD = URL + 'world/';
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
  if (full) await js('Promise.all([...document.images].map((i) => { i.loading = "eager"; return i.decode().catch(() => {}); })).then(() => true)');
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
};
async function load(width, height, { mobile = false, reduce = false, tour = false } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
  await send('Page.navigate', { url: WORLD + (tour ? '' : '?notour') });
  for (let i = 0; i < 50; i++) { await sleep(100); if ((await js('document.readyState')) === 'complete') break; }
  await js('document.fonts.ready.then(() => true)');
  for (let i = 0; i < 150 && !(await js('document.documentElement.classList.contains("world") || !document.documentElement.classList.contains("live")')); i++) await sleep(100);   // three.js loaded
  await sleep(reduce ? 500 : 1500);   // let the world draw a few frames
}
const mouse = (type, x, y) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(900); };
const clickShape = async (key) => { const p = await js(`scene.project('${key}')`); await click(p.x, p.y); };
// a rough fingerprint of the frame on screen
const framePrint = async () => (await send('Page.captureScreenshot', { format: 'png' })).data.length;

await send('Page.enable');
await send('Runtime.enable');
const errors = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });

try {
  // Desktop: the 3D world
  await load(1440, 900);
  await sleep(1500);   // three.js, the icons and the first frames
  assert.equal(await js('document.documentElement.classList.contains("world")'), true, '3D world is running');
  assert.equal(await js('document.querySelectorAll(".label").length'), 7, 'labels for 4 islands and 3 app icons');
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'no horizontal scroll on desktop');
  await shot('desktop-world');
  const before = await framePrint();
  await sleep(600);
  assert.notEqual(await framePrint(), before, 'the world is moving');

  // Pop a bubble
  let b = null;
  for (let i = 0; i < 50 && !b; i++) { b = await js('scene.bubble()'); if (!b) await sleep(100); }   // wait for one in a clickable spot
  await click(b.x, b.y);
  assert.ok(await js('scene.popped') >= 1, 'clicking a bubble pops it');
  assert.equal(await js('document.querySelector(".bubbles .count").textContent'), String(await js('scene.popped')), 'bubble counter');

  // Walk: hold W for a second
  const p0 = await js('scene.player');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW' });
  await sleep(1000);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW' });
  const p1 = await js('scene.player');
  assert.ok(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 3, 'W walks Aero forward');
  await shot('desktop-walked');

  // Drag orbits and opens nothing; clicking an island or an app icon opens its section
  await mouse('mouseMoved', 900, 700); await mouse('mousePressed', 900, 700);
  for (let x = 900; x > 760; x -= 20) await mouse('mouseMoved', x, 700);
  await mouse('mouseReleased', 760, 700);
  assert.equal(await js('scene.selected'), null, 'a drag does not open anything');
  await load(1440, 900); await sleep(1500);
  await clickShape('experience');
  assert.equal(await js('location.hash'), '#experience', 'clicking the Experience island opens it');
  await js('document.querySelector(".close").click()');
  await sleep(300);
  assert.equal(await js('scene.selected'), null, 'Close closes it');
  await load(1440, 900); await sleep(1500);
  await clickShape('scrollr');
  assert.equal(await js('location.hash'), '#scrollr', 'clicking the Scrollr icon opens it');
  assert.equal(await js('document.querySelector("#panel h2").textContent'), 'Projects', 'it opens the Projects panel');
  assert.ok(await js('document.querySelector("#panel .panel-body").scrollTop') > 100, 'scrolled down to Scrollr');
  assert.equal(await js('document.querySelectorAll("[id=scrollr]").length'), 1, 'no duplicate ids in the panel');
  await sleep(1500);
  await shot('desktop-projects');
  await js('document.querySelector(".close").click()');
  await sleep(300);
  assert.equal(await js('document.getElementById("panel").hidden && location.hash === ""'), true, 'Close button closes the panel');
  await sleep(1200);
  await clickShape('logo');
  assert.equal(await js('scene.selected'), null, 'the spinning logo is a toy, not a link');

  // Minimise and maximise
  await js('location.hash = "about"'); await sleep(800);
  await js('document.querySelector("[data-max]").click()'); await sleep(500);
  assert.ok(await js('document.getElementById("panel").getBoundingClientRect().width') > 1300, 'maximise fills the screen');
  assert.equal(await js('document.querySelector("[data-max]").getAttribute("aria-label")'), 'Restore down', 'maximise button turns into restore');
  await shot('desktop-max');
  await js('document.querySelector("[data-max]").click()'); await sleep(500);
  assert.ok(await js('document.getElementById("panel").getBoundingClientRect().width') < 600, 'restore down puts it back');
  await js('document.querySelector("[data-min]").click()'); await sleep(300);
  assert.equal(await js('getComputedStyle(document.getElementById("panel")).display'), 'none', 'minimise hides the window');
  assert.equal(await js('document.querySelector(".restore span").textContent'), 'About me', 'a taskbar button with its name appears');
  await shot('desktop-min');
  await js('document.querySelector(".restore").click()'); await sleep(300);
  assert.equal(await js('getComputedStyle(document.getElementById("panel")).display !== "none" && document.querySelector(".restore").hidden'), true, 'clicking it brings the window back');
  await js('document.querySelector(".close").click()'); await sleep(300);

  // Links between the two sites
  assert.equal(await js('document.querySelector(".brand").getAttribute("href")'), '../', 'the orb goes back to the main site');
  assert.equal(await js('document.querySelector(".brand-back").textContent'), 'Back to main site', 'the way back is labelled');
  assert.equal(await js('document.querySelector(".email-me").getAttribute("href")'), 'mailto:idertsogusukhbayar@gmail.com', 'Email me is always in the top bar');
  assert.equal(await js('[...document.querySelectorAll(".label.small")].every((l) => l.style.opacity === "0")'), true, 'app names hidden far from the Projects plaza');

  // Top bar link to Contact
  await js('document.querySelector(".tabs a[href=\'#contact\']").click()');
  await sleep(1800);
  assert.equal(await js('document.querySelector(".tabs a[aria-current]").hash'), '#contact', 'Contact tab is highlighted');
  assert.equal(await js('document.querySelector("#panel .email").getAttribute("href")'), 'mailto:idertsogusukhbayar@gmail.com', 'contact panel has the mailto link');
  assert.equal(await js('document.querySelector("#panel .copy").hidden'), false, 'copy button shown in the panel');
  assert.equal(await js('document.querySelectorAll("#panel .socials a").length'), 2, 'GitHub and dev.to links');
  await shot('desktop-contact');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
  await sleep(300);
  assert.equal(await js('document.getElementById("panel").hidden'), true, 'Escape closes the panel');

  // Content rules
  assert.equal(await js('document.documentElement.outerHTML.toLowerCase().includes("facebook")'), false, 'no Facebook anywhere (it is private)');
  assert.equal(await js('document.body.innerText.includes("The hard part")'), false, 'no "hard part" paragraphs');
  assert.equal(await js('document.documentElement.outerHTML.includes("your-domain")'), false, 'no placeholder domain');
  assert.equal(await js('document.querySelector("[data-year]").textContent'), String(new Date().getFullYear()), 'copyright year');

  // How to play: shows on the first visit, five steps, then stays away
  await load(1440, 900, { tour: true });
  assert.equal(await js('document.querySelector(".tour").hidden'), false, 'tour shows on the first visit');
  await shot('desktop-tour');
  for (let i = 0; i < 5; i++) await js('document.querySelector("[data-next]").click()');
  assert.equal(await js('document.querySelector(".tour").hidden'), true, 'tour ends after five steps');
  await load(1440, 900, { tour: true });
  assert.equal(await js('document.querySelector(".tour").hidden'), true, 'and does not come back');
  await js('document.querySelector("[data-tour]").click()');
  assert.equal(await js('document.querySelector(".tour").hidden'), false, 'the ? button shows it again');
  await js('document.querySelector("[data-skip]").click()');

  // Text version
  await send('Page.navigate', { url: WORLD + '?text' });
  await sleep(1200);
  assert.equal(await js('document.documentElement.classList.contains("live")'), false, '?text gives the text version');
  assert.equal(await js('document.querySelectorAll("main section").length'), 4, 'all four sections in the text version');
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'no horizontal scroll in the text version');
  await shot('desktop-text', true);

  // Phone: scene, bottom sheet, no sideways scroll
  for (const w of [320, 360, 390, 414]) {
    await load(w, 780, { mobile: true });
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, `no horizontal scroll at ${w}px`);
  }
  await sleep(1500);
  await shot('phone-world');
  const onScreen = await js(`['about', 'projects', 'experience', 'contact'].every((k) => { const q = scene.project(k); return q && q.x > 0 && q.x < innerWidth && q.y > 60 && q.y < innerHeight; })`);
  assert.equal(onScreen, true, 'phone overview shows all four plazas');
  await js('location.hash = "unpacked"');
  await sleep(1500);
  await shot('phone-unpacked');
  assert.equal(await js('getComputedStyle(document.getElementById("panel")).bottom'), '8px', 'panel is a bottom sheet on a phone');

  // Custom 404 page fits a small phone
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: URL + '404.html' });
  await sleep(1500);
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'no horizontal scroll on the 404 page');
  assert.equal(await js('document.querySelector(".btn.primary").href'), 'https://atuuuuuuu.github.io/portfolio/', '404 links home');

  // Reduced motion: a still scene
  await load(1440, 900, { reduce: true });
  await sleep(1500);
  const still = await framePrint();
  await sleep(500);
  assert.equal(await framePrint(), still, 'the world is a still picture');
  await shot('reduced-motion');

  assert.deepEqual(errors, [], 'no script errors');
  console.log(`browser: all checks passed. Screenshots in ${OUT}`);
} finally {
  ws.close();
  chrome.kill();
}
