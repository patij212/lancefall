// LANCEFALL — headless autoplay probe + a PRO autopilot you can watch.
//
// Paste this whole file into the devtools console on a running DEV build
// (`npm run dev`). Then:
//   __watch('endless')                 → watch the bot play LIVE (auto-restarts on death)
//   await __sweep()                    → full multi-mode survival report (headless, fast)
//   __runProbe(__MODES[0], 8, 20000)   → one mode, raw rows
//   clearInterval(__watchTimer)        → stop the live auto-restart loop
//
// HOW IT WORKS: the game's `Game.frame(now)` is the real per-display-frame loop.
// We override `input.poll` with an autopilot. For headless stats we also stub
// `requestAnimationFrame`/`renderer.render`/`ui.updateHud` and call `frame()`
// ourselves with synthetic timestamps, so the genuine sim runs as fast as JS
// allows. Nothing in the shipped game is modified — this is a console-only tool.
//
// THE AUTOPILOT (what makes it a pro, not a flailer):
//  • Dash i-frames are the dodge. A charged dash is invulnerable for its whole
//    travel + grace (~0.2–0.3s), and body/bullet/beam checks all skip while
//    iframe>0 — so the bot DASHES THROUGH danger and relocates to safety.
//  • Emergency dashes pick the safest LANDING from 18 sampled directions, scored
//    against where bullets will be after the i-frames lapse, walls, the arena
//    centre, enemy bodies, and active boss beams.
//  • Offensive dashes spear enemy clusters / the boss when a 1-charge reserve is
//    spare (grazing refunds stamina, so the reserve refills itself).
//  • Fine bullet-dodging steers PERPENDICULAR to incoming shots (tiny 9px hitbox).
//  • OVERDRIVE is a panic button: fired full + crowded/threatened.

(() => {
  const lf = window.__lf;
  if (!lf) { console.error('window.__lf not found — run a DEV build of LANCEFALL.'); return; }

  const bot = { prevHeld: false, committed: false, aimX: 0, aimY: 0, charge: 0, threatFns: null };
  window.__botState = bot;

  // Boss-beam predicates (loaded once; the bot degrades gracefully until ready).
  Promise.all([import('/src/boss.ts'), import('/src/sovereign.ts'), import('/src/tune.ts')])
    .then(([b, sv, t]) => {
      bot.threatFns = {
        beaconBeamActive: b.beaconBeamActive,
        sovereignBeamActive: sv.sovereignBeamActive,
        beamHitsPoint: sv.beamHitsPoint,
        sovereignBodyArmored: sv.sovereignBodyArmored,
        BEACON: t.BEACON, SOVEREIGN: t.SOVEREIGN,
      };
    })
    .catch(() => {});

  const DASH_COST = 100;

  const segDist = (px, py, ax, ay, bx, by) => {
    const abx = bx - ax, aby = by - ay, apx = px - ax, apy = py - ay;
    const L = abx * abx + aby * aby;
    let t = L > 1e-9 ? (apx * abx + apy * aby) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
  };
  // inverse of chargeToLen: len = lerp(180,560, easeOutQuad(c))
  const chargeForLen = (len) => {
    const y = Math.max(0, Math.min(1, (len - 180) / 380));
    return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - y)));
  };
  // Draft smart, not card #0. For a winnable boss gauntlet the build is half the
  // fight: more dash DAMAGE (kill bosses faster) + more STAMINA (dodge + joust more).
  const PERK_PRIORITY = ['secondwind', 'pierce', 'longreach', 'siphon', 'grazeburn', 'timethief', 'nova', 'chain', 'slipstream', 'afterimage', 'reflect', 'shardcache'];
  const pickPerk = () => {
    const cards = lf.draftCards || [];
    if (!cards.length) return 0;
    let bestIdx = 0, bestRank = 1e9;
    for (let i = 0; i < cards.length; i++) {
      const r = PERK_PRIORITY.indexOf(cards[i].id);
      const rank = r < 0 ? 999 : r;
      if (rank < bestRank) { bestRank = rank; bestIdx = i; }
    }
    return bestIdx;
  };

  const beamHits = (b, x, y, R) => {
    const tf = bot.threatFns; if (!tf || !b) return false;
    if (b.kind === 'beacon' && tf.beaconBeamActive(b)) {
      const dx = x - b.x, dy = y - b.y;
      if (Math.abs(dx * -Math.sin(b.angle) + dy * Math.cos(b.angle)) < tf.BEACON.beamWidth / 2 + R) return true;
    }
    if (b.kind === 'sovereign' && tf.sovereignBeamActive(b)) {
      if (tf.beamHitsPoint(b.x, b.y, b.angle, tf.SOVEREIGN.beamArms, tf.SOVEREIGN.beamWidth / 2 + R, x, y)) return true;
    }
    return false;
  };

  // Score sampled dash landing spots; return {aimX, aimY, charge} for the best.
  // Two modes:
  //  • escape (default): land OPEN — far from EVERY threat incl. the boss — clear of
  //    where bullets will be after the i-frames lapse, off the walls. Pure survival.
  //  • joust: a long dash that spears THROUGH the boss and lands in open space
  //    BEYOND it. Only used in safe windows; this is how bosses actually die.
  function bestDash(p, w, bullets, enemies, boss, R, lens, joust, bossHittable) {
    const DIRS = 20;
    let best = { aimX: p.x + 100, aimY: p.y, charge: 0 }, bestS = -1e18;
    for (let li = 0; li < lens.length; li++) {
      const len = lens[li];
      for (let k = 0; k < DIRS; k++) {
        const a = (k / DIRS) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
        let lx = Math.max(R + 6, Math.min(w.width - R - 6, p.x + ux * len));
        let ly = Math.max(R + 6, Math.min(w.height - R - 6, p.y + uy * len));
        let sc = 0;
        const m = 80;
        if (lx < m) sc -= (m - lx) * 1.6; if (lx > w.width - m) sc -= (lx - (w.width - m)) * 1.6;
        if (ly < m) sc -= (m - ly) * 1.6; if (ly > w.height - m) sc -= (ly - (w.height - m)) * 1.6;
        sc -= Math.hypot(lx - w.width / 2, ly - w.height / 2) * 0.03;
        for (let bi = 0; bi < bullets.length; bi++) {
          const b = bullets[bi];
          let d = Math.hypot(lx - (b.x + b.vx * 0.22), ly - (b.y + b.vy * 0.22)); if (d < 36) sc -= (36 - d) * 2.4;
          d = Math.hypot(lx - (b.x + b.vx * 0.42), ly - (b.y + b.vy * 0.42)); if (d < 36) sc -= (36 - d) * 1.5;
        }
        let kills = 0, nearestE = 1e9;
        for (let ei = 0; ei < enemies.length; ei++) {
          const e = enemies[ei]; if (!e.active) continue;
          const dl = Math.hypot(lx - e.x, ly - e.y);
          if (!e.isBoss) {
            if (e.kind !== 'sovereign_core' && dl < nearestE) nearestE = dl;
            if (segDist(e.x, e.y, p.x, p.y, lx, ly) < 24 + e.radius) kills++; // spear chaff / cores
          } else if (dl < e.radius + R + 16) {
            sc -= 60; // never LAND on the boss body
          }
        }
        if (!joust && boss) { const bd = Math.hypot(lx - boss.x, ly - boss.y); if (bd < nearestE) nearestE = bd; } // escape flees the boss too
        sc += Math.min(nearestE, 220) * 0.45; // OPENNESS
        sc += kills * 15;
        // SPEAR through the boss body — but ONLY when it can take damage (the
        // Sovereign's body is armored until its cores are shattered + it's cracked
        // open; while armored we let the core kill-bonus pull dashes onto the cores).
        if (joust && boss && bossHittable && segDist(boss.x, boss.y, p.x, p.y, lx, ly) < boss.radius + 26) sc += 55;
        if (boss && beamHits(boss, lx, ly, R)) sc -= 1000;
        if (sc > bestS) { bestS = sc; best = { aimX: p.x + ux * 1000, aimY: p.y + uy * 1000, charge: chargeForLen(len) }; }
      }
    }
    return best;
  }

  function decide() {
    const s = lf.input.state;
    s.pausePressed = false; s.overdrivePressed = false; s.anyPressed = false; s.selectIndex = -1;
    const st = lf.state;
    if (st === 'draft') { s.selectIndex = pickPerk(); s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = false; bot.prevHeld = false; bot.committed = false; return s; }
    if (st === 'event') { s.selectIndex = 0; s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = false; bot.prevHeld = false; bot.committed = false; return s; }
    if (st !== 'playing') { s.moveX = s.moveY = 0; s.dashHeld = false; s.dashReleased = false; bot.prevHeld = false; bot.committed = false; return s; }

    const w = lf.world, p = w.player, R = p.radius;
    if (p.phase === 'dashing') { s.moveX = 0; s.moveY = 0; s.dashHeld = false; s.dashReleased = false; bot.prevHeld = false; bot.committed = false; return s; }

    // ── bullets: perpendicular micro-dodge + hard-threat flag ──
    let mvx = 0, mvy = 0, hard = false, threatN = 0;
    const B = w.bullets.items, near = [];
    for (let i = 0; i < B.length; i++) {
      const b = B[i]; if (!b.active) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) > 360) continue;
      near.push(b);
      const vv = b.vx * b.vx + b.vy * b.vy;
      let ts = vv > 1e-3 ? -((b.x - p.x) * b.vx + (b.y - p.y) * b.vy) / vv : 0;
      if (ts < 0) ts = 0; if (ts > 0.7) continue;
      const cx = b.x + b.vx * ts, cy = b.y + b.vy * ts, minD = Math.hypot(cx - p.x, cy - p.y), hitR = R + b.radius;
      if (minD < hitR + 18) {
        const bl = Math.sqrt(vv) || 1; let nx = -b.vy / bl, ny = b.vx / bl;
        if ((p.x - cx) * nx + (p.y - cy) * ny < 0) { nx = -nx; ny = -ny; }
        const sev = (1 - Math.min(1, ts / 0.7)) * (1 - Math.min(1, minD / (hitR + 18)));
        mvx += nx * sev * 1.8; mvy += ny * sev * 1.8;
        if (minD < hitR + 8 && ts < 0.26) hard = true;
        if (minD < hitR + 12 && ts < 0.4) threatN++; // count converging shots → a wall you can't drift out of
      }
    }
    if (threatN >= 3) hard = true; // multiple shots closing → dash THROUGH on i-frames

    // ── enemies: body avoidance, crowd pressure, nearest target, boss ──
    const E = w.enemies.items; let nE = null, nED = 1e9, boss = null, bossDist = 1e9, crowd = 0, cgx = 0, cgy = 0, coresLeft = 0;
    for (let i = 0; i < E.length; i++) {
      const e = E[i]; if (!e.active) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (e.isBoss) { boss = e; bossDist = d; }
      if (e.kind === 'sovereign_core') coresLeft++;
      if (d < 130) { crowd++; cgx += dx; cgy += dy; }
      const al = d || 1;
      if (d < e.radius + R + 26) {
        mvx += (-dx / al) * 1.7; mvy += (-dy / al) * 1.7;
        const closing = (e.vx * dx + e.vy * dy) < 0; // enemy heading toward us
        if (d < e.radius + R + 6 || (closing && d < e.radius + R + 18)) hard = true;
      }
      if (!e.isBoss && d < nED) { nED = d; nE = e; }
    }
    if (crowd >= 3) hard = true; // surrounded → punch out now
    if (crowd > 0) { mvx -= (cgx / crowd) * 0.004; mvy -= (cgy / crowd) * 0.004; } // steer off the crowd centroid
    if (boss && beamHits(boss, p.x, p.y, R)) hard = true;
    // proactively slide OUT of the beacon's sweeping beam line (don't just react once caught)
    const tf0 = bot.threatFns;
    if (boss && boss.kind === 'beacon' && tf0 && tf0.beaconBeamActive(boss)) {
      const bdx = p.x - boss.x, bdy = p.y - boss.y;
      const sign = (bdx * -Math.sin(boss.angle) + bdy * Math.cos(boss.angle)) >= 0 ? 1 : -1;
      mvx += -Math.sin(boss.angle) * sign * 2.2; mvy += Math.cos(boss.angle) * sign * 2.2;
    }

    // ── dash decision (survive first: an escape dash also spears & thins the crowd) ──
    const canDash = p.stamina >= DASH_COST - 1;
    let wantDash = false, aimX = 0, aimY = 0, charge = 0;
    // The Sovereign's body only takes damage when EXPOSED, or — to crack it open —
    // once every orbiting core is shattered. Every other boss is always hittable.
    const bossHittable = !boss ? false
      : boss.kind !== 'sovereign' ? true
      : ((tf0 && !tf0.sovereignBodyArmored(boss)) || coresLeft === 0);
    // Escape/min dashes fire instantly (no i-frames while charging); only the JOUST
    // takes a real charge, and only in a clear window where that's safe.
    if (canDash && hard) {
      const bd = bestDash(p, w, near, E, boss, R, [190], false, bossHittable); // escape NOW — flee to the openest spot
      aimX = bd.aimX; aimY = bd.aimY; charge = 0; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = 0;
    } else if (bot.committed && p.phase === 'charging' && threatN < 2) {
      // keep charging the joust — but if a wall starts to form, drop out (this frame
      // releases the dash early: a shorter spear now beats eating shots while slow)
      aimX = bot.aimX; aimY = bot.aimY; charge = bot.charge; wantDash = true;
    } else if (canDash && boss && p.stamina >= DASH_COST * 2.9 && threatN === 0 && !hard && bossDist < 360) {
      // JOUST — only in a genuinely clear window (no shots closing, ≥1 charge held
      // back): a LONG dash that spears through the boss and lands in open space
      // beyond it. A real charge, but a hard threat appearing mid-charge aborts to
      // an escape (the hard branch above overrides the commit).
      const bd = bestDash(p, w, near, E, boss, R, [300, 400], true, bossHittable);
      aimX = bd.aimX; aimY = bd.aimY; charge = bd.charge; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = bd.charge;
    } else if (canDash && p.stamina >= DASH_COST * 2.9 && crowd === 0 && threatN === 0 && nE && nED < 420) {
      const bd = bestDash(p, w, near, E, boss, R, [190], false, bossHittable); // calm only: thin the field
      aimX = bd.aimX; aimY = bd.aimY; charge = 0; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = 0;
    } else {
      bot.committed = false;
    }

    // ── overdrive panic: clear a crush, or save us when we can't dash ──
    if (w.overdrive.meter >= 1 && w.overdrive.cooldown <= 0 && (crowd >= 4 || (hard && !canDash))) s.overdrivePressed = true;

    // ── movement: centre pull + opportunistic pickups when truly calm ──
    mvx += (w.width / 2 - p.x) / w.width * 0.35; mvy += (w.height / 2 - p.y) / w.height * 0.35;
    if (!hard && crowd === 0 && Math.hypot(mvx, mvy) < 0.45) {
      let tgt = null, td = 1e9;
      const PU = w.powerups && w.powerups.items;
      if (PU) for (let i = 0; i < PU.length; i++) { const g = PU[i]; if (!g.active) continue; const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < td) { td = d; tgt = g; } }
      if (!tgt) { const G = w.gems.items; for (let i = 0; i < G.length; i++) { const g = G[i]; if (!g.active) continue; const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < td) { td = d; tgt = g; } } }
      if (tgt) { mvx += (tgt.x - p.x) / Math.max(1, td) * 0.6; mvy += (tgt.y - p.y) / Math.max(1, td) * 0.6; }
    }
    // engage: hold a medium range — close enough to joust, not hugging the fire
    if (boss && bossDist > 280 && !hard) { mvx += (boss.x - p.x) / bossDist * 0.5; mvy += (boss.y - p.y) / bossDist * 0.5; }
    let ml = Math.hypot(mvx, mvy); if (ml > 1) { mvx /= ml; mvy /= ml; }
    s.moveX = mvx; s.moveY = mvy;

    // ── charge/release state machine ──
    let held = false;
    if (wantDash) {
      s.aimX = aimX; s.aimY = aimY;
      held = p.phase === 'charging' ? p.charge < charge : true;
      if (p.phase === 'charging' && !held) bot.committed = false; // releasing this frame → fire
    } else {
      s.aimX = nE ? nE.x : boss ? boss.x : p.x + Math.cos(p.angle) * 100;
      s.aimY = nE ? nE.y : boss ? boss.y : p.y + Math.sin(p.angle) * 100;
    }
    s.dashHeld = held; s.dashReleased = bot.prevHeld && !held; bot.prevHeld = held;
    return s;
  }

  lf.input.poll = decide;

  if (!lf.__origFGO) lf.__origFGO = lf.finishGameOver.bind(lf);
  lf.finishGameOver = function (won) { window.__lastWon = !!won; return lf.__origFGO(won); };

  // ── headless probe (stats) ──
  window.__runProbe = function (mode, runs, capSteps) {
    const origRAF = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    const oR = lf.renderer.render.bind(lf.renderer), oH = lf.ui.updateHud.bind(lf.ui);
    lf.renderer.render = () => {}; lf.ui.updateHud = () => {};
    const rows = [];
    for (let r = 0; r < runs; r++) {
      bot.prevHeld = false; bot.committed = false; window.__lastWon = false;
      lf.start(mode);
      let t = performance.now(); lf.lastTime = t; lf.accumulator = 0; let steps = 0;
      while (lf.state !== 'gameover' && steps < capSteps) { t += 16.667; lf.frame(t); steps++; }
      const w = lf.world;
      rows.push({ time: +w.time.toFixed(1), score: w.score, kills: w.killCount, combo: w.bestComboRun, won: window.__lastWon, bossKills: w.bossKills ?? 0 });
    }
    window.requestAnimationFrame = origRAF; lf.renderer.render = oR; lf.ui.updateHud = oH;
    return rows;
  };

  // ── live watch (rendered, real time, auto-restart on death) ──
  window.__watch = async function (modeId, loop) {
    const { MODES } = await import('/src/modes.ts');
    window.__MODES = MODES;
    const mode = MODES.find((m) => m.id === (modeId || 'endless')) || MODES[0];
    bot.mode = mode;
    lf.start(mode);
    if (window.__watchTimer) clearInterval(window.__watchTimer);
    if (loop !== false) window.__watchTimer = setInterval(() => { if (lf.state === 'gameover') lf.start(mode); }, 1500);
    console.log(`▶ watching the PRO bot play ${mode.id}. clearInterval(__watchTimer) to stop the auto-restart.`);
    return 'watching ' + mode.id;
  };

  window.__sweep = async function () {
    const { MODES } = await import('/src/modes.ts');
    window.__MODES = MODES;
    const out = {};
    for (const m of MODES) {
      const rows = window.__runProbe(m, m.seedKind === 'date' ? 3 : 10, m.id === 'arena' || m.id === 'bossrush' ? 40000 : 30000);
      const times = rows.map((x) => x.time).sort((a, b) => a - b);
      out[m.id] = {
        mode: m.id,
        medianSec: times[Math.floor(times.length / 2)],
        maxSec: times[times.length - 1],
        medBosses: rows.map((x) => x.bossKills).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
        maxBosses: Math.max(...rows.map((x) => x.bossKills)),
        winRate: +(rows.filter((x) => x.won).length / rows.length).toFixed(2),
      };
    }
    console.table(Object.values(out));
    return out;
  };

  console.log('LANCEFALL PRO bot installed.  ▶ watch: __watch("endless")   📊 stats: await __sweep()');
})();
