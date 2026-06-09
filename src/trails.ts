// Cosmetic dash-trail styles — shard/achievement-unlockable reskins of the
// signature dash trail (the streaking ship ghosts + trail particles + streaks).
// Purely cosmetic: the dash SPEAR LINE stays combo-coloured so the combo-tier
// signal is never lost; a trail only restyles the trailing flourish.

export interface TrailDef {
  id: string;
  name: string;
  unlockShards: number; // 0 = free (or achievement-gated)
  unlockAch?: string; // optional achievement id required to unlock (e.g. 'regicide')
  /** if true, the trail tracks the live combo colour (the default look) */
  combo?: boolean;
  base: string; // trail-particle / streak colour (when not combo)
  bright: string; // ghost-silhouette colour (when not combo)
}

export const TRAILS: TrailDef[] = [
  { id: 'pulse', name: 'PULSE', unlockShards: 0, combo: true, base: '#22d3ee', bright: '#5beaff' },
  { id: 'ember', name: 'EMBER', unlockShards: 600, base: '#fb7185', bright: '#fbbf24' },
  { id: 'frost', name: 'FROST', unlockShards: 600, base: '#7dd3fc', bright: '#e0f2fe' },
  { id: 'void', name: 'VOID', unlockShards: 1200, base: '#a855f7', bright: '#e9d5ff' },
  { id: 'acid', name: 'ACID', unlockShards: 1200, base: '#a3e635', bright: '#ecfccb' },
  // CROWN — the prestige trail: a reward for felling the final boss (THE SOVEREIGN)
  { id: 'crown', name: 'CROWN', unlockShards: 0, unlockAch: 'regicide', base: '#fde047', bright: '#ffffff' },
];

export function trailById(id: string): TrailDef {
  return TRAILS.find((t) => t.id === id) ?? TRAILS[0];
}

/** Colour for trail particles + dash streaks. The default PULSE follows the live
 *  combo colour; other trails use their fixed base colour. */
export function trailParticleColor(def: TrailDef, comboHex: string): string {
  return def.combo ? comboHex : def.base;
}

/** Colour for the streaking ghost silhouettes. The default PULSE uses the active
 *  theme accent; other trails use their bright colour. */
export function trailGhostColor(def: TrailDef, themeAccent2: string): string {
  return def.combo ? themeAccent2 : def.bright;
}

/** Is the gating requirement met to unlock this trail? Shard trails need enough
 *  shards; achievement-gated trails need the achievement (and are otherwise free). */
export function canUnlockTrail(def: TrailDef, shards: number, achievements: string[]): boolean {
  if (def.unlockAch) return achievements.includes(def.unlockAch);
  return shards >= def.unlockShards;
}
