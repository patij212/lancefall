// ENEMY TELLS — the readable telegraphs for the enemy-overhaul roles (Splitter cracks,
// Shade phase-in, Bomber arming, Wisp threads, Darter counter wind-up, Brooder hatch
// pulse, Orbiter mine-zone, Bloomer rotating wedge). Kept OUT of the 2500-line render.ts
// and the 5000-line skins.ts: render.ts calls drawEnemyTells() once per frame and every
// tell lives here, mirroring the render/boss.ts split. Each helper draws in WORLD space
// (translates itself, own save/restore), is a no-op unless its enemy is in the relevant
// state, allocates nothing per frame, and gates all motion/flash behind the passed
// reduceMotion / reduceFlashing flags (a11y) — the tells stay legible, never strobe.
//
// These are RENDER-ONLY overlays: they read sim state but never mutate it and never draw
// world.rng, so the seeded Daily is untouched. Drawn as a pass AFTER the enemy bodies so
// tells sit on top.

import type { World } from '../world';
import type { Enemy } from '../types';
import { WISP } from '../tune';

/** The post-scale render radius the body uses (mirrors render.ts drawEnemy). */
function bodyRadius(e: Enemy): number {
  return e.radius * (0.4 + 0.6 * e.scale);
}

/** SPLITTER — looks cracked / unstable so it reads as "this WILL split." A pair of
 *  jagged fault lines across the body, faintly breathing. The read: dash to be done,
 *  or parry/graze to shatter it into the combo-shower. */
function drawSplitterCracks(ctx: CanvasRenderingContext2D, e: Enemy, t: number, reduceMotion: boolean): void {
  const r = bodyRadius(e);
  // a slow instability flicker (frozen mid-value under reduceMotion)
  const flick = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 6 + e.spawnTime * 5);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#e9d5ff'; // pale violet seam — reads against the purple body
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.3 + 0.4 * flick;
  // two fixed fault lines (deterministic zig from the radius), offset per splitter
  for (let s = -1; s <= 1; s += 2) {
    const a = e.spawnTime * 0.7 + (s > 0 ? 1.2 : -0.9); // a stable per-splitter seam angle
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const px = -dy; // perpendicular zig offset
    const py = dx;
    ctx.beginPath();
    ctx.moveTo(-dx * r, -dy * r);
    ctx.lineTo(-dx * r * 0.35 + px * r * 0.28, -dy * r * 0.35 + py * r * 0.28);
    ctx.lineTo(dx * r * 0.35 - px * r * 0.24, dy * r * 0.35 - py * r * 0.24);
    ctx.lineTo(dx * r, dy * r);
    ctx.stroke();
  }
  ctx.restore();
}

/** SHADE — the timing-duel tell. While dormant it shows nothing (it is harmless, so the
 *  absence of a ring reads as "safe to touch"); as it readies a STRIKE a warning ring
 *  converges onto the body (the phase-in), and during the lethal lunge a hot ring + a
 *  forward slash along the lunge mark it as live. Strobe gated by a11y flags. */
function drawShadeStrike(ctx: CanvasRenderingContext2D, e: Enemy, t: number, reduceMotion: boolean, reduceFlashing: boolean): void {
  const tele = e.telegraph || 0;
  if (e.phase !== 1 && tele <= 0) return; // dormant drift → no tell (it is harmless)
  const r = bodyRadius(e);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalCompositeOperation = 'lighter';
  if (e.phase === 1) {
    // STRIKE (lethal): a hot ring + a slash along the committed lunge
    const pulse = reduceMotion || reduceFlashing ? 0.85 : 0.6 + 0.4 * Math.abs(Math.sin(t * 28));
    ctx.strokeStyle = '#fff7ed';
    ctx.globalAlpha = 0.85 * pulse;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    const a = Math.atan2(e.vy, e.vx) || 0;
    ctx.strokeStyle = '#fdba74';
    ctx.globalAlpha = 0.9 * pulse;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a) * (r + 18), Math.sin(a) * (r + 18));
    ctx.stroke();
  } else {
    // PHASE-IN warning: a ring converging onto the body as the strike readies (tele 0→1)
    const rr = r + 26 * (1 - tele);
    ctx.strokeStyle = '#fdba74';
    ctx.globalAlpha = 0.25 + 0.5 * tele;
    ctx.lineWidth = 1.5 + 2 * tele;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** BOMBER — the don't-greed arming tell. While ARMED (phase 1) a charge ring CONTRACTS
 *  onto the body and the pulse quickens as detonation nears, with a hot core in the last
 *  beat. The read: get out / dash through before it blows. Strobe gated by a11y flags. */
function drawBomberArming(ctx: CanvasRenderingContext2D, e: Enemy, t: number, reduceMotion: boolean, reduceFlashing: boolean): void {
  if (e.phase !== 1) return;
  const tele = e.telegraph || 0;
  const r = bodyRadius(e);
  const blink = reduceFlashing || reduceMotion ? 0.7 : 0.5 + 0.5 * Math.abs(Math.sin(t * (8 + 30 * tele)));
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalCompositeOperation = 'lighter';
  const rr = r + 30 * (1 - tele); // tightens onto the body as it nears the blast
  ctx.strokeStyle = '#fda4af';
  ctx.globalAlpha = 0.3 + 0.6 * tele * blink;
  ctx.lineWidth = 2 + 3 * tele;
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, Math.PI * 2);
  ctx.stroke();
  if (tele > 0.6) {
    // hot core in the final beat — the "it's about to go" read
    ctx.fillStyle = '#fff1f2';
    ctx.globalAlpha = ((tele - 0.6) / 0.4) * blink;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** WISP — a faint light-thread links nearby wisps in a pack, so the swarm reads as a
 *  cluster (and "don't camp the middle"). A pre-pass: collect the wisps, link any pair
 *  within threadDist. Few wisps on screen → the pairwise cost is trivial. */
function drawWispThreads(ctx: CanvasRenderingContext2D, world: World, t: number, reduceMotion: boolean): void {
  const wisps: Enemy[] = [];
  world.enemies.forEachActive((e) => {
    if (e.kind === 'wisp') wisps.push(e);
  });
  if (wisps.length < 2) return;
  const maxD2 = WISP.threadDist * WISP.threadDist;
  const breath = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#a5f3fc'; // pale cyan filament
  ctx.lineWidth = 1;
  for (let i = 0; i < wisps.length; i++) {
    for (let j = i + 1; j < wisps.length; j++) {
      const a = wisps[i];
      const b = wisps[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > maxD2) continue;
      // fade with distance — the thread thins as the pair drifts apart
      ctx.globalAlpha = (0.12 + 0.22 * breath) * (1 - d2 / maxD2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** DARTER — the counter-lunge tell. WINDUP (phase 1): a charging spike + arrowhead along
 *  the LOCKED counter line previews exactly where it will lunge, brightening as it commits
 *  (the bait/punish read). COUNTER (phase 2): a motion streak behind the lunge. Strobe
 *  gated by a11y flags. */
function drawDarterCounter(ctx: CanvasRenderingContext2D, e: Enemy, t: number, reduceMotion: boolean, reduceFlashing: boolean): void {
  const r = bodyRadius(e);
  if (e.phase === 1) {
    const tele = e.telegraph || 0;
    const pulse = reduceFlashing || reduceMotion ? 0.8 : 0.5 + 0.5 * Math.abs(Math.sin(t * 22));
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle); // the locked counter line ("along your dash")
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#ff7a99'; // darter red, lifted
    ctx.globalAlpha = 0.3 + 0.6 * tele * pulse;
    ctx.lineWidth = 2 + 3 * tele;
    const reach = r + 10 + 34 * tele;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(reach, 0);
    ctx.stroke();
    ctx.beginPath(); // arrowhead — where the lunge goes
    ctx.moveTo(reach, 0);
    ctx.lineTo(reach - 9, -6);
    ctx.moveTo(reach, 0);
    ctx.lineTo(reach - 9, 6);
    ctx.stroke();
    ctx.globalAlpha = 0.25 + 0.4 * tele; // brace ring
    ctx.beginPath();
    ctx.arc(0, 0, r + 4 + 3 * tele, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (e.phase === 2) {
    const a = Math.atan2(e.vy, e.vx) || e.angle;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#ffd0db';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-Math.cos(a) * r * 2, -Math.sin(a) * r * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** BROODER — the hatch-pulse tell. While it readies a drone (telegraph>0) an expanding
 *  pulse ring throbs around the core: "a drone is incoming — kill the source." Honours
 *  reduceMotion (the throb freezes to a steady ring). */
function drawBrooderHatch(ctx: CanvasRenderingContext2D, e: Enemy, t: number, reduceMotion: boolean): void {
  const tele = e.telegraph || 0;
  if (tele <= 0) return;
  const r = bodyRadius(e);
  const grow = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.abs(Math.sin(t * 14));
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#c4b5fd'; // brooder violet
  ctx.globalAlpha = 0.2 + 0.5 * tele;
  ctx.lineWidth = 1.5 + 2 * tele;
  ctx.beginPath();
  ctx.arc(0, 0, r + 6 + 14 * tele * grow, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Draw every active enemy's role tell. One call site in render.ts (drawEnemies). */
export function drawEnemyTells(
  ctx: CanvasRenderingContext2D,
  world: World,
  t: number,
  reduceMotion: boolean,
  reduceFlashing: boolean,
): void {
  drawWispThreads(ctx, world, t, reduceMotion); // pack filaments (pairwise pre-pass)
  world.enemies.forEachActive((e) => {
    switch (e.kind) {
      case 'splitter':
        drawSplitterCracks(ctx, e, t, reduceMotion);
        break;
      case 'shade':
        drawShadeStrike(ctx, e, t, reduceMotion, reduceFlashing);
        break;
      case 'bomber':
        drawBomberArming(ctx, e, t, reduceMotion, reduceFlashing);
        break;
      case 'darter':
        drawDarterCounter(ctx, e, t, reduceMotion, reduceFlashing);
        break;
      case 'brooder':
        drawBrooderHatch(ctx, e, t, reduceMotion);
        break;
      default:
        break;
    }
  });
}
