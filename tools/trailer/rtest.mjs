// De-risk: can we drive lf.frame(t) manually (rAF stubbed) and screenshot each rendered frame?
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = 'http://localhost:5197/';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });
await page.evaluate(async () => {
  const g = window.__lf;
  Object.assign(g.save, { seenSandbox: true, seenTutorial: true, seenIntro: true, selectedHeat: 0, ngPlusLevel: 0 });
  const { MODES } = await import('/src/modes.ts');
  g.start(MODES.find((m) => m.id === 'longestday'));
  await import('/tools/balance-bot.js?v=' + Date.now());
  await new Promise((r) => setTimeout(r, 800));
  g.spawnWarden('weaver');
  // freeze the real-time loop; we drive frame() ourselves
  g.__t = performance.now(); g.lastTime = g.__t; g.accumulator = 0;
  window.requestAnimationFrame = () => 0;
});
fs.mkdirSync('tools/trailer/rtest', { recursive: true });
const t0 = Date.now();
const N = 120;
for (let i = 0; i < N; i++) {
  await page.evaluate((dt) => {
    const g = window.__lf, w = g.world, p = w.player;
    if (p) { p.iframe = Math.max(p.iframe || 0, 30); p.alive = true; }
    for (const e of w.enemies.items) if (e.active && e.isBoss) { e.x = 640; e.y = 300; e.vx = 0; e.vy = 0; }
    g.__t += 1000 / 60;
    g.frame(g.__t);
  }, 1000 / 60);
  if (i % 30 === 0 || i === N - 1) await page.screenshot({ path: `tools/trailer/rtest/f_${String(i).padStart(4, '0')}.png` });
}
const dt = Date.now() - t0;
console.log(`${N} frames driven in ${dt}ms (${(dt / N).toFixed(1)}ms/frame incl. 5 screenshots)`);
// progress check: are the sampled frames distinct (sim advanced)?
const sizes = fs.readdirSync('tools/trailer/rtest').filter((f) => f.endsWith('.png')).map((f) => fs.statSync('tools/trailer/rtest/' + f).size);
console.log('frame png sizes:', sizes.join(', '));
await b.close();
