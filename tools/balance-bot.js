// LANCEFALL — headless autoplay balance probe.
//
// Paste this whole file into the devtools console on the running dev build
// (`npm run dev`), then call `await __sweep()` for a full multi-mode report, or
// `__runProbe(__MODES[0], 12, 7200)` for a single mode.
//
// HOW IT WORKS: the game's `Game.frame(now)` is the real per-display-frame loop.
// We stub `requestAnimationFrame`, `renderer.render`, and `ui.updateHud`, then call
// `frame()` ourselves with synthetic, monotonically increasing timestamps — so the
// genuine sim (director, spawns, drafts, bosses, clutch, overdrive) runs as fast as
// JS allows. A bot overrides `input.poll` to fly the ship. Nothing in the shipped
// game is modified; this is a console-only dev tool.
//
// IMPORTANT per-run resets: align `lastTime` to the synthetic clock and clear the
// substep `accumulator`, or the first frame of run N computes a huge negative
// realDt (only the >0.1 upper clamp exists) and the sim can't step.

(() => {
  const lf = window.__lf;
  if (!lf) { console.error('window.__lf not found — run a DEV build of LANCEFALL.'); return; }

  const bot = { prevHeld: false };
  window.__botState = bot;

  // ---- the bot: dodge bullets, avoid contact, grab gems when safe, dash enemies ----
  lf.input.poll = function () {
    const s = lf.input.state;
    s.pausePressed = false; s.overdrivePressed = false; s.anyPressed = false; s.selectIndex = -1;
    const st = lf.state;
    if (st === 'draft' || st === 'event') { s.selectIndex = 0; s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = false; return s; }
    if (st !== 'playing') { s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = false; return s; }
    const w = lf.world, p = w.player;
    let dx = 0, dy = 0;
    const B = w.bullets.items;
    for (let i = 0; i < B.length; i++) { const b = B[i]; if (!b.active) continue;
      const rx = p.x - b.x, ry = p.y - b.y; const d = Math.hypot(rx, ry) || 1;
      if (d < 150) { const toward = b.vx * (-rx) + b.vy * (-ry); const w8 = (150 - d) / 150;
        const m = toward > 0 ? 1.7 : 0.5; dx += (rx / d) * w8 * w8 * m; dy += (ry / d) * w8 * w8 * m; } }
    const E = w.enemies.items; let ne = null, ned = 1e9;
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (!e.active) continue;
      const rx = p.x - e.x, ry = p.y - e.y; const d = Math.hypot(rx, ry) || 1;
      if (d < e.radius + 46) { const w8 = (e.radius + 46 - d) / (e.radius + 46); dx += (rx / d) * w8 * 1.3; dy += (ry / d) * w8 * 1.3; }
      if (!e.isBoss && d < ned) { ned = d; ne = e; } else if (e.isBoss && !ne) { ne = e; ned = d; } }
    const mg = 70;
    if (p.x < mg) dx += (mg - p.x) / mg; if (p.x > w.width - mg) dx -= (p.x - (w.width - mg)) / mg;
    if (p.y < mg) dy += (mg - p.y) / mg; if (p.y > w.height - mg) dy -= (p.y - (w.height - mg)) / mg;
    if (Math.hypot(dx, dy) < 0.4) { const G = w.gems.items; let ng = null, nd = 1e9;
      for (let i = 0; i < G.length; i++) { const g = G[i]; if (!g.active) continue; const d = Math.hypot(p.x - g.x, p.y - g.y); if (d < nd) { nd = d; ng = g; } }
      if (ng) { dx += (ng.x - p.x) / Math.max(1, nd) * 0.5; dy += (ng.y - p.y) / Math.max(1, nd) * 0.5; } }
    let ml = Math.hypot(dx, dy); if (ml > 1) { dx /= ml; dy /= ml; }
    let aimX = p.x + Math.cos(p.angle) * 100, aimY = p.y + Math.sin(p.angle) * 100;
    if (ne) { aimX = ne.x; aimY = ne.y; }
    let held = false;
    const canDash = p.stamina >= 100 && p.phase !== 'dashing';
    if (canDash && ne && ned < 560) { const desired = Math.max(0.12, Math.min(1, (ned - 150) / (560 - 150))); held = p.charge < desired; }
    s.moveX = dx; s.moveY = dy; s.aimX = aimX; s.aimY = aimY;
    s.dashHeld = held; s.dashReleased = bot.prevHeld && !held; bot.prevHeld = held;
    s.overdrivePressed = w.overdrive.meter >= 1 && w.overdrive.cooldown <= 0;
    return s;
  };

  if (!lf.__origFGO) lf.__origFGO = lf.finishGameOver.bind(lf);
  lf.finishGameOver = function (won) { window.__lastWon = !!won; return lf.__origFGO(won); };

  window.__runProbe = function (mode, runs, capSteps) {
    const origRAF = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    const oR = lf.renderer.render.bind(lf.renderer), oH = lf.ui.updateHud.bind(lf.ui);
    lf.renderer.render = () => {}; lf.ui.updateHud = () => {};
    const rows = [];
    for (let r = 0; r < runs; r++) {
      bot.prevHeld = false; window.__lastWon = false;
      lf.start(mode);
      let t = performance.now(); lf.lastTime = t; lf.accumulator = 0; let steps = 0;
      while (lf.state !== 'gameover' && steps < capSteps) { t += 16.667; lf.frame(t); steps++; }
      const w = lf.world;
      rows.push({ time: +w.time.toFixed(1), score: w.score, kills: w.killCount, combo: w.bestComboRun, won: window.__lastWon, bossKills: w.bossKills ?? 0 });
    }
    window.requestAnimationFrame = origRAF; lf.renderer.render = oR; lf.ui.updateHud = oH;
    const times = rows.map((x) => x.time).sort((a, b) => a - b);
    const scores = rows.map((x) => x.score).sort((a, b) => a - b);
    const med = (a) => a[Math.floor(a.length / 2)];
    const mean = (a) => +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(1);
    return {
      mode: mode.id, runs,
      survTime: { min: times[0], median: med(times), mean: mean(times), max: times[times.length - 1] },
      score: { median: med(scores), mean: mean(scores), max: scores[scores.length - 1] },
      winRate: +(rows.filter((x) => x.won).length / runs).toFixed(2),
      bossKillsMean: +(rows.reduce((s, x) => s + x.bossKills, 0) / runs).toFixed(2),
    };
  };

  window.__sweep = async function () {
    const { MODES } = await import('/src/modes.ts');
    window.__MODES = MODES;
    const out = {};
    for (const m of MODES) out[m.id] = window.__runProbe(m, m.seedKind === 'date' ? 3 : 12, m.id === 'arena' || m.id === 'bossrush' ? 9000 : 7200);
    console.table(Object.values(out).map((r) => ({ mode: r.mode, median: r.survTime.median, max: r.survTime.max, medScore: r.score.median, winRate: r.winRate })));
    return out;
  };

  console.log('LANCEFALL balance bot installed. Run: await __sweep()  —  or  __runProbe(__MODES[0], 12, 7200)');
})();
