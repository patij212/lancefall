import type { Bullet } from './types';

/** The resolved visual class the renderer draws for a bullet. Distinct from the spawn-time
 *  `BulletStyle` tag: homing (SEEKER) + boss fire get their own silhouette derived from
 *  existing Bullet fields (no per-spawn tag), while dart/mine come straight from b.shot. */
export type BulletVisual = 'comet' | 'bossHeavy' | 'dart' | 'mine' | 'orb';

/** Resolve a bullet's render silhouette. PURE — a pickable subset of Bullet, no side effects.
 *  Precedence is deliberate: a curving homing threat (SEEKER) MUST read as a comet even if it
 *  also carries a boss/shot tag, so it can never be mistaken for ballistic fire. */
export function bulletVisual(b: Pick<Bullet, 'homing' | 'fromBoss' | 'shot'>): BulletVisual {
  if (b.homing > 0) return 'comet';
  if (b.fromBoss) return 'bossHeavy';
  if (b.shot === 'dart') return 'dart';
  if (b.shot === 'mine') return 'mine';
  return 'orb';
}
