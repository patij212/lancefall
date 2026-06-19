// localStorage persistence: high scores, settings, tutorial flag, daily best.
// Everything is client-side — the shareable score string is the zero-backend
// "leaderboard".

import { dateString } from './rng';
import { SAVE_VERSION, migrateSave } from './migrate';
import { TUNE } from './tune';
import type { SoundtrackId } from './soundtracks';
import { defaultKeyBindings, type KeyBindings } from './input';
import { PORTED_KINDS, defaultSkinId } from './skins';

const SAVE_KEY = 'lancefall.save';
const LEGACY_SAVE_KEY = 'lancefall.v1'; // pre-versioning key — read once, migrated forward
const SETTINGS_KEY = 'lancefall.settings.v1';

/** One completed (non-challenge) run, kept in a bounded ring for the STATS dossier graphs. */
export interface RunRecord {
  score: number;
  wave: number;
  mode: string;
  won: boolean;
  /** run duration, whole seconds */
  sec: number;
  heat: number;
  combo: number;
  /** YYYY-MM-DD (local), matches dateString() */
  date: string;
}

/** A RunRecord enriched with the per-mode LAST RUN debrief breakdowns (cockpit). Kept distinct
 *  from the lean RunRecord so the 50-entry runHistory stays small. */
export interface LastRunDetail extends RunRecord {
  /** per-EnemyKind kills this run */
  kills: Record<string, number>;
  /** would-be-fatal hits taken, by source (EnemyKind / 'a bullet' / 'a boss bullet' bucket) */
  damage: Record<string, number>;
  /** the killing blow's kind or cause text; '' when the run was won */
  killedBy: string;
  bosses: number;
  grazes: number;
  daybreaks: number;
  lastBreath: number;
  hitsTaken: number;
  powerups: number;
}

export interface SaveData {
  /** save schema version (see migrate.ts) */
  version: number;
  highScore: number;
  bestCombo: number;
  bestWave: number;
  seenTutorial: boolean;
  totalRuns: number;
  dailySeed: number;
  dailyBest: number;
  /** spendable shard balance accumulated across runs */
  shards: number;
  /** ship ids the player has unlocked */
  unlockedShips: string[];
  /** currently-selected ship id */
  selectedShip: string;
  /** cosmetic theme ids the player has unlocked */
  unlockedThemes: string[];
  /** currently-selected theme id */
  selectedTheme: string;
  /** cosmetic dash-trail ids the player has unlocked */
  unlockedTrails: string[];
  /** currently-selected dash-trail id */
  selectedTrail: string;
  /** ship-skins the player OWNS, keyed `${shipId}:${setId}` — each ship's copy of a skin is
   *  bought / unlocked individually (NOT a set-wide bundle). 'none' (the plain hull) is implicit
   *  for any owned ship and is never stored here. */
  unlockedShipSkins: string[];
  /** equipped skin set PER SHIP (shipId → setId; missing / 'none' = the plain hull). The flown
   *  ship's value is what render.ts wears; the loadout preview shows the selected ship's. */
  selectedShipSkins: Record<string, string>;
  /** cosmetic enemy-skin selection per kind (EnemyKind → skinId). Unlocks derive
   *  from `achievements` (no separate unlockedSkins field — like dash trails);
   *  an unknown / locked id is coerced back to the kind's default by the sanitizer. */
  selectedSkins: Record<string, string>;
  /** lifetime totals */
  lifeKills: number;
  lifeBoss: number;
  lifeShards: number;
  /** lifetime WON runs (win rate = lifeWins / totalRuns; the STATS hero stat) */
  lifeWins: number;
  /** lifetime bullets grazed (STATS COMBAT cell) — v7 */
  lifeGrazes: number;
  /** lifetime DAYBREAK (overdrive) fires (STATS COMBAT cell) — v7 */
  lifeDaybreaks: number;
  /** lifetime LAST BREATH clutch saves (STATS COMBAT cell) — v7 */
  lifeLastBreath: number;
  /** unlocked achievement ids */
  achievements: string[];
  /** permanent meta-upgrade levels (node id → level) */
  meta: Record<string, number>;
  /** mutator ids active on the most recently played Daily (for title/debrief display) */
  dailyMutators: string[];
  /** selected Heat ascension level (0..MAX_HEAT) */
  selectedHeat: number;
  /** highest Heat level ever played */
  maxHeat: number;
  /** selected build archetype id (draft bias); 'none' = freestyle */
  selectedArchetype: string;
  /** player handle for online leaderboards ('' = anonymous / not set) */
  handle: string;
  // ── THE STILLPOINT (v5) — the meta-layer. All additive; the only writes are
  //    plain assignments/array-pushes, never an rng method (determinism-safe). ──
  /** collected Memory Fragment ids (set; never a Set — JSON-safe) */
  stillpointFragments: string[];
  /** count spent on lore/dossiers (available = length - spent) */
  fragmentsSpent: number;
  /** unlocked lore entry ids */
  stillpointLore: string[];
  /** THE CHOICE on a Sovereign kill: hold the light (catch), let it go (fall), or not yet made */
  stillpointChoice: 'catch' | 'fall' | 'none';
  /** highest NG+ loop reached */
  ngPlusLevel: number;
  /** NG+ queued for the next run */
  ngPlusActive: boolean;
  /** killer-kind → death count (the hub's nemesis read; JSON-safe like meta) */
  nemesis: Record<string, number>;
  /** best run SCORE per mode id (personal record; the STATS "best by mode" chart). A
   *  {string:number} record like meta/nemesis → the migrate loop coerces it value-by-value. */
  bestByMode: Record<string, number>;
  /** lifetime kills per EnemyKind (the CODEX "N ✕" counts + boss "vanquished" read).
   *  A {string:number} record like nemesis/bestByMode → coerced value-by-value on migrate. */
  killsByKind: Record<string, number>;
  /** deepest descent (wave) reached — the hub run-state line */
  deepestWave: number;
  // ── v6 "THE FULL PASS" — reserved by the single 5→6 bump. All additive;
  //    consumption logic lands in later v6 phases (none write rng). ──
  /** active game mode id; endless is the default loop */
  selectedMode: string;
  /** daily-challenge attempts used on dailyAttemptDate */
  dailyAttempts: number;
  /** date-string the dailyAttempts counter applies to; empty = never played */
  dailyAttemptDate: string;
  /** survivability: hits absorbed before death; 0 = one-hit model */
  baseShields: number;
  /** show the City-of-Lancefall memory meter (cosmetic/coherence toggle) */
  cityMemoryMeter: boolean;
  /** count of early runs that still get the dash-on-the-beat hint */
  firstRunsBeatHint: number;
  // ── 4.2 DAILY STREAK — a cheap retention hook. Pure date math on run end; never
  //    touches sim/seed/scoring. lastPlayedDate is a YYYY-MM-DD dateString() ('' = never). ──
  /** YYYY-MM-DD of the last run played (local time); '' = never played */
  lastPlayedDate: string;
  /** consecutive-day play streak (1 on first play; +1 each next calendar day; reset on a gap) */
  playStreak: number;
  /** PERFECT_10_SPEC §1.2 — the no-fail DASH SANDBOX onboarding has been shown (or
   *  skipped) once; gates it to first-run-only so it never repeats. Default false. */
  seenSandbox: boolean;
  /** PERFECT_10_SPEC §1.7 — ids of first-appearance jargon glosses already shown once
   *  (graze / overdrive / armor / coherence / fusion). Sanitized to known GlossId
   *  strings; an unknown id is dropped. Default []. */
  glossSeen: string[];
  // ── v7 RECORDS — peak single-run bests for the STATS dossier. Additive; written only at
  //    run-end via max/min. 0 = never set (rendered as "—" / "OFF"). ──
  /** longest single run, whole seconds (STATS "Longest Run") */
  longestRunSec: number;
  /** fastest ARENA clear, whole seconds; 0 = no arena clear yet (STATS "Fastest Arena") */
  fastestArenaSec: number;
  /** most bosses felled in one run (STATS "Bosses · One Run") */
  mostBossesOneRun: number;
  // ── v9 DOSSIER — bounded run history + lifetime activity for the STATS graphs.
  //    Additive; written only at run-end via push/assign (never rng). ──
  /** last 50 completed runs (newest last) — the score-trend chart + recent list */
  runHistory: RunRecord[];
  /** YYYY-MM-DD → runs that day (the activity heatmap); capped to recent keys on migrate */
  playDays: Record<string, number>;
  /** total seconds played across all runs ("time in the City") */
  lifeTimeSec: number;
  /** mode id → runs played (per-mode plays) */
  runsByMode: Record<string, number>;
  /** mode id → runs won (per-mode win rate = winsByMode / runsByMode) */
  winsByMode: Record<string, number>;
  /** most-recent completed run PER MODE (one entry per mode id) — the cockpit "LAST RUN" debrief.
   *  Array (not a map) so the migrate generic loop preserves it as-is. */
  lastRuns: LastRunDetail[];
}

export interface Settings {
  master: number; // 0..1
  sfx: number;
  music: number;
  shake: number; // 0..1.5
  reduceFlashing: boolean;
  reduceMotion: boolean;
  particleDensity: 'low' | 'med' | 'high';
  colorblind: boolean;
  clarity: boolean; // high-contrast Clarity mode — tames the coherence visuals for readability
  rhythmAssist: boolean; // opt-in: the contracting beat-ring that teaches dash-on-the-beat
  dashStyle: 'lance' | 'slingshot'; // dash style — Lance (default) or the Slingshot Tether
  soundtrack: SoundtrackId; // selectable soundtrack: AURORA (dreamy) or SURGE (aggressive)
  hudScale: number; // 0.8..1.4
  chromAberration: number; // 0..1 scale on the chromatic-aberration effect (accessibility)
  rumble: boolean; // gamepad rumble on/off
  keymap: KeyBindings; // rebindable core actions (dash / overdrive / pause)
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The baseline enemy-skin map: every kind with a ported skin set mapped to its
 *  default (Common) skin. Un-ported kinds are simply absent (they always fall
 *  back to the committed biomech draw, so they need no save entry). Fresh map
 *  each call so callers never share a reference. */
export function defaultSelectedSkins(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PORTED_KINDS) out[k] = defaultSkinId(k);
  return out;
}

/** Canonical player-handle sanitizer — shared by the in-game setter (game.setHandle) and the
 *  live RANKS preview, and mirrored by the worker's sanitizeName. Allows word chars, space and
 *  hyphen; TRIMS BEFORE the 16-char cap so leading/trailing spaces can't eat real characters
 *  (playtest: "work on the anon player name"). Returns '' for blank/all-junk — the not-set /
 *  anonymous sentinel that drives the post-run name prompt (the worker substitutes 'ANON'). */
export function sanitizeHandle(raw: string): string {
  return raw.replace(/[^\w \-]/g, '').trim().slice(0, 16);
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    highScore: 0,
    bestCombo: 0,
    bestWave: 0,
    seenTutorial: false,
    totalRuns: 0,
    dailySeed: 0,
    dailyBest: 0,
    shards: 0,
    unlockedShips: ['lance'],
    selectedShip: 'lance',
    unlockedThemes: ['neon'],
    selectedTheme: 'neon',
    unlockedTrails: ['pulse'],
    selectedTrail: 'pulse',
    unlockedShipSkins: [],
    selectedShipSkins: {},
    selectedSkins: defaultSelectedSkins(),
    lifeKills: 0,
    lifeBoss: 0,
    lifeShards: 0,
    lifeWins: 0,
    lifeGrazes: 0,
    lifeDaybreaks: 0,
    lifeLastBreath: 0,
    achievements: [],
    meta: {},
    dailyMutators: [],
    selectedHeat: 0,
    maxHeat: 0,
    selectedArchetype: 'none',
    handle: '',
    stillpointFragments: [],
    fragmentsSpent: 0,
    stillpointLore: [],
    stillpointChoice: 'none',
    ngPlusLevel: 0,
    ngPlusActive: false,
    nemesis: {},
    bestByMode: {},
    killsByKind: {},
    deepestWave: 0,
    selectedMode: 'casual', // fresh saves start on the suggested first-run mode (gentle, off-board)
    dailyAttempts: 0,
    dailyAttemptDate: '',
    baseShields: TUNE.player.baseShields,
    cityMemoryMeter: true,
    firstRunsBeatHint: 0,
    lastPlayedDate: '',
    playStreak: 0,
    seenSandbox: false,
    glossSeen: [],
    longestRunSec: 0,
    fastestArenaSec: 0,
    mostBossesOneRun: 0,
    runHistory: [],
    playDays: {},
    lifeTimeSec: 0,
    runsByMode: {},
    winsByMode: {},
    lastRuns: [],
  };
}

export function defaultSettings(): Settings {
  return {
    master: 0.8,
    sfx: 0.9,
    music: 0.6,
    shake: 1,
    reduceFlashing: false,
    reduceMotion: prefersReducedMotion(),
    particleDensity: 'high',
    colorblind: false,
    clarity: false,
    rhythmAssist: false,
    dashStyle: 'lance',
    soundtrack: 'aurora',
    hudScale: 1,
    chromAberration: 1,
    rumble: true,
    keymap: defaultKeyBindings(),
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return migrateSave(JSON.parse(raw), defaultSave());
    // one-time migration from the pre-versioning key, then persist under the new key
    const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
    if (legacy) {
      const migrated = migrateSave(JSON.parse(legacy), defaultSave());
      saveSave(migrated);
      return migrated;
    }
    return defaultSave();
  } catch {
    return defaultSave();
  }
}

export function saveSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage disabled — ignore */
  }
}

/** Coerce a parsed settings blob field-by-field against the defaults (matching the rigor of
 *  migrateSave) so a corrupted/old/hand-edited blob can never inject a wrong-typed or
 *  out-of-range value into the live game. Pure + exported for tests. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, def: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def;
  // keymap: each action must be a non-empty array of strings (deduped, lowercased) or
  // it falls back to its default so an action can never end up permanently unbound.
  const keyList = (v: unknown, def: string[]): string[] => {
    if (!Array.isArray(v)) return def;
    const out = [...new Set(v.filter((k): k is string => typeof k === 'string' && k.length > 0).map((k) => k.toLowerCase()))];
    return out.length > 0 ? out : def;
  };
  const dk = defaultKeyBindings();
  const km = (r.keymap && typeof r.keymap === 'object' ? r.keymap : {}) as Record<string, unknown>;
  return {
    master: num(r.master, 0, 1, d.master),
    sfx: num(r.sfx, 0, 1, d.sfx),
    music: num(r.music, 0, 1, d.music),
    shake: num(r.shake, 0, 1.5, d.shake),
    reduceFlashing: bool(r.reduceFlashing, d.reduceFlashing),
    reduceMotion: bool(r.reduceMotion, d.reduceMotion),
    particleDensity: oneOf(r.particleDensity, ['low', 'med', 'high'] as const, d.particleDensity),
    colorblind: bool(r.colorblind, d.colorblind),
    clarity: bool(r.clarity, d.clarity),
    rhythmAssist: bool(r.rhythmAssist, d.rhythmAssist),
    dashStyle: oneOf(r.dashStyle, ['lance', 'slingshot'] as const, d.dashStyle),
    soundtrack: oneOf(r.soundtrack, ['aurora', 'surge'] as const, d.soundtrack),
    hudScale: num(r.hudScale, 0.8, 1.4, d.hudScale),
    chromAberration: num(r.chromAberration, 0, 1, d.chromAberration),
    rumble: bool(r.rumble, d.rumble),
    keymap: {
      dash: keyList(km.dash, dk.dash),
      overdrive: keyList(km.overdrive, dk.overdrive),
      pause: keyList(km.pause, dk.pause),
    },
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function particleDensityValue(d: Settings['particleDensity']): number {
  return d === 'low' ? 0.4 : d === 'med' ? 0.7 : 1;
}

// ── 4.2 DAILY STREAK transition (pure) ─────────────────────────────────────────
/** Day BEFORE a YYYY-MM-DD date string, as a YYYY-MM-DD string (local-time math,
 *  mirroring dateString()). Parses the canonical 'YYYY-MM-DD' shape; on anything
 *  unparseable returns '' (so it can never accidentally equal a real lastPlayedDate). */
function dayBefore(today: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1);
  return dateString(d);
}

/** Next play-streak value given the stored streak + last-played date and TODAY's
 *  date string. Rules: same day → unchanged; exactly yesterday → +1; any other gap
 *  (or first-ever play) → reset to 1. Pure; never touches the sim/seed/scoring. */
export function nextStreak(today: string, lastPlayedDate: string, playStreak: number): number {
  if (lastPlayedDate === today) return Math.max(1, playStreak); // already counted today
  if (lastPlayedDate && lastPlayedDate === dayBefore(today)) return Math.max(1, playStreak) + 1;
  return 1; // a gap (or never played) restarts the streak
}

export function buildShareString(
  score: number,
  combo: number,
  wave: number,
  daily: boolean,
  build = '',
): string {
  const head = daily ? `THE LAST KEY · Echo of the Fall ${dateString()}` : 'THE LAST KEY';
  const buildPart = build ? ` · ${build}` : '';
  return `${head} — held the light for ${score.toLocaleString()} · x${combo} combo · descent ${wave}${buildPart}. How much can you hold? lancefall.pages.dev`;
}
