// THE HOLLOW — boss #5. An intangible phantom: NEVER contact-lethal. It seeds
// killable echo clones and rains concentric rings. Its ONLY damage window used to
// be a fixed "wait for white" timer; now the window is EARNED — killing an echo
// destabilises the Hollow and opens the window on demand (openHollowWindow, called
// from game.ts at the echo's death). A long passive fallback still ticks so a
// purely-defensive player eventually gets a window. Extracted from boss.ts.

import { HOLLOW } from '../tune';
import { bossEnraged } from './util';
import { norm, clamp } from '../vec';
import type { World } from '../world';
import type { Enemy } from '../types';

/** Is the Hollow in its Clone Sync window? (the only time it can be damaged). */
export function hollowSyncActive(e: Enemy): boolean {
  return e.kind === 'hollow' && e.phase === 2;
}

/** DESTABILISE: open the Hollow's vulnerability window immediately (the reward for
 *  hunting an echo). Pure state mutation — no rng. Jumps straight to the damageable
 *  window from any phase; the update's phase-2 branch counts it down to the fallback. */
export function openHollowWindow(e: Enemy): void {
  if (e.kind !== 'hollow') return;
  e.phase = 2;
  e.timer = HOLLOW.echoSyncWindow;
  e.telegraph = 1;
}

/** Seed one echo clone at a random offset around the boss. */
function spawnHollowEcho(boss: Enemy, world: World): void {
  const a = world.rng.range(0, Math.PI * 2);
  const ec = world.spawnEnemy('hollow_echo', boss.x + Math.cos(a) * 160, boss.y + Math.sin(a) * 160, 1, 1, false);
  if (ec) {
    ec.timer = HOLLOW.echoFireEvery;
    ec.angle = a;
  }
}

/** Release any echoes still alive when the Hollow falls (so they don't linger). */
export function cleanupHollowEchoes(world: World): void {
  world.enemies.forEachActive((e) => {
    if (e.kind === 'hollow_echo') world.enemies.release(e);
  });
}

export function updateHollow(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 1.5);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
  const enraged = bossEnraged(e, HOLLOW.enrageFrac);

  // drift slowly near arena centre
  const cx = world.width / 2;
  const cy = world.height / 2;
  const tx = cx + Math.cos(e.spawnTime * 0.3) * world.width * 0.1;
  const ty = cy + Math.sin(e.spawnTime * 0.45) * world.height * 0.1;
  const [nx, ny] = norm(tx - e.x, ty - e.y);
  e.vx = nx * HOLLOW.moveSpeed;
  e.vy = ny * HOLLOW.moveSpeed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;

  // concentric rings with a rotating safe lane; seed echoes over the opening
  e.angle += HOLLOW.ringSpin * dt;
  e.fireTimer -= dt;
  if (e.fireTimer <= 0) {
    e.fireTimer = HOLLOW.ringEvery * (enraged ? 0.7 : 1);
    const n = HOLLOW.ringCount;
    const gap = Math.floor(world.rng.next() * n);
    const sp = HOLLOW.ringSpeed;
    for (let i = 0; i < n; i++) {
      if ((i - gap + n) % n < HOLLOW.ringGap) continue; // safe lane
      const a = e.angle + (i / n) * Math.PI * 2;
      world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, HOLLOW.color, true);
    }
    if (e.subPhase < HOLLOW.maxEchoes) {
      spawnHollowEcho(e, world);
      e.subPhase++;
    }
  }

  // Clone Sync state machine (phase): 0 normal → 1 telegraph → 2 window → 0. This is
  // now the FALLBACK path (syncEvery is long); hunting echoes opens the window early
  // via openHollowWindow(), which sets phase 2 directly.
  e.timer -= dt;
  if (e.phase === 0) {
    e.telegraph = 0;
    if (e.timer <= 0) {
      e.phase = 1;
      e.timer = HOLLOW.syncTelegraph;
    }
  } else if (e.phase === 1) {
    e.telegraph = clamp(1 - e.timer / HOLLOW.syncTelegraph, 0, 1);
    if (e.timer <= 0) {
      e.phase = 2;
      e.timer = HOLLOW.syncWindow;
      e.telegraph = 1;
      // a parting aimed fan as the window opens
      const p = world.player;
      const base = Math.atan2(p.y - e.y, p.x - e.x);
      const sp = HOLLOW.fanBulletSpeed;
      const half = (HOLLOW.fanBullets - 1) / 2;
      for (let i = 0; i < HOLLOW.fanBullets; i++) {
        const a = base + (i - half) * HOLLOW.fanSpread;
        world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, HOLLOW.echoColor, true);
      }
    }
  } else {
    e.telegraph = 1; // window — passable + damageable, drawn bright white
    if (e.timer <= 0) {
      e.phase = 0;
      e.timer = enraged ? HOLLOW.syncEvery * 0.6 : HOLLOW.syncEvery;
      e.telegraph = 0;
    }
  }
}
