// DOM overlay UI: title/attract, HUD, pause, game-over, perk draft, settings.
// One canvas always renders behind. HUD updates mutate cached refs only (no
// innerHTML churn) so the 60fps loop stays clean.

import type { World } from './world';
import type { Settings, SaveData } from './save';
import { defaultKeyBindings } from './input';
import { PERKS } from './perks';
import type { PerkDef } from './perks';
import { isEvolution, isRelic, EVOLUTIONS } from './evolutions';
import { RELICS } from './relics';
import { decodeBuildDna } from './buildDna';
import type { BuildDna } from './buildDna';
import type { DraftCard, EvolutionDef } from './evolutions';
import type { EventChoice } from './events';
import { HEAT_LEVELS, MAX_HEAT } from './heat';
import { ARCHETYPES, archetypeById } from './archetypes';
import { leaderboardEnabled, fetchLeaderboard } from './api';
import { comboColor } from './render';
import { TRACKS, type SoundtrackId } from './soundtracks';
import { SHIPS, shipById } from './ships';
import { drawShipSilhouette } from './shipModels';
import { THEMES } from './themes';
import { TRAILS } from './trails';
import { ACHIEVEMENTS } from './achievements';
import { META_NODES, nodeCost } from './meta';
import {
  modeById,
  modeBrief,
  modeRanked,
  modeSeeded,
  modeUnlocked,
  nextRailMode,
  rollDailyAttempt,
  RAIL_MODE_IDS,
  MAX_DAILY_ATTEMPTS,
} from './modes';
import { dailyMutatorPreview, weeklyMutatorPreview } from './mutators';
import { cityMemoryFill } from './renderMath';
import { POWERUPS } from './powerups';
import { BESTIARY, CODEX_CATEGORIES } from './bestiary';
import { audioCredits } from './audioManifest';
import { LORE, fragmentBalance, loreUnlocked } from './lore';
import { decodeView } from './cipherDecode';
import {
  type ShareGif,
  canCopyImage,
  canShareFile,
  copyImageToClipboard,
  shareImageFile,
  downloadGif,
} from './replay';
import type { RunConfig } from './modes';
import { dateString, seedFromDate, seedFromWeek } from './rng';
import { TUNE } from './tune';

export interface UICallbacks {
  onStart: (cfg: RunConfig) => void;
  onRestart: () => void;
  onResume: () => void;
  onPause: () => void;
  onQuit: () => void;
  onPick: (index: number) => void;
  onPickEvent: (index: number) => void;
  onCopyScore: () => void;
  onCopyBuildDna: () => void;
  onChoice: (c: 'catch' | 'fall') => void;
  onSaveReplay: () => void;
  onSettingsChange: (s: Settings) => void;
  onSelectShip: (id: string) => void;
  onUnlockShip: (id: string) => void;
  onSelectTheme: (id: string) => void;
  onUnlockTheme: (id: string) => void;
  onSelectTrail: (id: string) => void;
  onUnlockTrail: (id: string) => void;
  onBuyMeta: (id: string) => void;
  onUnlockLore: (id: string) => void;
  onToggleNgPlus: () => void;
  onCreateChallenge: () => void;
  onAcceptChallenge: (code: string) => void;
  /** 4.1 — launch the pinned CHALLENGE-THE-DEV seed (races the author ghost if one is bundled) */
  onChallengeDev: () => void;
  onHeatChange: (level: number) => void;
  onArchetypeChange: (id: string) => void;
  onSelectMode: (id: string) => void;
  onToggleCityMemory: (v: boolean) => void;
  onSetHandle: (name: string) => void;
  /** §1.2 — the player SKIPped the no-fail DASH SANDBOX (button / any-key) → start the run now */
  onSkipSandbox: () => void;
}

export interface GameOverInfo {
  score: number;
  /** first Sovereign kill → present THE CHOICE (hold the light / let it go) */
  choicePending?: boolean;
  /** a shareable replay clip exists → show the SAVE REPLAY button */
  canReplay?: boolean;
  combo: number;
  wave: number;
  time: number;
  newBest: boolean;
  daily: boolean;
  highScore: number;
  shardsEarned: number;
  dailyBest: number;
  ship: string;
  perks: string;
  won: boolean;
  mode: string;
  deathCause: string;
  nemesis: string; // "THE HOLLOW ×4" — the boss you fall to most (≥2), '' if none
  pbDelta: number;
  newAchievements: string[];
  mutators: { name: string; accent: string }[];
  clearTime?: number; // §4 M3 — set on a winnable-mode victory (cleartime scoring)
  hitsTaken?: number; // §4 M3 — would-be-fatal hits this run (0 = flawless)
  dailyAttempt?: number; // §4 M4 — which best-of-3 daily attempt this run was (1..3)
  dailyAttemptsMax?: number;
}

type ScreenId = 'title' | 'playing' | 'paused' | 'gameover' | 'draft' | 'event';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

/** Build an element from a raw inline-SVG (or any) markup string. Used for the cockpit's
 *  decorative mode/nav icons (lifted verbatim from the mock) so we don't re-author every
 *  path by hand. The markup is author-controlled (never user input), so innerHTML is safe. */
function iconEl(cls: string, markup: string): HTMLElement {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = markup;
  return span;
}

// ── Cockpit static art (verbatim from mock-v6) ─────────────────────────────────
// All `currentColor` so each rail icon picks up its card's accent for free.
const LOGO_SVG = `<svg viewBox="0 0 58 58" fill="none" aria-hidden="true">
  <circle cx="29" cy="29" r="27" stroke="#22d3ee" stroke-width="1.2" opacity="0.55"/>
  <circle cx="29" cy="29" r="20" stroke="#818cf8" stroke-width="0.7" opacity="0.35"/>
  <line x1="29" y1="5" x2="29" y2="53" stroke="#22d3ee" stroke-width="0.8" opacity="0.3"/>
  <line x1="5" y1="29" x2="53" y2="29" stroke="#22d3ee" stroke-width="0.8" opacity="0.3"/>
  <circle cx="29" cy="29" r="4.5" fill="none" stroke="#22d3ee" stroke-width="1.4"/>
  <path d="M29 7 L32.5 23 L29 25.5 L25.5 23 Z" fill="#22d3ee" opacity="0.92"/>
  <path d="M29 51 L26.5 37 L29 34.5 L31.5 37 Z" fill="#818cf8" opacity="0.45"/>
  <circle cx="29" cy="29" r="2.5" fill="#22d3ee"/>
</svg>`;

const COH_CITY_SVG = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
  <rect x="2" y="10" width="4" height="7"/><rect x="7" y="6" width="4" height="11"/><rect x="12" y="8" width="4" height="9"/>
</svg>`;

// Rail-mode icons, keyed by RunConfig id. currentColor → inherits the card accent.
const MODE_ICONS: Record<string, string> = {
  casual: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8.2" stroke="currentColor" stroke-width="1.1" fill="currentColor" fill-opacity="0.07"/><circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.5"/><path d="M10 2L11.4 8.5H8.6Z" fill="currentColor"/><path d="M10 18L8.6 11.5H11.4Z" fill="currentColor" opacity="0.45"/><path d="M18 10L11.5 8.6V11.4Z" fill="currentColor" opacity="0.65"/><path d="M2 10L8.5 11.4V8.6Z" fill="currentColor" opacity="0.65"/><circle cx="10" cy="10" r="1.4" fill="currentColor"/></svg>`,
  endless: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.5 7.5a3 3 0 100 5c1.4 0 2.2-1 3.5-2.5C11.3 8.5 12.1 7.5 13.5 7.5a3 3 0 110 5c-1.4 0-2.2-1-3.5-2.5C8.7 11.5 7.9 12.5 6.5 12.5Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arena: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.5" y1="8.5" x2="8.5" y2="4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="3" cy="3" r="1.6" fill="currentColor"/><line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="15.5" y1="8.5" x2="11.5" y2="4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="17" cy="3" r="1.6" fill="currentColor"/></svg>`,
  bossrush: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3.5 10L3.5 7.5L6.5 10L8.5 4L10 7.5L11.5 4L13.5 10L16.5 7.5L16.5 10Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/><path d="M3.5 10C3.5 15 5.8 18 10 18C14.2 18 16.5 15 16.5 10Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="7.5" cy="13" r="1.8" fill="currentColor" opacity="0.85"/><circle cx="12.5" cy="13" r="1.8" fill="currentColor" opacity="0.85"/></svg>`,
  daily: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2L3 5V11C3 15 6.2 18.2 10 19C13.8 18.2 17 15 17 11V5Z" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 10.5V8.5A2.5 2.5 0 0112.5 8.5V10.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/><rect x="6.5" y="10.5" width="7" height="5" rx="1" fill="currentColor" fill-opacity="0.45" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="12.8" r="1" fill="currentColor" opacity="0.9"/></svg>`,
  nightmare: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2C6.2 2 3.5 5 3.5 8.5C3.5 11.2 5 13.5 7.5 14.5V17H12.5V14.5C15 13.5 16.5 11.2 16.5 8.5C16.5 5 13.8 2 10 2Z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="7.5" cy="9" r="1.8" fill="currentColor" opacity="0.88"/><circle cx="12.5" cy="9" r="1.8" fill="currentColor" opacity="0.88"/><line x1="8.5" y1="17" x2="8.5" y2="14.8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.6"/><line x1="11.5" y1="17" x2="11.5" y2="14.8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.6"/></svg>`,
  longestday: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="3.2" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.3"/><circle cx="10" cy="10" r="1.4" fill="currentColor"/><path d="M10 1.5L11.4 7.5H8.6Z" fill="currentColor"/><path d="M10 18.5L8.6 12.5H11.4Z" fill="currentColor"/><path d="M1.5 10L7.5 8.6V11.4Z" fill="currentColor"/><path d="M18.5 10L12.5 11.4V8.6Z" fill="currentColor"/><path d="M4 4L7.4 7.5L6.2 8.8Z" fill="currentColor" opacity="0.7"/><path d="M16 4L12.6 7.5L13.8 8.8Z" fill="currentColor" opacity="0.7"/><path d="M4 16L7.4 12.5L6.2 11.2Z" fill="currentColor" opacity="0.7"/><path d="M16 16L12.6 12.5L13.8 11.2Z" fill="currentColor" opacity="0.7"/></svg>`,
};

// Bottom-nav icons (verbatim from mock-v6). currentColor inherits the nav text colour.
const NAV_ICONS: Record<string, string> = {
  upgrades: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v12M4 6l4-4 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 14h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.4"/></svg>`,
  ranks: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="6" r="3" stroke="currentColor" stroke-width="1.3"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/></svg>`,
  stats: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="9" width="3" height="5" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="6.5" y="6" width="3" height="8" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="11" y="3" width="3" height="11" rx="0.5" stroke="currentColor" stroke-width="1.2"/></svg>`,
  codex: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 6h6M5 9h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  fall: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2c0 0-5 3-5 7a5 5 0 0010 0C13 5 8 2 8 2z" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M6 9l2 2 4-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/></svg>`,
  duel: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 7a5 5 0 0110 0v6.5L11 12l-3 2-3-2-2 1.5Z" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>`,
  settings: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.2"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.2 3.2l1 1M11.8 11.8l1 1M11.8 3.2l-1 1M4.2 11.8l-1 1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  build: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5l1.7 4H14l-3.4 2.6L12 13 8 10.6 4 13l1.4-4.9L2 5.5h4.3Z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg>`,
  inspect: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  credits: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.5 11.5V4l7-1.2v7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="11.5" r="1.8" stroke="currentColor" stroke-width="1.3"/><circle cx="11" cy="9.8" r="1.8" stroke="currentColor" stroke-width="1.3"/></svg>`,
  howto: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/><path d="M6.2 6.2a1.8 1.8 0 113.1 1.3c-.6.5-1.3.8-1.3 1.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/><circle cx="8" cy="11.5" r="0.8" fill="currentColor"/></svg>`,
};

// Per-rail-mode accent (mock-v6). Drives the card icon/highlight + the center hero re-skin.
const RAIL_ACCENTS: Record<string, string> = {
  casual: '#34d399',
  endless: '#22d3ee',
  arena: '#22d3ee',
  bossrush: '#fb923c',
  daily: '#fbbf24',
  nightmare: '#f87171',
  longestday: '#c084fc',
};
function railAccent(id: string): string {
  return RAIL_ACCENTS[id] ?? '#22d3ee';
}

/** "#rrggbb" → "r, g, b" for the rgba() accent vars the cockpit CSS reads. */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `${r}, ${g}, ${b}`;
}

/** Human-readable label for a bound key list (e.SPACE / J / ESC). */
function keyLabel(keys: string[]): string {
  const one = (k: string) =>
    k === ' ' ? 'SPACE' : k === 'escape' ? 'ESC' : k === 'arrowleft' ? '←' : k === 'arrowright' ? '→' : k === 'arrowup' ? '↑' : k === 'arrowdown' ? '↓' : k.toUpperCase();
  return keys.map(one).join(' / ');
}

/** Coarse pointer (touch) — gates the on-screen PAUSE button so desktop keeps a clean HUD. */
function matchMediaCoarse(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export class UI {
  private root: HTMLElement;
  private cb: UICallbacks;
  private settings: Settings;

  // screens
  private title!: HTMLElement;
  private pause!: HTMLElement;
  private pauseBuild!: HTMLElement;
  private gameover!: HTMLElement;
  private draft!: HTMLElement;
  private eventPanel!: HTMLElement;
  private eventHead!: HTMLElement;
  private eventFlavor!: HTMLElement;
  private settingsPanel!: HTMLElement;
  private statsPanel!: HTMLElement;
  private upgradesPanel!: HTMLElement;
  private howtoPanel!: HTMLElement;
  private codexPanel!: HTMLElement;
  private codexMemories!: HTMLElement;
  private creditsPanel!: HTMLElement;
  private fallPanel!: HTMLElement;
  private ngBtn!: HTMLButtonElement;
  private heatPanel!: HTMLElement;
  private archetypePanel!: HTMLElement;
  private leaderPanel!: HTMLElement;
  private duelPanel!: HTMLElement;
  private inspectPanel!: HTMLElement;
  private toastLayer!: HTMLElement;
  private hud!: HTMLElement;
  // §1.2 — the no-fail DASH SANDBOX overlay (an instructional layer over the playing
  // canvas; pointer-events stay off so canvas dash input still works, except the SKIP btn)
  private sandboxOverlay!: HTMLElement;
  private sandboxText!: HTMLElement;
  private touchPauseBtn!: HTMLButtonElement;
  private rebinding: 'dash' | 'overdrive' | 'pause' | null = null; // active key-capture, if any
  private announceEl!: HTMLElement;
  private choiceRow!: HTMLElement;
  private saveReplayBtn!: HTMLButtonElement;
  private sharePanel!: HTMLElement;
  private shareImg!: HTMLImageElement;
  private shareBody!: HTMLElement;
  private shareActions!: HTMLElement;
  private shareUrl = '';
  private announceTimer = 0;
  private saveRef: SaveData | null = null;

  // hud refs
  private scoreEl!: HTMLElement;
  private waveEl!: HTMLElement;
  private dailyBadge!: HTMLElement;
  private mutatorRow!: HTMLElement;
  private odWrap!: HTMLElement;
  private odFill!: HTMLElement;
  private odLabel!: HTMLElement;
  private cipherEl!: HTMLElement;
  private puWrap!: HTMLElement;
  private puFill!: HTMLElement;
  private puLabel!: HTMLElement;
  private dailyCaption!: HTMLElement;
  private comboEl!: HTMLElement;
  private comboBar!: HTMLElement;
  private beatPip!: HTMLElement;
  private cityMemToggle: HTMLInputElement | null = null;
  private cityMemWrap!: HTMLElement;
  private cityMemFill!: HTMLElement;
  private staminaWrap!: HTMLElement;
  private staminaSegs: HTMLElement[] = [];
  private shieldsWrap!: HTMLElement;
  private shieldPips: HTMLElement[] = [];
  private grazeEl!: HTMLElement;
  private bestComboEl!: HTMLElement;
  private soundHint!: HTMLElement;

  // title refs
  private titleBest!: HTMLElement;
  private shipRow!: HTMLElement;
  private themeRow!: HTMLElement;
  private trailRow!: HTMLElement;
  private shardLine!: HTMLElement;
  private modeGrid!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  // cockpit (v6 mock-v6) refs — header stats, center SELECTED-RUN hero, loadout
  private hsBest!: HTMLElement;
  private hsCombo!: HTMLElement;
  private hsShards!: HTMLElement;
  private hsStreak!: HTMLElement; // 4.2 — "🔥 N day streak" header chip (hidden below 2)
  private cockpitSolstice!: HTMLElement;
  private heroSeedRow!: HTMLElement;
  private heroTitle!: HTMLElement;
  private heroTags!: HTMLElement;
  private heroDesc!: HTMLElement;
  private centerSec!: HTMLElement; // "SELECTED RUN" section label (carries mode accent)
  private infoBar!: HTMLElement;
  private rewardRow!: HTMLElement;
  private descendSub!: HTMLElement;
  private shipArt!: HTMLCanvasElement;
  private shipArtName!: HTMLElement;
  private shipArtDesc!: HTMLElement;
  private heatPipsWrap!: HTMLElement;
  private shipPicker!: HTMLElement; // wraps this.shipRow; toggled by CHANGE SHIP
  private cosmPicker!: HTMLElement; // wraps palette + trail rows; toggled by CUSTOMIZE
  private mainPanel!: HTMLElement; // .cockpit-main — carries the mode accent for re-skin
  private heroEl!: HTMLElement; // .ck-hero — toggles .first-light during the idle teaser
  private heroContent!: HTMLElement; // .ck-hero-content — toggles .swap on re-skin
  private lightLance!: HTMLElement; // fixed light-lance that streaks on DESCEND (the verb)
  private prevSelectedMode: string | null = null; // last painted selection (gate the swap motion)
  private firstLightTimer: ReturnType<typeof setTimeout> | null = null; // idle teaser scheduler
  private coercingMode = false; // guard so the invalid-mode coercion can't loop

  // gameover refs
  private goScore!: HTMLElement;
  private goStats!: HTMLElement;
  private goBadge!: HTMLElement;
  private goBuild!: HTMLElement;
  private goHead!: HTMLElement;
  private goSub!: HTMLElement;
  private goDelta!: HTMLElement;
  private goAch!: HTMLElement;

  private displayScore = 0;
  private pauseRestartArmed = false;

  // ── modal keyboard contract (a11y) ──
  // Every overlay that opens/closes by toggling `.hidden` is a "modal panel". A single
  // shared open/close path gives them all the same contract: Esc closes the topmost open
  // panel, Tab/Shift+Tab trap focus inside it, and closing restores focus to the opener.
  // openStack tracks open order so Esc always closes the most-recently-opened panel; the
  // WeakMap remembers which element to return focus to when each panel closes.
  private modalPanels: HTMLElement[] = [];
  private openStack: HTMLElement[] = [];
  private modalOpener = new WeakMap<HTMLElement, HTMLElement>();
  // Optional extra teardown a panel needs on close (the share panel revokes its blob URL).
  private modalOnClose = new WeakMap<HTMLElement, () => void>();

  constructor(root: HTMLElement, settings: Settings, cb: UICallbacks) {
    this.root = root;
    this.settings = settings;
    this.cb = cb;
    this.build();
    this.applyHudScale();
  }

  // ── construction ──
  private build(): void {
    this.buildHud();
    this.buildTitle();
    this.buildPause();
    this.buildGameOver();
    this.buildDraft();
    this.buildEvent();
    this.buildSettings();
    this.buildStats();
    this.buildUpgrades();
    this.buildHowTo();
    this.buildCodex();
    this.buildCredits();
    this.buildFall();
    this.buildHeat();
    this.buildArchetype();
    this.buildLeaderboard();
    this.buildDuel();
    this.buildInspect();
    this.buildShare();
    this.buildSandbox();
    // aria-live so the narrator's SOUL payload reaches screen-reader users:
    // toasts are polite (ambient), announces are assertive (emphatic, used sparingly).
    this.toastLayer = el('div', { class: 'toast-layer', role: 'status', 'aria-live': 'polite' });
    this.announceEl = el('div', { class: 'announce', role: 'status', 'aria-live': 'polite' });
    this.root.append(this.hud, this.title, this.pause, this.gameover, this.draft, this.eventPanel, this.settingsPanel, this.statsPanel, this.upgradesPanel, this.howtoPanel, this.codexPanel, this.creditsPanel, this.fallPanel, this.heatPanel, this.archetypePanel, this.leaderPanel, this.duelPanel, this.inspectPanel, this.sharePanel, this.sandboxOverlay, this.toastLayer, this.announceEl);
    // accessibility: announce overlays as dialogs
    const dialogs: [HTMLElement, string][] = [
      [this.pause, 'Paused'],
      [this.gameover, 'Game over'],
      [this.draft, 'Choose a perk'],
      [this.settingsPanel, 'Settings'],
    ];
    for (const [scr, label] of dialogs) {
      const panel = scr.querySelector('.panel');
      if (panel) {
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', label);
      }
    }
    this.toastLayer.setAttribute('aria-live', 'polite');
    this.registerModals();
    this.show('title');
  }

  // ── modal keyboard contract ────────────────────────────────────────────────
  /** Collect every overlay that opens/closes via `.hidden`, tag it as a dialog for
   *  screen readers, and install ONE capture-phase key handler that gives them all the
   *  same keyboard contract (Esc-close + focus-trap). Capture phase so we intercept Esc
   *  BEFORE the global game input handler latches its pause edge — and we only swallow it
   *  when a panel is actually open, so in-run Esc = PAUSE is untouched (no panel is ever
   *  open during gameplay; show('playing') force-hides them all). */
  private registerModals(): void {
    this.modalPanels = [
      this.settingsPanel,
      this.statsPanel,
      this.upgradesPanel,
      this.howtoPanel,
      this.codexPanel,
      this.creditsPanel,
      this.fallPanel,
      this.heatPanel,
      this.archetypePanel,
      this.leaderPanel,
      this.duelPanel,
      this.inspectPanel,
      this.sharePanel,
    ];
    for (const scr of this.modalPanels) {
      const panel = scr.querySelector('.panel');
      if (panel && !panel.hasAttribute('role')) {
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
      }
    }
    window.addEventListener('keydown', (e) => this.onModalKeydown(e), true);
  }

  /** The visible inner `.panel` of a modal screen (the focus-trap container). */
  private modalContent(panel: HTMLElement): HTMLElement {
    return (panel.querySelector('.panel') as HTMLElement | null) ?? panel;
  }

  /** Focusable, visible descendants of a panel — in DOM order, for the Tab cycle. */
  private focusables(panel: HTMLElement): HTMLElement[] {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(this.modalContent(panel).querySelectorAll<HTMLElement>(sel)).filter(
      (n) => n.offsetWidth > 0 || n.offsetHeight > 0 || n.getClientRects().length > 0,
    );
  }

  /** Open a modal panel: remember the trigger for focus-restore, reveal it, and move
   *  focus inside. Idempotent — re-opening an already-open panel just refreshes focus. */
  private openModal(panel: HTMLElement): void {
    if (!this.modalOpener.has(panel)) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) this.modalOpener.set(panel, active);
    }
    panel.classList.remove('hidden');
    if (!this.openStack.includes(panel)) this.openStack.push(panel);
    // move focus into the panel (first focusable, else the panel itself) so the trap has
    // somewhere to hold and screen-reader/keyboard users land inside the dialog.
    const focusable = this.focusables(panel);
    if (focusable.length) focusable[0].focus();
    else {
      this.modalContent(panel).setAttribute('tabindex', '-1');
      this.modalContent(panel).focus();
    }
  }

  /** Close a modal panel and restore focus to whatever opened it. */
  private closeModal(panel: HTMLElement): void {
    panel.classList.add('hidden');
    const idx = this.openStack.indexOf(panel);
    if (idx >= 0) this.openStack.splice(idx, 1);
    this.modalOnClose.get(panel)?.(); // panel-specific teardown (e.g. revoke a blob URL)
    const opener = this.modalOpener.get(panel);
    this.modalOpener.delete(panel);
    if (opener && opener.isConnected) opener.focus();
  }

  /** The topmost (most-recently-opened) panel that is still open, if any. */
  private topModal(): HTMLElement | null {
    for (let i = this.openStack.length - 1; i >= 0; i--) {
      const p = this.openStack[i];
      if (!p.classList.contains('hidden')) return p;
      this.openStack.splice(i, 1); // prune ones closed out-of-band (e.g. via show())
    }
    return null;
  }

  /** Esc-close + Tab focus-trap for the topmost open title modal. Only acts while a panel
   *  is actually open — otherwise Esc/Tab pass straight through (in-run Esc = PAUSE stays). */
  private onModalKeydown(e: KeyboardEvent): void {
    if (this.rebinding) return; // a key-capture is in flight — let buildSettings handle it
    const panel = this.topModal();
    if (!panel) return;
    const key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation(); // swallow so the global handler can't also read it as PAUSE
      this.closeModal(panel);
      return;
    }
    if (key === 'Tab') {
      const items = this.focusables(panel);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active != null && this.modalContent(panel).contains(active);
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!inside || active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  private buildHud(): void {
    this.scoreEl = el('div', { class: 'hud-score' }, '0');
    this.waveEl = el('div', { class: 'hud-wave' }, 'WAVE 1');
    this.dailyBadge = el('div', { class: 'hud-daily hidden' }, '◆ ECHO');
    this.mutatorRow = el('div', { class: 'hud-mutators' });
    const topLeft = el('div', { class: 'hud-topleft' }, this.scoreEl, this.waveEl, this.dailyBadge, this.mutatorRow);

    this.comboEl = el('div', { class: 'hud-combo' }, '');
    this.comboBar = el('div', { class: 'hud-combo-fill' });
    // Grid B — cheap in-run jargon tooltips on the stable meter wrappers (label text
    // changes per-frame; the wrapper title stays put). Keyboard-reachable, no flashing.
    const comboBarWrap = el('div', { class: 'hud-combo-bar', title: 'COMBO — kills chained without a break. Higher combo lifts your score multiplier and decays if you stop killing.' }, this.comboBar);
    this.beatPip = el('div', { class: 'hud-beatpip' });
    const topCenter = el('div', { class: 'hud-topcenter' }, this.comboEl, comboBarWrap, this.beatPip);

    this.staminaWrap = el('div', { class: 'hud-stamina', title: 'STAMINA — each dash spends a segment. It refills over time and faster when you graze bullets.' });
    this.shieldsWrap = el('div', { class: 'hud-shields' });
    this.grazeEl = el('div', { class: 'hud-graze', title: 'GRAZE — skim a bullet without being hit to refill stamina and build your run.' }, '');
    this.bestComboEl = el('div', { class: 'hud-bestcombo' }, '');
    this.cityMemFill = el('div', { class: 'hud-citymem-fill' });
    this.cityMemWrap = el('div', { class: 'hud-citymem', title: 'COHERENCE — the City of Lancefall lights up as you chain kills and dash on the beat. Higher coherence = brighter world and fuller sound.' }, this.cityMemFill);
    const bottom = el('div', { class: 'hud-bottom' }, this.grazeEl, this.staminaWrap, this.shieldsWrap, this.cityMemWrap, this.bestComboEl);

    // OVERDRIVE meter (below the stamina bar)
    this.odLabel = el('div', { class: 'hud-od-label' }, 'DAYBREAK');
    this.odFill = el('div', { class: 'hud-od-fill' });
    this.odWrap = el('div', { class: 'hud-overdrive', title: 'DAYBREAK (OVERDRIVE) — kills and grazes charge this meter. When it reads READY, press F (or LB) for a time-slowing, screen-clearing burst of light.' }, this.odLabel, el('div', { class: 'hud-od-track' }, this.odFill));

    // active POWER-UP badge (hidden unless one is active)
    this.puLabel = el('div', { class: 'hud-pu-label' }, '');
    this.puFill = el('div', { class: 'hud-pu-fill' });
    this.puWrap = el('div', { class: 'hud-powerup' }, this.puLabel, el('div', { class: 'hud-pu-track' }, this.puFill));

    // CIPHER-LOCK readout — the code to break, in required dash order (boss fights)
    this.cipherEl = el('div', { class: 'hud-cipher' });

    // Touch PAUSE — a 44px tap target (the iOS/Android min) shown only on coarse
    // pointers; phones have no Esc/P key. Pointerdown so it never competes with the
    // canvas touch handlers, and stopPropagation so the tap isn't read as a dash.
    this.touchPauseBtn = el('button', { class: 'hud-touch-pause', 'aria-label': 'Pause', type: 'button' }, 'II');
    if (!matchMediaCoarse()) this.touchPauseBtn.classList.add('hidden');
    // re-evaluate on pointer-modality change (hybrid / detachable / touch-laptop devices)
    try {
      window.matchMedia('(pointer: coarse)').addEventListener('change', (e) =>
        this.touchPauseBtn.classList.toggle('hidden', !e.matches),
      );
    } catch {
      /* older browsers: the one-time gate above stands */
    }
    const fireePause = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onPause();
    };
    this.touchPauseBtn.addEventListener('pointerdown', fireePause);
    this.touchPauseBtn.addEventListener('click', fireePause);

    this.hud = el('div', { class: 'hud' }, topLeft, topCenter, bottom, this.odWrap, this.puWrap, this.cipherEl, this.touchPauseBtn);
    this.rebuildStamina(TUNE.stamina.segments);
  }

  private rebuildStamina(count: number): void {
    this.staminaWrap.replaceChildren();
    this.staminaSegs = [];
    for (let i = 0; i < count; i++) {
      const fill = el('div', { class: 'seg-fill' });
      const seg = el('div', { class: 'seg' }, fill);
      this.staminaSegs.push(fill);
      this.staminaWrap.append(seg);
    }
  }

  private rebuildShields(count: number): void {
    this.shieldsWrap.replaceChildren();
    this.shieldPips = [];
    for (let i = 0; i < count; i++) {
      const pip = el('div', { class: 'shield-pip' });
      this.shieldPips.push(pip);
      this.shieldsWrap.append(pip);
    }
  }

  // ── COCKPIT title (mock-v6) ────────────────────────────────────────────────
  // A 3-region cockpit: HEADER (brand + decorative CITY COHERENCE bar + header stats),
  // MAIN PANEL (left MODE RAIL · center SELECTED RUN hero · right LOADOUT), and a
  // BOTTOM NAV of icon buttons wired to the existing modal openers. Every legacy ref
  // field is preserved (some repurposed, a few kept hidden so old read-sites stay valid).
  private buildTitle(): void {
    // ── HEADER: brand mark + wordmark + sub + tagline ──
    const brand = el(
      'div',
      { class: 'ck-brand' },
      el('div', { class: 'ck-wordmark' }, 'LANCEFALL'),
      el('div', { class: 'ck-wordmark-sub' }, 'THE LAST LANCE'),
      el('div', { class: 'ck-tagline' }, 'A CITY REMEMBERED. A FALL REVERSED.'),
    );
    const hdrLeft = el('div', { class: 'ck-hdr-left' }, iconEl('ck-logo', LOGO_SVG), brand);

    // decorative CITY COHERENCE bar — flavour ONLY (no gameplay state); a static 62%.
    const coherence = el(
      'div',
      { class: 'ck-coh' },
      el(
        'div',
        { class: 'ck-coh-row' },
        iconEl('ck-coh-icon', COH_CITY_SVG),
        el('div', { class: 'ck-coh-lbl' }, 'CITY COHERENCE'),
        el('div', { class: 'ck-coh-pct' }, '62%'),
      ),
      el('div', { class: 'ck-coh-track' }, el('div', { class: 'ck-coh-fill' })),
      el('div', { class: 'ck-coh-sub' }, 'NEON BLOOMS AS THE CITY REMEMBERS'),
    );

    // header stats — repurpose titleBest (BEST RUN) + shardLine (SHARDS); add BEST COMBO.
    this.titleBest = el('div', { class: 'ck-hstat-val' }, '—');
    this.hsBest = this.titleBest;
    this.hsCombo = el('div', { class: 'ck-hstat-val' }, '—');
    this.shardLine = el('div', { class: 'ck-hstat-val' }, '—');
    this.hsShards = this.shardLine;
    // 4.2 — daily-streak retention chip; hidden until the player has a 2+ day streak.
    this.hsStreak = el('div', { class: 'ck-streak hidden', title: 'Consecutive days played — keep it alive!' }, '');
    const hdrRight = el(
      'div',
      { class: 'ck-hdr-right' },
      this.hsStreak,
      el('div', { class: 'ck-hstat' }, el('div', { class: 'ck-hstat-lbl' }, 'BEST RUN'), this.hsBest),
      el('div', { class: 'ck-hstat' }, el('div', { class: 'ck-hstat-lbl' }, 'BEST COMBO'), this.hsCombo),
      el('div', { class: 'ck-hstat' }, el('div', { class: 'ck-hstat-lbl' }, 'SHARDS'), this.hsShards),
    );
    const header = el('div', { class: 'ck-header' }, hdrLeft, coherence, hdrRight);

    // solstice stamp (kept) — the judging-window hook, sits under the header.
    const today = dateString();
    const isSolstice = today.endsWith('-06-20') || today.endsWith('-06-21');
    this.cockpitSolstice = el(
      'div',
      { class: 'title-solstice' + (isSolstice ? ' on' : '') },
      '☀ SOLSTICE — the longest day · today the whole world breaks the same key',
    );

    // ── LEFT: MODE RAIL (this.modeGrid, vertical) ──
    this.modeGrid = el('div', { class: 'mode-grid ck-rail', role: 'group', 'aria-label': 'Select game mode' });
    const railCol = el('div', { class: 'ck-col ck-col-left' }, el('div', { class: 'ck-sec' }, 'SELECT MODE'), this.modeGrid);

    // ── CENTER: SELECTED RUN hero ──
    this.centerSec = el('div', { class: 'ck-sec' }, 'SELECTED RUN');
    this.heroSeedRow = el('div', { class: 'ck-hero-seed' });
    this.heroTitle = el('div', { class: 'ck-hero-title' }, 'LANCEFALL');
    this.heroTags = el('div', { class: 'ck-hero-tags' }, '');
    this.heroDesc = el('div', { class: 'ck-hero-desc' }, '');
    // hero-content is captured so a mode re-skin can replay the .swap micro-animation.
    this.heroContent = el(
      'div',
      { class: 'ck-hero-content' },
      this.heroSeedRow,
      this.heroTitle,
      this.heroTags,
      this.heroDesc,
      el(
        'div',
        { class: 'ck-hero-verb' },
        el('b', {}, 'HOLD'),
        el('span', {}, ' TO CHARGE · '),
        el('b', {}, 'RELEASE'),
        el('span', {}, ' TO SPEAR'),
      ),
    );
    // ck-hero-streak (idle ghost dash) + ck-hero-firstlight (idle dawn teaser) — pure
    // decoration, aria-hidden; both fully gated under reduce-motion (see STILL CITY css).
    const hero = el(
      'div',
      { class: 'ck-hero' },
      el('div', { class: 'ck-hero-bg' }),
      el('div', { class: 'ck-hero-glow' }),
      el('div', { class: 'ck-hero-streak', 'aria-hidden': 'true' }),
      el('div', { class: 'ck-hero-firstlight', 'aria-hidden': 'true' }),
      this.heroContent,
    );
    this.heroEl = hero;
    this.infoBar = el('div', { class: 'ck-infobar' });
    this.rewardRow = el('div', { class: 'ck-rewards' });

    // DESCEND = the renamed/restyled PLAY button. REUSE this.playBtn + its existing handler.
    const play = el('button', { class: 'btn btn-primary btn-play ck-descend', 'aria-label': 'Descend — start the selected run' }, 'DESCEND');
    this.playBtn = play;
    play.addEventListener('click', () => {
      // DESCEND cock-and-fire — a charge dip then a light-lance "dash into the run"
      // feel, gated under reduce-motion. The actual launch is unchanged.
      this.fireDescend();
      const s = this.saveRef;
      this.cb.onStart(modeById(s ? s.selectedMode : 'endless'));
    });
    this.descendSub = el('div', { class: 'ck-descend-sub' }, '');
    const centerCol = el(
      'div',
      { class: 'ck-col ck-col-center' },
      this.centerSec,
      hero,
      this.infoBar,
      this.rewardRow,
      el('div', { class: 'ck-descend-wrap' }, play),
      this.descendSub,
    );

    // ── RIGHT: LOADOUT ──
    this.shipArt = el('canvas', { class: 'ck-ship-art', 'aria-hidden': 'true' }) as HTMLCanvasElement;
    this.shipArtName = el('div', { class: 'ck-ship-name' }, '—');
    this.shipArtDesc = el('div', { class: 'ck-ship-desc' }, '');
    const changeShip = el('button', { class: 'ck-change-ship', type: 'button' }, 'CHANGE SHIP');
    const shipDisplay = el(
      'div',
      { class: 'ck-ship-display' },
      el('div', { class: 'ck-ship-ring' }, this.shipArt),
      this.shipArtName,
      this.shipArtDesc,
      changeShip,
    );

    // HEAT stepper (− / pips / +) bound to onHeatChange, clamped 0..MAX_HEAT.
    this.heatPipsWrap = el('div', { class: 'ck-heat-pips' });
    const heatMinus = el('button', { class: 'ck-step', type: 'button', 'aria-label': 'Lower Heat' }, '−');
    const heatPlus = el('button', { class: 'ck-step', type: 'button', 'aria-label': 'Raise Heat' }, '+');
    heatMinus.addEventListener('click', () => this.stepHeat(-1));
    heatPlus.addEventListener('click', () => this.stepHeat(1));
    const heatRow = el(
      'div',
      { class: 'ck-lo-row', title: 'HEAT — optional difficulty ladder. Higher Heat = tougher run, bigger score multiplier.' },
      el('div', { class: 'ck-lo-key' }, 'HEAT'),
      el('div', { class: 'ck-lo-right' }, heatMinus, this.heatPipsWrap, heatPlus),
    );

    // ship picker (reuse this.shipRow), hidden until CHANGE SHIP.
    this.shipRow = el('div', { class: 'ship-row ck-ship-row' });
    this.shipPicker = el('div', { class: 'ck-picker hidden' }, this.shipRow);
    changeShip.addEventListener('click', () => {
      const open = this.shipPicker.classList.toggle('hidden');
      changeShip.setAttribute('aria-expanded', String(!open));
    });

    // cosmetics: PALETTE (this.themeRow) + DASH TRAIL (this.trailRow), revealed by CUSTOMIZE.
    this.themeRow = el('div', { class: 'theme-row ck-cosm-grid' });
    this.trailRow = el('div', { class: 'theme-row ck-cosm-grid' });
    const customize = el('button', { class: 'ck-customize', type: 'button' }, 'CUSTOMIZE');
    this.cosmPicker = el(
      'div',
      { class: 'ck-picker hidden' },
      el('div', { class: 'ck-cosm-lbl', title: 'PALETTE — a cosmetic colour theme for the whole game. No effect on gameplay.' }, 'PALETTE'),
      this.themeRow,
      el('div', { class: 'ck-cosm-lbl', title: 'DASH TRAIL — the cosmetic streak left behind when you dash. Unlocked through play.' }, 'DASH TRAIL'),
      this.trailRow,
    );
    customize.addEventListener('click', () => {
      const open = this.cosmPicker.classList.toggle('hidden');
      customize.setAttribute('aria-expanded', String(!open));
    });
    const loadoutCol = el(
      'div',
      { class: 'ck-col ck-col-right' },
      el('div', { class: 'ck-sec' }, 'LOADOUT'),
      shipDisplay,
      this.shipPicker,
      heatRow,
      el('div', { class: 'ck-cosm-title' }, 'COSMETICS'),
      customize,
      this.cosmPicker,
    );

    this.mainPanel = el(
      'div',
      { class: 'ck-main' },
      el('div', { class: 'ck-corner tl' }),
      el('div', { class: 'ck-corner tr' }),
      el('div', { class: 'ck-corner bl' }),
      el('div', { class: 'ck-corner br' }),
      railCol,
      centerCol,
      loadoutCol,
    );

    // ── BOTTOM NAV ── icon buttons → existing modal openers. Every entry point kept.
    this.ngBtn = el('button', { class: 'ck-nav-btn ck-nav-ng hidden', type: 'button' }, 'NG+') as HTMLButtonElement;
    this.ngBtn.addEventListener('click', () => this.cb.onToggleNgPlus());
    const navBtn = (icon: string, label: string, on: () => void, title: string) => {
      const b = el('button', { class: 'ck-nav-btn', type: 'button', title }, iconEl('ck-nav-ico', NAV_ICONS[icon]), el('span', {}, label));
      b.addEventListener('click', on);
      return b;
    };
    const bottomNav = el(
      'div',
      { class: 'ck-nav', role: 'group', 'aria-label': 'Menus' },
      navBtn('upgrades', 'UPGRADES', () => this.openUpgrades(), 'UPGRADES — spend shards on a permanent meta-tree that carries between runs.'),
      navBtn('ranks', 'RANKS', () => this.openLeaderboard(), 'RANKS — online leaderboards (daily, weekly and all-time) if you opt in.'),
      navBtn('stats', 'STATS', () => this.openStats(), 'STATS — your lifetime numbers and achievements.'),
      el('div', { class: 'ck-nav-div' }),
      navBtn('build', 'BUILD', () => this.openArchetype(), 'BUILD — pick a starting archetype that biases your perk draft.'),
      navBtn('codex', 'CODEX', () => this.showCodex(), 'CODEX — a bestiary of every enemy, boss, biome and relic, with lore.'),
      navBtn('fall', 'THE FALL', () => this.showFall(), 'THE FALL — the story: six who let the City of Lancefall go dark.'),
      navBtn('duel', 'DUEL', () => this.openDuel(), 'DUEL — async 1v1: you and a friend race the same fixed seed.'),
      el('div', { class: 'ck-nav-div' }),
      navBtn('inspect', 'INSPECT', () => this.openInspect(), 'INSPECT — paste a BUILD DNA code to read back a run.'),
      navBtn('credits', 'CREDITS', () => this.showCredits(), 'CREDITS — the music, sounds and assets behind LANCEFALL.'),
      navBtn('howto', 'HOW TO', () => this.showHowTo(), 'HOW TO PLAY — the controls and the core loop.'),
      navBtn('settings', 'SETTINGS', () => this.openSettings(), 'SETTINGS — audio, accessibility, key bindings.'),
      this.ngBtn,
    );

    // legacy refs kept alive (old read-sites still reference them) but unused in the cockpit.
    this.dailyCaption = el('div', { class: 'daily-caption hidden' }, '');
    this.soundHint = el('div', { class: 'sound-hint ck-sound-hint' }, '♪ press DESCEND to enable sound');

    // the light-lance that streaks the frame on DESCEND release (the core verb made
    // visible). position:fixed, pointer-events:none; lives inside the title screen.
    this.lightLance = el('div', { class: 'ck-light-lance', 'aria-hidden': 'true' });

    this.title = el(
      'div',
      { class: 'screen screen-title screen-cockpit' },
      el('div', { class: 'ck-frame' }, header, this.cockpitSolstice, this.mainPanel, bottomNav, this.soundHint, this.dailyCaption),
      this.lightLance,
    );
  }

  /** Replay a CSS animation by removing its class, forcing reflow, and re-adding it.
   *  Used by the boot-in reveal, the mode-swap micro-motion, the panel-commit pulse,
   *  the DESCEND charge and the light-lance — so each re-triggers cleanly on re-entry. */
  private replayAnim(elm: HTMLElement | null | undefined, cls: string): void {
    if (!elm) return;
    elm.classList.remove(cls);
    void elm.offsetWidth; // reflow so the animation restarts
    elm.classList.add(cls);
  }

  /** Is decorative motion suppressed right now? Honours BOTH the game's own
   *  reduce-motion setting AND the OS prefers-reduced-motion query (matching the
   *  cockpit CSS gating, so JS never fires a motion the CSS has frozen). */
  private motionOff(): boolean {
    return this.settings.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** DESCEND cock-and-fire: a brief charge dip on the button + a light-lance streak.
   *  No-op under reduce-motion (the launch itself still proceeds via the caller). */
  private fireDescend(): void {
    if (this.motionOff()) return;
    this.replayAnim(this.playBtn, 'charging');
    this.replayAnim(this.lightLance, 'fire');
  }

  /** FIRST LIGHT idle teaser: after ~8s of stillness on the title the hero blooms a
   *  warm dawn (the win-frame preview), holds a beat, then dissolves back. A single
   *  recurring scheduler; fully suppressed under reduce-motion. */
  private startFirstLightIdle(): void {
    this.stopFirstLightIdle();
    if (this.motionOff() || !this.heroEl) return;
    const tick = () => {
      this.heroEl.classList.add('first-light');
      // hold the dawn, then let it fall back to night and schedule the next cycle.
      this.firstLightTimer = setTimeout(() => {
        this.heroEl.classList.remove('first-light');
        this.firstLightTimer = setTimeout(tick, 8000);
      }, 3400);
    };
    this.firstLightTimer = setTimeout(tick, 8000);
  }

  private stopFirstLightIdle(): void {
    if (this.firstLightTimer !== null) {
      clearTimeout(this.firstLightTimer);
      this.firstLightTimer = null;
    }
  }

  /** Heat stepper (loadout) — clamp to 0..MAX_HEAT and route through onHeatChange. */
  private stepHeat(delta: number): void {
    const s = this.saveRef;
    if (!s) return;
    const next = Math.max(0, Math.min(MAX_HEAT, s.selectedHeat + delta));
    if (next !== s.selectedHeat) this.cb.onHeatChange(next); // persists → refreshTitle re-paints pips
  }

  /** Paint the loadout HEAT pips (one per level 1..MAX_HEAT; first `level` lit). */
  private paintHeatPips(level: number): void {
    this.heatPipsWrap.replaceChildren();
    for (let i = 1; i <= MAX_HEAT; i++) {
      this.heatPipsWrap.append(el('div', { class: 'ck-heat-pip' + (i <= level ? ' on' : '') }));
    }
  }

  private buildPause(): void {
    const h = el('h2', {}, 'PAUSED');
    this.pauseBuild = el('div', { class: 'go-build pause-build' }, '');
    const resume = el('button', { class: 'btn btn-primary' }, 'RESUME');
    resume.addEventListener('click', () => this.cb.onResume());
    const settingsBtn = el('button', { class: 'btn btn-ghost' }, 'SETTINGS');
    settingsBtn.addEventListener('click', () => this.openSettings());
    const restart = el('button', { class: 'btn btn-ghost' }, 'RESTART');
    restart.addEventListener('click', () => {
      if (!this.pauseRestartArmed) {
        this.pauseRestartArmed = true;
        restart.textContent = 'CONFIRM RESTART';
        restart.classList.add('btn-danger');
        setTimeout(() => {
          this.pauseRestartArmed = false;
          restart.textContent = 'RESTART';
          restart.classList.remove('btn-danger');
        }, 2500);
      } else {
        this.cb.onRestart();
      }
    });
    const quit = el('button', { class: 'btn btn-ghost' }, 'QUIT TO MENU');
    quit.addEventListener('click', () => this.cb.onQuit());
    const panel = el('div', { class: 'panel' }, h, this.pauseBuild, resume, settingsBtn, restart, quit);
    this.pause = el('div', { class: 'screen screen-dim' }, panel);
  }

  /** Populate the pause screen's current-build summary (called when pausing). */
  setPauseBuild(buildLine: string, ship: string, heat: number): void {
    const heatStr = heat > 0 ? ` · HEAT ${heat}` : '';
    this.pauseBuild.replaceChildren(
      el('span', { class: 'go-ship' }, `${ship}${heatStr}`),
      el('span', { class: 'go-perks' }, buildLine ? ` · ${buildLine}` : ' · no perks yet'),
    );
  }

  private buildGameOver(): void {
    this.goHead = el('h2', { class: 'go-head' }, 'THE LIGHT DIMS');
    this.goSub = el('div', { class: 'go-sub' }, '');
    this.goBadge = el('div', { class: 'go-badge' }, '');
    this.goScore = el('div', { class: 'go-score' }, '0');
    this.goDelta = el('div', { class: 'go-delta' }, '');
    this.goStats = el('div', { class: 'go-stats' }, '');
    this.goBuild = el('div', { class: 'go-build' }, '');
    this.goAch = el('div', { class: 'go-ach' }, '');
    const again = el('button', { class: 'btn btn-primary' }, 'AGAIN');
    again.addEventListener('click', () => this.cb.onRestart());
    const copy = el('button', { class: 'btn btn-ghost' }, 'COPY SCORE');
    copy.addEventListener('click', () => this.cb.onCopyScore());
    const dna = el('button', { class: 'btn btn-ghost' }, 'COPY BUILD ⧬');
    dna.addEventListener('click', () => this.cb.onCopyBuildDna());
    const duel = el('button', { class: 'btn btn-ghost' }, '⚔ DUEL A FRIEND');
    duel.addEventListener('click', () => this.cb.onCreateChallenge());
    const menu = el('button', { class: 'btn btn-ghost' }, 'MENU');
    menu.addEventListener('click', () => this.cb.onQuit());
    this.saveReplayBtn = el('button', { class: 'btn btn-ghost hidden' }, 'SHARE GIF ⤴') as HTMLButtonElement;
    this.saveReplayBtn.addEventListener('click', () => this.cb.onSaveReplay());
    const row = el('div', { class: 'go-row' }, again, copy, dna, duel, this.saveReplayBtn, menu);
    // THE CHOICE — shown only on the first Sovereign kill (hold the light / let it go)
    const catchBtn = el('button', { class: 'btn btn-primary' }, 'HOLD THE LIGHT');
    catchBtn.addEventListener('click', () => this.cb.onChoice('catch'));
    const fallBtn = el('button', { class: 'btn btn-ghost' }, 'LET IT GO');
    fallBtn.addEventListener('click', () => this.cb.onChoice('fall'));
    this.choiceRow = el(
      'div',
      { class: 'go-row go-choice hidden' },
      el('div', { class: 'go-choice-prompt' }, 'The last cipher cannot be solved — only chosen. Hold the light at its height, or let the day turn?'),
      catchBtn,
      fallBtn,
    );
    const panel = el('div', { class: 'panel' }, this.goHead, this.goSub, this.goBadge, this.goScore, this.goDelta, this.goStats, this.goBuild, this.goAch, this.choiceRow, row);
    this.gameover = el('div', { class: 'screen screen-dim' }, panel);
  }

  private buildDraft(): void {
    const h = el('h2', { class: 'draft-head' }, 'CHOOSE A PERK');
    const cards = el('div', { class: 'draft-cards' });
    cards.id = 'draft-cards';
    const panel = el('div', { class: 'panel panel-wide' }, h, cards);
    this.draft = el('div', { class: 'screen screen-dim' }, panel);
  }

  private buildEvent(): void {
    this.eventHead = el('h2', { class: 'event-head' }, 'EVENT');
    this.eventFlavor = el('div', { class: 'event-flavor' }, '');
    const cards = el('div', { class: 'draft-cards' });
    cards.id = 'event-cards';
    const panel = el('div', { class: 'panel panel-wide' }, this.eventHead, this.eventFlavor, cards);
    this.eventPanel = el('div', { class: 'screen screen-dim' }, panel);
  }

  showEvent(name: string, flavor: string, accent: string, choices: EventChoice[]): void {
    this.eventHead.textContent = name;
    this.eventHead.style.color = accent;
    this.eventFlavor.textContent = flavor;
    const wrap = this.eventPanel.querySelector('#event-cards')!;
    wrap.replaceChildren();
    choices.forEach((c, i) => {
      const card = el('button', { class: 'perk-card' });
      card.style.setProperty('--accent', c.accent);
      const riskLabel = c.risk === 'high' ? 'HIGH RISK' : c.risk === 'low' ? 'RISK' : 'SAFE';
      card.append(
        el('div', { class: `event-risk event-risk-${c.risk}` }, riskLabel),
        el('div', { class: 'perk-name' }, c.name),
        el('div', { class: 'perk-desc' }, c.desc),
        el('div', { class: 'perk-key' }, String(i + 1)),
      );
      card.addEventListener('click', () => this.cb.onPickEvent(i));
      wrap.append(card);
    });
    this.show('event');
  }

  private buildSettings(): void {
    const h = el('h2', {}, 'SETTINGS');
    const body = el('div', { class: 'settings-body' });

    const slider = (label: string, min: number, max: number, step: number, val: number, on: (v: number) => void) => {
      const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val) }) as HTMLInputElement;
      input.addEventListener('input', () => on(parseFloat(input.value)));
      return el('label', { class: 'setting' }, el('span', {}, label), input);
    };
    const toggle = (label: string, val: boolean, on: (v: boolean) => void) => {
      const input = el('input', { type: 'checkbox' }) as HTMLInputElement;
      input.checked = val;
      input.addEventListener('change', () => on(input.checked));
      return el('label', { class: 'setting setting-toggle' }, el('span', {}, label), input);
    };

    const s = this.settings;
    // City-memory is backed by SaveData (not Settings), and buildSettings() runs once in
    // the constructor when saveRef is still null — so capture this checkbox and refresh it
    // from the live save each time the panel opens (see openSettings()).
    const cityMemRow = toggle('City memory meter', this.saveRef?.cityMemoryMeter ?? true, (v) =>
      this.cb.onToggleCityMemory(v),
    );
    this.cityMemToggle = cityMemRow.querySelector('input');
    body.append(
      slider('Master volume', 0, 1, 0.05, s.master, (v) => this.patch({ master: v })),
      slider('SFX volume', 0, 1, 0.05, s.sfx, (v) => this.patch({ sfx: v })),
      slider('Music volume', 0, 1, 0.05, s.music, (v) => this.patch({ music: v })),
      slider('Screen shake', 0, 1.5, 0.05, s.shake, (v) => this.patch({ shake: v })),
      slider('HUD scale', 0.8, 1.4, 0.05, s.hudScale, (v) => this.patch({ hudScale: v })),
      slider('Chromatic aberration', 0, 1, 0.05, s.chromAberration, (v) => this.patch({ chromAberration: v })),
      toggle('Controller rumble', s.rumble, (v) => this.patch({ rumble: v })),
      toggle('Reduce flashing', s.reduceFlashing, (v) => this.patch({ reduceFlashing: v })),
      toggle('Reduce motion', s.reduceMotion, (v) => this.patch({ reduceMotion: v })),
      toggle('Colorblind shapes', s.colorblind, (v) => this.patch({ colorblind: v })),
      toggle('Clarity (high contrast)', s.clarity, (v) => this.patch({ clarity: v })),
      toggle('Beat ring (rhythm assist)', s.rhythmAssist, (v) => this.patch({ rhythmAssist: v })),
      cityMemRow,
      toggle('Slingshot dash (alt style)', s.dashStyle === 'slingshot', (v) =>
        this.patch({ dashStyle: v ? 'slingshot' : 'lance' }),
      ),
    );

    const densityWrap = el('div', { class: 'setting' }, el('span', {}, 'Particle density'));
    for (const d of ['low', 'med', 'high'] as const) {
      const b = el('button', { class: 'btn btn-ghost btn-sm' + (s.particleDensity === d ? ' active' : '') }, d.toUpperCase());
      b.addEventListener('click', () => {
        this.patch({ particleDensity: d });
        densityWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
      densityWrap.append(b);
    }
    body.append(densityWrap);

    // soundtrack picker — AURORA (dreamy) vs SURGE (aggressive)
    const trackWrap = el('div', { class: 'setting' }, el('span', {}, 'Soundtrack'));
    for (const id of ['aurora', 'surge'] as SoundtrackId[]) {
      const prof = TRACKS[id];
      const b = el(
        'button',
        { class: 'btn btn-ghost btn-sm' + (s.soundtrack === id ? ' active' : ''), title: prof.blurb },
        prof.name,
      );
      b.addEventListener('click', () => {
        this.patch({ soundtrack: id });
        trackWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
      trackWrap.append(b);
    }
    body.append(trackWrap);

    // ── key rebinding for the core actions (keyboard only; gamepad/touch unchanged) ──
    body.append(el('div', { class: 'setting setting-section' }, el('span', {}, 'KEY BINDINGS')));
    const rebindBtns: Array<{ action: 'dash' | 'overdrive' | 'pause'; btn: HTMLButtonElement }> = [];
    const refreshKeyLabels = () => {
      for (const { action, btn } of rebindBtns) btn.textContent = keyLabel(this.settings.keymap[action]);
    };
    const rebindRow = (label: string, action: 'dash' | 'overdrive' | 'pause') => {
      const btn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, keyLabel(this.settings.keymap[action]));
      rebindBtns.push({ action, btn });
      btn.addEventListener('click', () => {
        if (this.rebinding) return; // one capture at a time
        this.rebinding = action;
        btn.classList.add('active');
        btn.textContent = 'press a key…';
        const onKey = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation(); // swallow the capture key so it can't also trigger the old binding
          window.removeEventListener('keydown', onKey, true);
          this.rebinding = null;
          btn.classList.remove('active');
          const k = e.key.toLowerCase();
          // Escape cancels the capture; anything else binds (single key — the default's
          // extra alias is dropped on an explicit rebind).
          if (k !== 'escape') this.patch({ keymap: { ...this.settings.keymap, [action]: [k] } });
          refreshKeyLabels();
        };
        // capture phase so we intercept BEFORE the global game keydown handler reacts
        window.addEventListener('keydown', onKey, true);
      });
      return el('label', { class: 'setting' }, el('span', {}, label), btn);
    };
    body.append(
      rebindRow('Dash', 'dash'),
      rebindRow('Overdrive', 'overdrive'),
      rebindRow('Pause', 'pause'),
    );
    const resetKeys = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Reset keys to default');
    resetKeys.addEventListener('click', () => {
      this.patch({ keymap: defaultKeyBindings() });
      refreshKeyLabels();
    });
    body.append(el('div', { class: 'setting' }, resetKeys));

    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeSettings());
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.settingsPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  private buildStats(): void {
    const h = el('h2', {}, 'STATS');
    const body = el('div', { class: 'stats-body' });
    body.id = 'stats-body';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.statsPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.statsPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  private openStats(): void {
    const s = this.saveRef;
    if (!s) return;
    const body = this.statsPanel.querySelector('#stats-body')!;
    // stat(label, value) — label-first, matching the helper + the game-over panel
    // (the value is the big/bold .go-stat-v; the label is the small .go-stat-l)
    const lifetime = el('div', { class: 'stats-grid' },
      stat('high score', s.highScore.toLocaleString()),
      stat('best combo', `x${s.bestCombo}`),
      stat('runs', String(s.totalRuns)),
      stat('total kills', s.lifeKills.toLocaleString()),
      stat('bosses down', String(s.lifeBoss)),
      stat('shards earned', s.lifeShards.toLocaleString()),
    );
    const achWrap = el('div', { class: 'ach-grid' });
    const unlockedCount = ACHIEVEMENTS.filter((a) => s.achievements.includes(a.id)).length;
    for (const a of ACHIEVEMENTS) {
      const got = s.achievements.includes(a.id);
      achWrap.append(
        el('div', { class: 'ach' + (got ? ' got' : '') },
          el('div', { class: 'ach-name' }, (got ? '🏆 ' : '🔒 ') + a.name),
          el('div', { class: 'ach-desc' }, a.desc),
        ),
      );
    }
    body.replaceChildren(
      el('div', { class: 'stats-label' }, 'LIFETIME'),
      lifetime,
      el('div', { class: 'stats-label' }, `ACHIEVEMENTS · ${unlockedCount}/${ACHIEVEMENTS.length}`),
      achWrap,
    );
    this.openModal(this.statsPanel);
  }

  private buildUpgrades(): void {
    const h = el('h2', {}, 'UPGRADES');
    const bal = el('div', { class: 'upg-balance' }, '');
    bal.id = 'upg-balance';
    const body = el('div', { class: 'upg-body' });
    body.id = 'upg-body';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.upgradesPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, bal, body, close);
    this.upgradesPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  openUpgrades(): void {
    const s = this.saveRef;
    if (!s) return;
    (this.upgradesPanel.querySelector('#upg-balance')!).textContent = `◆ ${s.shards.toLocaleString()} shards`;
    const body = this.upgradesPanel.querySelector('#upg-body')!;
    body.replaceChildren();
    for (const node of META_NODES) {
      const lvl = s.meta?.[node.id] ?? 0;
      const maxed = lvl >= node.maxLevel;
      const cost = nodeCost(node, lvl);
      const affordable = !maxed && s.shards >= cost;
      const pips = el('div', { class: 'upg-pips' });
      for (let i = 0; i < node.maxLevel; i++) pips.append(el('span', { class: 'pip' + (i < lvl ? ' on' : '') }));
      const btn = el('button', { class: 'btn btn-sm' + (affordable ? ' btn-primary' : '') }, maxed ? 'MAX' : `◆ ${cost}`);
      if (maxed) btn.setAttribute('disabled', 'true');
      btn.addEventListener('click', () => this.cb.onBuyMeta(node.id));
      const card = el('div', { class: 'upg-node' + (maxed ? ' maxed' : '') },
        el('div', { class: 'upg-info' },
          el('div', { class: 'upg-name' }, `${node.name}  ${lvl}/${node.maxLevel}`),
          el('div', { class: 'upg-desc' }, node.desc),
          pips,
        ),
        btn,
      );
      body.append(card);
    }
    this.openModal(this.upgradesPanel);
  }

  private patch(p: Partial<Settings>): void {
    Object.assign(this.settings, p);
    if (p.hudScale !== undefined) this.applyHudScale();
    this.cb.onSettingsChange(this.settings);
  }

  private applyHudScale(): void {
    this.root.style.setProperty('--hud-scale', String(this.settings.hudScale));
  }

  private openSettings(): void {
    // buildSettings() ran in the constructor before any save loaded, so the city-memory
    // checkbox was rendered against a null saveRef. Re-sync it to the live save on open.
    if (this.cityMemToggle) this.cityMemToggle.checked = this.saveRef?.cityMemoryMeter ?? true;
    this.openModal(this.settingsPanel);
  }
  private closeSettings(): void {
    this.closeModal(this.settingsPanel);
  }

  private buildHowTo(): void {
    const h = el('h2', {}, 'HOW TO PLAY');
    const body = el('div', { class: 'howto-body' });
    body.id = 'howto-body';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.howtoPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.howtoPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  /** CREDITS — the player-facing audio attribution surface (CC BY 3.0 requires visible credit). */
  private buildCredits(): void {
    const c = audioCredits();
    const h = el('h2', {}, '♪ AUDIO CREDITS');
    const body = el('div', { class: 'howto-body' });
    body.append(
      el('div', { class: 'howto-rule' }, el('b', {}, 'MUSIC'), el('span', {}, 'free-licensed, used under Creative Commons')),
    );
    for (const line of c.music) body.append(el('div', { class: 'credit-line' }, line));
    body.append(el('div', { class: 'howto-rule' }, el('b', {}, 'SOUND'), el('span', {}, '')));
    for (const line of c.sfx) body.append(el('div', { class: 'credit-line' }, line));
    body.append(
      el('div', { class: 'credit-foot' }, 'The recurring LANCE THEME melody + the procedural reactive layer are original to LANCEFALL.'),
    );
    body.append(
      el(
        'div',
        { class: 'credit-foot credit-dedication' },
        'Made for the June Solstice Game Jam — an ode to Alan Turing (1912–1954): code-breaking, algorithms, and the machine that learned to think. Every cipher here is a small tribute.',
      ),
    );
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.creditsPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.creditsPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  private showCredits(): void {
    this.openModal(this.creditsPanel);
  }

  /** THE FALL — the premise card (the encryption story). Diegetic; sets the
   *  Turing×solstice frame for new players and the jam judges. */
  private buildFall(): void {
    const h = el('h2', {}, 'THE FALL');
    const body = el('div', { class: 'howto-body fall-prose' });
    const paras = [
      'Lancefall was a kingdom whose memory was kept as living light — every name, every bell, every street written in code, so the dark would always have somewhere to fail.',
      'When the fear came, the Six did not let the city fall. They enciphered it — scrambled its light into grey noise, so the loss could not be read, or felt.',
      'You are the last key: a spear that reads the pattern and breaks it. Descend through the cipher of the fall, crack the six who hold the rotors, and decrypt the city back to its longest day — when the light stands highest, and the dark, at last, begins to lose.',
      'To decrypt is to remember. To remember is to relight.',
    ];
    for (const p of paras) body.append(el('p', { class: 'fall-para' }, p));
    const close = el('button', { class: 'btn btn-primary' }, 'DESCEND');
    close.addEventListener('click', () => this.closeModal(this.fallPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.fallPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  private showFall(): void {
    this.openModal(this.fallPanel);
  }

  private buildDuel(): void {
    const h = el('h2', {}, '⚔ ACCEPT A DUEL');
    const blurb = el(
      'div',
      { class: 'event-flavor' },
      'A friend sent you a duel code? Paste it below. You\'ll fall through their exact seed, racing their translucent ghost — beat their score to win.',
    );
    const input = el('textarea', {
      class: 'duel-input',
      rows: '4',
      placeholder: 'Paste duel code…',
    }) as HTMLTextAreaElement;
    const accept = el('button', { class: 'btn btn-primary' }, 'ACCEPT DUEL');
    accept.addEventListener('click', () => {
      const code = input.value.trim();
      if (!code) return;
      this.closeModal(this.duelPanel);
      input.value = '';
      this.cb.onAcceptChallenge(code);
    });
    const close = el('button', { class: 'btn btn-ghost' }, 'CANCEL');
    close.addEventListener('click', () => this.closeModal(this.duelPanel));
    // 4.1 — CHALLENGE THE DEV: a pinned fixed-seed run (races the author ghost if bundled).
    const devBlurb = el(
      'div',
      { class: 'event-flavor' },
      'Or take the dev\'s gauntlet: a pinned fixed seed everyone shares. Beat it, then ⚔ DUEL your run back.',
    );
    const dev = el('button', { class: 'btn btn-ghost' }, '⚑ CHALLENGE THE DEV');
    dev.addEventListener('click', () => {
      this.closeModal(this.duelPanel);
      this.cb.onChallengeDev();
    });
    const panel = el(
      'div',
      { class: 'panel' },
      h,
      blurb,
      input,
      el('div', { class: 'go-row' }, accept, close),
      devBlurb,
      el('div', { class: 'go-row' }, dev),
    );
    this.duelPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  private openDuel(): void {
    this.openModal(this.duelPanel);
    const input = this.duelPanel.querySelector('.duel-input') as HTMLTextAreaElement | null;
    input?.focus();
  }

  /** 4.4 — open the DUEL panel pre-filled with a code arriving from a shared `#duel=` link.
   *  The player reads the blurb + the challenger's context, then hits ACCEPT (same flow as a
   *  manual paste). Public so the boot URL-router can call it; additive (no UICallbacks change). */
  openDuelWithCode(code: string): void {
    this.openModal(this.duelPanel);
    const input = this.duelPanel.querySelector('.duel-input') as HTMLTextAreaElement | null;
    if (input) {
      input.value = code;
      input.focus();
      input.select();
    }
  }

  // INSPECT A BUILD — paste a Build DNA code (someone hit COPY BUILD) and read back
  // exactly what they ran. Pure decode + display; closes the export-only loop.
  private buildInspect(): void {
    const h = el('h2', {}, '⧬ INSPECT A BUILD');
    const blurb = el(
      'div',
      { class: 'event-flavor' },
      'Paste a Build DNA code (a friend hit COPY BUILD) to read exactly what they ran — ship, heat, perks, fusions, relics.',
    );
    const input = el('textarea', { class: 'duel-input', rows: '3', placeholder: 'Paste build code (L1…)…' }) as HTMLTextAreaElement;
    const result = el('div', { class: 'howto-rules' });
    const inspect = el('button', { class: 'btn' }, 'INSPECT');
    inspect.addEventListener('click', () => {
      result.replaceChildren();
      const dna = decodeBuildDna(input.value.trim());
      if (!dna) {
        result.append(el('div', { class: 'event-flavor' }, input.value.trim() ? 'That is not a valid Build DNA code.' : 'Paste a build code first.'));
        return;
      }
      for (const row of describeBuild(dna)) {
        result.append(el('div', { class: 'howto-rule' }, el('b', {}, row.label), el('span', {}, row.value)));
      }
    });
    const close = el('button', { class: 'btn btn-ghost' }, 'CLOSE');
    close.addEventListener('click', () => this.closeModal(this.inspectPanel));
    const panel = el('div', { class: 'panel' }, h, blurb, input, el('div', { class: 'go-row' }, inspect, close), result);
    this.inspectPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  private openInspect(): void {
    const result = this.inspectPanel.querySelector('.howto-rules');
    result?.replaceChildren(); // clear any prior inspection
    const input = this.inspectPanel.querySelector('.duel-input') as HTMLTextAreaElement | null;
    if (input) input.value = '';
    this.openModal(this.inspectPanel);
    input?.focus();
  }

  private buildCodex(): void {
    const h = el('h2', {}, 'CODEX');
    const body = el('div', { class: 'codex-body' });
    this.codexMemories = el('div', { class: 'codex-memories' });
    body.append(this.codexMemories);
    for (const { cat, label } of CODEX_CATEGORIES) {
      body.append(el('div', { class: 'stats-label' }, label));
      const grid = el('div', { class: 'codex-grid' });
      for (const e of BESTIARY.filter((x) => x.cat === cat)) {
        const card = el('div', { class: 'codex-entry' });
        card.style.setProperty('--accent', e.accent);
        card.append(
          el('div', { class: 'codex-name' }, e.name),
          el('div', { class: 'codex-blurb' }, e.blurb),
        );
        grid.append(card);
      }
      body.append(grid);
    }
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.codexPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.codexPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  /** Render THE FALL · MEMORIES (fragment balance + lore unlocks). Public so the
   *  game can re-render after a successful unlock. */
  refreshMemories(): void {
    const s = this.saveRef;
    if (!this.codexMemories) return;
    this.codexMemories.replaceChildren();
    if (!s) return;
    const bal = fragmentBalance(s);
    this.codexMemories.append(
      el('div', { class: 'stats-label' }, 'THE FALL · MEMORIES'),
      el(
        'div',
        { class: 'codex-frag' },
        `◆ ${bal} Memory Fragment${bal === 1 ? '' : 's'} — one is carried out of every descent. Spend them to decrypt what was lost.`,
      ),
    );
    const grid = el('div', { class: 'codex-grid' });
    for (const e of LORE) {
      const unlocked = loreUnlocked(s, e.id);
      const card = el('div', { class: 'codex-entry' + (unlocked ? '' : ' codex-forgotten') });
      if (unlocked) {
        card.append(el('div', { class: 'codex-name' }, e.title), el('div', { class: 'codex-blurb' }, e.text));
      } else {
        const affordable = bal >= e.cost;
        const btn = el('button', { class: 'btn btn-sm' + (affordable ? ' btn-primary' : '') }, `DECRYPT ◆${e.cost}`);
        if (!affordable) btn.setAttribute('disabled', 'true');
        btn.addEventListener('click', () => this.cb.onUnlockLore(e.id));
        card.append(
          el('div', { class: 'codex-name codex-locked' }, '— enciphered —'),
          el('div', { class: 'codex-blurb codex-locked' }, `A memory of the fall, enciphered. ◆${e.cost} to decrypt it.`),
          btn,
        );
      }
      grid.append(card);
    }
    this.codexMemories.append(grid);
  }

  private showCodex(): void {
    this.refreshMemories();
    this.openModal(this.codexPanel);
  }

  private showHowTo(): void {
    const body = this.howtoPanel.querySelector('#howto-body')!;
    const rule = (k: string, v: string) => el('div', { class: 'howto-rule' }, el('b', {}, k), el('span', {}, v));
    const basics = el('div', { class: 'howto-rules' },
      rule('Move', 'WASD / arrows / left stick'),
      rule('Dash', 'Hold to charge, release to spear through enemies (mouse / Space / RT)'),
      rule('I-frames', 'You are invincible mid-dash — dash through bullets and bosses'),
      rule('Combo', 'Chain kills before the timer runs out to multiply score — hit ×50 and your combo ERUPTS into a bullet-clearing nova'),
      rule('Graze', 'Skim bullets without being hit to refill stamina'),
      rule('DAYBREAK', 'Kills + grazes charge the bottom meter. When it reads READY, tap F (or gamepad LB) to break the cipher — a time-slowing, screen-clearing burst of light'),
      rule('Power-ups', 'Bosses and Champions drop timed buffs — run over the glowing pickup to grab it (one active at a time)'),
      rule('Last Breath', 'A fatal hit triggers a one-off bullet-time second wind — dash to safety before it fades'),
      rule('Champions', 'Gold-aura elites are tanky but rain shards — mind the death blast'),
      rule('Bosses', 'Dash through the safe gaps. THE SOVEREIGN is the master cipher — its CORES are a keypad; dash them in the order the CIPHER readout shows to crack it open, then punish the exposed crown'),
      rule('Cipher', 'A cipher-locked boss is armored until you BREAK its code: READ THE KEY — the legend maps each ciphered symbol to a letter — then dash the cores whose symbols spell the message, in order. A wrong key just fizzles (progress is kept), so wait for a safe lane and read the next symbol. (Every boss is a cipher in SOLSTICE PROTOCOL.)'),
      rule('Perks', 'Pick a perk every few waves. They STACK — that is the snowball'),
      rule('Unlocks', 'Spend shards on ships + palettes + dash trails; beat the Sovereign for the gold CROWN trail'),
    );
    const evoCards = el('div', { class: 'howto-evos' });
    for (const id of Object.keys(EVOLUTIONS) as (keyof typeof EVOLUTIONS)[]) {
      const e = EVOLUTIONS[id];
      const card = el('div', { class: 'howto-evo' });
      card.style.setProperty('--accent', e.accent);
      card.append(
        el('div', { class: 'howto-evo-name' }, e.name),
        el('div', { class: 'howto-evo-from' }, e.from),
        el('div', { class: 'howto-evo-desc' }, e.desc),
      );
      evoCards.append(card);
    }
    body.replaceChildren(
      basics,
      el('div', { class: 'stats-label' }, 'EVOLUTIONS · stack the recipe to unlock a fusion'),
      evoCards,
    );
    this.openModal(this.howtoPanel);
  }

  private buildHeat(): void {
    const h = el('h2', {}, 'HEAT ASCENSION');
    const sub = el('div', { class: 'event-flavor' }, 'Crank the difficulty for a bigger score multiplier. Your call — every run.');
    const grid = el('div', { class: 'heat-grid' });
    grid.id = 'heat-grid';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.heatPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, sub, grid, close);
    this.heatPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  openHeat(): void {
    const s = this.saveRef;
    if (!s) return;
    const grid = this.heatPanel.querySelector('#heat-grid')!;
    grid.replaceChildren();
    for (const lvl of HEAT_LEVELS) {
      const selected = s.selectedHeat === lvl.level;
      const card = el('button', { class: 'heat-card' + (selected ? ' selected' : '') });
      card.style.setProperty('--accent', lvl.accent);
      card.append(
        el('div', { class: 'heat-num' }, lvl.level === 0 ? 'OFF' : `H${lvl.level}`),
        el('div', { class: 'heat-name' }, lvl.name),
        el('div', { class: 'heat-desc' }, lvl.desc),
        el('div', { class: 'heat-mul' }, `×${lvl.scoreMul.toFixed(2)} score`),
      );
      card.addEventListener('click', () => {
        this.cb.onHeatChange(lvl.level);
        this.openHeat(); // re-render selection
      });
      grid.append(card);
    }
    this.openModal(this.heatPanel);
  }

  private buildArchetype(): void {
    const h = el('h2', {}, 'BUILD ARCHETYPE');
    const sub = el('div', { class: 'event-flavor' }, 'Bias your perk draft toward a build path. Or stay FREESTYLE and take what comes.');
    const grid = el('div', { class: 'heat-grid' });
    grid.id = 'arch-grid';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.archetypePanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, sub, grid, close);
    this.archetypePanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  openArchetype(): void {
    const s = this.saveRef;
    if (!s) return;
    const grid = this.archetypePanel.querySelector('#arch-grid')!;
    grid.replaceChildren();
    for (const a of ARCHETYPES) {
      const selected = s.selectedArchetype === a.id;
      const card = el('button', { class: 'heat-card' + (selected ? ' selected' : '') });
      card.style.setProperty('--accent', a.accent);
      card.append(
        el('div', { class: 'heat-name' }, a.name),
        el('div', { class: 'heat-desc' }, a.desc),
      );
      card.addEventListener('click', () => {
        this.cb.onArchetypeChange(a.id);
        this.openArchetype();
      });
      grid.append(card);
    }
    this.openModal(this.archetypePanel);
  }

  private buildLeaderboard(): void {
    const h = el('h2', {}, 'LEADERBOARD');
    const body = el('div', { class: 'leader-body' });
    body.id = 'leader-body';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.leaderPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.leaderPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  openLeaderboard(): void {
    const s = this.saveRef;
    if (!s) return;
    const body = this.leaderPanel.querySelector('#leader-body')!;
    body.replaceChildren();

    // handle field — always available (used for online submission)
    const nameWrap = el('div', { class: 'leader-name' });
    const label = el('label', {}, 'Your handle');
    const input = el('input', { type: 'text', maxlength: '16', value: s.handle, placeholder: 'ACE' }) as HTMLInputElement;
    input.addEventListener('change', () => this.cb.onSetHandle(input.value));
    nameWrap.append(label, input);
    body.append(nameWrap);

    if (!leaderboardEnabled()) {
      body.append(el('div', { class: 'event-flavor' }, 'Online leaderboards are not configured for this build. Your scores are saved locally; set a handle so they\'re ready when boards go live.'));
      this.openModal(this.leaderPanel);
      return;
    }

    // candour over a cheat-cap: the game is client-authoritative, so be honest about it
    // (a developer audience respects that more than a silently spoofable "global" board).
    body.append(
      el('div', { class: 'event-flavor leader-note' }, '🛈 Community board — scores are client-reported and unverified.'),
    );

    const modeRow = el('div', { class: 'leader-modes' });
    const scopeRow = el('div', { class: 'leader-modes' });
    const listWrap = el('div', { class: 'leader-list' }, el('div', { class: 'event-flavor' }, 'Loading…'));
    // must mirror src/modes.ts MODES (and the worker's MODES allow-set) so every
    // submittable mode is also viewable — ARENA + SOLSTICE PROTOCOL were submitted
    // but had no board tab.
    const modes: { id: string; name: string }[] = [
      { id: 'endless', name: 'ENDLESS' }, { id: 'arena', name: 'ARENA' }, { id: 'daily', name: 'ECHO OF THE FALL' }, { id: 'weekly', name: 'WEEKLY SIEGE' }, { id: 'nightmare', name: 'NIGHTMARE' }, { id: 'bossrush', name: 'BOSS RUSH' }, { id: 'longestday', name: 'SOLSTICE PROTOCOL' },
    ];
    let curMode = 'endless';
    let curWeekly = false;
    const allBtn = el('button', { class: 'btn btn-ghost btn-sm' }, 'ALL-TIME');
    const wkBtn = el('button', { class: 'btn btn-ghost btn-sm' }, '★ THIS WEEK');
    const load = async () => {
      const weekly = curWeekly && curMode !== 'daily'; // daily is already date-scoped
      scopeRow.classList.toggle('hidden', curMode === 'daily');
      allBtn.classList.toggle('btn-primary', !weekly);
      wkBtn.classList.toggle('btn-primary', weekly);
      listWrap.replaceChildren(el('div', { class: 'event-flavor' }, 'Loading…'));
      const entries = await fetchLeaderboard(curMode, curMode === 'daily' ? dateString() : undefined, weekly);
      listWrap.replaceChildren();
      if (entries.length === 0) {
        listWrap.append(el('div', { class: 'event-flavor' }, weekly ? 'No scores this week yet — be the first.' : 'No scores yet — be the first.'));
        return;
      }
      entries.forEach((e, i) => {
        listWrap.append(el('div', { class: 'leader-row' },
          el('span', { class: 'leader-rank' }, `#${e.rank ?? i + 1}`),
          el('span', { class: 'leader-handle' }, e.name || '—'),
          el('span', { class: 'leader-score' }, e.score.toLocaleString()),
          el('span', { class: 'leader-meta' }, `w${e.wave}${e.heat ? ` · H${e.heat}` : ''}`),
        ));
      });
    };
    allBtn.addEventListener('click', () => { curWeekly = false; void load(); });
    wkBtn.addEventListener('click', () => { curWeekly = true; void load(); });
    scopeRow.append(allBtn, wkBtn);
    for (const m of modes) {
      const b = el('button', { class: 'btn btn-ghost btn-sm' }, m.name);
      // the WEEKLY SIEGE board is canonically the this-week scope — default to it on select
      b.addEventListener('click', () => { curMode = m.id; if (m.id === 'weekly') curWeekly = true; void load(); });
      modeRow.append(b);
    }
    body.append(modeRow, scopeRow, listWrap);
    void load();
    this.openModal(this.leaderPanel);
  }

  // ── screen control ──
  private current: ScreenId = 'title';
  show(s: ScreenId): void {
    this.current = s;
    this.title.classList.toggle('hidden', s !== 'title');
    // ── cockpit soul: orchestrate the bootIn reveal + the FIRST LIGHT idle teaser ──
    if (s === 'title') {
      // re-trigger the staggered bootIn each time we land on the title (replayAnim
      // forces the reflow); under reduce-motion the class is inert (STILL CITY css).
      this.replayAnim(this.title, 'boot-in');
      this.prevSelectedMode = null; // the reveal subsumes the first swap; don't double up
      this.startFirstLightIdle();
    } else {
      this.title.classList.remove('boot-in');
      this.stopFirstLightIdle();
      this.heroEl?.classList.remove('first-light');
    }
    this.pause.classList.toggle('hidden', s !== 'paused');
    this.gameover.classList.toggle('hidden', s !== 'gameover');
    this.draft.classList.toggle('hidden', s !== 'draft');
    this.eventPanel.classList.toggle('hidden', s !== 'event');
    this.hud.classList.toggle('hidden', s !== 'playing');
    // §1.2 — any standard screen transition force-hides the sandbox teach overlay so it
    // can never leak into a real run / menu (the Game shows it explicitly via showSandbox).
    this.sandboxOverlay.classList.add('hidden');
    // any screen transition dismisses every modal so none can block play or strand the
    // focus-trap; clear the open-stack/opener bookkeeping to match (focus is set below).
    for (const p of this.modalPanels) {
      if (!p.classList.contains('hidden')) this.modalOnClose.get(p)?.(); // run teardown (e.g. revoke the share blob URL)
      p.classList.add('hidden');
      this.modalOpener.delete(p);
    }
    this.openStack.length = 0;
    if (s !== 'paused') {
      this.pauseRestartArmed = false;
    }
    // move keyboard focus to the active screen's primary action
    const active = { title: this.title, paused: this.pause, gameover: this.gameover, draft: this.draft, event: this.eventPanel, playing: null }[s];
    if (active) {
      // on the title, foreground PLAY explicitly (it is the dominant action)
      const btn = (s === 'title' ? this.playBtn : (active.querySelector('.btn-primary, .perk-card, .btn') as HTMLElement | null));
      btn?.focus();
    }
  }

  refreshTitle(save: SaveData): void {
    this.saveRef = save;

    // ── coerce an invalid/locked selection ONCE so the rail always has a valid card ──
    // (e.g. a Nightmare/Solstice selection from before it was earned, or a non-rail mode
    // like Weekly that has no rail card). Guarded so the re-entrant refreshTitle can't loop.
    if (!this.coercingMode) {
      const sel = modeById(save.selectedMode);
      const onRail = RAIL_MODE_IDS.includes(sel.id) && modeUnlocked(sel, save.deepestWave);
      if (!onRail) {
        const firstUnlocked = RAIL_MODE_IDS.find((id) => modeUnlocked(modeById(id), save.deepestWave)) ?? 'endless';
        this.coercingMode = true;
        this.cb.onSelectMode(firstUnlocked); // persists → re-enters refreshTitle (guarded)
        this.coercingMode = false;
        return; // the re-entrant call painted everything with the corrected selection
      }
    }

    // ── HEADER stats ──
    this.hsBest.textContent = save.highScore > 0 ? save.highScore.toLocaleString() : '—';
    this.hsCombo.textContent = save.bestCombo > 0 ? `×${save.bestCombo}` : '—';
    this.hsShards.textContent = `◆ ${save.shards.toLocaleString()}`;
    // 4.2 — show the streak chip only once a 2+ day streak is alive
    const streaking = save.playStreak >= 2;
    this.hsStreak.classList.toggle('hidden', !streaking);
    if (streaking) this.hsStreak.textContent = `🔥 ${save.playStreak} day streak`;

    // NG+ toggle — appears only once the Sovereign has been felled
    const ngUnlocked = save.ngPlusLevel >= 1;
    this.ngBtn.classList.toggle('hidden', !ngUnlocked);
    this.ngBtn.classList.toggle('active', save.ngPlusActive);
    this.ngBtn.textContent = save.ngPlusActive ? `★ NG+${save.ngPlusLevel}` : `NG+${save.ngPlusLevel}`;
    this.ngBtn.title = save.ngPlusActive ? `New Game+ ${save.ngPlusLevel} active — tap to turn off` : 'New Game+ — tap to turn on';

    // legacy daily caption (kept hidden) — preserves the old read-site contract.
    let daily = `Echo of the Fall · ${dateString()}`;
    if (save.dailySeed === seedFromDate() && save.dailyBest > 0) {
      daily += ` · your best ${save.dailyBest.toLocaleString()}`;
    }
    const dUsed = save.dailyAttemptDate === dateString() ? save.dailyAttempts : 0;
    daily += dUsed >= MAX_DAILY_ATTEMPTS ? ` · ${MAX_DAILY_ATTEMPTS}/${MAX_DAILY_ATTEMPTS} done today` : ` · Attempt ${dUsed + 1}/${MAX_DAILY_ATTEMPTS}`;
    this.dailyCaption.textContent = daily;

    // ── LOADOUT: ship art + name/desc + HEAT pips ──
    const ship = shipById(save.selectedShip);
    this.paintShipGlyph(this.shipArt, ship.id, ship.accent);
    this.shipArt.style.filter = `drop-shadow(0 0 12px ${ship.accent})`;
    this.shipArtName.textContent = ship.name;
    this.shipArtName.style.color = ship.accent;
    this.shipArtDesc.textContent = ship.desc;
    this.paintHeatPips(save.selectedHeat);

    this.shipRow.replaceChildren();
    for (const ship of SHIPS) {
      const unlocked = save.unlockedShips.includes(ship.id);
      const selected = save.selectedShip === ship.id;
      const chip = el('button', { class: 'ship-chip' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked') });
      chip.style.setProperty('--accent', ship.accent);
      const glyph = el('canvas', { class: 'ship-glyph' }) as HTMLCanvasElement;
      this.paintShipGlyph(glyph, ship.id, ship.accent);
      chip.append(
        el(
          'div',
          { class: 'ship-info' },
          el('div', { class: 'ship-name' }, ship.name),
          el('div', { class: 'ship-desc' }, ship.desc),
          el('div', { class: 'ship-status' }, unlocked ? (selected ? 'EQUIPPED' : 'tap to equip') : `◆ ${ship.unlockShards.toLocaleString()}`),
        ),
        el('div', { class: 'ship-preview' }, glyph), // hidden by default; reveals big below the text on hover
      );
      chip.title = ship.desc;
      chip.addEventListener('click', () => {
        if (unlocked) this.cb.onSelectShip(ship.id);
        else this.cb.onUnlockShip(ship.id);
      });
      this.shipRow.append(chip);
    }

    this.themeRow.replaceChildren();
    for (const theme of THEMES) {
      const unlocked = save.unlockedThemes.includes(theme.id);
      const selected = save.selectedTheme === theme.id;
      const sw = el('button', { class: 'theme-sw' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked') });
      sw.style.setProperty('--a', theme.accent);
      sw.style.setProperty('--b', theme.accent2);
      sw.title = unlocked ? theme.name : `${theme.name} — ◆ ${theme.unlockShards}`;
      sw.append(el('span', { class: 'theme-name' }, unlocked ? theme.name : `◆${theme.unlockShards}`));
      sw.addEventListener('click', () => {
        if (unlocked) this.cb.onSelectTheme(theme.id);
        else this.cb.onUnlockTheme(theme.id);
      });
      this.themeRow.append(sw);
    }

    this.trailRow.replaceChildren();
    for (const trail of TRAILS) {
      const unlocked = save.unlockedTrails.includes(trail.id);
      const selected = save.selectedTrail === trail.id;
      const sw = el('button', { class: 'theme-sw' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked') });
      sw.style.setProperty('--a', trail.combo ? '#22d3ee' : trail.base);
      sw.style.setProperty('--b', trail.bright);
      const req = trail.unlockAch ? '★' : `◆${trail.unlockShards}`;
      sw.title = unlocked ? trail.name : `${trail.name} — ${trail.unlockAch ? 'beat the Sovereign' : `◆ ${trail.unlockShards}`}`;
      sw.append(el('span', { class: 'theme-name' }, unlocked ? trail.name : req));
      sw.addEventListener('click', () => {
        if (unlocked) this.cb.onSelectTrail(trail.id);
        else this.cb.onUnlockTrail(trail.id);
      });
      this.trailRow.append(sw);
    }

    // ── LEFT: MODE RAIL (RAIL_MODE_IDS order; roving tabindex; locked = dimmed, not pickable) ──
    this.modeGrid.replaceChildren();
    for (const id of RAIL_MODE_IDS) {
      const m = modeById(id);
      const selected = save.selectedMode === m.id;
      const unlocked = modeUnlocked(m, save.deepestWave);
      const brief = modeBrief(m);
      const card = el('button', {
        class: 'mode-card ck-mi' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked'),
        'aria-pressed': String(selected),
        'aria-disabled': unlocked ? 'false' : 'true',
        tabindex: selected ? '0' : '-1',
      });
      card.style.setProperty('--accent', railAccent(m.id));
      card.style.setProperty('--accent-rgb', hexToRgb(railAccent(m.id)));
      const text = el(
        'div',
        { class: 'ck-mi-text' },
        el('div', { class: 'ck-mi-name' }, m.name),
        el('div', { class: 'ck-mi-sub' }, `${brief.tier}${brief.note ? ` · ${brief.note}` : ''}`),
      );
      // PB line on the selected card (and a "new? start here" nudge on Casual for fresh saves).
      if (selected) {
        const pb = m.seedKind === 'date'
          ? (save.dailyBest > 0 ? save.dailyBest.toLocaleString() : '—')
          : (save.highScore > 0 ? save.highScore.toLocaleString() : '—');
        text.append(el('div', { class: 'ck-mi-pb' }, `PB ${pb}`));
      }
      card.append(iconEl('ck-mi-icon', MODE_ICONS[m.id] ?? ''), text);
      if (!unlocked) {
        card.append(el('div', { class: 'ck-mi-badge locked' }, `LOCKED · reach wave ${m.unlockedAtWave}`));
      } else if (m.id === 'casual' && save.totalRuns === 0) {
        card.append(el('div', { class: 'ck-mi-badge start' }, 'START HERE'));
      } else if (m.seedKind === 'date') {
        card.append(el('div', { class: 'ck-mi-badge daily' }, 'DAILY'));
      }
      card.title = unlocked ? m.desc : `Locked — reach wave ${m.unlockedAtWave} to unlock ${m.name}.`;
      card.addEventListener('click', () => {
        if (unlocked) this.cb.onSelectMode(m.id);
      });
      this.modeGrid.append(card);
    }

    // ── CENTER: SELECTED RUN ──
    this.refreshSelectedRun(save);
    this.playBtn.title = 'Descend — play ' + modeById(save.selectedMode).name;
  }

  /** Paint the center SELECTED-RUN hero panel from the selected mode (purity-safe mutator
   *  preview only). Also drives the mode accent across the cockpit + the DESCEND sub-line. */
  private refreshSelectedRun(save: SaveData): void {
    const m = modeById(save.selectedMode);
    const accent = railAccent(m.id);
    const rgb = hexToRgb(accent);
    this.mainPanel.style.setProperty('--accent', accent);
    this.mainPanel.style.setProperty('--accent-rgb', rgb);
    this.centerSec.style.setProperty('--accent', accent);

    const brief = modeBrief(m);
    const seeded = modeSeeded(m);
    const seed = m.seedKind === 'week' ? seedFromWeek() : m.seedKind === 'date' ? seedFromDate() : 0;
    // PURITY-CRITICAL: preview mutators only via the dedicated preview fns (own rng stream).
    const muts = m.seedKind === 'week' ? weeklyMutatorPreview(seed) : m.seedKind === 'date' ? dailyMutatorPreview(seed) : [];

    // hero seed rule (only for seeded modes), title, tags, desc
    this.heroSeedRow.replaceChildren();
    if (seeded) {
      this.heroSeedRow.append(
        el('span', { class: 'ck-seed-rule' }),
        el('span', { class: 'ck-seed-txt' }, `◇ ${seed} ◇`),
        el('span', { class: 'ck-seed-rule r' }),
      );
    }
    this.heroSeedRow.classList.toggle('hidden', !seeded);
    this.heroTitle.textContent = m.name;
    this.heroTags.textContent = [brief.tier, brief.note].filter(Boolean).join(' · ');
    this.heroDesc.textContent = m.desc;

    // info bar: (Daily) ATTEMPT x/3 · SEED · MUTATOR chips
    this.infoBar.replaceChildren();
    const ii = (label: string, ...val: (Node | string)[]) =>
      el('div', { class: 'ck-ii' }, el('div', { class: 'ck-ii-lbl' }, label), el('div', { class: 'ck-ii-val' }, ...val));
    const sep = () => el('div', { class: 'ck-ii-sep' });
    if (m.seedKind === 'date') {
      const roll = rollDailyAttempt(dateString(), save.dailyAttemptDate, save.dailyAttempts);
      this.infoBar.append(ii('ATTEMPT', `${Math.min(roll.attempts + 1, MAX_DAILY_ATTEMPTS)} / ${MAX_DAILY_ATTEMPTS}`), sep());
    }
    if (seeded) {
      this.infoBar.append(ii('SEED', String(seed)), sep());
      const mutWrap = el('div', { class: 'ck-mut-chips' });
      if (muts.length === 0) mutWrap.append(el('span', { class: 'ck-mut-none' }, 'NONE'));
      for (const mut of muts) {
        const chip = el('span', { class: 'ck-mut-chip' }, mut.name);
        chip.style.setProperty('--accent', mut.accent);
        mutWrap.append(chip);
      }
      this.infoBar.append(el('div', { class: 'ck-ii' }, el('div', { class: 'ck-ii-lbl' }, 'MUTATOR'), mutWrap), sep());
    }
    this.infoBar.append(ii('HEAT', save.selectedHeat > 0 ? `H${save.selectedHeat}` : 'OFF'));
    this.infoBar.classList.toggle('hidden', this.infoBar.childElementCount === 0);

    // reward chips: shard reward + leaderboard status
    this.rewardRow.replaceChildren();
    const rewardChip = (cls: string, lbl: string, val: string) =>
      el('div', { class: `ck-rc ${cls}` }, el('div', { class: 'ck-rc-dot' }), el('div', { class: 'ck-rc-text' }, el('div', { class: 'ck-rc-lbl' }, lbl), el('div', { class: 'ck-rc-val' }, val)));
    this.rewardRow.append(rewardChip('shards', 'REWARD', brief.reward));
    const board = !modeRanked(m) ? 'OFF-BOARD' : m.seedKind === 'date' ? 'DAILY RANKED' : m.seedKind === 'week' ? 'WEEKLY RANKED' : 'RANKED';
    this.rewardRow.append(rewardChip('board' + (modeRanked(m) ? '' : ' off'), 'LEADERBOARD', board));

    // DESCEND sub-line: mode · ship · Heat N (+ mutator on seeded)
    const ship = shipById(save.selectedShip);
    const parts = [m.name, ship.name, save.selectedHeat > 0 ? `Heat ${save.selectedHeat}` : 'Heat 0'];
    if (muts.length) parts.push(muts.map((x) => x.name).join(' + '));
    this.descendSub.textContent = parts.join('  ·  ');

    // ── selection-accent spring: when the picked mode CHANGES, ease the center column
    //    to the new identity (a light hero swap) and pulse the whole panel once. Gated
    //    under reduce-motion. The first paint after a title show is skipped (prev=null)
    //    so the bootIn reveal owns the entrance, not a swap on top of it. ──
    if (this.prevSelectedMode !== null && this.prevSelectedMode !== m.id && !this.motionOff()) {
      this.replayAnim(this.heroContent, 'swap');
      this.replayAnim(this.mainPanel, 'pulse');
    }
    this.prevSelectedMode = m.id;
  }

  /** Paint a ship's big silhouette into its hover-preview canvas (nose-up, in its accent).
   *  Hidden by default; the chip reveals it on hover (see .ship-preview in the CSS). */
  private paintShipGlyph(canvas: HTMLCanvasElement, shipId: string, accent: string): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 128; // logical draw area; CSS displays it a touch smaller so it stays crisp
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 2); // nose up, like a ship in a hangar
    const r = size * 0.42;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, accent + '55');
    g.addColorStop(1, accent + '00');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    drawShipSilhouette(ctx, shipId, size * 0.3, {
      fill: '#0a0b0f',
      stroke: accent,
      lineWidth: 2.5,
      detail: accent,
      core: '#eaf2ff',
    });
  }

  /** §5 U2 — step the selected mode along the RAIL (keyboard/gamepad), skipping locked
   *  modes, persist, and re-focus the now-selected card. */
  moveModeSelection(dir: number): void {
    const s = this.saveRef;
    if (!s) return;
    this.cb.onSelectMode(nextRailMode(s.selectedMode, dir, s.deepestWave)); // persists → refreshTitle rebuilds the rail
    (this.modeGrid.querySelector('.mode-card.selected') as HTMLElement | null)?.focus();
  }

  hideSoundHint(): void {
    this.soundHint.style.display = 'none';
  }

  // ── §1.2 DASH SANDBOX overlay ──────────────────────────────────────────────
  /** Build the no-fail sandbox instructional overlay: a stepped center prompt + a
   *  SKIP button. The overlay itself is pointer-events:none so the player can still
   *  dash on the canvas behind it; only the SKIP button is interactive. The teach
   *  text lives here in the DOM (NOT canvas text — that would require render.ts). */
  private buildSandbox(): void {
    this.sandboxText = el('div', { class: 'sandbox-step', role: 'status', 'aria-live': 'polite' }, '');
    const skip = el('button', { class: 'btn btn-ghost btn-sm sandbox-skip', type: 'button' }, 'SKIP ▸');
    skip.addEventListener('click', () => this.cb.onSkipSandbox());
    this.sandboxOverlay = el(
      'div',
      { class: 'screen sandbox-overlay hidden', 'aria-label': 'Dash practice' },
      el('div', { class: 'sandbox-tag' }, 'DASH PRACTICE · no danger here'),
      this.sandboxText,
      el('div', { class: 'sandbox-skip-wrap' }, skip),
    );
  }

  /** Show the sandbox overlay over the playing canvas with the first step's text. */
  showSandbox(text: string): void {
    this.sandboxText.textContent = text;
    // §1.2 fix — hide EVERY standard screen so the practice canvas (the sandbox player +
    // dummy targets, drawn by the sandbox frame) is actually visible. The title/cockpit
    // was previously left up, covering the canvas so the teach floated over a dead menu.
    this.title.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.gameover.classList.add('hidden');
    this.draft.classList.add('hidden');
    this.eventPanel.classList.add('hidden');
    this.hud.classList.add('hidden'); // no score/combo HUD during the teach
    this.sandboxOverlay.classList.remove('hidden');
  }

  /** Update the stepped instruction text (no DOM churn beyond the text node). */
  setSandboxText(text: string): void {
    if (this.sandboxText.textContent !== text) this.sandboxText.textContent = text;
  }

  /** Hide the sandbox overlay (on completion or skip). */
  hideSandbox(): void {
    this.sandboxOverlay.classList.add('hidden');
  }

  /** Show the active mode on the HUD (hidden for plain Endless). */
  setMode(cfg: RunConfig): void {
    const show = cfg.id !== 'endless';
    this.dailyBadge.classList.toggle('hidden', !show);
    if (show) this.dailyBadge.textContent = `◆ ${cfg.name}`;
  }

  /** Show the active run mutators as a small coloured badge row under the mode badge. */
  setMutators(muts: { name: string; accent: string }[]): void {
    this.mutatorRow.replaceChildren();
    for (const m of muts) {
      const b = el('span', { class: 'hud-mutator' }, m.name);
      b.style.setProperty('--accent', m.accent);
      this.mutatorRow.append(b);
    }
  }

  showDraft(cards: DraftCard[]): void {
    const wrap = this.draft.querySelector('#draft-cards')!;
    wrap.replaceChildren();
    cards.forEach((c, i) => {
      const evo = isEvolution(c);
      const relic = isRelic(c);
      const cls = evo ? 'perk-card perk-card-evo' : relic ? 'perk-card perk-card-relic' : 'perk-card';
      const card = el('button', { class: cls });
      card.style.setProperty('--accent', c.accent);
      const glyph = relic ? (c as { glyph: string }).glyph : perkGlyph((c as PerkDef).glyph);
      card.append(
        ...(evo ? [el('div', { class: 'perk-tag' }, 'EVOLUTION')] : []),
        ...(relic ? [el('div', { class: 'perk-tag' }, 'CURSED RELIC')] : []),
        el('div', { class: 'perk-glyph' }, glyph),
        el('div', { class: 'perk-name' }, c.name),
        el('div', { class: 'perk-desc' }, c.desc),
        ...(evo ? [el('div', { class: 'perk-from' }, (c as EvolutionDef).from)] : []),
        el('div', { class: 'perk-key' }, String(i + 1)),
      );
      card.addEventListener('click', () => this.cb.onPick(i));
      wrap.append(card);
    });
    this.show('draft');
  }

  /** After THE CHOICE is made: show the chosen ending + retire the prompt. */
  resolveChoice(head: string, line: string): void {
    this.goHead.textContent = head;
    this.goHead.style.color = 'var(--amber)';
    this.goSub.textContent = line;
    this.choiceRow.classList.add('hidden');
  }

  showGameOver(info: GameOverInfo): void {
    this.displayScore = 0;
    this.goScore.textContent = '0';
    this.goHead.textContent = info.won ? 'THE LIGHT HOLDS' : 'THE LIGHT DIMS';
    this.goHead.style.color = info.won ? 'var(--amber)' : 'var(--pink)';
    this.goSub.textContent = info.won
      ? 'Lancefall remembers itself'
      : `the city slips back to grey · ${info.deathCause}${info.nemesis ? ` · ⚔ nemesis: ${info.nemesis}` : ''}`;
    this.choiceRow.classList.toggle('hidden', !info.choicePending);
    this.saveReplayBtn.classList.toggle('hidden', !info.canReplay);
    this.goBadge.classList.toggle('hidden', !info.newBest);
    this.goBadge.textContent = info.newBest ? '★ NEW BEST ★' : '';
    // personal-best delta vs your previous high
    if (info.newBest && info.pbDelta > 0) {
      this.goDelta.textContent = `+${info.pbDelta.toLocaleString()} over your best!`;
      this.goDelta.style.color = 'var(--green)';
    } else if (info.pbDelta < 0) {
      this.goDelta.textContent = `${info.pbDelta.toLocaleString()} from your best`;
      this.goDelta.style.color = 'var(--text-muted)';
    } else {
      this.goDelta.textContent = '';
    }
    // newly-unlocked achievement chips + active-mutator chips
    this.goAch.replaceChildren();
    for (const m of info.mutators) {
      const chip = el('span', { class: 'ach-chip mut-chip' }, `⚡ ${m.name}`);
      chip.style.setProperty('--accent', m.accent);
      this.goAch.append(chip);
    }
    for (const name of info.newAchievements) {
      this.goAch.append(el('span', { class: 'ach-chip' }, `🏆 ${name}`));
    }
    const goStats = [
      stat('best combo', `x${info.combo}`),
      stat('wave', String(info.wave)),
      stat('time', formatTime(info.time)),
      stat('◆ shards', `+${info.shardsEarned}`),
      stat(info.daily ? 'daily best' : 'high score', (info.daily ? info.dailyBest : info.highScore).toLocaleString()),
    ];
    if (info.won && info.clearTime !== undefined) {
      goStats.push(stat('clear time', formatTime(info.clearTime)));
      goStats.push(stat('flawless', info.hitsTaken === 0 ? 'YES ✦' : `${info.hitsTaken} hits`));
    }
    if (info.dailyAttempt !== undefined) {
      goStats.push(stat('attempt', `${info.dailyAttempt}/${info.dailyAttemptsMax ?? MAX_DAILY_ATTEMPTS}`));
    }
    this.goStats.replaceChildren(...goStats);
    this.goBuild.replaceChildren(
      el('span', { class: 'go-ship' }, `${info.mode} · ${info.ship}`),
      el('span', { class: 'go-perks' }, info.perks ? ` · ${info.perks}` : ' · no perks taken'),
    );
    this.show('gameover');
    // animate score count-up
    const target = info.score;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 700);
      const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
      this.goScore.textContent = v.toLocaleString();
      if (k < 1 && this.current === 'gameover') requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── SHARE GIF — in-page preview + copy/share/download ──────────────────────
  private buildShare(): void {
    const h = el('h2', {}, 'SHARE YOUR RUN');
    this.shareImg = el('img', { class: 'share-img', alt: 'Your watermarked run clip' }) as HTMLImageElement;
    this.shareBody = el('div', { class: 'share-body' }, this.shareImg);
    this.shareActions = el('div', { class: 'share-actions' });
    const close = el('button', { class: 'btn btn-ghost' }, 'CLOSE');
    close.addEventListener('click', () => this.closeShare());
    const panel = el('div', { class: 'panel' }, h, this.shareBody, this.shareActions, close);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Share your run');
    this.sharePanel = el('div', { class: 'screen screen-dim screen-modal hidden' }, panel);
    // Esc-close (or any closeModal path) must also revoke the preview blob — register the
    // teardown so it runs identically however the panel is dismissed.
    this.modalOnClose.set(this.sharePanel, () => {
      this.shareBody.classList.remove('share-loading');
      this.revokeShare();
    });
  }

  /** Called the moment SHARE GIF is pressed — open the modal with a spinner. */
  beginShareReplay(): void {
    this.revokeShare();
    this.shareImg.classList.add('hidden');
    this.shareActions.replaceChildren();
    this.shareBody.classList.add('share-loading');
    this.shareBody.setAttribute('data-msg', 'encoding clip…');
    this.openModal(this.sharePanel);
  }

  /** The encode finished — show the watermarked preview + share/copy/download. */
  showSharePreview(gif: ShareGif): void {
    this.revokeShare();
    this.shareUrl = URL.createObjectURL(gif.blob);
    this.shareImg.src = this.shareUrl;
    this.shareImg.classList.remove('hidden');
    this.shareBody.classList.remove('share-loading');
    this.shareBody.removeAttribute('data-msg');

    this.shareActions.replaceChildren();
    // Primary affordance: OS share sheet if available (mobile + some desktops),
    // else copy-image-to-clipboard, else fall straight to download.
    if (canShareFile(gif.blob)) {
      const share = el('button', { class: 'btn btn-primary' }, '⤴ SHARE');
      share.addEventListener('click', () => {
        void shareImageFile(gif.blob, gif.caption).then((ok) => {
          if (ok) this.toast('Shared!');
        });
      });
      this.shareActions.append(share);
    }
    if (canCopyImage()) {
      const copy = el('button', { class: 'btn btn-primary' }, '⧉ COPY IMAGE');
      copy.addEventListener('click', () => {
        void copyImageToClipboard(gif.blob).then((ok) =>
          this.toast(ok ? 'GIF copied — paste it anywhere!' : 'Copy unavailable — downloading instead'),
        );
        if (!canCopyImage()) downloadGif(gif.blob);
      });
      this.shareActions.append(copy);
    }
    const dl = el('button', { class: 'btn btn-ghost' }, '⬇ DOWNLOAD');
    dl.addEventListener('click', () => downloadGif(gif.blob));
    this.shareActions.append(dl);
    // Always offer copying the caption text too (works fully offline).
    const txt = el('button', { class: 'btn btn-ghost' }, '⧉ COPY TEXT');
    txt.addEventListener('click', () => {
      try {
        void navigator.clipboard?.writeText(gif.caption);
        this.toast('Caption copied!');
      } catch {
        this.toast(gif.caption);
      }
    });
    this.shareActions.append(txt);
  }

  /** Encode failed / nothing to share — tell the player, keep the modal closed. */
  failShareReplay(): void {
    this.closeShare();
    this.toast('Could not build the clip — try again after a run.');
  }

  private closeShare(): void {
    // teardown runs via the modalOnClose hook registered in buildShare(), so an Esc-close
    // cleans up identically to the CLOSE button.
    this.closeModal(this.sharePanel);
  }

  private revokeShare(): void {
    if (this.shareUrl) {
      URL.revokeObjectURL(this.shareUrl);
      this.shareUrl = '';
    }
    this.shareImg.removeAttribute('src');
  }

  toast(msg: string): void {
    const t = el('div', { class: 'toast' }, msg);
    this.toastLayer.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 2200);
    while (this.toastLayer.children.length > 3) this.toastLayer.firstChild?.remove();
  }

  /** Big center milestone announcement (RAMPAGE / FRENZY / ...). */
  announce(text: string, color: string): void {
    const el = this.announceEl;
    el.textContent = text;
    el.style.color = color;
    el.classList.remove('show');
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
    clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => el.classList.remove('show'), 1100);
  }

  comboBreakFlash(): void {
    this.comboEl.classList.remove('break');
    void this.comboEl.offsetWidth; // restart animation
    this.comboEl.classList.add('break');
  }

  /** C1 (v6 §1) — flash the HUD beat-grade pip cyan (Good) / gold (Perfect). A static
   *  color fade (no motion) — caller gates it off under reduceFlashing. */
  flashBeatPip(perfect: boolean): void {
    this.beatPip.classList.remove('on', 'perfect');
    void this.beatPip.offsetWidth; // restart the fade
    this.beatPip.classList.add('on');
    if (perfect) this.beatPip.classList.add('perfect');
  }

  // ── per-frame HUD update ──
  updateHud(world: World, particleDensity: number, coherence = 0): void {
    void particleDensity;
    // C4 — CITY MEMORY meter: fill = coherence value, gray→neon tint; hidden when toggled off
    const showMem = this.saveRef?.cityMemoryMeter !== false;
    this.cityMemWrap.style.display = showMem ? '' : 'none';
    if (showMem) {
      const { fill, neon } = cityMemoryFill(coherence, this.settings.reduceFlashing, this.settings.clarity);
      this.cityMemFill.style.transform = `scaleX(${fill})`;
      this.cityMemFill.style.opacity = String(neon);
    }
    // score odometer
    this.displayScore += (world.score - this.displayScore) * 0.18;
    if (Math.abs(world.score - this.displayScore) < 1) this.displayScore = world.score;
    this.scoreEl.textContent = Math.round(this.displayScore).toLocaleString();
    this.waveEl.textContent = `${formatTime(world.time)}  ·  shards ${world.shards}`;

    // combo
    if (world.combo > 0) {
      const col = comboColor(world.combo);
      this.comboEl.textContent = `x${world.combo}`;
      this.comboEl.style.color = col;
      const sz = 26 + Math.min(world.combo, 40) * 0.6;
      this.comboEl.style.fontSize = sz + 'px';
      this.comboBar.style.transform = `scaleX(${Math.max(0, world.comboTimer / TUNE.combo.window)})`;
      this.comboBar.style.background = col;
    } else {
      this.comboEl.textContent = '';
      this.comboBar.style.transform = 'scaleX(0)';
    }

    // stamina
    const segs = world.stats.staminaSegments;
    if (segs !== this.staminaSegs.length) this.rebuildStamina(segs);
    const per = TUNE.stamina.perSegment;
    for (let i = 0; i < this.staminaSegs.length; i++) {
      const segStamina = Math.max(0, Math.min(per, world.player.stamina - i * per));
      const fill = this.staminaSegs[i];
      fill.style.width = (segStamina / per) * 100 + '%';
      // Flash ALL segments red exactly when you can't afford a dash (total < one
      // segment) — a deliberate "you can't escape" warning, not per-segment state.
      fill.parentElement!.classList.toggle('empty', world.player.stamina < TUNE.stamina.dashCost);
    }

    // ARMOR shields (v6 §7) — discrete pips; the strip is hidden entirely on a shields-off run
    const maxSh = world.player.maxShields;
    this.shieldsWrap.style.display = maxSh > 0 ? '' : 'none';
    if (maxSh > 0) {
      if (maxSh !== this.shieldPips.length) this.rebuildShields(maxSh);
      for (let i = 0; i < this.shieldPips.length; i++) {
        this.shieldPips[i].classList.toggle('filled', i < world.player.shields);
      }
    }

    this.grazeEl.textContent = world.grazeCount > 0 ? `GRAZE ${world.grazeCount}` : '';
    this.bestComboEl.textContent = world.bestComboRun > 0 ? `best x${world.bestComboRun}` : '';

    // OVERDRIVE meter
    const od = world.overdrive;
    const ready = od.meter >= 1 && od.cooldown <= 0;
    this.odFill.style.transform = `scaleX(${Math.max(0, Math.min(1, od.meter))})`;
    this.odWrap.classList.toggle('od-ready', ready);
    this.odLabel.textContent = od.cooldown > 0 ? `FADING ${Math.ceil(od.cooldown)}s` : ready ? 'DAYBREAK READY [F]' : 'DAYBREAK';

    // READ THE KEY — the substitution decode (an ode to Turing, *played*). Show the plaintext
    // MESSAGE you're decrypting + the KEY (letter ↔ ciphered symbol); the player reads the key
    // and dashes the core showing the next letter's symbol. The next pair is lit as the crib.
    const cipher = world.cipher;
    if (cipher && !cipher.solved) {
      const v = decodeView(cipher);
      const cls = (i: number) => (i < v.progress ? ' done' : i === v.progress ? ' next' : '');
      this.cipherEl.replaceChildren(
        el('span', { class: 'cipher-label' }, 'READ THE KEY'),
        el(
          'div',
          { class: 'cipher-msg' },
          ...v.plaintext.map((ltr, i) => el('span', { class: 'cipher-glyph' + cls(i) }, ltr)),
        ),
        el(
          'div',
          { class: 'cipher-key' },
          ...v.key.map((k, i) =>
            el(
              'span',
              { class: 'cipher-pair' + cls(i) },
              el('span', { class: 'cipher-plain' }, k.plain),
              el('span', { class: 'cipher-eq' }, '→'),
              el('span', { class: 'cipher-sym' }, k.cipher),
            ),
          ),
        ),
      );
      this.cipherEl.classList.add('on');
    } else {
      this.cipherEl.classList.remove('on');
    }

    // active POWER-UP badge
    const pu = world.powerup;
    const puActive = pu.active != null;
    this.puWrap.classList.toggle('on', puActive);
    if (puActive) {
      const def = POWERUPS[pu.active!];
      this.puLabel.textContent = `${def.name} ${Math.ceil(pu.timer)}s`;
      this.puLabel.style.color = def.color;
      this.puFill.style.transform = `scaleX(${Math.max(0, Math.min(1, pu.total > 0 ? pu.timer / pu.total : 0))})`;
      this.puFill.style.background = def.color;
    }
  }
}

function stat(label: string, value: string): HTMLElement {
  return el('div', { class: 'go-stat' }, el('span', { class: 'go-stat-v' }, value), el('span', { class: 'go-stat-l' }, label));
}

/** Render a decoded Build DNA into readable label/value rows. Defensive: unknown
 *  ids (from an older/edited code) are skipped, never looked up blindly. */
function describeBuild(dna: BuildDna): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const perksReg = PERKS as Record<string, { name: string }>;
  const evosReg = EVOLUTIONS as Record<string, { name: string }>;
  const relicsReg = RELICS as Record<string, { name: string }>;
  const stacks = (dna.stacks ?? {}) as Record<string, number>;
  const ship = SHIPS.find((s) => s.id === dna.ship);
  rows.push({ label: 'SHIP', value: ship ? ship.name : dna.ship || '—' });
  if (dna.heat > 0) {
    const lvl = Math.max(0, Math.min(HEAT_LEVELS.length - 1, Math.round(dna.heat)));
    rows.push({ label: 'HEAT', value: `${lvl} · ${HEAT_LEVELS[lvl].name}` });
  }
  if (dna.arch && dna.arch !== 'none') rows.push({ label: 'PATH', value: archetypeById(dna.arch).name });
  const perks = Object.keys(stacks)
    .filter((id) => (stacks[id] ?? 0) > 0 && perksReg[id])
    .map((id) => (stacks[id] > 1 ? `${perksReg[id].name}×${stacks[id]}` : perksReg[id].name));
  if (perks.length) rows.push({ label: 'PERKS', value: perks.join(', ') });
  const evos = (dna.evos ?? []).filter((id) => evosReg[id]).map((id) => evosReg[id].name);
  if (evos.length) rows.push({ label: 'FUSIONS', value: evos.join(', ') });
  const relics = (dna.relics ?? []).filter((id) => relicsReg[id]).map((id) => relicsReg[id].name);
  if (relics.length) rows.push({ label: 'RELICS', value: relics.join(', ') });
  return rows;
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function perkGlyph(g: PerkDef['glyph']): string {
  const map: Record<PerkDef['glyph'], string> = {
    lance: '➤',
    cell: '▰▰',
    graze: '✶',
    burst: '✺',
    ghost: '◈',
    clock: '◷',
    pierce: '⫸',
    siphon: '♺',
    window: '⧗',
    nova: '✸',
    reflect: '⊛',
    gem: '◆',
    impaler: '⤞',
    supernova: '❂',
    perpetual: '∞',
    wraith: '⟁',
    inferno: '🔥',
    juggernaut: '⬢',
    aegis: '❖',
  };
  return map[g];
}
