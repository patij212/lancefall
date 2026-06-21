// Debug the FLOW spawner: does w.spawnEnemy flood the field + does the combo climb?
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:5197/';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 120)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });

const out = await page.evaluate(async () => {
  const g = window.__lf;
  Object.assign(g.save, { seenSandbox: true, seenTutorial: true, seenIntro: true, selectedHeat: 0, ngPlusLevel: 0 });
  const { MODES } = await import('/src/modes.ts');
  g.start(MODES.find((m) => m.id === 'arena'));
  await import('/tools/balance-bot.js?v=' + Date.now());
  await new Promise((r) => setTimeout(r, 600));
  // pin time + stub render, fast-forward 15s with god
  const oR = g.renderer.render.bind(g.renderer), oH = g.ui.updateHud.bind(g.ui);
  g.renderer.render = () => {}; g.ui.updateHud = () => {};
  const s = g.scheduler; if (s) { s.requestHitstop = () => {}; s.requestSlowmo = () => {}; s.update = (dt) => dt; }
  g.finishGameOver = () => {};
  g.__t = performance.now(); g.lastTime = g.__t; g.accumulator = 0; window.requestAnimationFrame = () => 0;
  for (let i = 0; i < 900; i++) { const p = g.world.player; if (p) { p.iframe = 60; p.alive = true; } g.dying = false; g.winning = false; g.__t += 1000 / 60; g.frame(g.__t); }
  const w = g.world;
  const log = [];
  const countActive = () => { let n = 0; for (const e of w.enemies.items) if (e.active && !e.isBoss) n++; return n; };
  log.push(`after warmup: active=${countActive()} combo=${w.combo} score=${w.score} state=${g.state} poolItems=${w.enemies.items.length}`);
  // now run the spawner + comboHold for 180 frames, sampling
  // AGGRO pilot: continuously dash THROUGH the nearest enemy (overshoot to spear clusters).
  const cf = (len) => { const y = Math.max(0, Math.min(1, (len - 180) / 380)); return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - y))); };
  let prevHeld = false;
  g.input.poll = function () {
    const s = g.input.state; s.pausePressed = s.overdrivePressed = s.parryPressed = false; s.selectIndex = -1; s.dashTapped = false;
    const p = g.world.player;
    if (g.state !== 'playing' || !p || p.phase === 'dashing') { s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = prevHeld; prevHeld = false; return s; }
    let best = null, bd = 1e9; for (const e of g.world.enemies.items) { if (!e.active || e.isBoss) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
    if (!best) { s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = prevHeld; prevHeld = false; return s; }
    s.aimX = best.x; s.aimY = best.y; s.moveX = 0; s.moveY = 0;
    const held = p.phase === 'charging' ? p.charge < cf(Math.min(560, bd + 130)) * 0.9 : true;
    s.dashHeld = held; s.dashReleased = prevHeld && !held; prevHeld = held; return s;
  };
  const kinds = ['wisp', 'darter', 'wisp', 'darter', 'wisp', 'brooder'];
  for (let i = 0; i < 300; i++) {
    const p = w.player; if (p) { p.iframe = 60; p.alive = true; p.stamina = 300; } g.dying = false; g.winning = false;
    if (w.combo > 0) w.comboTimer = 10;
    if (w.overdrive) w.overdrive.meter = 0;
    if (w.bullets) for (const b of w.bullets.items) if (b.active) b.active = false; // no bullets → pure offense
    let n = 0; for (const e of w.enemies.items) { if (!e.active || e.isBoss) continue; if (!e.__flow) e.active = false; else n++; } // keep only the flow swarm
    while (n < 12) { const a = Math.random() * Math.PI * 2; const en = w.spawnEnemy(kinds[Math.floor(Math.random() * kinds.length)], w.width / 2 + Math.cos(a) * 380, w.height / 2 + Math.sin(a) * 250, 1, 1, false, false); if (en) { en.__flow = true; n++; } else break; }
    g.__t += 1000 / 60; g.frame(g.__t);
    if (i % 30 === 0) log.push(`f${i}: active=${n} combo=${w.combo} mult=x${(1 + w.combo * 0.1).toFixed(1)} score=${w.score} best=${w.bestComboRun}`);
  }
  g.renderer.render = oR; g.ui.updateHud = oH;
  return log;
});
console.log(out.join('\n'));
await b.close();
