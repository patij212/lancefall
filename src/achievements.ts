// Achievements — goals to chase, evaluated on game over against a snapshot of
// the run + lifetime totals. Pure: evaluate() returns the newly-unlocked ones.

import type { EnemyKind } from './types';
import { CONSOLE_PUZZLES } from './bombe';

/** How many console puzzles must be solved for the Cryptanalyst achievement (the full set). */
const CRYPTANALYSIS_PUZZLE_COUNT = CONSOLE_PUZZLES.length;

export interface AchCtx {
  score: number;
  combo: number; // best combo this run
  wave: number;
  kills: number; // this run
  grazes: number; // this run
  maxDashChain: number; // most kills in one dash this run
  bossKills: number; // this run
  daily: boolean;
  won: boolean;
  modeId: string;
  heat: number;
  sovereignDown: boolean; // the Sovereign (final boss) fell this run
  overdriveUses: number; // OVERDRIVE bursts fired this run
  lastBreathUses: number; // Last Breath clutch saves this run
  powerupsCollected: number; // power-ups grabbed this run
  hitsTaken: number; // §4 M3 — would-be-fatal hits this run; 0 = a flawless (no-hit) run
  lifeRuns: number;
  lifeKills: number;
  lifeBoss: number;
  lifeShards: number;
  lifeKillsByKind: Record<string, number>; // lifetime per-kind kills (CODEX tally) — gates the per-enemy SKIN achievements
  // ── THE BOMBE — decryption (meta, save-side; optional so non-console eval sites need not set them) ──
  decryptedCount?: number; // distinct vocabulary words decrypted (master-cipher numerator)
  transmissionsComplete?: number; // intercepts fully decrypted
  bombeLevel?: number; // the Bombe meta-tool level (0 = not built)
  puzzlesSolvedCount?: number; // console cryptanalysis puzzles solved
  masterFrac?: number; // master-cipher fraction in [0,1] (1 = THE LONGEST DAY)
}

/** Build a zeroed AchCtx carrying ONLY the decryption (meta) fields, for evaluating the
 *  decryption achievements from the console — where there is no run. The run fields read as
 *  0/false so no run achievement can misfire. */
export function metaAchContext(m: {
  decryptedCount: number; transmissionsComplete: number; bombeLevel: number; puzzlesSolvedCount: number; masterFrac: number;
}): AchCtx {
  return {
    score: 0, combo: 0, wave: 0, kills: 0, grazes: 0, maxDashChain: 0, bossKills: 0, daily: false,
    won: false, modeId: '', heat: 0, sovereignDown: false, overdriveUses: 0, lastBreathUses: 0,
    powerupsCollected: 0, hitsTaken: 1, lifeRuns: 0, lifeKills: 0, lifeBoss: 0, lifeShards: 0,
    lifeKillsByKind: {}, ...m,
  };
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** 'skin' = a dedicated per-enemy SKIN unlock (grouped under the STATS SKINS tab); absent =
   *  a general achievement. (Some general achievements ALSO gate a skin — see skinAchId.) */
  category?: 'skin';
  check: (c: AchCtx) => boolean;
}

// ── general achievements (the curated set) ──────────────────────────────────
const BASE_ACHIEVEMENTS: Achievement[] = [
  { id: 'firstblood', name: 'First Blood', desc: 'Spear your first enemy.', check: (c) => c.kills >= 1 },
  { id: 'skewer', name: 'Shish Kebab', desc: 'Spear 6 enemies in a single dash.', check: (c) => c.maxDashChain >= 6 },
  { id: 'comboist', name: 'On a Roll', desc: 'Reach a ×25 combo.', check: (c) => c.combo >= 25 },
  { id: 'annihilator', name: 'Unstoppable', desc: 'Reach a ×50 combo.', check: (c) => c.combo >= 50 },
  { id: 'centurion', name: 'Centurion', desc: 'Get 100 kills in one run.', check: (c) => c.kills >= 100 },
  { id: 'bosskiller', name: 'Giant Slayer', desc: 'Bring down a mini-boss.', check: (c) => c.bossKills >= 1 },
  { id: 'grazer', name: 'Living Dangerously', desc: 'Graze 50 bullets in one run.', check: (c) => c.grazes >= 50 },
  { id: 'survivor', name: 'Last One Standing', desc: 'Reach wave 10.', check: (c) => c.wave >= 10 },
  { id: 'highroller', name: 'High Roller', desc: 'Score 200,000 in a run.', check: (c) => c.score >= 200000 },
  { id: 'daily', name: 'Creature of Habit', desc: 'Witness an Echo of the Fall.', check: (c) => c.daily },
  { id: 'veteran', name: 'Veteran', desc: 'Complete 20 runs.', check: (c) => c.lifeRuns >= 20 },
  { id: 'hoarder', name: 'Shard Hoarder', desc: 'Earn 5,000 shards all-time.', check: (c) => c.lifeShards >= 5000 },
  { id: 'gauntlet', name: 'Gauntlet Cleared', desc: 'Win the Arena.', check: (c) => c.won && c.modeId === 'arena' },
  { id: 'bossbane', name: 'Boss Bane', desc: 'Clear Boss Rush.', check: (c) => c.won && c.modeId === 'bossrush' },
  { id: 'nightmarewalker', name: 'Nightmare Walker', desc: 'Reach wave 8 in Nightmare.', check: (c) => c.modeId === 'nightmare' && c.wave >= 8 },
  { id: 'ignis', name: 'Playing with Fire', desc: 'Reach wave 5+ at Heat 3 or above.', check: (c) => c.heat >= 3 && (c.won || c.wave >= 5) },
  { id: 'crucible', name: 'The Crucible', desc: 'Reach wave 5+ at Heat 7 (maximum heat).', check: (c) => c.heat >= 7 && (c.won || c.wave >= 5) },
  { id: 'regicide', name: 'Regicide', desc: 'Bring down the Sovereign.', check: (c) => c.sovereignDown },
  { id: 'coronation', name: 'Long Live the Lance', desc: 'Defeat the Sovereign at Heat 3 or above.', check: (c) => c.sovereignDown && c.heat >= 3 },
  // THE LONGEST DAY — per-mode Sovereign flexes (SOVEREIGN_VICTORY_SPEC §5.3). The hardest feats.
  { id: 'daybreakdark', name: 'Daybreak in the Dark', desc: 'Down the Sovereign in Nightmare — no ARMOR, walls closing in.', check: (c) => c.sovereignDown && c.modeId === 'nightmare' },
  { id: 'codebroken', name: 'The Code Is Broken', desc: 'Decode and down the Sovereign in Solstice Protocol.', check: (c) => c.sovereignDown && c.modeId === 'longestday' },
  { id: 'unleashed', name: 'Unleashed', desc: 'Fire DAYBREAK.', check: (c) => c.overdriveUses >= 1 },
  { id: 'overcharged', name: 'Overcharged', desc: 'Fire DAYBREAK 4 times in a single run.', check: (c) => c.overdriveUses >= 4 },
  // require actually SURVIVING the save (reached a later wave or won) — not merely triggering
  // it then dying the same instant, which misfired on wave-1, 0-score deaths.
  { id: 'lastbreath', name: 'Cheating Death', desc: 'Survive a Last Breath bullet-time save.', check: (c) => c.lastBreathUses >= 1 && (c.won || c.wave >= 2) },
  { id: 'powerplayer', name: 'Power Player', desc: 'Collect 5 power-ups in one run.', check: (c) => c.powerupsCollected >= 5 },
  // §3.4 CHALLENGE UNLOCKS — no-hit feats (hitsTaken is the would-be-fatal seam; 0 = flawless).
  // The "one more run" goals: a clean clear is a different skill bar than a fast/high-score one.
  { id: 'flawlessgauntlet', name: 'Flawless Gauntlet', desc: 'Win the Arena without taking a single hit.', check: (c) => c.won && c.modeId === 'arena' && c.hitsTaken === 0 },
  { id: 'pristine', name: 'Pristine', desc: 'Clear Boss Rush without taking a single hit.', check: (c) => c.won && c.modeId === 'bossrush' && c.hitsTaken === 0 },
  { id: 'flawlesskey', name: 'The Flawless Key', desc: 'Down the Sovereign without taking a single hit.', check: (c) => c.sovereignDown && c.hitsTaken === 0 },
  // ── THE BOMBE — decryption (meta) achievements. Save-side: earned in the codebreaker console
  //    (and re-checked at run-end), gated on the optional decryption fields above. ──
  { id: 'firstdecrypt', name: 'First Light Read', desc: 'Decrypt your first word in THE BOMBE.', check: (c) => (c.decryptedCount ?? 0) >= 1 },
  { id: 'transmission', name: 'Signal Restored', desc: 'Fully decrypt a transmission.', check: (c) => (c.transmissionsComplete ?? 0) >= 1 },
  { id: 'thebombe', name: 'The Bombe', desc: 'Build the Bombe — an ode to Turing.', check: (c) => (c.bombeLevel ?? 0) >= 1 },
  { id: 'cryptanalyst', name: 'Cryptanalyst', desc: 'Solve every console cryptanalysis puzzle.', check: (c) => (c.puzzlesSolvedCount ?? 0) >= CRYPTANALYSIS_PUZZLE_COUNT },
  { id: 'mastercipher', name: 'The Longest Day', desc: 'Decrypt the entire history — 100% master cipher.', check: (c) => (c.masterFrac ?? 0) >= 1 },
  { id: 'longestday-read', name: 'The Longest Day, Read', desc: 'Decrypt every word — reach 100% master cipher.', check: (c) => (c.masterFrac ?? 0) >= 1 },
];

// ── SKIN unlocks — one achievement per non-common skin ──────────────────────
// Cosmetic enemy skins (skins.ts) used to share THREE tier gates (every Rare from `survivor`,
// every Epic from `gauntlet`, every Legendary from `regicide`). They are now broken out so each
// of the 57 non-common skins has its OWN unique achievement. Where a fitting general achievement
// already exists it is REUSED (it does double duty as that skin's gate); the rest are new, themed
// to the enemy that wears the skin. Per-enemy kill goals read the lifetime CODEX tally
// (save.killsByKind → AchCtx.lifeKillsByKind), so a veteran retroactively earns them on their next
// game over. Common skins stay free (no gate). This table is the single source of truth: skins.ts
// reads it via skinAchId(), and the new entries are folded into ACHIEVEMENTS below.

type SkinTier = 'rare' | 'epic' | 'legendary';
const SKIN_TIERS: SkinTier[] = ['rare', 'epic', 'legendary'];

/** Either reuse an existing achievement as this skin's gate, or define a brand-new one. A `kill`
 *  tag marks a LIFETIME per-kind kill gate (so the picker can show live "have / need" progress —
 *  per-run feats and reused gates have no accumulating progress and omit it). */
type SkinGate =
  | { reuse: string }
  | { id: string; name: string; desc: string; check: (c: AchCtx) => boolean; kill?: { kind: string; need: number } };
interface SkinAchEntry {
  kind: EnemyKind;
  tier: SkinTier;
  gate: SkinGate;
}

/** A rare/epic/legendary ladder of "defeat N of this enemy" (lifetime). The enemy's own
 *  colours, earned by mastering it. `singular` titles the trophy; `plural` reads in the desc. */
function killLadder(kind: EnemyKind, singular: string, plural: string, counts: [number, number, number]): SkinAchEntry[] {
  const titles = [`${singular} Hunter`, `${singular} Bane`, `${singular} Nemesis`];
  return SKIN_TIERS.map((tier, i) => ({
    kind,
    tier,
    gate: {
      id: `skin-${kind}-${tier}`,
      name: titles[i],
      desc: `Defeat ${counts[i].toLocaleString()} ${plural}.`,
      check: (c: AchCtx) => (c.lifeKillsByKind[kind] ?? 0) >= counts[i],
      kill: { kind, need: counts[i] },
    },
  }));
}

/** A boss skin ladder — defeat that boss N times (lifetime). Boss kills are precious, so the
 *  counts are small; the first felling already earns the Rare. */
function bossLadder(kind: EnemyKind, display: string, short: string, counts: [number, number, number]): SkinAchEntry[] {
  const titles = [`${short} Slain`, `${short} Vanquisher`, `${short} Conqueror`];
  return SKIN_TIERS.map((tier, i) => ({
    kind,
    tier,
    gate: {
      id: `skin-${kind}-${tier}`,
      name: titles[i],
      desc: counts[i] <= 1 ? `Defeat ${display}.` : `Defeat ${display} ${counts[i]} times.`,
      check: (c: AchCtx) => (c.lifeKillsByKind[kind] ?? 0) >= counts[i],
      kill: { kind, need: counts[i] },
    },
  }));
}

const SKIN_ACH_ENTRIES: SkinAchEntry[] = [
  // DARTER — the RUSHER you dash through: a dash-chain ladder (reuses the Shish Kebab feat).
  { kind: 'darter', tier: 'rare', gate: { reuse: 'skewer' } },
  { kind: 'darter', tier: 'epic', gate: { id: 'skin-darter-epic', name: 'Impaler', desc: 'Spear 8 enemies in a single dash.', check: (c) => c.maxDashChain >= 8 } },
  { kind: 'darter', tier: 'legendary', gate: { id: 'skin-darter-legendary', name: 'The Long Lance', desc: 'Spear 10 enemies in a single dash.', check: (c) => c.maxDashChain >= 10 } },
  // ORBITER — the ZONER: a graze ladder (reuses Living Dangerously).
  { kind: 'orbiter', tier: 'rare', gate: { id: 'skin-orbiter-rare', name: 'Brush With Death', desc: 'Graze 30 bullets in a single run.', check: (c) => c.grazes >= 30 } },
  { kind: 'orbiter', tier: 'epic', gate: { reuse: 'grazer' } },
  { kind: 'orbiter', tier: 'legendary', gate: { id: 'skin-orbiter-legendary', name: 'Eye of the Storm', desc: 'Graze 120 bullets in a single run.', check: (c) => c.grazes >= 120 } },
  // MINI — the SWARM: a single-run body-count ladder (reuses Centurion).
  { kind: 'mini', tier: 'rare', gate: { id: 'skin-mini-rare', name: 'Swarm Cleaner', desc: 'Get 60 kills in a single run.', check: (c) => c.kills >= 60 } },
  { kind: 'mini', tier: 'epic', gate: { reuse: 'centurion' } },
  { kind: 'mini', tier: 'legendary', gate: { id: 'skin-mini-legendary', name: 'Extermination', desc: 'Get 175 kills in a single run.', check: (c) => c.kills >= 175 } },
  // SOVEREIGN — the marquee: reuse the three existing Sovereign feats (the perfect fits).
  { kind: 'sovereign', tier: 'rare', gate: { reuse: 'regicide' } },
  { kind: 'sovereign', tier: 'epic', gate: { reuse: 'coronation' } },
  { kind: 'sovereign', tier: 'legendary', gate: { reuse: 'flawlesskey' } },
  // ── per-enemy kill ladders (the rest) — wear an enemy's colours by mastering it ──
  ...killLadder('lancer', 'Lancer', 'Lancers', [25, 110, 450]),
  ...killLadder('seeker', 'Seeker', 'Seekers', [25, 110, 450]),
  ...killLadder('splitter', 'Splitter', 'Splitters', [25, 110, 450]),
  ...killLadder('bloomer', 'Bloomer', 'Bloomers', [25, 110, 450]),
  ...killLadder('bomber', 'Bomber', 'Bombers', [12, 55, 220]),
  ...killLadder('wisp', 'Wisp', 'Wisps', [40, 180, 700]),
  ...killLadder('drifter', 'Drifter', 'Drifters', [40, 180, 700]),
  ...killLadder('shade', 'Shade', 'Shades', [12, 55, 220]),
  ...killLadder('brooder', 'Brooder', 'Brooders', [12, 55, 220]),
  ...killLadder('herald', 'Herald', 'Heralds', [12, 55, 220]),
  // ── boss skin ladders — fell the boss enough to wear its regalia ──
  ...bossLadder('warden', 'THE WARDEN', 'Warden', [1, 4, 12]),
  ...bossLadder('weaver', 'THE WEAVER', 'Weaver', [1, 4, 12]),
  ...bossLadder('beacon', 'THE BEACON', 'Beacon', [1, 4, 12]),
  ...bossLadder('mirrorblade', 'THE MIRRORBLADE', 'Mirrorblade', [1, 4, 12]),
  ...bossLadder('hollow', 'THE HOLLOW', 'Hollow', [1, 4, 12]),
];

/** The NEW skin achievements (the non-reuse gates), tagged as the 'skin' category. */
const SKIN_ACHIEVEMENTS: Achievement[] = SKIN_ACH_ENTRIES.flatMap((e) =>
  'id' in e.gate ? [{ id: e.gate.id, name: e.gate.name, desc: e.gate.desc, check: e.gate.check, category: 'skin' as const }] : [],
);

export const ACHIEVEMENTS: Achievement[] = [...BASE_ACHIEVEMENTS, ...SKIN_ACHIEVEMENTS];

const SKIN_ACH_BY_KEY = new Map<string, string>();
for (const e of SKIN_ACH_ENTRIES) {
  SKIN_ACH_BY_KEY.set(`${e.kind}:${e.tier}`, 'reuse' in e.gate ? e.gate.reuse : e.gate.id);
}

/** The achievement id that gates a given skin (kind + rarity), or null for the free Common.
 *  The single source of truth shared with skins.ts so a skin's gate and the achievement that
 *  satisfies it can never drift apart. */
export function skinAchId(kind: string, rarity: string): string | null {
  if (rarity === 'common') return null;
  return SKIN_ACH_BY_KEY.get(`${kind}:${rarity}`) ?? null;
}

const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
/** Look up an achievement by id (for the skin picker's per-skin unlock hint). */
export function achievementById(id: string): Achievement | undefined {
  return ACH_BY_ID.get(id);
}

// gates whose progress accumulates over a lifetime (per-enemy / per-boss kill counts) — the
// only ones a "have / need" readout is meaningful for. Per-run feats (dash/graze/single-run
// kills) and reused event achievements are absent, so skinKillProgress returns null for them.
const KILL_GATE = new Map<string, { kind: string; need: number }>();
for (const e of SKIN_ACH_ENTRIES) {
  if ('id' in e.gate && e.gate.kill) KILL_GATE.set(e.gate.id, e.gate.kill);
}

/** Live progress toward a LIFETIME kill-gated skin, from the player's CODEX tally. Returns
 *  { have, need } for per-enemy / per-boss kill gates, or null for gates that don't accumulate
 *  (per-run feats, reused event achievements) — those have no meaningful running count. */
export function skinKillProgress(achId: string, killsByKind: Record<string, number>): { have: number; need: number } | null {
  const g = KILL_GATE.get(achId);
  if (!g) return null;
  return { have: Math.max(0, Math.floor(killsByKind?.[g.kind] ?? 0)), need: g.need };
}

/** Returns the achievements newly satisfied by this context (not already in `unlocked`). */
export function evaluate(unlocked: string[], c: AchCtx): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.check(c));
}
