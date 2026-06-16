// src/dailyGoal.ts — THE LIVING DAILY (SOVEREIGN_VICTORY_SPEC §5.6/§6a). A small daily
// objective layered on Weekly's week-stable siege seed: a date-derived target the SAME for
// everyone that day, refreshing at UTC midnight. PURE — a function of the date string only,
// evaluated read-only over end-of-run stats. It NEVER touches world.rng or the week seed, so
// the siege stays bit-identical for all. (Carries the retired Daily's retention loop + story.)

export type DailyGoalType = 'sovereign' | 'bossKills' | 'wave' | 'combo' | 'graze' | 'dashChain' | 'score' | 'hitsUnder';

export interface DailyGoal {
  type: DailyGoalType;
  target: number; // the threshold (meaning depends on type; ignored for 'sovereign')
  label: string; // short title for the card/HUD
  desc: string; // one-line instruction
}

/** End-of-run snapshot the goal is checked against (read-only — never mutated here). */
export interface DailyGoalStats {
  sovereignDown: boolean;
  bossKills: number;
  wave: number;
  bestCombo: number;
  graze: number;
  maxDashChain: number;
  score: number;
  hitsTaken: number;
}

// The pool. Each entry derives its concrete target from a 0..1 roll so the difficulty varies
// day to day but stays fair. `sovereign` (down the Sovereign) is the marquee goal — rare,
// the others fill the rotation. Order is stable (the date hash indexes into it).
interface PoolEntry {
  type: DailyGoalType;
  target: (roll: number) => number;
  label: string;
  desc: (t: number) => string;
}

const POOL: PoolEntry[] = [
  { type: 'sovereign', target: () => 0, label: 'THE LONGEST DAY', desc: () => 'Down the Sovereign.' },
  { type: 'bossKills', target: (r) => 2 + Math.floor(r * 3), label: 'WARLORD', desc: (t) => `Down ${t} bosses in one run.` },
  { type: 'wave', target: (r) => 8 + Math.floor(r * 7), label: 'SURVIVOR', desc: (t) => `Reach wave ${t}.` },
  { type: 'combo', target: (r) => 25 + Math.floor(r * 30), label: 'ON A CHAIN', desc: (t) => `Hit a ×${t} combo.` },
  { type: 'graze', target: (r) => 40 + Math.floor(r * 60), label: 'CLOSE SHAVE', desc: (t) => `Graze ${t} bullets.` },
  { type: 'dashChain', target: (r) => 4 + Math.floor(r * 4), label: 'SKEWER', desc: (t) => `Spear ${t} enemies in one dash.` },
  { type: 'score', target: (r) => 120000 + Math.floor(r * 280000), label: 'HIGH ROLLER', desc: (t) => `Score ${t.toLocaleString()}.` },
  { type: 'hitsUnder', target: (r) => 1 + Math.floor(r * 2), label: 'UNTOUCHABLE', desc: (t) => `Reach wave 6 taking under ${t} hit${t === 1 ? '' : 's'}.` },
];

/** Stable 32-bit hash of a YYYY-MM-DD date string — pure, no rng. Same date → same number
 *  for every player (the daily seed for the goal; never the week siege seed). */
export function dailyGoalSeed(date: string): number {
  let h = 0x811c9dc5 >>> 0; // FNV-1a basis
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // extra avalanche so the low bits (which pick the pool entry) are well-mixed
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return h >>> 0;
}

/** The objective for a given UTC date (YYYY-MM-DD). Pure + deterministic-for-all. */
export function dailyGoalForDate(date: string): DailyGoal {
  const seed = dailyGoalSeed(date);
  const entry = POOL[seed % POOL.length];
  const roll = ((seed >>> 8) & 0xffff) / 0xffff; // a stable 0..1 for the target
  const target = entry.target(roll);
  return { type: entry.type, target, label: entry.label, desc: entry.desc(target) };
}

/** Did this run satisfy the goal? Pure read over the end-of-run snapshot. */
export function dailyGoalMet(goal: DailyGoal, s: DailyGoalStats): boolean {
  switch (goal.type) {
    case 'sovereign': return s.sovereignDown;
    case 'bossKills': return s.bossKills >= goal.target;
    case 'wave': return s.wave >= goal.target;
    case 'combo': return s.bestCombo >= goal.target;
    case 'graze': return s.graze >= goal.target;
    case 'dashChain': return s.maxDashChain >= goal.target;
    case 'score': return s.score >= goal.target;
    case 'hitsUnder': return s.wave >= 6 && s.hitsTaken < goal.target;
    default: return false;
  }
}

/** Update the daily-goal streak. Pure: returns the new streak + whether a NEW completion landed
 *  today. Completing on a consecutive UTC day extends the streak; a gap resets it to 1; a repeat
 *  completion on the same day is idempotent (no double-count). `met` already folds dailyGoalMet. */
export function updateDailyStreak(
  today: string,
  lastDate: string,
  streak: number,
  met: boolean,
): { streak: number; lastDate: string; newlyCompleted: boolean } {
  if (!met || lastDate === today) return { streak, lastDate, newlyCompleted: false }; // not met, or already counted today
  const consecutive = isPrevUtcDay(lastDate, today);
  return { streak: consecutive ? streak + 1 : 1, lastDate: today, newlyCompleted: true };
}

/** Is `prev` exactly the UTC day before `today`? (Both YYYY-MM-DD.) Pure. */
function isPrevUtcDay(prev: string, today: string): boolean {
  const p = Date.parse(prev + 'T00:00:00Z');
  const t = Date.parse(today + 'T00:00:00Z');
  if (!Number.isFinite(p) || !Number.isFinite(t)) return false;
  return t - p === 86_400_000;
}
