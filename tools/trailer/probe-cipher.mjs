// Can the cipher-pilot solve the Weaver WITHOUT god-mode (real bullets, real damage)?
// Logs progress, shields, alive, and whether it solves before dying — for pin + no-pin.
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:5199/';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

async function trial(pin) {
  const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });
  const out = await page.evaluate(async (pin) => {
    const g = window.__lf;
    Object.assign(g.save, { seenSandbox: true, seenTutorial: true, seenIntro: true, selectedHeat: 0, ngPlusLevel: 0 });
    const { MODES } = await import('/src/modes.ts');
    g.start(MODES.find((m) => m.id === 'longestday'));
    let t = performance.now(); g.lastTime = t; g.accumulator = 0;
    for (let i = 0; i < 30; i++) { t += 16.7; g.frame(t); }
    g.spawnWarden('weaver');
    // PACED cipher pilot (same as render.mjs, no god)
    const st = { prevHeld: false, didWrong: false, wrongHeld: false, cd: 24, lastProgress: 0 };
    const cf = (len) => { const y = Math.max(0, Math.min(1, (len - 180) / 380)); return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - y))); };
    g.input.poll = function () {
      const s = g.input.state; s.pausePressed = s.overdrivePressed = s.parryPressed = false; s.selectIndex = -1; s.dashTapped = false;
      const idle = () => { s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = st.prevHeld; st.prevHeld = false; return s; };
      if (g.state !== 'playing') return idle();
      const w = g.world, p = w.player, c = w.cipher;
      if (!c || c.solved) return idle();
      if (c.wrongFlash > 0.5 && !st.wrongHeld) { st.didWrong = true; st.wrongHeld = true; st.cd = Math.max(st.cd, 52); }
      if (c.wrongFlash <= 0.5) st.wrongHeld = false;
      if (c.progress !== st.lastProgress) { st.lastProgress = c.progress; st.cd = Math.max(st.cd, 46); }
      if (p.phase === 'dashing') return idle();
      const cores = w.enemies.items.filter((e) => e.active && e.kind === 'sovereign_core');
      if (!cores.length) return idle();
      const slot = (!st.didWrong && c.progress === 0 && c.order.length > 1) ? c.order[1] : c.order[c.progress];
      const target = cores.find((e) => e.phase === slot) || cores[0];
      s.aimX = target.x; s.aimY = target.y;
      if (st.cd > 0) { st.cd--; s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = st.prevHeld; st.prevHeld = false; return s; }
      const dist = Math.hypot(target.x - p.x, target.y - p.y);
      const held = p.phase === 'charging' ? p.charge < cf(Math.min(560, dist + 90)) * 0.98 : true;
      s.moveX = 0; s.moveY = 0; s.dashHeld = held; s.dashReleased = st.prevHeld && !held; st.prevHeld = held; return s;
    };
    const w = g.world, p = w.player;
    let minShields = p.maxShields ?? 2, solvedAt = -1, diedAt = -1;
    for (let i = 0; i < 1200; i++) { // 20s
      if (pin) for (const e of w.enemies.items) if (e.active && e.isBoss) { e.x = 640; e.y = 300; e.vx = 0; e.vy = 0; }
      t += 16.7; g.frame(t);
      if (p.shields != null) minShields = Math.min(minShields, p.shields);
      if (w.cipher == null && solvedAt < 0) solvedAt = i;
      if ((g.state === 'gameover' || !p.alive) && diedAt < 0) { diedAt = i; break; }
    }
    return { pin, solvedAt, diedAt, minShields, finalShields: p.shields, alive: p.alive, score: w.score };
  }, pin);
  await page.context().close();
  return out;
}

console.log('PIN:   ', JSON.stringify(await trial(true)));
console.log('NO-PIN:', JSON.stringify(await trial(false)));
await b.close();
