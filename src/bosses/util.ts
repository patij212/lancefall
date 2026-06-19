// Shared boss helpers. Pure — no rng, no side effects (the determinism contract:
// low-HP escalation is an HP predicate, never a fresh world.rng draw).
import { WARDEN, WEAVER, BEACON, MIRRORBLADE, HOLLOW, SOVEREIGN, ZONE, FINALE } from '../tune';
import type { World } from '../world';
import type { Enemy, EnemyKind } from '../types';

/** Universal low-HP ENRAGE gate: below `frac` of max HP a boss changes BEHAVIOR
 *  (a second beam, two closing gaps, a rear back-spray) — not just its fire rate.
 *  Pure HP read, so it stays bit-identical on a replay. */
export function bossEnraged(e: Enemy, frac: number): boolean {
  return e.hp / e.maxHp < frac;
}

/** ZONE the player: nudge a boss's drift target (curTx,curTy) TOWARD the player by
 *  `bias` so the boss pressures the player's spot instead of letting them turtle a
 *  safe corner. A fraction of the way (modest bias keeps the readable lissajous wander),
 *  clamped to the arena with a margin so the boss never leaves bounds. Pure: reads only
 *  the player position (already seeded state) + arena dims — NO rng. bias=0 is identity. */
export function zoneTarget(
  px: number, py: number, arenaW: number, arenaH: number, curTx: number, curTy: number, bias: number,
): { tx: number; ty: number } {
  const m = ZONE.margin;
  const tx = clampRange(curTx + bias * (px - curTx), m, arenaW - m);
  const ty = clampRange(curTy + bias * (py - curTy), m, arenaH - m);
  return { tx, ty };
}

function clampRange(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The HP fraction at which a boss's behavior ESCALATES — the single threshold the
 *  enrage stinger announces. Mirrorblade enrages at 0.5; Warden/Weaver/Beacon/Hollow
 *  at 0.4; the Sovereign's escalation is its sub-25% finale (finaleFrac). Pure. */
export function bossEnrageFrac(kind: EnemyKind): number {
  switch (kind) {
    case 'mirrorblade': return MIRRORBLADE.enrageFrac;
    case 'weaver': return WEAVER.enrageFrac;
    case 'beacon': return BEACON.enrageFrac;
    case 'hollow': return HOLLOW.enrageFrac;
    case 'sovereign': return SOVEREIGN.finaleFrac;
    default: return WARDEN.enrageFrac;
  }
}

/** The neon flash colour for a boss's enrage stinger (its signature hue). Pure lookup. */
export function getEnrageColor(kind: EnemyKind): string {
  switch (kind) {
    case 'weaver': return WEAVER.color;
    case 'beacon': return BEACON.color;
    case 'mirrorblade': return MIRRORBLADE.color;
    case 'hollow': return HOLLOW.color;
    case 'sovereign': return SOVEREIGN.color;
    default: return WARDEN.color;
  }
}

/** FINALE edge-detect: fires true exactly ONCE, the first frame a boss's HP drops below
 *  `frac`, latching e.finaleTrig so the last-stand volley never repeats. Pure (HP read +
 *  a one-shot flag flip), no rng — bit-identical on a replay. */
export function bossFinaleStart(e: Enemy, frac: number): boolean {
  if (e.finaleTrig) return false;
  if (e.hp / e.maxHp >= frac) return false;
  e.finaleTrig = true;
  return true;
}

/** The per-kind FINALE burst config (bullets + speed). */
function finaleConfig(kind: EnemyKind): { bullets: number; speed: number } {
  switch (kind) {
    case 'weaver': return FINALE.weaver;
    case 'beacon': return FINALE.beacon;
    case 'mirrorblade': return FINALE.mirrorblade;
    case 'hollow': return FINALE.hollow;
    default: return FINALE.warden;
  }
}

/** The one-shot "last stand" volley: a full ring in the boss's signature colour with a
 *  guaranteed safe lane centred on the player (so it's always survivable — a felt last
 *  gasp, not a cheap-shot wall). Deterministic: the lane is the pure boss→player angle,
 *  no rng draw. Call once, gated by bossFinaleStart. */
export function finaleBurst(e: Enemy, world: World): void {
  const cfg = finaleConfig(e.kind);
  const toPlayer = Math.atan2(world.player.y - e.y, world.player.x - e.x);
  const n = cfg.bullets;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // omit the wedge facing the player — a guaranteed dash-out lane
    let d = a - toPlayer;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < FINALE.gapHalf) continue;
    world.spawnBullet(e.x, e.y, Math.cos(a) * cfg.speed, Math.sin(a) * cfg.speed, 7, e.color, true);
  }
}
