// LANCEFALL — headless autoplay probe + a PRO autopilot you can watch.
//
// Paste this whole file into the devtools console on a running DEV build
// (`npm run dev`). Then:
//   __watch('endless')                 → watch the bot play LIVE (auto-restarts on death)
//   await __sweep()                    → full multi-mode survival report (headless, fast)
//   await __heatSweep('arena',[0,3,7]) → win/sovereign-rate per HEAT level for one mode
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
//  • Emergency dashes pick the safest LANDING from sampled directions, scored
//    against where bullets will be after the i-frames lapse, walls, the arena
//    centre, enemy bodies, and active boss beams.
//  • Offensive dashes spear enemy clusters / the boss when a 1-charge reserve is
//    spare (grazing refunds stamina, so the reserve refills itself).
//  • PARRY — the SECOND verb (taught 2026-06-19). The bot now:
//      – RIPOSTE-finishes lone chaff. parryEnemySweep hits any enemy in the arc
//        REGARDLESS of its shield, so a 2-dmg riposte one-shots the shielded
//        darter/orbiter stragglers the head-on spear clangs off — the #1 cause
//        of the wave-clear STALL (a wave never empties → arena/casual freeze).
//      – STAGGERS the Mirrorblade mid-lunge (cancels the lethal lunge + chips it).
//      – REFLECTS boss orbs (parry-as-offense) back at the boss.
//      – DEFLECTS a converging bullet wall when out of dashes (refunds stamina).
//  • Fine bullet-dodging steers PERPENDICULAR to incoming shots (tiny 9px hitbox).
//  • OVERDRIVE is a panic button: fired full + crowded/threatened.

(() => {
  const lf = window.__lf;
  if (!lf) { console.error('window.__lf not found — run a DEV build of LANCEFALL.'); return; }

  const bot = { prevHeld: false, committed: false, aimX: 0, aimY: 0, charge: 0, threatFns: null, stuckFrames: 0, lastChaff: 0 };
  window.__botState = bot;

  // Boss-beam + parry predicates (loaded once; the bot degrades gracefully until ready).
  Promise.all([import('/src/boss.ts'), import('/src/sovereign.ts'), import('/src/tune.ts')])
    .then(([b, sv, t]) => {
      bot.threatFns = {
        beaconBeamActive: b.beaconBeamActive,
        beaconEnraged: b.beaconEnraged, // <50% HP → a 2-arm CROSS beam (arms=2)
        sovereignBeamActive: sv.sovereignBeamActive,
        beamHitsPoint: sv.beamHitsPoint,
        sovereignBodyArmored: sv.sovereignBodyArmored,
        mirrorbladeStaggerable: b.mirrorbladeStaggerable, // PARRY: stagger the lunge
        BEACON: t.BEACON, SOVEREIGN: t.SOVEREIGN, PARRY: t.PARRY,
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
  const angWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // inverse of chargeToLen: len = lerp(180,560, easeOutQuad(c))
  const chargeForLen = (len) => {
    const y = Math.max(0, Math.min(1, (len - 180) / 380));
    return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - y)));
  };
  // Draft smart, not card #0 — and draft for the MODE. The boss gauntlet (Boss Rush) is
  // about damage + stamina to out-DPS and out-dodge tanky bosses. The chaff modes (Arena,
  // Endless, …) are about CLEAR SPEED: a wave only advances once it's empty, so AoE (Nova
  // shockwave-on-dash, Chain detonations) thins a crowd far faster than poking one spear at
  // a time — which is exactly what lets the bot push past the wave-11 clearing wall.
  const BOSS_PRIORITY = ['secondwind', 'pierce', 'afterimage', 'longreach', 'siphon', 'grazeburn', 'timethief', 'nova', 'chain', 'slipstream', 'reflect', 'shardcache'];
  const CHAFF_PRIORITY = ['nova', 'chain', 'pierce', 'secondwind', 'longreach', 'siphon', 'grazeburn', 'reflect', 'timethief', 'afterimage', 'slipstream', 'shardcache'];
  const pickPerk = () => {
    const cards = lf.draftCards || [];
    if (!cards.length) return 0;
    const pri = lf.mode && lf.mode.bossrush ? BOSS_PRIORITY : CHAFF_PRIORITY;
    let bestIdx = 0, bestRank = 1e9;
    for (let i = 0; i < cards.length; i++) {
      const r = pri.indexOf(cards[i].id);
      const rank = r < 0 ? 999 : r;
      if (rank < bestRank) { bestRank = rank; bestIdx = i; }
    }
    return bestIdx;
  };

  const beamHits = (b, x, y, R) => {
    const tf = bot.threatFns; if (!tf || !b) return false;
    if (b.kind === 'beacon' && tf.beaconBeamActive(b)) {
      // enraged Beacon (<50% HP) fires a 2-arm CROSS — model it with the engine's own
      // beamHitsPoint so the bot dodges BOTH arms, not just the primary diameter.
      const arms = tf.beaconEnraged && tf.beaconEnraged(b) ? 2 : 1;
      if (tf.beamHitsPoint(b.x, b.y, b.angle, arms, tf.BEACON.beamWidth / 2 + R, x, y)) return true;
    }
    if (b.kind === 'sovereign' && tf.sovereignBeamActive(b)) {
      if (tf.beamHitsPoint(b.x, b.y, b.angle, tf.SOVEREIGN.beamArms, tf.SOVEREIGN.beamWidth / 2 + R, x, y)) return true;
    }
    return false;
  };

  // Score sampled dash landing spots; return {aimX, aimY, charge} for the best.
  // mode 0 ESCAPE: land OPEN — far from EVERY threat incl. the boss — clear of where
  //   bullets will be after the i-frames lapse, off the walls. Pure survival.
  // mode 1 JOUST: a long dash that spears THROUGH the boss and lands in open space
  //   BEYOND it. Only in safe windows; this is how bosses die.
  // mode 2 HUNT: spear the nearest CHAFF (Arena waves only advance once cleared, and
  //   escape-scoring flees enemies → a wave you can't drift-dodge forever stalls).
  function bestDash(p, w, bullets, enemies, boss, R, lens, mode, bossHittable) {
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
        const segLen2 = (lx - p.x) * (lx - p.x) + (ly - p.y) * (ly - p.y) || 1;
        for (let ei = 0; ei < enemies.length; ei++) {
          const e = enemies[ei]; if (!e.active) continue;
          const dl = Math.hypot(lx - e.x, ly - e.y);
          if (!e.isBoss) {
            if (mode === 0 && e.kind !== 'sovereign_core' && dl < nearestE) nearestE = dl; // only ESCAPE flees chaff
            if (segDist(e.x, e.y, p.x, p.y, lx, ly) < 24 + e.radius) {
              // ARMORED chaff (shielded darter/orbiter) clangs a head-on spear: the shield tracks
              // you, so you only land by SKEWERING THROUGH to the far side. Approximate that: count
              // the kill only when the enemy sits in the dash's INTERIOR (t<0.85) so we pass it and
              // land beyond — a poke that stops short (t≈1) would just bounce off the armor.
              if (e.shielded) {
                const t = ((e.x - p.x) * (lx - p.x) + (e.y - p.y) * (ly - p.y)) / segLen2;
                if (t < 0.85) kills++; // a true through-skewer flanks it
              } else kills++; // spear chaff / cores
            }
          } else if (dl < e.radius + R + 16) {
            sc -= 60; // never LAND on the boss body
          }
        }
        if (mode === 0 && boss) { const bd = Math.hypot(lx - boss.x, ly - boss.y); if (bd < nearestE) nearestE = bd; } // escape flees the boss too
        sc += Math.min(nearestE, 220) * 0.45; // OPENNESS (escape only; a flat constant otherwise)
        sc += kills * (mode === 2 ? 42 : 15); // HUNT hard-prioritises spearing chaff to clear the wave
        // SPEAR through the boss body — but ONLY when it can take damage (the
        // Sovereign's body is armored until its cores are shattered + it's cracked open).
        if (mode === 1 && boss && bossHittable && segDist(boss.x, boss.y, p.x, p.y, lx, ly) < boss.radius + 26) sc += 55;
        if (boss && beamHits(boss, lx, ly, R)) sc -= 1000;
        if (sc > bestS) { bestS = sc; best = { aimX: p.x + ux * 1000, aimY: p.y + uy * 1000, charge: chargeForLen(len) }; }
      }
    }
    return best;
  }

  function decide() {
    const s = lf.input.state;
    s.pausePressed = false; s.overdrivePressed = false; s.anyPressed = false; s.selectIndex = -1; s.parryPressed = false;
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
        mvx += nx * sev * 2.1; mvy += ny * sev * 2.1; // lean on movement first — it's free; dashes cost stamina
        if (minD < hitR + 8 && ts < 0.26) hard = true;
        if (minD < hitR + 12 && ts < 0.4) threatN++; // count converging shots → a wall you can't drift out of
      }
    }
    // Stamina is the boss-fight bottleneck: dash-spamming patterns strands you. A
    // DENSE wall (a full ring) you must dash through; MODERATE pressure you drift
    // out of for free — only burn a dash on it when there's stamina to spare.
    if (threatN >= 5 || (threatN >= 3 && p.stamina >= DASH_COST * 2)) hard = true;

    // ── enemies: body avoidance, crowd pressure, nearest target, boss ──
    const E = w.enemies.items; let nE = null, nED = 1e9, nEscore = 1e9, boss = null, bossDist = 1e9, crowd = 0, cgx = 0, cgy = 0, coresLeft = 0, chaffCount = 0;
    // TARGET PRIORITY — telemetry: the orbiter (bullets + parked mines + body-checks) and the
    // herald/seeker (gap-walls / homing bolts) are the top KILLERS, so hunt them ahead of a
    // nearer-but-harmless drifter. A kind weight <1 shrinks effective distance → preferred.
    const threatWeight = (k) => (k === 'orbiter' || k === 'herald' ? 0.5 : k === 'seeker' || k === 'bomber' ? 0.6 : k === 'lancer' || k === 'shade' ? 0.8 : 1);
    for (let i = 0; i < E.length; i++) {
      const e = E[i]; if (!e.active) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (e.isBoss) { boss = e; bossDist = d; }
      if (e.kind === 'sovereign_core') coresLeft++;
      if (!e.isBoss && e.kind !== 'sovereign_core') chaffCount++;
      if (d < 130) { crowd++; cgx += dx; cgy += dy; }
      const al = d || 1;
      if (d < e.radius + R + 26) {
        mvx += (-dx / al) * 1.7; mvy += (-dy / al) * 1.7;
        const closing = (e.vx * dx + e.vy * dy) < 0; // enemy heading toward us
        if (d < e.radius + R + 6 || (closing && d < e.radius + R + 18)) hard = true;
      }
      if (!e.isBoss && e.kind !== 'sovereign_core') { const sc = d * threatWeight(e.kind); if (sc < nEscore) { nEscore = sc; nED = d; nE = e; } }
    }
    // STUCK detector — a wave only advances once it's EMPTY. If the chaff count won't fall
    // (distant zoners — bloomer/herald/seeker the escape-scoring keeps fleeing), the run
    // STALLS at the cap. Track frames where the count hasn't dropped; once "stuck", spend a
    // ready OVERDRIVE (360px obliterate) and force an aggressive HUNT to break the deadlock.
    if (!boss && chaffCount > 0 && chaffCount >= bot.lastChaff) bot.stuckFrames++; else bot.stuckFrames = 0;
    bot.lastChaff = chaffCount;
    const stuck = !boss && bot.stuckFrames > 150; // ~2.5s without thinning the wave
    if (crowd >= 3) hard = true; // surrounded → punch out now
    if (crowd > 0) { mvx -= (cgx / crowd) * 0.004; mvy -= (cgy / crowd) * 0.004; } // steer off the crowd centroid
    if (boss && beamHits(boss, p.x, p.y, R)) hard = true;
    // BEAMS — the #1 boss killer. They telegraph (subPhase 0) before going lethal
    // (subPhase 1), and the line(s) ROTATE the whole time. So dodge the path DURING
    // the telegraph: predict where each beam will be at fire-time (angle + spin·remaining)
    // and slide perpendicular into a safe wedge before it's lethal.
    const tf0 = bot.threatFns;
    if (boss && tf0 && boss.phase === 0 && (boss.subPhase === 0 || boss.subPhase === 1)) {
      const bdx = p.x - boss.x, bdy = p.y - boss.y;
      const lead = boss.subPhase === 0 ? boss.fireTimer : 0; // telegraph → look ahead to fire-time
      if (boss.kind === 'beacon') {
        // dodge EVERY arm of the (possibly enraged 2-arm cross) beam — arm k at +k·π/arms
        const arms = tf0.beaconEnraged && tf0.beaconEnraged(boss) ? 2 : 1;
        for (let k = 0; k < arms; k++) {
          const a = boss.angle + tf0.BEACON.sweepSpin * lead + (k * Math.PI) / arms;
          const perp = bdx * -Math.sin(a) + bdy * Math.cos(a);
          if (Math.abs(perp) < tf0.BEACON.beamWidth / 2 + R + 65) {
            const s = perp >= 0 ? 1 : -1;
            mvx += -Math.sin(a) * s * 2.8; mvy += Math.cos(a) * s * 2.8;
            if (boss.subPhase === 1) hard = true; // already live and we're in it → dash out NOW
          }
        }
      } else if (boss.kind === 'sovereign') {
        const arms = tf0.SOVEREIGN.beamArms, half = tf0.SOVEREIGN.beamWidth / 2 + R + 60;
        for (let k = 0; k < arms; k++) {
          const a = boss.angle + tf0.SOVEREIGN.beamSpin * lead + (k * Math.PI) / arms;
          const perp = bdx * -Math.sin(a) + bdy * Math.cos(a);
          if (Math.abs(perp) < half) {
            const s = perp >= 0 ? 1 : -1;
            mvx += -Math.sin(a) * s * 2.0; mvy += Math.cos(a) * s * 2.0;
            if (boss.subPhase === 1) hard = true;
          }
        }
        const bd = Math.hypot(bdx, bdy) || 1;
        if (bd < 210) { mvx += (bdx / bd) * 1.4; mvy += (bdy / bd) * 1.4; } // leave the convergent centre where every arm is close
      }
    }

    // ── PARRY decision (the SECOND verb) — pick at most one parry target this frame, by
    //    priority. Parry casts toward the ship's FACING (p.angle, which lerps to aim), so we
    //    aim at the target and fire only once roughly aligned. Parry locks out the dash for
    //    ~0.34s, so a NON-urgent parry yields to a dash-escape when a lethal shot is closing. ──
    const PARRY = tf0 && tf0.PARRY;
    const PREACH = 70;     // base wedge reach (px) — conservative; coherence widens it in-engine
    const PHALF = 0.62;    // base half-angle (rad ~71°)
    const canParry = !!PARRY && p.parryCooldown <= 0 && p.parryTime <= 0 && p.phase !== 'charging';
    let pTgt = null; // { x, y, why, urgent }
    if (PARRY) {
      // A) reflectable boss ORB incoming → fling it back at the boss (parry-as-offense)
      if (boss) {
        let od = 1e9, orb = null;
        for (let i = 0; i < near.length; i++) { const b = near[i]; if (!b.reflectable || !b.fromBoss) continue; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < od) { od = d; orb = b; } }
        if (orb && od < PREACH + 36) pTgt = { x: orb.x, y: orb.y, why: 'orb', urgent: true };
      }
      // B) MIRRORBLADE mid-lunge → parry to STAGGER (cancels the lethal lunge body + chips it)
      if (!pTgt && boss && boss.kind === 'mirrorblade' && tf0.mirrorbladeStaggerable && tf0.mirrorbladeStaggerable(boss)) {
        if (Math.hypot(boss.x - p.x, boss.y - p.y) < (PARRY.mirrorbladeReach || 100) - 6) pTgt = { x: boss.x, y: boss.y, why: 'mirror', urgent: true };
      }
      // (NB: there is no bare-enemy "riposte parry" — game.ts only runs the enemy counter-burst
      //  when the parry ALSO catches a bullet / staggers / reflects. A melee shielded darter
      //  with no bullets in the arc can't be parry-killed; it dies to a through-skewer or AoE.)
      // C) genuinely out of dashes with a wall converging in front → deflect it + refund stamina
      if (!pTgt && p.stamina < DASH_COST * 0.6 && threatN >= 3) {
        let bd = 1e9, bb = null;
        for (let i = 0; i < near.length; i++) { const b = near[i]; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < PREACH + 16 && d < bd) { bd = d; bb = b; } }
        if (bb) pTgt = { x: bb.x, y: bb.y, why: 'deflect', urgent: false };
      }
    }
    // resolve the parry into FIRE / LINE-UP (rotate toward it, hold the dash) / none
    let parryAimX = 0, parryAimY = 0, parryFire = false, parryCommit = false;
    if (pTgt) {
      const desired = Math.atan2(pTgt.y - p.y, pTgt.x - p.x);
      const dd = Math.abs(angWrap(desired - p.angle));
      const dashEscapes = hard && !pTgt.urgent && p.stamina >= DASH_COST - 1; // a closing lethal shot a dash dodges wins over a non-urgent parry
      if (!dashEscapes) {
        parryAimX = pTgt.x; parryAimY = pTgt.y;
        if (canParry && dd <= PHALF) { parryFire = true; parryCommit = true; }
        else if (dd < 1.0) { parryCommit = true; } // rotating into alignment — hold the dash this frame
      }
    }

    // ── dash decision (survive first: an escape dash also spears & thins the crowd) ──
    const canDash = p.stamina >= DASH_COST - 1;
    let wantDash = false, aimX = 0, aimY = 0, charge = 0;
    // The Sovereign's body only takes damage when EXPOSED, or — to crack it open —
    // once every orbiting core is shattered. Every other boss is always hittable.
    const bossHittable = !boss ? false
      : boss.kind !== 'sovereign' ? true
      : ((tf0 && !tf0.sovereignBodyArmored(boss)) || coresLeft === 0);
    if (parryCommit) {
      // committing to a parry this frame — no dash; aim is forced to the parry target below
      bot.committed = false;
    } else if (stuck && canDash && nE && (!hard || bot.stuckFrames > 600)) {
      // STALL-BREAKER — the wave won't thin on its own (distant zoners the escape-scoring
      // flees). Spear the nearest one (reach past it) to force progress. Normally only when
      // NOT under a hard threat (eating a wall to chase a straggler is how the bot died at
      // w6–7); but a LONG genuine stall (>10s) is a guaranteed loss at the cap, so then it
      // outranks the escape — the HUNT bestDash still scores bullet-avoidance at the landing.
      const hl = Math.min(560, nED + 90);
      const bd = bestDash(p, w, near, E, boss, R, [hl], 2, bossHittable);
      aimX = bd.aimX; aimY = bd.aimY; charge = bd.charge; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = bd.charge;
    } else if (canDash && hard) {
      const bd = bestDash(p, w, near, E, boss, R, [190], 0, bossHittable); // escape NOW — flee to the openest spot
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
      const bd = bestDash(p, w, near, E, boss, R, [300, 400], 1, bossHittable);
      aimX = bd.aimX; aimY = bd.aimY; charge = bd.charge; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = bd.charge;
    } else if (canDash && !boss && p.stamina >= DASH_COST * 2.6 && threatN <= 1 && nE && nED < 470) {
      // HUNT the last chaff — Arena waves only advance once cleared, so spear the
      // nearest one. Floor raised to ~2.6 charges (was 2): telemetry showed the bot dying
      // STAMINA-STARVED (avg 62 at death, <1 dash) — it spent its reserve hunting and then
      // couldn't dash through the chaff wall that killed it. Keep more in the tank.
      // nearest enemy (reach through it) instead of fleeing it forever. A shielded
      // darter/orbiter is killed by a dash that passes THROUGH + past it (the shield
      // block test uses the dash-START angle, which falls outside the cone once you've
      // shot past — bestDash already scores those through-skewers, t<0.85).
      const hl = Math.min(540, nED + 70);
      const bd = bestDash(p, w, near, E, boss, R, [hl], 2, bossHittable);
      aimX = bd.aimX; aimY = bd.aimY; charge = bd.charge; wantDash = true;
      bot.committed = true; bot.aimX = aimX; bot.aimY = aimY; bot.charge = bd.charge;
    } else {
      bot.committed = false;
    }

    // a lingering SHIELDED straggler the spear clangs off (≤3 chaff left) is a STALL — its
    // 360px nova obliterate is a clean shield-proof finisher worth spending the meter on.
    const stragglerStuck = !boss && nE && nE.shielded && chaffCount <= 3;
    // ── overdrive: clear a crush, finish a stuck straggler, break a STALLED zoner wave, or
    //    save us when we can't dash. The 360px obliterate clears a spread-out wave the spear
    //    can't chase down — the cure for the late-arena bloomer/herald/seeker stall. ──
    if (w.overdrive.meter >= 1 && w.overdrive.cooldown <= 0 && (crowd >= 4 || stragglerStuck || stuck || (hard && !canDash && !parryCommit))) s.overdrivePressed = true;

    // ── movement: centre pull + opportunistic pickups when truly calm ──
    mvx += (w.width / 2 - p.x) / w.width * 0.35; mvy += (w.height / 2 - p.y) / w.height * 0.35;
    if (!hard && crowd === 0 && Math.hypot(mvx, mvy) < 0.45) {
      let tgt = null, td = 1e9;
      const PU = w.powerups && w.powerups.items;
      if (PU) for (let i = 0; i < PU.length; i++) { const g = PU[i]; if (!g.active) continue; const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < td) { td = d; tgt = g; } }
      if (!tgt) { const G = w.gems.items; for (let i = 0; i < G.length; i++) { const g = G[i]; if (!g.active) continue; const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < td) { td = d; tgt = g; } } }
      if (tgt) { mvx += (tgt.x - p.x) / Math.max(1, td) * 0.6; mvy += (tgt.y - p.y) / Math.max(1, td) * 0.6; }
    }
    // STRAGGLER CLEAR — a lingering SHIELDED darter/orbiter clangs the head-on spear, so when
    // it (and ≤2 others) is all that's left, the wave never empties → STALL. The shield-proof
    // kills are: (1) a dash THROUGH+past it (handled by HUNT/bestDash above), (2) the Nova-Dash
    // launch shockwave (chainExplode ignores the shield) — so CLOSE to within nova radius and
    // the next dash detonates on it, (3) OVERDRIVE's 360px nova obliterate. Close in so the
    // through-skewer / nova lands; the overdrive panic below fires if it's available.
    if (stragglerStuck && !hard) {
      const d = nED || 1;
      const want = Math.max(40, (w.stats.dashNovaRadius || 0) - 10); // sit inside the launch-nova ring
      if (d > want) { mvx += (nE.x - p.x) / d * 1.3; mvy += (nE.y - p.y) / d * 1.3; }
    }
    // stamina-aware CHAFF spacing — the cure for the stamina-starved chaff deaths. When low
    // on dashes and NOT stuck (the stall-breaker owns that case), back off the nearest threat
    // to open space and let stamina regen (grazing refunds it too) so a full escape charge is
    // always in reserve for the next wall. Skipped under a hard threat (escape owns that).
    if (!boss && !hard && !stuck && nE && p.stamina < DASH_COST * 1.6 && nED < 200) {
      mvx -= (nE.x - p.x) / (nED || 1) * 0.9; mvy -= (nE.y - p.y) / (nED || 1) * 0.9;
    }
    // stamina-aware boss spacing: with charges to spare, close in to joust range;
    // when low, KITE OUT to where the boss's radial patterns are sparse (a full ring
    // is a thin arc out there → movement alone dodges it) and let stamina regen.
    if (boss && !hard && !parryCommit) {
      if (p.stamina < DASH_COST && bossDist < 380) { mvx -= (boss.x - p.x) / bossDist * 1.0; mvy -= (boss.y - p.y) / bossDist * 1.0; } // out of dashes → kite to sparse range & regen
      else if (p.stamina >= DASH_COST * 2 && bossDist > 270) { mvx += (boss.x - p.x) / bossDist * 0.55; mvy += (boss.y - p.y) / bossDist * 0.55; } // charges to spare → close to joust range
    }
    let ml = Math.hypot(mvx, mvy); if (ml > 1) { mvx /= ml; mvy /= ml; }
    s.moveX = mvx; s.moveY = mvy;

    // ── charge/release + parry state machine ──
    let held = false;
    if (parryCommit) {
      // aim at the parry target so p.angle rotates into the wedge; never hold/charge a dash
      s.aimX = parryAimX; s.aimY = parryAimY;
      s.parryPressed = parryFire;
      held = false;
    } else if (wantDash) {
      s.aimX = aimX; s.aimY = aimY;
      held = p.phase === 'charging' ? p.charge < charge : true;
      if (p.phase === 'charging' && !held) bot.committed = false; // releasing this frame → fire
    } else {
      s.aimX = nE ? nE.x : boss ? boss.x : p.x + Math.cos(p.angle) * 100;
      s.aimY = nE ? nE.y : boss ? boss.y : p.y + Math.sin(p.angle) * 100;
    }
    s.dashHeld = held; s.dashReleased = bot.prevHeld && !held; s.dashTapped = false; bot.prevHeld = held;
    return s;
  }

  lf.input.poll = decide;

  if (!lf.__origFGO) lf.__origFGO = lf.finishGameOver.bind(lf);
  lf.finishGameOver = function (won) { window.__lastWon = !!won; return lf.__origFGO(won); };

  // ── headless probe (stats). Optional `heat` pins save.selectedHeat for the batch
  //    (restored after); pass null to use the player's current selection. ──
  window.__runProbe = function (mode, runs, capSteps, heat) {
    const origRAF = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    const oR = lf.renderer.render.bind(lf.renderer), oH = lf.ui.updateHud.bind(lf.ui);
    lf.renderer.render = () => {}; lf.ui.updateHud = () => {};
    // Don't pollute the LIVE leaderboard while probing: each headless run ends in a
    // real gameover → submitScore POSTs to the deployed worker, which rate-limits
    // (429) and rejects implausible bot payloads (400). Swallow leaderboard traffic
    // (POST /score + GET /leaderboard) for the duration; everything else passes through.
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/\/(score|leaderboard)(\?|$)/.test(url)) return Promise.resolve(new Response('{"entries":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
      return origFetch.call(this, input, init);
    };
    const saveHeat = lf.save.selectedHeat;
    const rows = [];
    try {
      for (let r = 0; r < runs; r++) {
        if (heat != null) lf.save.selectedHeat = heat;
        bot.prevHeld = false; bot.committed = false; window.__lastWon = false;
        lf.start(mode);
        let t = performance.now(); lf.lastTime = t; lf.accumulator = 0; let steps = 0;
        while (lf.state !== 'gameover' && steps < capSteps) { t += 16.667; lf.frame(t); steps++; }
        const w = lf.world;
        rows.push({ time: +w.time.toFixed(1), score: w.score, kills: w.killCount, combo: w.bestComboRun, won: window.__lastWon, sov: !!w.sovereignDown, bossKills: w.bossKills ?? 0, stall: steps >= capSteps && lf.state !== 'gameover' });
      }
    } finally {
      window.requestAnimationFrame = origRAF; lf.renderer.render = oR; lf.ui.updateHud = oH; window.fetch = origFetch;
      lf.save.selectedHeat = saveHeat;
    }
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
        sovRate: +(rows.filter((x) => x.sov).length / rows.length).toFixed(2),
      };
    }
    console.table(Object.values(out));
    return out;
  };

  // ── HEAT sweep — win/sovereign-down rate per HEAT level for one mode. Pins NG+0 (so a
  //    win can't silently inflate difficulty mid-sweep) + restores the player's real save. ──
  window.__heatSweep = async function (modeId, heats, runs, cap) {
    const { MODES } = await import('/src/modes.ts');
    const mode = MODES.find((m) => m.id === modeId) || MODES[0];
    heats = heats || [0, 1, 2, 3, 4, 5, 6, 7];
    runs = runs || 12;
    cap = cap || (mode.arena || mode.bossrush ? 40000 : 28000);
    const saveNg = { lvl: lf.save.ngPlusLevel, active: lf.save.ngPlusActive };
    const cells = [];
    try {
      for (const heat of heats) {
        lf.save.ngPlusLevel = 0; lf.save.ngPlusActive = false;
        const rows = window.__runProbe(mode, runs, cap, heat);
        const n = rows.length;
        const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
        cells.push({
          mode: modeId, heat,
          winPct: Math.round(100 * rows.filter((r) => r.won).length / n),
          sovPct: Math.round(100 * rows.filter((r) => r.sov).length / n),
          medBoss: med(rows.map((r) => r.bossKills)), maxBoss: Math.max(...rows.map((r) => r.bossKills)),
          medTime: med(rows.map((r) => r.time)),
          stallPct: Math.round(100 * rows.filter((r) => r.stall).length / n),
        });
      }
    } finally {
      lf.save.ngPlusLevel = saveNg.lvl; lf.save.ngPlusActive = saveNg.active;
    }
    console.table(cells);
    return cells;
  };

  console.log('LANCEFALL PRO bot installed (v2 — PARRY-aware).  ▶ watch: __watch("endless")   📊 stats: await __sweep()   🔥 heat: await __heatSweep("arena")');
})();
