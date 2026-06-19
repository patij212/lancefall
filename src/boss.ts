// The Warden — the mini-boss crescendo. Two alternating attack phases: a
// readable rotating bullet spiral you dash through the gaps of, and aimed fan
// bursts with a rest window that is your damage opening. HP scales each
// appearance. Takes 1 "dash-hit" per dash (one-hit-per-dashId enforced upstream).

import { WARDEN, WEAVER, BEACON, MIRRORBLADE, HOLLOW, SOVEREIGN, CIPHER } from './tune';
import type { World } from './world';
import type { Enemy } from './types';
import { updateWarden } from './bosses/warden';
import { updateWeaver } from './bosses/weaver';
import { updateBeacon, beaconBeamActive, beaconEnraged, beaconSweepTightnessFrac } from './bosses/beacon';
import { updateMirrorblade, mirrorbladeDashing } from './bosses/mirrorblade';
import { updateHollow, hollowSyncActive, cleanupHollowEchoes, openHollowWindow } from './bosses/hollow';
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
export { beaconBeamActive, beaconEnraged, beaconSweepTightnessFrac };
export { bossEnraged, bossEnrageFrac, getEnrageColor } from './bosses/util';
export { mirrorbladeDashing };
export { hollowSyncActive, cleanupHollowEchoes, openHollowWindow };
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
  e.enrageAnnounced = false; // reset the enrage-stinger latch (pooled objects may carry a stale flag)
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

/** Whether a boss's body kills the player on contact this frame. Extracted so
 *  the per-boss exceptions live in one place (Mirrorblade only mid-lunge; the
 *  Hollow is an intangible phantom and never contact-lethal). */
export function isBossLethal(e: Enemy): boolean {
  if (e.kind === 'mirrorblade') return mirrorbladeDashing(e);
  if (e.kind === 'hollow') return false;
  return true;
}

/** Bosses that get the GENERIC ring cipher in a cipher-lock mode (Warden, Weaver,
 *  Beacon). The Hollow (one-time key), Mirrorblade (imitation game) and Sovereign
 *  (master cipher) are already code-breaking puzzles in their own right. */
export function bossUsesRingCipher(kind: Enemy['kind']): boolean {
  return kind === 'warden' || kind === 'weaver' || kind === 'beacon';
}
