// localStorage persistence: high scores, settings, tutorial flag, daily best.
// Everything is client-side — the shareable score string is the zero-backend
// "leaderboard".

import { dateString } from './rng';
import { SAVE_VERSION, migrateSave } from './migrate';
import { TUNE } from './tune';
import type { SoundtrackId } from './soundtracks';
import { defaultKeyBindings, type KeyBindings } from './input';

const SAVE_KEY = 'lancefall.save';
const LEGACY_SAVE_KEY = 'lancefall.v1'; // pre-versioning key — read once, migrated forward
const SETTINGS_KEY = 'lancefall.settings.v1';

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
  /** lifetime totals */
  lifeKills: number;
  lifeBoss: number;
  lifeShards: number;
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
    lifeKills: 0,
    lifeBoss: 0,
    lifeShards: 0,
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
    deepestWave: 0,
    selectedMode: 'endless',
    dailyAttempts: 0,
    dailyAttemptDate: '',
    baseShields: TUNE.player.baseShields,
    cityMemoryMeter: true,
    firstRunsBeatHint: 0,
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
