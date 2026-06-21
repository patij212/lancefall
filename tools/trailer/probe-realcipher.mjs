// Does the REAL bot (bot-core.mjs) solve the cipher while dodging, with NO god? Logs solve time,
// survival, and min armor — so I know it works + where to set the trailer in-point.
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:5197/';
const boss = process.argv[3] || 'weaver';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 100)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });
const out = await page.evaluate(async (boss) => {
  const g = window.__lf;
  Object.assign(g.save, { seenSandbox: true, seenTutorial: true, seenIntro: true, selectedHeat: 0, ngPlusLevel: 0 });
  const { MODES } = await import('/src/modes.ts');
  g.start(MODES.find((m) => m.id === 'longestday'));
  await import('/tools/balance-bot.js?v=' + Date.now()); // the REAL capable bot
  await new Promise((r) => setTimeout(r, 700));
  let t = performance.now(); g.lastTime = t; g.accumulator = 0;
  for (let i = 0; i < 30; i++) { t += 16.7; g.frame(t); }
  g.spawnWarden(boss);
  const w = g.world, p = w.player;
  let minShields = p.maxShields ?? 2, solvedAt = -1, diedAt = -1, brokeSeen = false;
  for (let i = 0; i < 1500; i++) { // 25s
    t += 16.7; g.frame(t);
    if (p.shields != null) minShields = Math.min(minShields, p.shields);
    if (w.cipher && w.cipher.solved && !brokeSeen) brokeSeen = true;
    if (w.cipher == null && solvedAt < 0 && i > 30) solvedAt = i; // cipher cleared (solved → shattered)
    if ((g.state === 'gameover' || !p.alive) && diedAt < 0) { diedAt = i; break; }
  }
  return { boss, solvedSec: solvedAt < 0 ? null : +(solvedAt / 60).toFixed(1), diedSec: diedAt < 0 ? null : +(diedAt / 60).toFixed(1), minShields, alive: p.alive, score: w.score };
}, boss);
console.log(JSON.stringify(out));
await b.close();
