// Headless diagnostic: does the cipher pilot actually SOLVE the Weaver lock?
// Drives g.frame() manually and logs cipher.progress/solved + core keying over time.
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:5197/';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const g = window.__lf;
  Object.assign(g.save, { seenSandbox: true, seenTutorial: true, seenIntro: true });
  const { MODES } = await import('/src/modes.ts');
  const m = MODES.find((x) => x.id === 'longestday');
  g.start(m);
  // pump a few frames so the run settles, then arm the cipher boss
  let t = performance.now();
  for (let i = 0; i < 30; i++) { t += 16.7; g.frame(t); }
  g.spawnWarden('weaver');
  for (let i = 0; i < 5; i++) { t += 16.7; g.frame(t); }
  const w = g.world;

  // install the same cipher pilot logic as capture.mjs
  const stt = { prevHeld: false, didWrong: false };
  const chargeForLen = (len) => { const y = Math.max(0, Math.min(1, (len - 180) / 380)); return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - y))); };
  g.input.poll = function () {
    const s = g.input.state;
    s.pausePressed = false; s.overdrivePressed = false; s.parryPressed = false; s.selectIndex = -1; s.dashTapped = false;
    const neutral = () => { s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = stt.prevHeld; stt.prevHeld = false; return s; };
    if (g.state !== 'playing') return neutral();
    const c = w.cipher, p = w.player;
    if (!c || c.solved) return neutral();
    if (p.phase === 'dashing') return neutral();
    const cores = w.enemies.items.filter((e) => e.active && e.kind === 'sovereign_core');
    if (!cores.length) return neutral();
    if (c.wrongFlash > 0) stt.didWrong = true;
    let slot;
    if (!stt.didWrong && c.progress === 0 && c.order.length > 1) slot = c.order[1];
    else slot = c.order[c.progress];
    const target = cores.find((e) => e.phase === slot) || cores[0];
    const dx = target.x - p.x, dy = target.y - p.y, dist = Math.hypot(dx, dy);
    s.aimX = target.x; s.aimY = target.y;
    const charge = chargeForLen(Math.min(560, dist + 90));
    let held = p.phase === 'charging' ? p.charge < charge * 0.98 : true;
    s.moveX = 0; s.moveY = 0; s.dashHeld = held; s.dashReleased = stt.prevHeld && !held; stt.prevHeld = held;
    return s;
  };
  // keep safe + boss pinned
  const pin = { x: Math.round(w.width / 2), y: Math.round(w.height * 0.42) };
  const log = [];
  let lastProg = -1;
  for (let i = 0; i < 1200; i++) { // ~20s @60
    const p = w.player; p.iframe = Math.max(p.iframe || 0, 30); p.alive = true;
    for (const e of w.enemies.items) if (e.active && e.isBoss) { e.x = pin.x; e.y = pin.y; e.vx = 0; e.vy = 0; }
    t += 16.7; g.frame(t);
    const c = w.cipher;
    if (!c) { log.push(`f${i} cipher=null (solved/cleared)`); break; }
    if (c.progress !== lastProg) { log.push(`f${i} progress=${c.progress}/${c.order.length} solved=${c.solved} wrongFlash=${(c.wrongFlash||0).toFixed(2)}`); lastProg = c.progress; }
    if (c.solved) { log.push(`f${i} SOLVED`); break; }
  }
  return { order: (w.cipher && w.cipher.order) || 'cleared', log, finalCipher: w.cipher ? { progress: w.cipher.progress, solved: w.cipher.solved } : 'null(cleared)' };
});
console.log(JSON.stringify(result, null, 2));
await b.close();
