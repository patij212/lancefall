// Achievements — goals to chase, evaluated on game over against a snapshot of
// the run + lifetime totals. Pure: evaluate() returns the newly-unlocked ones.

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
  lifeRuns: number;
  lifeKills: number;
  lifeBoss: number;
  lifeShards: number;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (c: AchCtx) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
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
  { id: 'unleashed', name: 'Unleashed', desc: 'Fire DAYBREAK.', check: (c) => c.overdriveUses >= 1 },
  { id: 'overcharged', name: 'Overcharged', desc: 'Fire DAYBREAK 4 times in a single run.', check: (c) => c.overdriveUses >= 4 },
  { id: 'lastbreath', name: 'Cheating Death', desc: 'Survive a Last Breath bullet-time save.', check: (c) => c.lastBreathUses >= 1 },
  { id: 'powerplayer', name: 'Power Player', desc: 'Collect 5 power-ups in one run.', check: (c) => c.powerupsCollected >= 5 },
];

/** Returns the achievements newly satisfied by this context (not already in `unlocked`). */
export function evaluate(unlocked: string[], c: AchCtx): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.check(c));
}
