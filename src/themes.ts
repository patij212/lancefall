// Cosmetic palette themes — shard-unlockable reskins. A theme retints the
// "neutral" surfaces (player ship, UI accent, nebula backdrop). Enemy and
// bullet colors are deliberately NOT themed so the swarm stays readable and
// colorblind-friendly.

export interface ThemeDef {
  id: string;
  name: string;
  unlockShards: number;
  unlockAch?: string; // optional achievement id required to unlock (e.g. 'longestday-read')
  accent: string; // primary — UI accent + ship glow
  accent2: string; // ship outline / secondary
  nebula: [string, string, string]; // background cloud tints
}

export const THEMES: ThemeDef[] = [
  { id: 'neon', name: 'NEON', unlockShards: 0, accent: '#22d3ee', accent2: '#5beaff', nebula: ['#103040', '#241046', '#2e1030'] },
  { id: 'sunset', name: 'SUNSET', unlockShards: 800, accent: '#fb923c', accent2: '#fbbf24', nebula: ['#3a1810', '#3a1020', '#2a1030'] },
  // accent/accent2 kept clear of every enemy color: herald lime #a3e635, drifter
  // emerald #10b981, hollow mint #6ee7b7, and the combo-ramp green #34d399 — the
  // secondary (ship outline + beat-ring + trail) overlaps enemy silhouettes, so it
  // must never read as an enemy.
  { id: 'toxic', name: 'TOXIC', unlockShards: 800, accent: '#2dd4bf', accent2: '#86efac', nebula: ['#0e3024', '#1a3a10', '#103020'] },
  { id: 'vapor', name: 'VAPOR', unlockShards: 1500, accent: '#f472b6', accent2: '#c084fc', nebula: ['#2a1040', '#3a1030', '#101a40'] },
  { id: 'mono', name: 'MONO', unlockShards: 1500, accent: '#e2e8f0', accent2: '#94a3b8', nebula: ['#1a1f2a', '#15151a', '#202028'] },
  // DECRYPTED — the gold prestige palette, unlocked only at THE LONGEST DAY (100% decryption).
  { id: 'decrypted', name: 'DECRYPTED', unlockShards: 0, unlockAch: 'longestday-read', accent: '#fde047', accent2: '#fff7cd', nebula: ['#2a2410', '#241c08', '#1a1404'] },
];

export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Is the gating met to unlock this theme? Achievement-gated themes need the achievement
 *  (and are otherwise free); shard themes need enough shards. Mirrors canUnlockTrail. */
export function canUnlockTheme(def: ThemeDef, shards: number, achievements: string[]): boolean {
  if (def.unlockAch) return achievements.includes(def.unlockAch);
  return shards >= def.unlockShards;
}
