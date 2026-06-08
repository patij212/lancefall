// localStorage persistence: high scores, settings, tutorial flag, daily best.
// Everything is client-side — the shareable score string is the zero-backend
// "leaderboard".

import { dateString } from './rng';

const SAVE_KEY = 'lancefall.v1';
const SETTINGS_KEY = 'lancefall.settings.v1';

export interface SaveData {
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
  hudScale: number; // 0.8..1.4
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
    hudScale: 1,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return { ...defaultSave(), ...JSON.parse(raw) };
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
): string {
  const head = daily ? `LANCEFALL Daily ${dateString()}` : 'LANCEFALL';
  return `${head} — ${score.toLocaleString()} pts · x${combo} combo · wave ${wave}. Can you thread the swarm?`;
}
