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

/** Draw every active enemy's role tell. One call site in render.ts (drawEnemies). */
export function drawEnemyTells(
  ctx: CanvasRenderingContext2D,
  world: World,
  t: number,
  reduceMotion: boolean,
  reduceFlashing: boolean,
): void {
  void reduceFlashing; // reserved for strobe-gated tells added in later enemy passes
  world.enemies.forEachActive((e) => {
    switch (e.kind) {
      case 'splitter':
        drawSplitterCracks(ctx, e, t, reduceMotion);
        break;
      default:
        break;
    }
  });
}
