// ENDLESS milestones — a next-goal pull for the open-ended modes. Every Nth wave
// (TUNE.director.milestoneInterval) is a NAMED mini-gauntlet with an on-screen callout,
// so a long ENDLESS run always has a near horizon to chase ("reach THE LONG NIGHT").
//
// DETERMINISM: a milestone is a PURE FUNCTION OF THE WAVE COUNT — it draws ZERO rng
// (world.rng or otherwise) and holds no state, so it can never fork the seeded wave
// stream. It is display-only flavor: the callout text + accent, plus the milestone's
// 1-based ordinal (which a caller may surface as a "next milestone" goal). The named
// titles cycle through a fixed THE-FALL-themed table by ordinal, with the ordinal woven
// into the line so wave 35 and wave 65 (same title slot) still read distinctly.

import { TUNE } from './tune';

export interface Milestone {
  /** the wave this milestone lands on (1-based, time-driven wave number) */
  wave: number;
  /** 1-based milestone ordinal (wave 5 → 1, wave 10 → 2, …) */
  ordinal: number;
  /** the named title shown big on screen */
  title: string;
  /** the narrator sub-line beneath the title */
  line: string;
  /** accent color for the callout (a static fade — never strobes) */
  accent: string;
}

// THE FALL-themed milestone slots. Cycled by ordinal so the pull never runs dry on a
// marathon run. Order escalates in menace, then loops — the ordinal in the callout keeps
// each repeat legible (THE LONG NIGHT · II reads as deeper than · I).
const SLOTS: { title: string; line: string; accent: string }[] = [
  { title: 'THE GATHERING DARK', line: 'the chaff thickens — hold the line', accent: '#22d3ee' },
  { title: 'THE LONG NIGHT', line: 'no dawn yet — keep the light burning', accent: '#a78bfa' },
  { title: 'THE DEEPENING', line: 'the City sinks further — descend with it', accent: '#f472b6' },
  { title: 'THE RECKONING', line: 'they remember you now — make them regret it', accent: '#fb923c' },
  { title: 'THE LAST WATCH', line: 'beyond the maps — every wave is yours alone', accent: '#fde047' },
];

/** Roman numeral for a small positive integer (milestone ordinals stay small in practice;
 *  falls back to the plain number past the table so it is always defined + total). */
export function romanize(n: number): string {
  if (n < 1) return String(n);
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let rem = n;
  for (const [v, s] of table) {
    while (rem >= v) { out += s; rem -= v; }
  }
  return out;
}

/** Is this wave a milestone wave? Pure fn of the wave count + the tuned interval. The
 *  interval guards against a 0/negative tune misconfig so it can never divide-by-zero. */
export function isMilestoneWave(wave: number): boolean {
  const n = TUNE.director.milestoneInterval;
  return n >= 1 && wave >= n && wave % n === 0;
}

/** The milestone landing on this wave, or null if it isn't a milestone wave. PURE — the
 *  single source the game reads on a wave-change edge to fire the callout. Determinism-safe:
 *  no rng, no World, no DOM — just (wave, TUNE) → flavor. */
export function milestoneAt(wave: number): Milestone | null {
  if (!isMilestoneWave(wave)) return null;
  const n = TUNE.director.milestoneInterval;
  const ordinal = Math.floor(wave / n); // 1-based: wave n → 1, wave 2n → 2, …
  const slot = SLOTS[(ordinal - 1) % SLOTS.length];
  // Past the first lap the Roman tier disambiguates a recurring title slot.
  const lap = Math.floor((ordinal - 1) / SLOTS.length) + 1;
  const title = lap > 1 ? `${slot.title} · ${romanize(lap)}` : slot.title;
  return { wave, ordinal, title, line: slot.line, accent: slot.accent };
}

/** The wave number of the NEXT milestone strictly AFTER the given wave (for a "next goal"
 *  HUD nudge). Pure; total for any wave >= 0. */
export function nextMilestoneWave(wave: number): number {
  const n = TUNE.director.milestoneInterval;
  if (n < 1) return wave + 1;
  return (Math.floor(wave / n) + 1) * n;
}
