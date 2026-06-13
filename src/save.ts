// localStorage persistence: high scores, settings, tutorial flag, daily best.
// Everything is client-side — the shareable score string is the zero-backend
// "leaderboard".

import { dateString } from './rng';
import { SAVE_VERSION, migrateSave } from './migrate';
import type { SoundtrackId } from './soundtracks';

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
  /** unlocked betrayer dossier ids (== boss EnemyKind) */
  stillpointDossiers: string[];
  /** THE CHOICE on a Sovereign kill: catch the star, let it fall, or not yet made */
  stillpointChoice: 'catch' | 'fall' | 'none';
  /** highest NG+ loop reached */
  ngPlusLevel: number;
  /** NG+ queued for the next run */
  ngPlusActive: boolean;
  /** killer-kind → death count (the hub's nemesis read; JSON-safe like meta) */
  nemesis: Record<string, number>;
  /** deepest descent (wave) reached — the hub run-state line */
  deepestWave: number;
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
    stillpointDossiers: [],
    stillpointChoice: 'none',
    ngPlusLevel: 0,
    ngPlusActive: false,
    nemesis: {},
    deepestWave: 0,
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

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    return { ...defaultSettings(), ...JSON.parse(raw) };
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
  const head = daily ? `THE LAST LANCE · Echo of the Fall ${dateString()}` : 'THE LAST LANCE';
  const buildPart = build ? ` · ${build}` : '';
  return `${head} — held the light for ${score.toLocaleString()} · x${combo} combo · descent ${wave}${buildPart}. How much can you hold? lancefall.pages.dev`;
}
