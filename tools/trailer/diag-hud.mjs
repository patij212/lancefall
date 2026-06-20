// Inspect the READ THE KEY legend DOM during a live cipher fight.
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:5197/';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });
await page.evaluate(async () => {
  const g = window.__lf;
  Object.assign(g.save, { seenSandbox: true, seenTutorial: true, seenIntro: true });
  const { MODES } = await import('/src/modes.ts');
  g.start(MODES.find((m) => m.id === 'longestday'));
});
await page.waitForTimeout(700);
await page.evaluate(() => window.__lf.spawnWarden('weaver'));
await page.waitForTimeout(2500); // let the entrance pass; cipher should be active
const info = await page.evaluate(() => {
  const w = window.__lf.world;
  const el = document.querySelector('.hud-cipher');
  const r = el && el.getBoundingClientRect();
  const cs = el && getComputedStyle(el);
  return {
    cipherActive: !!(w.cipher && !w.cipher.solved),
    cipherProgress: w.cipher ? w.cipher.progress : null,
    found: !!el,
    classList: el ? [...el.classList] : null,
    text: el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : null,
    display: cs ? cs.display : null,
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    parentClass: el && el.parentElement ? el.parentElement.className : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: 'tools/trailer/frames/diag-hud-full.png' });
await b.close();
