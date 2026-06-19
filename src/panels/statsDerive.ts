// Pure derivations for the STATS dossier — no DOM, fully unit-tested. The DOM layer (stats.ts)
// and the share card (statsShare.ts) both consume these, so the maths lives in one tested place.
import type { SaveData, RunRecord, LastRunDetail } from '../save';
import { dateString } from '../rng';
import { modeById } from '../modes';

// per-mode bar accents — mirrors ui.ts RAIL_ACCENTS / stats.ts MODE_COLOR.
const MODE_COLOR: Record<string, string> = {
  casual: '#34d399', endless: '#22d3ee', arena: '#22d3ee', bossrush: '#fb923c',
  daily: '#fbbf24', weekly: '#f59e0b', nightmare: '#f87171', longestday: '#c084fc',
};

export interface RadarAxis { name: string; value: number; rating: number; norm: number; }

// [label, per-run value fn, reference cap, archetype-if-dominant]
const AXES: [string, (s: SaveData) => number, number, string][] = [
  ['Aggression', (s) => s.lifeKills / Math.max(1, s.totalRuns), 90, 'THE EXECUTIONER'],
  ['Survival', (s) => (s.lifeWins / Math.max(1, s.totalRuns)) * 100, 60, 'THE SURVIVOR'],
  ['Precision', (s) => s.lifeGrazes / Math.max(1, s.totalRuns), 70, 'THE DANCER'],
  ['Power', (s) => s.lifeDaybreaks / Math.max(1, s.totalRuns), 10, 'THE STORM'],
  ['Clutch', (s) => s.lifeLastBreath / Math.max(1, s.totalRuns), 3, 'THE DAREDEVIL'],
  ['Depth', (s) => s.deepestWave, 30, 'THE DELVER'],
];

/** Six playstyle axes. `rating` is value/cap clamped 0..1; `norm` rescales so the dominant
 *  axis reaches the rim (self-relative — the radar reads as a SHAPE / lean, always full-ish). */
export function radarAxes(s: SaveData): RadarAxis[] {
  const raw = AXES.map(([name, fn, cap]) => ({ name, value: Math.round(fn(s) * 10) / 10, rating: Math.min(1, fn(s) / cap) }));
  const maxR = Math.max(...raw.map((a) => a.rating), 0.0001);
  return raw.map((a) => ({ ...a, norm: Math.max(0.04, a.rating / maxR) }));
}

/** Name the player's lean from the dominant axis; the newcomer label under 5 runs. */
export function archetypeName(s: SaveData): string {
  if (s.totalRuns < 5) return 'FINDING YOUR LANCE';
  let best = AXES[0], bestR = -1;
  for (const ax of AXES) {
    const r = Math.min(1, ax[1](s) / ax[2]);
    if (r > bestR) { bestR = r; best = ax; }
  }
  return best[3];
}

/** "You're improving" beat: last-10 avg vs first-10 avg of the window, as a %. null if <10 runs. */
export function trendDeltaPct(runs: RunRecord[]): number | null {
  if (runs.length < 10) return null;
  const avg = (a: RunRecord[]) => a.reduce((t, r) => t + r.score, 0) / a.length;
  const first = avg(runs.slice(0, 10)), last = avg(runs.slice(-10));
  if (first <= 0) return null;
  return Math.round(((last - first) / first) * 100);
}

/** One soulful headline in the narrator's voice. */
export function narratorLine(s: SaveData): string {
  if (s.totalRuns < 5) return 'The City is just beginning to remember you.';
  const hrs = Math.floor(s.lifeTimeSec / 3600);
  if (hrs >= 1) return `You've held the light for ${hrs} hour${hrs === 1 ? '' : 's'} across ${s.totalRuns} descents.`;
  return `${s.totalRuns} descents into the City, and counting.`;
}

/** Whole seconds → "14h 22m" / "12m" / "0m". */
export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h >= 1 ? `${h}h ${m}m` : `${m}m`;
}

export interface HeatDay { date: string; count: number; }
/** The last `days` calendar days ending today (oldest first), each with its run count. */
export function heatmapWindow(playDays: Record<string, number>, now: Date, days = 182): HeatDay[] {
  const out: HeatDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = dateString(d);
    out.push({ date: key, count: playDays[key] ?? 0 });
  }
  return out;
}

export interface ModeStat { id: string; name: string; color: string; plays: number; winPct: number; best: number; }
/** Per-mode plays / win-rate / best score, real-mode-id filtered, sorted by plays desc. */
export function modeStats(s: SaveData): ModeStat[] {
  const ids = new Set<string>([...Object.keys(s.runsByMode), ...Object.keys(s.bestByMode)]);
  const out: ModeStat[] = [];
  for (const id of ids) {
    if (modeById(id).id !== id) continue; // real modes only (modeById falls back otherwise)
    const plays = s.runsByMode[id] ?? 0;
    out.push({
      id, name: modeById(id).name, color: MODE_COLOR[id] ?? '#22d3ee', plays,
      winPct: plays > 0 ? Math.round(((s.winsByMode[id] ?? 0) / plays) * 100) : 0,
      best: s.bestByMode[id] ?? 0,
    });
  }
  return out.sort((a, b) => b.plays - a.plays);
}

/** The player's most-recent completed run in `modeId`, or null if they've never finished one.
 *  Defensive against a malformed stored entry (missing mode). */
export function lastRunForMode(s: SaveData, modeId: string): LastRunDetail | null {
  return s.lastRuns.find((r) => r && typeof r === 'object' && r.mode === modeId) ?? null;
}

/** Sort a {label: count} breakdown (kills / damage) into [label, count] pairs, desc by count.
 *  Drops non-positive / non-finite counts so a garbage entry never renders. Pure. */
export function breakdownEntries(rec: Record<string, number> | undefined): [string, number][] {
  if (!rec || typeof rec !== 'object') return [];
  return (Object.entries(rec) as [string, number][])
    .filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n > 0)
    .sort((a, b) => b[1] - a[1]);
}

/** A YYYY-MM-DD date → a terse relative stamp vs `now` ("today" / "yesterday" / "5d ago" / "3w ago"). */
export function fmtAgo(date: string, now: Date): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return '';
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - then.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
