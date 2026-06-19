// THE MIRRORBLADE — boss #4. A dash-duelist that lunges like the player: wind-up
// (telegraphed aim) → lunge (body lethal) → recover (vulnerable). It is the MODEL
// the other bosses' enrage generalises from — below 50% HP it halves its windup/
// recover AND chains a second quick lunge. Extracted from boss.ts unchanged; the
// pure mirrorbladeDashing predicate lives here too.

import { MIRRORBLADE, FINALE } from '../tune';
import { norm, clamp } from '../vec';
import { bossEnraged, bossFinaleStart, finaleBurst } from './util';
import type { World } from '../world';
import type { Enemy } from '../types';

/** Is the Mirrorblade mid-lunge? (its body is lethal then). */
export function mirrorbladeDashing(e: Enemy): boolean {
  return e.kind === 'mirrorblade' && e.phase === 1;
}

/** Can a PARRY stagger it right now? Only mid-lunge (phase 1) — the duel read: time the
 *  parry to its committed charge, not its wind-up or recovery. */
export function mirrorbladeStaggerable(e: Enemy): boolean {
  return e.kind === 'mirrorblade' && e.phase === 1;
}

/** STAGGER: a parried lunge is cancelled mid-flight and the duelist is dumped into an
 *  extended RECOVER window (the punish opening) — its body stops dead. Pure state
 *  mutation, no rng. Caller adds the chip damage + juice. */
export function staggerMirrorblade(e: Enemy): void {
  e.phase = 2; // RECOVER (vulnerable)
  e.timer = MIRRORBLADE.recoverFast + MIRRORBLADE.staggerRecoverBonus;
  e.telegraph = 0;
  e.vx = 0;
  e.vy = 0;
}

export function updateMirrorblade(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 2);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
  if (bossFinaleStart(e, FINALE.frac)) finaleBurst(e, world); // one-shot last-stand volley

  const p = world.player;
  const enraged = bossEnraged(e, MIRRORBLADE.enrageFrac);
  const windup = enraged ? MIRRORBLADE.windupFast : MIRRORBLADE.windup;
  const recover = enraged ? MIRRORBLADE.recoverFast : MIRRORBLADE.recover;
  const dashDur = MIRRORBLADE.dashLen / MIRRORBLADE.dashSpeed;

  if (e.phase === 0) {
    // WIND-UP: drift toward the player, tracking aim; commit on release
    const [nx, ny] = norm(p.x - e.x, p.y - e.y);
    e.vx = nx * MIRRORBLADE.driftSpeed;
    e.vy = ny * MIRRORBLADE.driftSpeed;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    e.timer -= dt;
    e.telegraph = clamp(1 - e.timer / windup, 0, 1);
    if (e.timer <= 0) {
      e.phase = 1;
      e.timer = dashDur;
      e.telegraph = 0;
      // a parting aimed fan as it commits
      const base = e.angle;
      const sp = MIRRORBLADE.fanBulletSpeed * e.bulletMul;
      const half = (MIRRORBLADE.fanBullets - 1) / 2;
      for (let i = 0; i < MIRRORBLADE.fanBullets; i++) {
        const a = base + (i - half) * MIRRORBLADE.fanSpread;
        world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, '#ff8a8a', true);
      }
    }
  } else if (e.phase === 1) {
    // LUNGE: rocket along the committed angle (body is lethal, see game)
    e.vx = Math.cos(e.angle) * MIRRORBLADE.dashSpeed;
    e.vy = Math.sin(e.angle) * MIRRORBLADE.dashSpeed;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.timer -= dt;
    if (e.timer <= 0) {
      e.phase = 2;
      e.timer = recover;
    }
  } else {
    // RECOVER: slow, vulnerable
    e.vx *= 0.85;
    e.vy *= 0.85;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.timer -= dt;
    if (e.timer <= 0) {
      e.subPhase++;
      // enraged: chain a second quick dash before the next wind-up
      if (enraged && e.subPhase % 2 === 1) {
        e.phase = 0;
        e.timer = windup * 0.5;
      } else {
        e.phase = 0;
        e.timer = windup;
      }
    }
  }

  e.telegraph = e.phase === 0 ? e.telegraph : e.phase === 2 ? 0 : 0;
}
