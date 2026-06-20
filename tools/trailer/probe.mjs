// Runtime probe: boot the dev build, seed the save, start a run, and dump the field/method
// names the trailer harness needs (mode ids + cipherLock, Game methods, player/world shape).
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:5197/';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__lf, null, { timeout: 30000 });
await page.waitForTimeout(800);

const info = await page.evaluate(async () => {
  const g = window.__lf;
  const out = {};
  // modes
  const { MODES } = await import('/src/modes.ts');
  out.modes = MODES.map((m) => ({ id: m.id, cipherLock: !!m.cipherLock, arena: !!m.arena, bossrush: !!m.bossrush, seedKind: m.seedKind }));
  // Game methods of interest
  out.gameMethods = ['start', 'spawnWarden', 'pause', 'resume', 'toTitle', 'finishGameOver', 'narrate'].filter((k) => typeof g[k] === 'function');
  // seed a rich save then start an endless run for shape inspection
  try {
    const mod = await import('/src/ships.ts');
    const SHIPS = mod.SHIPS || mod.default;
    if (SHIPS) g.save.unlockedShips = Object.keys(SHIPS);
  } catch {}
  Object.assign(g.save, { seenSandbox: true, seenTutorial: true, shards: 5000, selectedHeat: 0, maxHeat: 7, highScore: 184260, bestWave: 15 });
  const endless = MODES.find((m) => m.id === 'endless') || MODES[0];
  g.start(endless);
  // run a few frames
  let t = performance.now();
  for (let i = 0; i < 120; i++) { t += 16.7; g.frame(t); }
  const w = g.world;
  const p = w.player;
  out.state = g.state;
  out.worldKeys = Object.keys(w).filter((k) => /cipher|coher|combo|time|score|won|sovereign/i.test(k));
  out.playerKeys = Object.keys(p);
  out.playerNumeric = {};
  for (const k of Object.keys(p)) { if (typeof p[k] === 'number') out.playerNumeric[k] = p[k]; }
  out.coherenceLike = Object.keys(w).filter((k) => /coher|light|grey|gray|neon|wash/i.test(k)).map((k) => [k, typeof w[k]]);
  // does the cipher mode arm a ring when we force a weaver?
  try {
    const proto = MODES.find((m) => m.cipherLock);
    if (proto) {
      g.start(proto);
      let t2 = performance.now();
      for (let i = 0; i < 30; i++) { t2 += 16.7; g.frame(t2); }
      g.spawnWarden && g.spawnWarden('weaver');
      for (let i = 0; i < 30; i++) { t2 += 16.7; g.frame(t2); }
      const c = w.cipher;
      out.cipher = c ? { order: c.order, glyphs: c.glyphs, progress: c.progress, cls: c.cls, solved: c.solved } : null;
      const cores = w.enemies.items.filter((e) => e.active && e.kind === 'sovereign_core').map((e) => ({ phase: e.phase, x: Math.round(e.x), y: Math.round(e.y) }));
      out.cores = cores;
      out.bossKinds = w.enemies.items.filter((e) => e.active && e.isBoss).map((e) => e.kind);
    }
  } catch (e) { out.cipherErr = e.message; }
  return out;
});
console.log(JSON.stringify(info, null, 2));
await b.close();
