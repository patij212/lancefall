// The Warden — the mini-boss crescendo. Two alternating attack phases: a
// readable rotating bullet spiral you dash through the gaps of, and aimed fan
// bursts with a rest window that is your damage opening. HP scales each
// appearance. Takes 1 "dash-hit" per dash (one-hit-per-dashId enforced upstream).

import { WARDEN, WEAVER, BEACON, MIRRORBLADE, HOLLOW, SOVEREIGN, CIPHER } from './tune';
import { norm, clamp } from './vec';
import type { World } from './world';
import type { Enemy } from './types';
import { updateWarden } from './bosses/warden';
import { updateWeaver } from './bosses/weaver';
import { updateBeacon, beaconBeamActive, beaconEnraged } from './bosses/beacon';
import {
  updateSovereign,
  spawnSovereignCores,
  spawnCipherRing,
  cleanupSovereignCores,
  countSovereignCores,
} from './bosses/sovereign';

// Re-export per-boss predicates + Sovereign core/cipher helpers so existing
// importers of './boss' (game.ts, cipherIntegration.test) keep working after the
// extraction into src/bosses/*.
export { beaconBeamActive, beaconEnraged };
export { spawnSovereignCores, spawnCipherRing, cleanupSovereignCores, countSovereignCores };

/** Human-readable boss name for the incoming-warning toast. */
export function bossName(kind: Enemy['kind']): string {
  if (kind === 'weaver') return 'THE WEAVER';
  if (kind === 'beacon') return 'THE BEACON';
  if (kind === 'mirrorblade') return 'THE MIRRORBLADE';
  if (kind === 'hollow') return 'THE HOLLOW';
  if (kind === 'sovereign') return 'THE SOVEREIGN';
  return 'THE WARDEN';
}

const BOSS_CYCLE: Enemy['kind'][] = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];

/** True for the six real boss kinds (excludes chaff + the hollow_echo / sovereign_core
 *  sub-entities). Used to filter the nemesis read so stale prose-keyed entries from an
 *  older save can't mislabel a non-boss as 'THE WARDEN'. */
export function isBossKind(kind: string): boolean {
  return (BOSS_CYCLE as string[]).includes(kind);
}

export function spawnBoss(world: World, count: number, force?: Enemy['kind']): Enemy | null {
  const e = world.enemies.obtain();
  if (!e) return null;
  const edge = world.edgeSpawn();
  // cycle bosses: Warden → Weaver → Beacon → Mirrorblade, then repeat (unless forced)
  const kind = force ?? BOSS_CYCLE[(count - 1) % BOSS_CYCLE.length];
  const def =
    kind === 'weaver' ? WEAVER
    : kind === 'beacon' ? BEACON
    : kind === 'mirrorblade' ? MIRRORBLADE
    : kind === 'hollow' ? HOLLOW
    : kind === 'sovereign' ? SOVEREIGN
    : WARDEN;
  e.kind = kind;
  e.x = edge.x;
  e.y = edge.y;
  e.vx = 0;
  e.vy = 0;
  // HP scales with appearance ordinal, but with diminishing returns past the 4th
  // so late bosses don't become un-dashable sponges (one dash-hit per dash).
  const ramp = Math.min(count, 4) + 0.5 * Math.max(0, count - 4);
  e.hp = e.maxHp = Math.round(def.baseHp + ramp * def.hpPerInterval);
  e.radius = def.radius;
  e.color =
    kind === 'weaver' ? WEAVER.color
    : kind === 'beacon' ? BEACON.color
    : kind === 'mirrorblade' ? MIRRORBLADE.color
    : kind === 'hollow' ? HOLLOW.color
    : kind === 'sovereign' ? SOVEREIGN.color
    : WARDEN.color;
  e.baseScore = 0;
  e.timer =
    kind === 'mirrorblade' ? MIRRORBLADE.windup
    : kind === 'weaver' ? WEAVER.phaseDuration
    : kind === 'beacon' ? BEACON.phaseDuration
    : kind === 'hollow' ? HOLLOW.syncEvery
    : kind === 'sovereign' ? SOVEREIGN.phaseDuration
    : WARDEN.phaseDuration;
  e.phase = 0;
  e.telegraph = 0;
  e.angle = 0;
  e.spawnTime = 0;
  e.hitFlash = 0;
  e.lastDashId = -1;
  e.shielded = false;
  e.shieldAngle = 0;
  e.speedMul = 1;
  e.bulletMul = 1;
  e.isBoss = true;
  e.bossWave = count;
  e.scale = 0.1;
  e.fireTimer = 0;
  e.subPhase = 0;
  e.cipherExposed = 0;
  e.facing = Math.atan2(world.player.y - e.y, world.player.x - e.x); // WARDEN rear weak-point seed (harmless for others)
  world.bossAlive = true;
  world.boss = e;
  if (kind === 'sovereign') {
    e.fireTimer = SOVEREIGN.beamTelegraph; // start CROWN BEAMS in their telegraph
    spawnSovereignCores(world, e);
  }
  return e;
}

export function updateBoss(e: Enemy, world: World, dt: number): void {
  // GENERIC ring-cipher expose window: while cracked the boss is vulnerable; when
  // the window closes the cipher re-locks (a fresh ring). Dormant unless a ring was
  // armed (cipher-lock mode), so every other mode is completely unaffected.
  if (bossUsesRingCipher(e.kind) && (e.cipherExposed ?? 0) > 0) {
    e.cipherExposed = (e.cipherExposed ?? 0) - dt;
    if (e.cipherExposed <= 0) {
      e.cipherExposed = 0;
      spawnCipherRing(world, e, CIPHER.ringCount);
    }
  }
  if (e.kind === 'weaver') updateWeaver(e, world, dt);
  else if (e.kind === 'beacon') updateBeacon(e, world, dt);
  else if (e.kind === 'mirrorblade') updateMirrorblade(e, world, dt);
  else if (e.kind === 'hollow') updateHollow(e, world, dt);
  else if (e.kind === 'sovereign') updateSovereign(e, world, dt);
  else updateWarden(e, world, dt);
}

/** Is the Mirrorblade mid-lunge? (its body is lethal then). */
export function mirrorbladeDashing(e: Enemy): boolean {
  return e.kind === 'mirrorblade' && e.phase === 1;
}

/** Is the Hollow in its Clone Sync window? (the only time it can be damaged). */
export function hollowSyncActive(e: Enemy): boolean {
  return e.kind === 'hollow' && e.phase === 2;
}

/** Whether a boss's body kills the player on contact this frame. Extracted so
 *  the per-boss exceptions live in one place (Mirrorblade only mid-lunge; the
 *  Hollow is an intangible phantom and never contact-lethal). */
export function isBossLethal(e: Enemy): boolean {
  if (e.kind === 'mirrorblade') return mirrorbladeDashing(e);
  if (e.kind === 'hollow') return false;
  return true;
}

function updateMirrorblade(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 2);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

  const p = world.player;
  const enraged = e.hp / e.maxHp < 0.5;
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

function updateHollow(e: Enemy, world: World, dt: number): void {
  e.spawnTime += dt;
  if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 1.5);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
  const enraged = e.hp / e.maxHp < 0.4;

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

  // Clone Sync state machine (phase): 0 normal → 1 telegraph → 2 window → 0
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

/** Bosses that get the GENERIC ring cipher in a cipher-lock mode (Warden, Weaver,
 *  Beacon). The Hollow (one-time key), Mirrorblade (imitation game) and Sovereign
 *  (master cipher) are already code-breaking puzzles in their own right. */
export function bossUsesRingCipher(kind: Enemy['kind']): boolean {
  return kind === 'warden' || kind === 'weaver' || kind === 'beacon';
}
