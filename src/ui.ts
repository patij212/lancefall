// DOM overlay UI: title/attract, HUD, pause, game-over, perk draft, settings.
// One canvas always renders behind. HUD updates mutate cached refs only (no
// innerHTML churn) so the 60fps loop stays clean.

import type { World } from './world';
import { el, iconEl, stat } from './panels/dom';
import type { Settings, SaveData } from './save';
import { sanitizeHandle } from './save';
import { defaultKeyBindings } from './input';
import { PERKS, deriveStats } from './perks';
import type { PerkDef, RunStats } from './perks';
import { glyphArt, hasGlyphArt, relicGlyphArt, powerupGlyphArt } from './glyphArt';
import { isEvolution, isRelic, EVOLUTIONS } from './evolutions';
import { RELICS, type RelicId } from './relics';
import { decodeBuildDna } from './buildDna';
import type { BuildDna } from './buildDna';
import type { DraftCard, EvolutionDef } from './evolutions';
import type { EventChoice } from './events';
import { HEAT_LEVELS, MAX_HEAT } from './heat';
import { ARCHETYPES, archetypeById } from './archetypes';
import { leaderboardEnabled, fetchLeaderboard, fetchAchievementRarity, type AchRarity } from './api';
import { renderStats } from './panels/stats';
import { comboColor } from './render';
import { TRACKS, type SoundtrackId } from './soundtracks';
import { SHIPS, shipById } from './ships';
import { drawShipSilhouette } from './shipModels';
import { THEMES } from './themes';
import { TRAILS } from './trails';
import { PORTED_KINDS, skinsForKind, canUnlockSkin, skinUnlockHint } from './skins';
import type { SkinDef } from './skins';
import type { Enemy } from './types';
import { GLOSSES, glossTriggers, type GlossId } from './gloss';
import {
  modeById,
  modeBrief,
  modeFlavor,
  modeRanked,
  modeSeeded,
  modeUnlocked,
  nextRailMode,
  rollDailyAttempt,
  RAIL_MODE_IDS,
  MAX_DAILY_ATTEMPTS,
} from './modes';
import { dailyMutatorPreview, weeklyMutatorPreview } from './mutators';
import { cityMemoryFill, threatRim } from './renderMath';
import { POWERUPS } from './powerups';
import { renderBestiary, renderCipherLegend } from './panels/codex';
import { renderUpgrades } from './panels/upgrades';
import { renderTheSix } from './panels/fall';
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
import { choiceEnding } from './stillpoint';

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
  /** equip a ported enemy skin for a kind (cosmetic) */
  onSelectSkin: (kind: string, id: string) => void;
  /** tap a locked skin → explain the achievement gate (or equip if held) */
  onUnlockSkin: (kind: string, id: string) => void;
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
  /** §1.7 — a first-appearance jargon gloss was shown; persist it as seen (once-ever) */
  onMarkGloss: (id: string) => void;
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

// el / iconEl / stat now live in ./panels/dom (shared with the per-panel modules).

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

// loadout-row label glyphs (verbatim from the mock): HEAT semicircle, BUILD star, ARMOR trend.
const LO_HEAT_SVG = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M5.5 1C3 1 1 3 1 5.5 1 8 3 10 5.5 10" stroke="#f97316" stroke-width="1.1" stroke-linecap="round"/><circle cx="5.5" cy="5.5" r="1.8" fill="#f97316" opacity="0.5"/></svg>`;
const LO_BUILD_SVG = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M5.5 1l1.5 3H10L7.5 6.5 8.5 10 5.5 8 2.5 10 3.5 6.5 1 4h3Z" stroke="#a78bfa" stroke-width="0.9" fill="none"/></svg>`;
const LO_ARMOR_SVG = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M1 5.5L3 3l2.5 2.5L8 2l2 1.5" stroke="#818cf8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ── FIRST LIGHT run-end static art (ported from mock-choice-v2) ────────────────
// The dawn sigil header mark (the tonal inverse of the cockpit's cyan logo: gold).
const GO_SIGIL_SVG = `<svg viewBox="0 0 46 46" fill="none" aria-hidden="true">
  <circle cx="23" cy="23" r="21" stroke="#ffd884" stroke-width="1" opacity="0.55"/>
  <circle cx="23" cy="23" r="15" stroke="#a78bfa" stroke-width="0.6" opacity="0.3"/>
  <path d="M23 5 L26 19 L23 21 L20 19 Z" fill="#ffd884"/>
  <circle cx="23" cy="23" r="3.4" fill="none" stroke="#fff3d6" stroke-width="1.3"/>
  <circle cx="23" cy="23" r="1.8" fill="#ffd884"/>
  <g stroke="#ffd884" stroke-width="1" stroke-linecap="round" opacity="0.7">
    <line x1="23" y1="2" x2="23" y2="5"/><line x1="44" y1="23" x2="41" y2="23"/><line x1="2" y1="23" x2="5" y2="23"/>
  </g>
</svg>`;

// The FIRST LIGHT skyline tableau — SVG city + spire + windows (CSS filters lean it).
const GO_CITY_SVG = `<svg viewBox="0 0 680 138" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="340" cy="128" rx="300" ry="44" fill="rgba(255,200,120,0.10)"/>
  <g fill="#1a1326" opacity="0.7">
    <rect x="0" y="86" width="34" height="52"/><rect x="40" y="70" width="26" height="68"/>
    <rect x="74" y="94" width="40" height="44"/><rect x="120" y="78" width="30" height="60"/>
    <rect x="540" y="78" width="30" height="60"/><rect x="576" y="94" width="40" height="44"/>
    <rect x="622" y="70" width="26" height="68"/><rect x="654" y="86" width="26" height="52"/>
  </g>
  <g fill="#251830">
    <rect x="150" y="66" width="50" height="72"/><rect x="206" y="82" width="40" height="56"/>
    <rect x="252" y="56" width="30" height="82"/><rect x="430" y="56" width="30" height="82"/>
    <rect x="468" y="82" width="40" height="56"/><rect x="282" y="94" width="68" height="44"/>
    <rect x="356" y="94" width="68" height="44"/>
  </g>
  <g style="transform-box: fill-box; transform-origin: 50% 100%;">
    <rect x="326" y="44" width="16" height="94" fill="#2a1c34"/><rect x="320" y="60" width="28" height="6" rx="1" fill="#2a1c34"/>
    <rect x="333" y="28" width="2" height="20" fill="#fff3d6"/>
    <circle cx="334" cy="28" r="2.6" fill="#fff3d6"/>
  </g>
  <g fill="#ffd884">
    <circle cx="334" cy="54" r="1.3" opacity="0.95"/><circle cx="334" cy="64" r="1.3" opacity="0.85"/>
    <circle cx="334" cy="74" r="1.3" opacity="0.7"/><circle cx="334" cy="84" r="1.2" opacity="0.55"/>
  </g>
  <g>
    <circle cx="170" cy="78" r="1.3" fill="#ffe0a0"/><circle cx="176" cy="86" r="1.3" fill="#ffce80"/>
    <circle cx="184" cy="74" r="1.2" fill="#ffd884"/><circle cx="220" cy="92" r="1.3" fill="#ffe0a0"/>
    <circle cx="226" cy="100" r="1.2" fill="#ffce80"/><circle cx="262" cy="70" r="1.3" fill="#fff0c8"/>
    <circle cx="266" cy="82" r="1.2" fill="#ffd884"/><circle cx="300" cy="104" r="1.2" fill="#ffce80"/>
    <circle cx="320" cy="108" r="1.2" fill="#ffe0a0"/><circle cx="380" cy="106" r="1.2" fill="#ffd884"/>
    <circle cx="410" cy="108" r="1.2" fill="#ffce80"/><circle cx="442" cy="70" r="1.3" fill="#fff0c8"/>
    <circle cx="448" cy="82" r="1.2" fill="#ffd884"/><circle cx="480" cy="92" r="1.3" fill="#ffe0a0"/>
    <circle cx="486" cy="100" r="1.2" fill="#ffce80"/><circle cx="100" cy="100" r="1.1" fill="#ffce80"/>
    <circle cx="560" cy="100" r="1.1" fill="#ffce80"/>
    <circle cx="200" cy="96" r="1" fill="#67e8f9" opacity="0.6"/><circle cx="470" cy="96" r="1" fill="#67e8f9" opacity="0.6"/>
  </g>
  <g fill="#140e1c"><rect x="160" y="52" width="34" height="86"/><rect x="486" y="52" width="34" height="86"/></g>
  <line x1="0" y1="137" x2="680" y2="137" stroke="rgba(255,216,132,0.5)" stroke-width="0.8"/>
</svg>`;

// The cockpit "SELECTED RUN" skyline — the COOL "city remembered" night (cyan/lavender
// stars + a central spire whose returning-light halo grows with --coh), distinct from the
// warm-dawn GO_CITY_SVG. Verbatim from the mock; aria-hidden (pure decoration).
const CK_CITY_SVG = `<svg class="ck-hero-city" viewBox="0 0 680 140" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="340" cy="22" rx="80" ry="4" fill="rgba(129,140,248,0.018)"/>
  <circle cx="18" cy="12" r="0.8" fill="rgba(255,255,255,0.65)"/><circle cx="56" cy="7" r="0.6" fill="rgba(255,255,255,0.5)"/>
  <circle cx="92" cy="17" r="1" fill="rgba(255,255,255,0.6)"/><circle cx="148" cy="9" r="0.7" fill="rgba(255,255,255,0.4)"/>
  <circle cx="213" cy="14" r="0.6" fill="rgba(255,255,255,0.55)"/><circle cx="286" cy="6" r="0.9" fill="rgba(255,255,255,0.45)"/>
  <circle cx="352" cy="11" r="0.6" fill="rgba(167,139,250,0.7)"/><circle cx="418" cy="8" r="1.4" fill="rgba(34,211,238,0.75)"/>
  <circle cx="487" cy="15" r="0.6" fill="rgba(255,255,255,0.5)"/><circle cx="544" cy="5" r="1" fill="rgba(255,255,255,0.6)"/>
  <circle cx="601" cy="13" r="1.2" fill="rgba(200,180,255,0.6)"/><circle cx="648" cy="8" r="0.6" fill="rgba(34,211,238,0.5)"/>
  <circle cx="34" cy="22" r="0.6" fill="rgba(180,220,255,0.55)"/><circle cx="115" cy="19" r="0.7" fill="rgba(180,220,255,0.5)"/>
  <circle cx="195" cy="8" r="0.5" fill="rgba(255,255,255,0.6)"/><circle cx="240" cy="20" r="0.8" fill="rgba(180,220,255,0.45)"/>
  <circle cx="310" cy="15" r="0.6" fill="rgba(255,255,255,0.5)"/><circle cx="404" cy="18" r="0.7" fill="rgba(255,255,255,0.55)"/>
  <circle cx="468" cy="10" r="0.5" fill="rgba(180,220,255,0.5)"/><circle cx="512" cy="23" r="0.8" fill="rgba(255,255,255,0.45)"/>
  <circle cx="563" cy="16" r="0.6" fill="rgba(180,220,255,0.5)"/><circle cx="618" cy="20" r="0.7" fill="rgba(255,255,255,0.55)"/>
  <circle cx="670" cy="15" r="0.6" fill="rgba(255,255,255,0.5)"/>
  <g fill="#071326" opacity="0.55">
    <rect x="0" y="88" width="26" height="52"/><rect x="30" y="72" width="20" height="68"/><rect x="54" y="94" width="32" height="46"/>
    <rect x="90" y="78" width="24" height="62"/><rect x="118" y="100" width="40" height="40"/><rect x="562" y="78" width="24" height="62"/>
    <rect x="590" y="94" width="32" height="46"/><rect x="626" y="72" width="20" height="68"/><rect x="650" y="88" width="30" height="52"/>
  </g>
  <g fill="#030b18">
    <rect x="0" y="75" width="34" height="65"/><rect x="38" y="56" width="28" height="84"/><rect x="70" y="82" width="44" height="58"/>
    <rect x="118" y="62" width="32" height="78"/><rect x="154" y="78" width="50" height="62"/><rect x="208" y="50" width="28" height="90"/>
    <rect x="240" y="74" width="56" height="66"/><rect x="302" y="86" width="76" height="54"/><rect x="480" y="86" width="76" height="54"/>
    <rect x="560" y="74" width="56" height="66"/><rect x="620" y="50" width="28" height="90"/><rect x="474" y="78" width="50" height="62"/>
    <rect x="430" y="62" width="32" height="78"/><rect x="568" y="82" width="44" height="58"/><rect x="614" y="56" width="28" height="84"/>
    <rect x="648" y="75" width="34" height="65"/>
  </g>
  <ellipse class="spire-halo" cx="333" cy="74" rx="24" ry="76" fill="#22d3ee"/>
  <g fill="#030d1f"><rect x="326" y="30" width="14" height="110"/><rect x="332" y="10" width="2" height="24"/><rect x="322" y="46" width="22" height="6" rx="1"/><rect x="320" y="60" width="26" height="4" rx="1"/></g>
  <rect x="332" y="10" width="2" height="24" fill="#22d3ee" opacity="0.7"/>
  <circle class="spire-beacon" cx="333" cy="10" r="2" fill="#22d3ee" opacity="0.9"/>
  <circle cx="333" cy="36" r="0.9" fill="#22d3ee" opacity="0.6"/><circle cx="333" cy="44" r="0.9" fill="#22d3ee" opacity="0.6"/>
  <circle cx="333" cy="52" r="0.9" fill="#22d3ee" opacity="0.55"/><circle cx="333" cy="60" r="0.9" fill="#22d3ee" opacity="0.5"/>
  <circle cx="333" cy="68" r="0.9" fill="#22d3ee" opacity="0.45"/><circle cx="333" cy="76" r="0.9" fill="#22d3ee" opacity="0.4"/>
  <g fill="#010810"><rect x="160" y="42" width="36" height="98"/><rect x="200" y="58" width="44" height="82"/><rect x="436" y="58" width="44" height="82"/><rect x="484" y="42" width="36" height="98"/></g>
  <g opacity="0.9">
    <circle cx="176" cy="58" r="1.2" fill="#22d3ee" opacity="0.9"/><circle cx="180" cy="64" r="1.2" fill="#22d3ee" opacity="0.7"/>
    <circle cx="176" cy="70" r="1.2" fill="#22d3ee" opacity="0.85"/><circle cx="183" cy="76" r="1.2" fill="#818cf8" opacity="0.8"/>
    <circle cx="176" cy="82" r="1.2" fill="#22d3ee" opacity="0.6"/><circle cx="182" cy="88" r="1.2" fill="rgba(251,146,60,0.55)"/>
    <circle cx="215" cy="72" r="1.2" fill="#22d3ee" opacity="0.85"/><circle cx="222" cy="68" r="1.2" fill="#818cf8" opacity="0.75"/>
    <circle cx="218" cy="80" r="1.2" fill="#22d3ee" opacity="0.7"/><circle cx="225" cy="86" r="1.2" fill="#22d3ee" opacity="0.6"/>
    <circle cx="504" cy="58" r="1.2" fill="#22d3ee" opacity="0.9"/><circle cx="500" cy="64" r="1.2" fill="#22d3ee" opacity="0.7"/>
    <circle cx="504" cy="70" r="1.2" fill="#22d3ee" opacity="0.85"/><circle cx="497" cy="76" r="1.2" fill="#818cf8" opacity="0.8"/>
    <circle cx="498" cy="88" r="1.2" fill="rgba(251,146,60,0.55)"/><circle cx="462" cy="72" r="1.2" fill="#22d3ee" opacity="0.85"/>
    <circle cx="455" cy="68" r="1.2" fill="#818cf8" opacity="0.75"/><circle cx="459" cy="80" r="1.2" fill="#22d3ee" opacity="0.7"/>
    <circle cx="50" cy="66" r="1" fill="#22d3ee" opacity="0.7"/><circle cx="102" cy="88" r="1" fill="#22d3ee" opacity="0.65"/>
    <circle cx="630" cy="66" r="1" fill="#22d3ee" opacity="0.7"/><circle cx="575" cy="88" r="1" fill="#22d3ee" opacity="0.65"/>
    <circle cx="620" cy="88" r="1.2" fill="rgba(251,146,60,0.5)"/>
  </g>
  <line x1="0" y1="139" x2="680" y2="139" stroke="rgba(251,191,36,0.22)" stroke-width="0.8"/>
  <line x1="0" y1="140" x2="680" y2="140" stroke="#22d3ee" stroke-width="0.4" opacity="0.12"/>
</svg>`;

// Rising embers off the cockpit skyline (CSS animates; gated under reduce-motion).
const CK_SPARKS_HTML = `<span class="ck-hero-spark" style="left:15%;background:rgba(34,211,238,0.7);animation-duration:2.6s;animation-delay:0s"></span>
<span class="ck-hero-spark" style="left:28%;background:rgba(129,140,248,0.55);animation-duration:3.4s;animation-delay:0.7s"></span>
<span class="ck-hero-spark" style="left:50%;background:rgba(34,211,238,0.65);animation-duration:2.2s;animation-delay:1.4s"></span>
<span class="ck-hero-spark" style="left:67%;background:rgba(34,211,238,0.7);animation-duration:3.8s;animation-delay:0.3s"></span>
<span class="ck-hero-spark" style="left:82%;background:rgba(129,140,248,0.55);animation-duration:2.9s;animation-delay:2.1s"></span>`;

// Rising motes over the skyline (CSS animates them; gated under reduce-motion).
const GO_MOTES_HTML = `<span class="go-mote" style="left:16%;animation-duration:5.5s;animation-delay:0s"></span>
<span class="go-mote" style="left:33%;animation-duration:6.8s;animation-delay:1.4s;background:rgba(255,210,140,0.7)"></span>
<span class="go-mote" style="left:62%;animation-duration:5s;animation-delay:0.7s"></span>
<span class="go-mote" style="left:78%;animation-duration:7.2s;animation-delay:2.2s;background:rgba(255,210,140,0.7)"></span>`;

// THE CHOICE glyphs — a rising / a setting light (currentColor → the card accent).
const GO_CATCH_GLYPH = `<svg viewBox="0 0 52 52" fill="none" aria-hidden="true">
  <circle cx="26" cy="20" r="7" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="26" cy="20" r="2.6" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.8">
    <line x1="26" y1="6" x2="26" y2="10"/><line x1="38" y1="9" x2="35.5" y2="12.5"/>
    <line x1="14" y1="9" x2="16.5" y2="12.5"/><line x1="42" y1="20" x2="38" y2="20"/><line x1="10" y1="20" x2="14" y2="20"/>
  </g>
  <path d="M10 30 C12 42 20 47 26 47 C32 47 40 42 42 30" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M14 31 C16 39 21 43 26 43 C31 43 36 39 38 31" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0.5"/>
</svg>`;
const GO_FALL_GLYPH = `<svg viewBox="0 0 52 52" fill="none" aria-hidden="true">
  <path d="M10 18 C12 12 20 9 26 9 C32 9 40 12 42 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M14 19 C16 14 21 12 26 12 C31 12 36 14 38 19" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0.5"/>
  <circle cx="26" cy="27" r="3" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.7">
    <line x1="20" y1="34" x2="18" y2="42"/><line x1="26" y1="35" x2="26" y2="45"/><line x1="32" y1="34" x2="34" y2="42"/>
  </g>
  <circle cx="18" cy="45" r="1.3" fill="currentColor" opacity="0.6"/>
  <circle cx="26" cy="48" r="1.3" fill="currentColor" opacity="0.5"/>
  <circle cx="34" cy="45" r="1.3" fill="currentColor" opacity="0.6"/>
</svg>`;

// The SHARE THE DAWN preview card chrome (a static dawn frame — no canvas dependency).
const GO_GIF_HTML = `<span class="go-gif-sky"></span><span class="go-gif-glow"></span><span class="go-gif-shimmer"></span>
<span class="go-gif-badge"><span class="go-gif-dot"></span> GIF · 6s</span>`;

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

/** Multiply a #rrggbb toward black by `amt` (0..1). Mirrors render.ts shade() so a
 *  skin preview's dark carapace fill matches the in-game look. */
function darken(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = Math.round((parseInt(n.slice(0, 2), 16) || 0) * amt);
  const g = Math.round((parseInt(n.slice(2, 4), 16) || 0) * amt);
  const b = Math.round((parseInt(n.slice(4, 6), 16) || 0) * amt);
  return `rgb(${r}, ${g}, ${b})`;
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
  private codexBestiary!: HTMLElement; // §v7 — bestiary grids, re-rendered per open (live kill counts)
  private skinsPanel!: HTMLElement;
  private skinsBody!: HTMLElement;
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
  /** §v7 — cached global achievement-rarity aggregate (fetched lazily on first STATS open) */
  private statsRarity: AchRarity | null = null;

  // §1.7 — first-appearance jargon gloss callout. One shown at a time (a queue drains
  // FIFO); each id shows once ever (persisted in save.glossSeen via onMarkGloss). The
  // session set reserves an id at ENQUEUE time so a per-frame trigger can't double-queue.
  private glossEl!: HTMLElement;
  private glossTermEl!: HTMLElement;
  private glossBodyEl!: HTMLElement;
  private glossQueue: GlossId[] = [];
  private glossActive = false;
  private glossTimer = 0;
  private glossSeenSession = new Set<GlossId>();

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
  private puIcon!: HTMLElement;
  private puPrevPu: string | null = null; // re-render the badge glyph only when the active buff changes
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
  private descendModeLine!: HTMLElement; // §v7 the mode·ship·heat·mutator line under the kbd hints
  private descendOverlay!: HTMLElement; // §v7 fixed "INITIATING DESCENT" takeover (mock sequence)
  private fitRaf: number | null = null; // §v7 scale-to-fit cockpit fitter rAF handle
  private quietReskin = false; // §v7 arrow-nav re-skin suppresses the heavy panel pulse
  private shipArt!: HTMLCanvasElement;
  private shipArtName!: HTMLElement;
  private shipArtDesc!: HTMLElement;
  private ckShipRing!: HTMLElement; // §v7 loadout ship ring — carries the equipped hull accent (currentColor)
  private heatPipsWrap!: HTMLElement;
  private armorPipsWrap!: HTMLElement; // §v7 loadout ARMOR pips (effective shields for the selected Heat)
  private buildRowVal!: HTMLElement; // §v7 loadout BUILD row value (selected archetype name)
  private flavorBox!: HTMLElement; // §v7 mode-rail bottom flavour box (sinks the lower-left void)
  private shipPicker!: HTMLElement; // wraps this.shipRow; toggled by CHANGE SHIP
  private cosmeticsPanel!: HTMLElement; // §v7 CUSTOMIZE modal — hosts the palette + trail pickers
  private cosmThemeDot!: HTMLElement; // loadout summary card: current palette swatch
  private cosmThemeName!: HTMLElement; // loadout summary card: current palette name
  private cosmTrailDot!: HTMLElement; // loadout summary card: current dash-trail swatch
  private cosmTrailName!: HTMLElement; // loadout summary card: current dash-trail name
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
  // gameover — FIRST LIGHT run-end shell (mock-choice-v2): the screen root carries a
  // `.go-screen` skin + state class (won / lost / pending), plus a `--lean` dial driven
  // by THE CHOICE hover/focus and locked on commit.
  private goScreenInner!: HTMLElement; // .go-frame — carries won/lost/choice-pending + resolved state
  private goEyebrow!: HTMLElement; // result eyebrow ("THE SOVEREIGN HAS FALLEN")
  private goCohPct!: HTMLElement; // header COHERENCE %
  private goCohFoot!: HTMLElement; // header COHERENCE footnote
  private goHsScore!: HTMLElement; // header SCORE
  private goHsCombo!: HTMLElement; // header BEST COMBO
  private goHsTime!: HTMLElement; // header TIME
  private goTableau!: HTMLElement; // FIRST LIGHT tableau (DOM/CSS skyline)
  private goTabEyebrow!: HTMLElement; // tableau eyebrow ("THE LAST CIPHER IS YOURS")
  private goTabTitle!: HTMLElement; // tableau hero title ("FIRST LIGHT")
  private goTabLine!: HTMLElement; // tableau italic line (echo memory)
  private goCatchBtn!: HTMLElement; // THE CHOICE — CATCH card
  private goFallBtn!: HTMLElement; // THE CHOICE — FALL card
  private goGrade!: HTMLElement; // S-grade badge
  private goGradeTitle!: HTMLElement;
  private goGradeNote!: HTMLElement;
  private goResolve!: HTMLElement; // committed-resolve full-screen wash overlay
  private goResolveHead!: HTMLElement;
  private goResolveLine!: HTMLElement;
  private goAscendBtn!: HTMLButtonElement; // ASCEND / KEEP GOING (NG+) — shown only when relevant
  private goResolveTimer = 0;
  private goChoiceLocked = false; // once a choice commits, the cards lock + the world holds

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
    this.buildSkins();
    this.buildCosmetics();
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
    this.root.append(this.hud, this.title, this.pause, this.gameover, this.draft, this.eventPanel, this.settingsPanel, this.statsPanel, this.upgradesPanel, this.howtoPanel, this.codexPanel, this.skinsPanel, this.cosmeticsPanel, this.creditsPanel, this.fallPanel, this.heatPanel, this.archetypePanel, this.leaderPanel, this.duelPanel, this.inspectPanel, this.sharePanel, this.sandboxOverlay, this.toastLayer, this.announceEl, this.glossEl);
    // accessibility: announce overlays as dialogs
    const dialogs: [HTMLElement, string][] = [
      [this.pause, 'Paused'],
      [this.gameover, 'Game over'],
      [this.draft, 'Choose a perk'],
      // mid-run event: labeled as a dialog for screen readers, but deliberately NOT in
      // the Esc-close registry below — it's a forced choice, so Esc-dismissing it could
      // strand the paused run. The player resolves it by picking a card (click / 1-3).
      [this.eventPanel, 'Mid-run event'],
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
    // re-fit the scaled cockpit composition on viewport changes (desktop layout only).
    window.addEventListener('resize', () => this.scheduleFit());
    window.addEventListener('orientationchange', () => this.scheduleFit());
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
    // [panel, accessible name] — every Esc-close + focus-trapped modal. The label is the
    // dialog's accessible NAME: a role=dialog with no name is announced as just "dialog",
    // so each gets an aria-label (settings already got one from the dialogs[] pass above —
    // the hasAttribute guard leaves it). Driving modalPanels from this list keeps the
    // registry and the labels in one place.
    const labeled: [HTMLElement, string][] = [
      [this.settingsPanel, 'Settings'],
      [this.statsPanel, 'Lifetime stats'],
      [this.upgradesPanel, 'Upgrades'],
      [this.howtoPanel, 'How to play'],
      [this.codexPanel, 'Bestiary codex'],
      [this.skinsPanel, 'Bestiary skins'],
      [this.cosmeticsPanel, 'Customize cosmetics'],
      [this.creditsPanel, 'Credits'],
      [this.fallPanel, 'The fall'],
      [this.heatPanel, 'Heat ascension'],
      [this.archetypePanel, 'Build archetype'],
      [this.leaderPanel, 'Leaderboard'],
      [this.duelPanel, 'Seed duel'],
      [this.inspectPanel, 'Inspect a build'],
      [this.sharePanel, 'Share your run'],
    ];
    this.modalPanels = labeled.map(([scr]) => scr);
    for (const [scr, label] of labeled) {
      const panel = scr.querySelector('.panel');
      if (!panel) continue;
      if (!panel.hasAttribute('role')) {
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
      }
      if (!panel.hasAttribute('aria-label')) panel.setAttribute('aria-label', label);
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
    // ── TOP-LEFT: score · time/shards · graze · combo · buffs (mock .hud-tl) ──
    this.dailyBadge = el('div', { class: 'hud-daily hidden' }, '◆ ECHO');
    this.scoreEl = el('div', { class: 'hud-score' }, '0');
    this.waveEl = el('div', { class: 'hud-wave' }, ''); // repurposed at runtime as a time · shards subline
    this.grazeEl = el('div', { class: 'hud-graze', title: 'GRAZE — skim a bullet without being hit to refill stamina and build your run.' }, '');
    const subline = el('div', { class: 'hud-subline' }, this.waveEl, this.grazeEl);

    this.comboEl = el('div', { class: 'hud-combo' }, '');
    this.comboBar = el('div', { class: 'hud-combo-fill' });
    // Grid B — cheap in-run jargon tooltips on the stable meter wrappers (label text
    // changes per-frame; the wrapper title stays put). Keyboard-reachable, no flashing.
    const comboBarWrap = el('div', { class: 'hud-combo-bar', title: 'COMBO — kills chained without a break. Higher combo lifts your score multiplier and decays if you stop killing.' }, this.comboBar);
    this.beatPip = el('div', { class: 'hud-beatpip' });
    const comboRow = el('div', { class: 'hud-combo-row' }, this.comboEl, comboBarWrap, this.beatPip);

    this.mutatorRow = el('div', { class: 'hud-mutators' });

    // active POWER-UP badge (hidden unless one is active) — sits under combo, top-left (mock .pups)
    this.puLabel = el('div', { class: 'hud-pu-label' }, '');
    this.puFill = el('div', { class: 'hud-pu-fill' });
    this.puIcon = el('span', { class: 'hud-pu-icon' });
    this.puWrap = el('div', { class: 'hud-powerup' }, this.puIcon, this.puLabel, el('div', { class: 'hud-pu-track' }, this.puFill));

    const topLeft = el(
      'div',
      { class: 'hud-topleft' },
      this.dailyBadge,
      el('div', { class: 'hud-lbl' }, 'SCORE'),
      this.scoreEl,
      subline,
      comboRow,
      this.mutatorRow,
      this.puWrap,
    );

    // ── TOP-CENTER: cipher readout (boss fights) (mock .hud-tc) ──
    this.cipherEl = el('div', { class: 'hud-cipher' });
    const topCenter = el('div', { class: 'hud-topcenter' }, this.cipherEl);

    // ── TOP-RIGHT: coherence meter + best (mock .hud-tr) ──
    this.cityMemFill = el('div', { class: 'hud-citymem-fill' });
    this.cityMemWrap = el('div', { class: 'hud-citymem', title: 'COHERENCE — the City of Lancefall lights up as you chain kills and dash on the beat. Higher coherence = brighter world and fuller sound.' }, this.cityMemFill);
    this.bestComboEl = el('div', { class: 'hud-bestcombo' }, '');
    const topRight = el('div', { class: 'hud-topright' }, el('div', { class: 'hud-lbl' }, 'COHERENCE'), this.cityMemWrap, this.bestComboEl);

    // ── BOTTOM-LEFT: dash / stamina (mock .hud-bl) ──
    this.staminaWrap = el('div', { class: 'hud-stamina', title: 'STAMINA — each dash spends a segment. It refills over time and faster when you graze bullets.' });
    const bottomLeft = el('div', { class: 'hud-botleft' }, el('div', { class: 'hud-lbl' }, 'DASH'), this.staminaWrap);

    // ── BOTTOM-CENTER: OVERDRIVE gauge (mock .hud-bc) ──
    this.odLabel = el('div', { class: 'hud-od-label' }, 'DAYBREAK');
    this.odFill = el('div', { class: 'hud-od-fill' });
    this.odWrap = el('div', { class: 'hud-overdrive', title: 'DAYBREAK (OVERDRIVE) — kills and grazes charge this meter. When it reads READY, press F (or LB) for a time-slowing, screen-clearing burst of light.' }, this.odLabel, el('div', { class: 'hud-od-track' }, this.odFill));
    const bottomCenter = el('div', { class: 'hud-botcenter' }, this.odWrap);

    // ── BOTTOM-RIGHT: armor pips (mock .hud-br) ──
    this.shieldsWrap = el('div', { class: 'hud-shields', title: 'ARMOR — each pip absorbs one lethal hit before LAST BREATH. One pip regenerates every boss clear.' });
    const bottomRight = el('div', { class: 'hud-botright' }, el('div', { class: 'hud-lbl' }, 'ARMOR'), this.shieldsWrap);

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

    // §1.7 — first-appearance jargon gloss. Built here but appended to ROOT (next to
    // the toast/announce layers) so it stacks ABOVE the draft/pause overlays — the
    // FUSION gloss has to read over the open draft. aria-live so a reader speaks it.
    this.glossTermEl = el('div', { class: 'hud-gloss-term' });
    this.glossBodyEl = el('div', { class: 'hud-gloss-body' });
    this.glossEl = el('div', { class: 'hud-gloss', role: 'status', 'aria-live': 'polite' }, this.glossTermEl, this.glossBodyEl);

    this.hud = el('div', { class: 'hud' }, topLeft, topCenter, topRight, bottomLeft, bottomCenter, bottomRight, this.touchPauseBtn);
    this.rebuildStamina(TUNE.stamina.segments);
  }

  // ── §1.7 first-appearance jargon glosses ──────────────────────────────────────
  /** Enqueue a term's one-line gloss the first time its concept appears. No-op if the
   *  id was already shown (this session OR persisted) — once ever. Reserves the id in
   *  the session set immediately so a per-frame trigger can't enqueue it twice before
   *  it drains. */
  private queueGloss(id: GlossId): void {
    const s = this.saveRef;
    if (!s || this.glossSeenSession.has(id) || s.glossSeen.includes(id)) return;
    this.glossSeenSession.add(id);
    this.glossQueue.push(id);
    this.pumpGloss();
  }

  /** Show the next queued gloss if none is on screen. Marks it seen + persists at the
   *  moment it actually shows (not when queued), so an unshown queue tail can reappear
   *  next session rather than being silently consumed. */
  private pumpGloss(): void {
    if (this.glossActive || this.glossQueue.length === 0) return;
    const id = this.glossQueue.shift()!;
    const def = GLOSSES[id];
    if (!def) { this.pumpGloss(); return; }
    this.glossActive = true;
    const s = this.saveRef;
    if (s && !s.glossSeen.includes(id)) {
      s.glossSeen.push(id); // optimistic local mark so a re-open this session won't re-fire
      this.cb.onMarkGloss(id);
    }
    this.glossTermEl.textContent = def.term;
    this.glossBodyEl.textContent = def.text;
    this.glossEl.style.setProperty('--gloss-accent', def.accent);
    this.glossEl.classList.remove('show');
    void this.glossEl.offsetWidth; // restart the entrance
    this.glossEl.classList.add('show');
    clearTimeout(this.glossTimer);
    this.glossTimer = window.setTimeout(() => {
      this.glossEl.classList.remove('show');
      this.glossActive = false;
      // small gap before the next one so they read as separate notes
      window.setTimeout(() => this.pumpGloss(), 360);
    }, 5400);
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
    // per-stat accent colours (mock): BEST RUN cyan · BEST COMBO lavender · SHARDS green —
    // each column reads as its own identity instead of a wall of monochrome numerals.
    this.titleBest = el('div', { class: 'ck-hstat-val run' }, '—');
    this.hsBest = this.titleBest;
    this.hsCombo = el('div', { class: 'ck-hstat-val combo' }, '—');
    this.shardLine = el('div', { class: 'ck-hstat-val shards' }, '—');
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
    // mode-flavour box — sinks flush to the rail bottom (kills the lower-left void); the head +
    // italic body are repainted per selected mode in refreshSelectedRun. aria-hidden: it only
    // restates the hero copy in a quieter voice, so it's decorative to the screen reader.
    this.flavorBox = el('div', { class: 'mode-flavor', 'aria-hidden': 'true' });
    const railCol = el('div', { class: 'ck-col ck-col-left' }, el('div', { class: 'ck-sec' }, 'SELECT MODE'), this.modeGrid, this.flavorBox);

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
      iconEl('ck-hero-citywrap', CK_CITY_SVG), // the "city remembered" skyline (behind the glow)
      el('div', { class: 'ck-hero-glow' }),
      // atmospheric depth (mock): a mid-ground fog gradient + a dark vignette framing the
      // skyline. Pure decoration, aria-hidden; both sit under the hero content + firstlight.
      el('div', { class: 'ck-hero-fog', 'aria-hidden': 'true' }),
      el('div', { class: 'ck-hero-overlay', 'aria-hidden': 'true' }),
      el('div', { class: 'ck-hero-streak', 'aria-hidden': 'true' }),
      el('div', { class: 'ck-hero-firstlight', 'aria-hidden': 'true' }),
      iconEl('ck-hero-sparks', CK_SPARKS_HTML), // rising embers off the skyline
      this.heroContent,
    );
    this.heroEl = hero;
    this.infoBar = el('div', { class: 'ck-infobar' });
    this.rewardRow = el('div', { class: 'ck-rewards' });

    // DESCEND = the renamed/restyled PLAY button. REUSE this.playBtn + its existing handler.
    // Flanking chevrons (mock) point into the hexagon button; aria-hidden so the label reads clean.
    const play = el(
      'button',
      { class: 'btn btn-primary btn-play ck-descend', 'aria-label': 'Descend — start the selected run' },
      el('span', { class: 'ck-descend-chev l', 'aria-hidden': 'true' }, '›› '),
      'DESCEND',
      el('span', { class: 'ck-descend-chev r', 'aria-hidden': 'true' }, ' ‹‹'),
    );
    this.playBtn = play;
    play.addEventListener('click', () => {
      // DESCEND commit: the cock-and-fire charge + light-lance + an INITIATING DESCENT
      // takeover (the mock's full-screen sequence), then launch. The lance leads the bloom
      // by a beat; under reduce-motion the flourish is skipped and the run starts at once.
      const s = this.saveRef;
      const mode = modeById(s ? s.selectedMode : 'endless');
      this.fireDescend(mode.name);
      const delay = this.motionOff() ? 0 : 130;
      window.setTimeout(() => this.cb.onStart(mode), delay);
    });
    // descend sub: keyboard-affordance row (ENTER / SPACE) above the live mode line.
    this.descendModeLine = el('div', { class: 'ck-descend-mode-line' }, '');
    this.descendSub = el(
      'div',
      { class: 'ck-descend-sub' },
      el(
        'div',
        { class: 'ck-kbd-hint-row', 'aria-hidden': 'true' },
        el('span', { class: 'ck-kbd-hint' }, '↵ ENTER'),
        el('span', { class: 'ck-kbd-sep' }, '/'),
        el('span', { class: 'ck-kbd-hint' }, 'SPACE'),
      ),
      this.descendModeLine,
    );
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
    // the ring carries the equipped hull's accent as `color`, so the glow backdrop, orbit
    // rings and hangar floor (all currentColor) tint to the hull. Set in refreshSelectedRun.
    this.ckShipRing = el(
      'div',
      { class: 'ck-ship-ring' },
      el('div', { class: 'ck-hangar-grid', 'aria-hidden': 'true' }, el('div', { class: 'ck-hangar-floor' })),
      el('div', { class: 'ck-ship-orbit outer', 'aria-hidden': 'true' }),
      el('div', { class: 'ck-ship-orbit inner', 'aria-hidden': 'true' }),
      this.shipArt,
    );
    const shipDisplay = el(
      'div',
      { class: 'ck-ship-display' },
      this.ckShipRing,
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
      el('div', { class: 'ck-lo-key' }, iconEl('ck-lo-ico', LO_HEAT_SVG), 'HEAT'),
      el('div', { class: 'ck-lo-right' }, heatMinus, this.heatPipsWrap, heatPlus),
    );

    // BUILD — the selected archetype (draft bias); a quick-row into the archetype picker.
    this.buildRowVal = el('div', { class: 'ck-lo-muted' }, 'None Equipped');
    const buildRow = el(
      'button',
      { class: 'ck-lo-row ck-lo-btn', type: 'button', title: 'BUILD — pick an archetype that biases your perk draft. Tap to choose.' },
      el('div', { class: 'ck-lo-key' }, iconEl('ck-lo-ico', LO_BUILD_SVG), 'BUILD'),
      el('div', { class: 'ck-lo-right' }, this.buildRowVal, el('div', { class: 'ck-lo-chevron' }, '›')),
    );
    buildRow.addEventListener('click', () => this.openArchetype());

    // ARMOR — effective shield pips for the selected Heat (each absorbs one lethal hit
    // before LAST BREATH); higher Heat strips ARMOR, so this re-paints with HEAT.
    this.armorPipsWrap = el('div', { class: 'ck-armor-pips' });
    const armorRow = el(
      'div',
      { class: 'ck-lo-row ck-lo-armor', title: 'ARMOR — shield pips that each soak a lethal hit before LAST BREATH. Higher Heat strips ARMOR.' },
      el('div', { class: 'ck-lo-armor-top' }, el('div', { class: 'ck-lo-key' }, iconEl('ck-lo-ico', LO_ARMOR_SVG), 'ARMOR'), this.armorPipsWrap),
      el('div', { class: 'ck-armor-cap' }, 'LETHAL HIT ABSORPTION'),
    );

    // ship picker (reuse this.shipRow), hidden until CHANGE SHIP.
    this.shipRow = el('div', { class: 'ship-row ck-ship-row' });
    this.shipPicker = el('div', { class: 'ck-picker hidden' }, this.shipRow);
    changeShip.addEventListener('click', () => {
      const open = this.shipPicker.classList.toggle('hidden');
      changeShip.setAttribute('aria-expanded', String(!open));
    });

    // cosmetics — the PALETTE + DASH-TRAIL pickers (this.themeRow / this.trailRow) now live in
    // a CUSTOMIZE modal (built by buildCosmetics); the loadout shows two at-a-glance summary
    // cards of the current selection, each (and the CUSTOMIZE button) opening that modal.
    this.themeRow = el('div', { class: 'theme-row ck-cosm-grid' });
    this.trailRow = el('div', { class: 'theme-row ck-cosm-grid' });
    this.cosmThemeDot = el('div', { class: 'cosm-dot' });
    this.cosmThemeName = el('div', { class: 'cosm-name' }, '—');
    this.cosmTrailDot = el('div', { class: 'cosm-dot' });
    this.cosmTrailName = el('div', { class: 'cosm-name' }, '—');
    const cosmCard = (dot: HTMLElement, type: string, name: HTMLElement, title: string) => {
      const card = el(
        'button',
        { class: 'cosm-card', type: 'button', title },
        dot,
        el('div', { class: 'cosm-info' }, el('div', { class: 'cosm-type' }, type), name),
      );
      card.addEventListener('click', () => this.openCosmetics());
      return card;
    };
    const customize = el('button', { class: 'ck-customize cust-btn', type: 'button' }, 'CUSTOMIZE');
    customize.addEventListener('click', () => this.openCosmetics());
    const loadoutCol = el(
      'div',
      { class: 'ck-col ck-col-right' },
      el('div', { class: 'ck-sec' }, 'LOADOUT'),
      shipDisplay,
      this.shipPicker,
      heatRow,
      buildRow,
      armorRow,
      el('div', { class: 'ck-cosm-title' }, 'COSMETICS'),
      el(
        'div',
        { class: 'cosm-cards' },
        cosmCard(this.cosmThemeDot, 'PALETTE', this.cosmThemeName, 'PALETTE — a cosmetic colour theme for the whole game. Tap to customize.'),
        cosmCard(this.cosmTrailDot, 'DASH TRAIL', this.cosmTrailName, 'DASH TRAIL — the cosmetic streak left when you dash. Tap to customize.'),
      ),
      customize,
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
    // each nav button carries a small indicator pip (mock); UPGRADES gets the gold pip.
    const navBtn = (icon: string, label: string, on: () => void, title: string, pip = '') => {
      const b = el(
        'button',
        { class: 'ck-nav-btn', type: 'button', title },
        el('div', { class: 'ck-nav-pip' + (pip ? ' ' + pip : ''), 'aria-hidden': 'true' }),
        iconEl('ck-nav-ico', NAV_ICONS[icon]),
        el('span', {}, label),
      );
      b.addEventListener('click', on);
      return b;
    };
    const bottomNav = el(
      'div',
      { class: 'ck-nav', role: 'group', 'aria-label': 'Menus' },
      navBtn('upgrades', 'UPGRADES', () => this.openUpgrades(), 'UPGRADES — spend shards on a permanent meta-tree that carries between runs.', 'gold'),
      navBtn('ranks', 'RANKS', () => this.openLeaderboard(), 'RANKS — online leaderboards (daily, weekly and all-time) if you opt in.'),
      navBtn('stats', 'STATS', () => this.openStats(), 'STATS — your lifetime numbers and achievements.'),
      el('div', { class: 'ck-nav-div' }),
      navBtn('build', 'BUILD', () => this.openArchetype(), 'BUILD — pick a starting archetype that biases your perk draft.'),
      navBtn('codex', 'CODEX', () => this.showCodex(), 'CODEX — a bestiary of every enemy, boss, biome and relic, with lore.'),
      navBtn('fall', 'THE FALL', () => this.showFall(), 'THE FALL — the story: six who let the City of Lancefall go dark.'),
      // DUEL / GHOST nav entry PARKED — async duels are confusing without a proper server-
      // backed list; the panel + openDuelWithCode deep-link stay in the code, just unadvertised.
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

    // "INITIATING DESCENT" takeover (mock): a fixed, pointer-events:none full-screen wash that
    // plays the mode title + a pulsing bar trio as the run launches. Mounted on <body> so it
    // floats above the screen swap into the game. Built once; the title gets repainted per launch.
    this.descendOverlay = el(
      'div',
      { class: 'ck-descend-overlay', 'aria-hidden': 'true' },
      el('div', { class: 'ck-do-title' }),
      el('div', { class: 'ck-do-sub' }, 'INITIATING DESCENT'),
      el(
        'div',
        { class: 'ck-do-bars' },
        el('span', { style: 'animation-delay:0s' }),
        el('span', { style: 'animation-delay:.13s' }),
        el('span', { style: 'animation-delay:.26s' }),
      ),
    );
    if (!this.descendOverlay.parentNode) document.body.appendChild(this.descendOverlay);

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

  /** DESCEND cock-and-fire: a brief charge dip on the button + a light-lance streak + the
   *  full-screen "INITIATING DESCENT" takeover stamped with the launching mode's name. The
   *  flourish is skipped under reduce-motion (the launch itself still proceeds via the caller),
   *  but the overlay title is always set so a follow-up frame reads correctly. */
  private fireDescend(modeName: string): void {
    (this.descendOverlay.firstElementChild as HTMLElement).textContent = modeName;
    if (this.motionOff()) return;
    this.replayAnim(this.playBtn, 'charging');
    this.replayAnim(this.lightLance, 'fire');
    this.replayAnim(this.descendOverlay, 'show');
    window.setTimeout(() => this.descendOverlay.classList.remove('show'), 1200);
  }

  /** Scale-to-fit cockpit fitter (mock): on the desktop layout (≥1040px) the cockpit is a
   *  fixed composition scaled to fill the viewport (clamped 0.55–1.85), centred, never
   *  scrolling. Below 1040px we hand off to the CSS breakpoints (fluid reflow) by dropping the
   *  `fitted` class. Only ever active on the 'title' screen. */
  private fitCockpit(): void {
    const frame = this.title.querySelector('.ck-frame') as HTMLElement | null;
    if (!frame) return;
    const DESKTOP_MIN_W = 1040;
    const MAX_SCALE = 1.85;
    const MIN_SCALE = 0.55;
    const MARGIN = 30; // breathing room around the scaled frame
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (this.current !== 'title' || vw < DESKTOP_MIN_W) {
      this.title.classList.remove('fitted');
      frame.style.transform = '';
      return;
    }
    this.title.classList.add('fitted');
    frame.style.transform = 'translate(-50%, -50%) scale(1)'; // neutral, to measure natural size
    const w = frame.offsetWidth;
    const h = frame.offsetHeight;
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min((vw - MARGIN) / w, (vh - MARGIN) / h)));
    frame.style.transform = `translate(-50%, -50%) scale(${s.toFixed(4)})`;
  }

  /** Coalesce fitter runs to one per frame (resize fires in bursts). */
  private scheduleFit(): void {
    if (this.fitRaf !== null) return;
    this.fitRaf = window.requestAnimationFrame(() => {
      this.fitRaf = null;
      this.fitCockpit();
    });
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

  /** Paint the loadout ARMOR pips — effective shields for the selected Heat (baseShields
   *  minus that level's shieldsLost; floor 0). Higher Heat strips ARMOR, so this re-paints
   *  alongside the HEAT pips whenever refreshTitle runs. */
  private paintArmorPips(save: SaveData): void {
    const eff = Math.max(0, save.baseShields - (HEAT_LEVELS[save.selectedHeat]?.shieldsLost ?? 0));
    this.armorPipsWrap.replaceChildren();
    if (eff <= 0) {
      this.armorPipsWrap.append(el('div', { class: 'ck-armor-none' }, 'STRIPPED'));
      return;
    }
    for (let i = 0; i < eff; i++) this.armorPipsWrap.append(el('div', { class: 'ck-armor-pip' }));
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

  // ── FIRST LIGHT run-end (mock-choice-v2) ───────────────────────────────────
  //   One screen, three faces: a won-with-CHOICE hero (the FIRST LIGHT tableau +
  //   THE CHOICE cards), a plain victory shell (no cards), and a restrained loss
  //   debrief. The DOM is built once; showGameOver()/resolveChoice() toggle state
  //   classes + fill the refs. Every callback (onChoice/onRestart/onQuit/
  //   onToggleNgPlus/onSaveReplay) is wired to the SAME methods as before — this is
  //   a pure presentation re-skin, the interface is untouched.
  private buildGameOver(): void {
    // — HEADER —
    this.goEyebrow = el('div', { class: 'go-eyebrow' }, '');
    this.goHead = el('h2', { class: 'go-head' }, 'THE LIGHT DIMS');
    this.goSub = el('div', { class: 'go-sub' }, '');
    const brand = el('div', { class: 'go-brand' }, this.goEyebrow, this.goHead, this.goSub);
    const sigil = el('span', { class: 'go-sigil', 'aria-hidden': 'true' });
    sigil.innerHTML = GO_SIGIL_SVG;
    const hdrLeft = el('div', { class: 'go-hdr-left' }, sigil, brand);

    this.goCohPct = el('div', { class: 'go-coh-pct' }, '100%');
    this.goCohFoot = el('div', { class: 'go-coh-foot' }, '');
    const cohWrap = el(
      'div',
      { class: 'go-coh-wrap' },
      el('div', { class: 'go-coh-row' }, el('div', { class: 'go-coh-lbl' }, 'CITY COHERENCE'), this.goCohPct),
      el('div', { class: 'go-coh-track' }, el('div', { class: 'go-coh-fill' })),
      this.goCohFoot,
    );

    this.goHsScore = el('div', { class: 'go-hstat-val', style: 'color:var(--amber)' }, '0');
    this.goHsCombo = el('div', { class: 'go-hstat-val', style: 'color:var(--purple)' }, '×0');
    this.goHsTime = el('div', { class: 'go-hstat-val', style: 'color:var(--cyan)' }, '0:00');
    const hdrRight = el(
      'div',
      { class: 'go-hdr-right' },
      el('div', { class: 'go-hstat' }, el('div', { class: 'go-hstat-lbl' }, 'SCORE'), this.goHsScore),
      el('div', { class: 'go-hstat' }, el('div', { class: 'go-hstat-lbl' }, 'BEST COMBO'), this.goHsCombo),
      el('div', { class: 'go-hstat' }, el('div', { class: 'go-hstat-lbl' }, 'TIME'), this.goHsTime),
    );
    const header = el('div', { class: 'go-header' }, hdrLeft, cohWrap, hdrRight);

    // — FIRST LIGHT tableau (DOM/CSS skyline; reacts to --lean) —
    this.goTabEyebrow = el('div', { class: 'go-tab-eyebrow' });
    this.goTabEyebrow.append(el('span', { class: 'go-rule' }), 'THE LAST CIPHER IS YOURS', el('span', { class: 'go-rule r' }));
    this.goTabTitle = el('div', { class: 'go-tab-title' }, 'FIRST LIGHT');
    this.goTabLine = el('div', { class: 'go-tab-line' }, '');
    const tabContent = el('div', { class: 'go-tab-content' }, this.goTabEyebrow, this.goTabTitle, this.goTabLine);
    const sky = el('div', { class: 'go-tab-sky' });
    const city = el('span', { class: 'go-tab-city', 'aria-hidden': 'true' });
    city.innerHTML = GO_CITY_SVG;
    const motes = el('div', { class: 'go-tab-motes', 'aria-hidden': 'true' });
    motes.innerHTML = GO_MOTES_HTML;
    this.goTableau = el(
      'div',
      { class: 'go-tableau' },
      sky,
      city,
      el('div', { class: 'go-tab-dusk' }),
      el('div', { class: 'go-tab-glow' }),
      el('div', { class: 'go-tab-overlay' }),
      motes,
      tabContent,
    );

    // — THE CHOICE — two cards (lean-reactive, keyboard-operable). Shown only on a
    //   choicePending run. Faithful to stillpoint.choiceEnding(): the head/line below
    //   match choiceEnding('catch'|'fall') verbatim.
    this.goCatchBtn = this.buildChoiceCard('catch');
    this.goFallBtn = this.buildChoiceCard('fall');
    this.choiceRow = el(
      'div',
      { class: 'go-choice-zone hidden' },
      el(
        'div',
        { class: 'go-choice-prompt' },
        el('div', { class: 'go-choice-kicker' }, '◇ THE CHOICE ◇'),
        el('div', { class: 'go-choice-q' }, 'WHAT BECOMES OF THE LIGHT?'),
        (() => {
          const t = el('div', { class: 'go-choice-turing' }, 'The last cipher has no key. ');
          t.append(el('b', {}, 'No machine can decide it'), ' — it can only be chosen.');
          return t;
        })(),
      ),
      el('div', { class: 'go-choice-row' }, this.goCatchBtn, this.goFallBtn),
    );
    this.wireChoiceKeyboard();

    // — DEBRIEF + SHARE —
    this.goBadge = el('div', { class: 'go-badge hidden' }, '');
    this.goDelta = el('div', { class: 'go-delta' }, '');
    this.goScore = el('div', { class: 'go-score hidden' }, '0'); // kept for the count-up animation target / legacy
    this.goStats = el('div', { class: 'go-stats' }, '');
    this.goGrade = el('div', { class: 'go-grade-badge' }, 'S');
    this.goGradeTitle = el('div', { class: 'go-grade-title' }, '');
    this.goGradeNote = el('div', { class: 'go-grade-note' }, '');
    const gradeRow = el(
      'div',
      { class: 'go-grade-row' },
      this.goGrade,
      el('div', { class: 'go-grade-text' }, this.goGradeTitle, this.goGradeNote),
    );
    this.goAch = el('div', { class: 'go-ach' }, '');
    this.goBuild = el('div', { class: 'go-build' }, '');
    const statPanel = el(
      'div',
      { class: 'go-stat-panel' },
      el('div', { class: 'go-panel-lbl' }, 'DEBRIEF'),
      this.goBadge,
      this.goDelta,
      this.goStats,
      this.goAch,
      gradeRow,
      this.goBuild,
    );

    // SHARE THE DAWN card — opens the existing SHARE modal via onSaveReplay.
    this.saveReplayBtn = el('button', { class: 'go-sbtn primary' }, '⧉ SHARE THE DAWN') as HTMLButtonElement;
    this.saveReplayBtn.addEventListener('click', () => this.cb.onSaveReplay());
    const copy = el('button', { class: 'go-sbtn ghost' }, '⧉ COPY SCORE');
    copy.addEventListener('click', () => this.cb.onCopyScore());
    const dna = el('button', { class: 'go-sbtn ghost' }, '⧬ COPY BUILD');
    dna.addEventListener('click', () => this.cb.onCopyBuildDna());
    const duel = el('button', { class: 'go-sbtn ghost' }, '⚔ DUEL A FRIEND');
    duel.addEventListener('click', () => this.cb.onCreateChallenge());
    const sharePreview = el('span', { class: 'go-gif', 'aria-hidden': 'true' });
    sharePreview.innerHTML = GO_GIF_HTML;
    const sharePanel = el(
      'div',
      { class: 'go-share-panel' },
      el('div', { class: 'go-panel-lbl' }, 'SHARE THE DAWN'),
      sharePreview,
      el('div', { class: 'go-share-btns' }, this.saveReplayBtn, copy),
      el('div', { class: 'go-share-btns' }, dna, duel),
      el('div', { class: 'go-share-note' }, 'the first-light frame, captured the instant the run resolved'),
    );
    const lower = el('div', { class: 'go-lower' }, statPanel, sharePanel);

    // — FOOTER — DESCEND AGAIN → onRestart · ASCEND → onToggleNgPlus · RETURN → onQuit
    const again = el('button', { class: 'go-descend' }, 'DESCEND AGAIN');
    again.addEventListener('click', () => this.cb.onRestart());
    this.goAscendBtn = el('button', { class: 'go-fbtn go-ascend hidden' }) as HTMLButtonElement;
    this.goAscendBtn.append(el('span', {}, '↑ ASCEND'), el('span', { class: 'go-k' }, 'KEEP GOING'));
    this.goAscendBtn.addEventListener('click', () => this.cb.onToggleNgPlus());
    const menu = el('button', { class: 'go-fbtn' });
    menu.append(el('span', {}, '⌂ RETURN TO LANCEFALL'), el('span', { class: 'go-k' }, 'ESC'));
    menu.addEventListener('click', () => this.cb.onQuit());
    const footer = el('div', { class: 'go-footer' }, again, el('div', { class: 'go-foot-secondary' }, this.goAscendBtn, menu));

    // corner accents on the main panel
    const corners = ['c-tl', 'c-tr', 'c-bl', 'c-br'].map((c) => el('div', { class: `go-corner go-${c}` }));
    const mainPanel = el('div', { class: 'go-main' }, ...corners, this.goTableau, this.choiceRow, lower);

    // the screen root carries the `.panel` class so the role=dialog/aria-modal wiring
    // in build() still finds it; `.go-frame` carries the won/lost/pending/resolved state.
    this.goScreenInner = el('div', { class: 'go-frame panel' }, header, mainPanel, footer);

    // committed-resolve full-screen wash (fixed overlay, like the mock's .resolve)
    this.goResolveHead = el('div', { class: 'go-resolve-head' }, '');
    this.goResolveLine = el('div', { class: 'go-resolve-line' }, '');
    this.goResolve = el('div', { class: 'go-resolve', 'aria-hidden': 'true' }, this.goResolveHead, this.goResolveLine);

    this.gameover = el('div', { class: 'screen screen-dim go-screen' }, this.goScreenInner, this.goResolve);
  }

  /** Build one THE CHOICE card (CATCH / FALL). The head/line are filled at show
   *  time from stillpoint.choiceEnding() so the screen and the sim ending never drift. */
  private buildChoiceCard(which: 'catch' | 'fall'): HTMLElement {
    const card = el('div', {
      class: `go-choice go-choice-${which}`,
      tabindex: '0',
      role: 'button',
      'aria-pressed': 'false',
      'data-choice': which,
    });
    const glyph = el('span', { class: 'go-choice-glyph', 'aria-hidden': 'true' });
    glyph.innerHTML = which === 'catch' ? GO_CATCH_GLYPH : GO_FALL_GLYPH;
    const act = el('div', { class: 'go-choice-act' }, which === 'catch' ? 'CATCH THE LIGHT' : 'LET IT FALL');
    // head/line sourced from stillpoint.choiceEnding so the card description matches the
    // sim ending verbatim (no drift) — and the cards are never blank.
    const ending = choiceEnding(which);
    const head = el('div', { class: 'go-choice-head' }, ending.head);
    const line = el('div', { class: 'go-choice-line' }, ending.line);
    const tag = el('div', { class: 'go-choice-tag' });
    tag.append(el('b', {}, which === 'catch' ? 'HOLD' : 'RELEASE'), which === 'catch' ? ' · THE VIGIL CONTINUES' : ' · IT IS FINISHED');
    card.append(glyph, act, head, line, tag);
    card.setAttribute('aria-label', which === 'catch' ? 'Catch the light — hold it' : 'Let it fall — release it');
    // the world LEANS toward the ending being weighed (dawn ⇄ dusk); locked on commit
    const lean = which === 'catch' ? 1 : -1;
    card.addEventListener('mouseenter', () => this.setGoLean(lean));
    card.addEventListener('mouseleave', () => this.setGoLean(0));
    card.addEventListener('focus', () => this.setGoLean(lean));
    card.addEventListener('blur', () => this.setGoLean(0));
    card.addEventListener('click', () => this.commitChoice(which));
    return card;
  }

  /** Keyboard contract for THE CHOICE: Enter/Space commits, ArrowLeft/Right move
   *  between the two cards (matching the mock). */
  private wireChoiceKeyboard(): void {
    const cards = [this.goCatchBtn, this.goFallBtn];
    cards.forEach((card, i) => {
      card.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (this.goChoiceLocked) return;
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          this.commitChoice(card.getAttribute('data-choice') as 'catch' | 'fall');
        } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
          ev.preventDefault();
          cards[(i + 1) % cards.length].focus();
        }
      });
    });
  }

  /** Set the live --lean dial on the screen root (0 neutral · +1 CATCH · −1 FALL). */
  private setGoLean(v: number): void {
    if (this.goChoiceLocked) return;
    this.goScreenInner.style.setProperty('--lean', String(v));
  }

  /** Commit THE CHOICE: drive the sim ending (onChoice) AND play the resolve. */
  private commitChoice(which: 'catch' | 'fall'): void {
    if (this.goChoiceLocked) return;
    this.cb.onChoice(which); // unchanged — the sim ending is driven here
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

  showEvent(name: string, flavor: string, accent: string, choices: EventChoice[], headGlyph?: string): void {
    // the event's maximalist glyph art sits above the title (currentColor → tinted by the accent set below)
    this.eventHead.replaceChildren();
    if (headGlyph) this.eventHead.append(iconEl('event-glyph', headGlyph));
    this.eventHead.append(document.createTextNode(name));
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
    const s = this.settings;

    // slider returns { row, input } so a PRESET can re-sync the displayed value
    const fmtSliderVal = (v: number) => String(Math.round(v * 100) / 100);
    const slider = (label: string, min: number, max: number, step: number, val: number, on: (v: number) => void) => {
      const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val) }) as HTMLInputElement;
      // value chip (mock flourish): a live amber readout of the current value, right-aligned.
      const chip = el('span', { class: 'setting-val' }, fmtSliderVal(val));
      input.addEventListener('input', () => { const v = parseFloat(input.value); on(v); chip.textContent = fmtSliderVal(v); });
      return { row: el('label', { class: 'setting' }, el('span', {}, label), input, chip), input };
    };
    const toggle = (label: string, val: boolean, on: (v: boolean) => void) => {
      const input = el('input', { type: 'checkbox' }) as HTMLInputElement;
      input.checked = val;
      input.addEventListener('change', () => on(input.checked));
      return el('label', { class: 'setting setting-toggle' }, el('span', {}, label), input);
    };

    // ── the perf/fidelity dials the PRESETS drive (kept as refs so a preset re-syncs them) ──
    const shakeS = slider('Screen shake', 0, 1.5, 0.05, s.shake, (v) => this.patch({ shake: v }));
    const chromaS = slider('Chromatic aberration', 0, 1, 0.05, s.chromAberration, (v) => this.patch({ chromAberration: v }));
    // live preview chips (mock flourish): the chromatic split widens with the value; the
    // shake box jitters at the chosen amplitude. Both update on drag + on a preset.
    const chromaPrev = el('span', { class: 'chroma-prev' }, 'LANCE');
    const setChromaPrev = (v: number) => {
      const o = (v * 1.6).toFixed(2);
      chromaPrev.style.textShadow = `-${o}px 0 #ff004c, ${o}px 0 #00e1ff`;
    };
    setChromaPrev(s.chromAberration);
    chromaS.input.addEventListener('input', () => setChromaPrev(parseFloat(chromaS.input.value)));
    chromaS.row.insertBefore(chromaPrev, chromaS.input);
    const shakePrev = el('span', { class: 'shake-prev' });
    const setShakePrev = (v: number) => shakePrev.style.setProperty('--amp', `${(v * 1.8).toFixed(2)}px`);
    setShakePrev(s.shake);
    shakeS.input.addEventListener('input', () => setShakePrev(parseFloat(shakeS.input.value)));
    shakeS.row.insertBefore(shakePrev, shakeS.input);
    const partPrev = el('span', { class: 'part-prev' });
    for (let i = 0; i < 4; i++) partPrev.append(el('i'));
    const densityWrap = el('div', { class: 'setting' }, el('span', {}, 'Particle density'), partPrev);
    const densityBtns: Partial<Record<'low' | 'med' | 'high', HTMLElement>> = {};
    const setDensity = (d: 'low' | 'med' | 'high') => {
      for (const k of ['low', 'med', 'high'] as const) densityBtns[k]?.classList.toggle('active', k === d);
      partPrev.dataset.d = d; // CSS lights 1 / 2 / 4 dots
    };
    for (const d of ['low', 'med', 'high'] as const) {
      const b = el('button', { class: 'btn btn-ghost btn-sm' }, d.toUpperCase());
      densityBtns[d] = b;
      b.addEventListener('click', () => { this.patch({ particleDensity: d }); setDensity(d); });
      densityWrap.append(b);
    }
    setDensity(s.particleDensity);

    // ── PRESETS (mock-mainui) — one tap sets the perf/fidelity dials + re-syncs the controls ──
    const PRESETS: Record<string, { particleDensity: 'low' | 'med' | 'high'; chromAberration: number; shake: number }> = {
      PERFORMANCE: { particleDensity: 'low', chromAberration: 0, shake: 0.6 },
      BALANCED: { particleDensity: 'med', chromAberration: 0.6, shake: 1 },
      QUALITY: { particleDensity: 'high', chromAberration: 1, shake: 1 },
    };
    const presetRow = el('div', { class: 'set-presets' });
    for (const [name, p] of Object.entries(PRESETS)) {
      const b = el('button', { class: 'btn btn-ghost btn-sm' }, name);
      b.addEventListener('click', () => {
        this.patch(p);
        chromaS.input.value = String(p.chromAberration);
        shakeS.input.value = String(p.shake);
        // dispatch 'input' so the live preview AND the value chip both re-sync to the preset.
        chromaS.input.dispatchEvent(new Event('input'));
        shakeS.input.dispatchEvent(new Event('input'));
        setDensity(p.particleDensity);
        presetRow.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
      presetRow.append(b);
    }
    // reflect the active preset on open (mock: a preset reads lit) — light whichever preset the
    // current dials already match, so the row isn't blank. Defaults land on BALANCED.
    const presetNames = Object.keys(PRESETS);
    const activeIdx = presetNames.findIndex((name) => {
      const p = PRESETS[name];
      return p.particleDensity === s.particleDensity && p.chromAberration === s.chromAberration && p.shake === s.shake;
    });
    if (activeIdx >= 0) (presetRow.children[activeIdx] as HTMLElement | undefined)?.classList.add('active');

    // soundtrack picker — AURORA (dreamy) vs SURGE (aggressive)
    const trackWrap = el('div', { class: 'setting' }, el('span', {}, 'Soundtrack'));
    for (const id of ['aurora', 'surge'] as SoundtrackId[]) {
      const prof = TRACKS[id];
      const b = el('button', { class: 'btn btn-ghost btn-sm' + (s.soundtrack === id ? ' active' : ''), title: prof.blurb }, prof.name);
      b.addEventListener('click', () => {
        this.patch({ soundtrack: id });
        trackWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
      trackWrap.append(b);
    }

    // City-memory is backed by SaveData (not Settings); re-synced on open (see openSettings()).
    const cityMemRow = toggle('City memory meter', this.saveRef?.cityMemoryMeter ?? true, (v) => this.cb.onToggleCityMemory(v));
    this.cityMemToggle = cityMemRow.querySelector('input');

    // ── key rebinding (keyboard only; gamepad/touch unchanged) ──
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
          if (k !== 'escape') this.patch({ keymap: { ...this.settings.keymap, [action]: [k] } });
          refreshKeyLabels();
        };
        window.addEventListener('keydown', onKey, true);
      });
      return el('label', { class: 'setting' }, el('span', {}, label), btn);
    };
    const resetKeys = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Reset keys to default');
    resetKeys.addEventListener('click', () => { this.patch({ keymap: defaultKeyBindings() }); refreshKeyLabels(); });

    // ── tabbed SECTIONS (mock-mainui) — group related settings; one section visible at a time ──
    const sect = (id: string, ...kids: HTMLElement[]) => el('div', { class: 'set-sect', 'data-sect': id }, ...kids);
    const sections: { id: string; name: string; el: HTMLElement }[] = [
      { id: 'audio', name: 'AUDIO', el: sect('audio',
        slider('Master volume', 0, 1, 0.05, s.master, (v) => this.patch({ master: v })).row,
        slider('SFX volume', 0, 1, 0.05, s.sfx, (v) => this.patch({ sfx: v })).row,
        slider('Music volume', 0, 1, 0.05, s.music, (v) => this.patch({ music: v })).row,
        trackWrap) },
      { id: 'visuals', name: 'VISUALS', el: sect('visuals',
        shakeS.row,
        slider('HUD scale', 0.8, 1.4, 0.05, s.hudScale, (v) => this.patch({ hudScale: v })).row,
        chromaS.row, densityWrap) },
      { id: 'gameplay', name: 'GAMEPLAY', el: sect('gameplay',
        toggle('Slingshot dash (alt style)', s.dashStyle === 'slingshot', (v) => this.patch({ dashStyle: v ? 'slingshot' : 'lance' })),
        cityMemRow) },
      { id: 'access', name: 'ACCESS', el: sect('access',
        toggle('Reduce flashing', s.reduceFlashing, (v) => this.patch({ reduceFlashing: v })),
        toggle('Reduce motion', s.reduceMotion, (v) => this.patch({ reduceMotion: v })),
        toggle('Colorblind shapes', s.colorblind, (v) => this.patch({ colorblind: v })),
        toggle('Clarity (high contrast)', s.clarity, (v) => this.patch({ clarity: v })),
        toggle('Beat ring (rhythm assist)', s.rhythmAssist, (v) => this.patch({ rhythmAssist: v }))) },
      { id: 'controls', name: 'CONTROLS', el: sect('controls',
        toggle('Controller rumble', s.rumble, (v) => this.patch({ rumble: v })),
        rebindRow('Dash', 'dash'), rebindRow('Overdrive', 'overdrive'), rebindRow('Pause', 'pause'),
        el('div', { class: 'setting' }, resetKeys)) },
    ];
    const tabRow = el('div', { class: 'set-tabs' });
    const showSect = (id: string) => {
      for (const x of sections) x.el.classList.toggle('hidden', x.id !== id);
      tabRow.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.getAttribute('data-sect') === id));
    };
    for (const x of sections) {
      const b = el('button', { class: 'btn btn-ghost btn-sm', 'data-sect': x.id }, x.name);
      b.addEventListener('click', () => showSect(x.id));
      tabRow.append(b);
    }

    const body = el('div', { class: 'settings-body' }, ...sections.map((x) => x.el));
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeSettings());
    const panel = el('div', { class: 'panel panel-wide' }, h, presetRow, tabRow, body, close);
    this.settingsPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
    showSect('audio'); // default to the AUDIO tab
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
    body.replaceChildren(...renderStats(s, this.statsRarity));
    this.openModal(this.statsPanel);
    // §v7 — fetch the global achievement-rarity aggregate once (cache it on the UI), then
    // re-render the dossier in place if it resolves while the panel is still open. Offline /
    // no-backend → null → the rarity line simply stays hidden. Never blocks the open.
    if (!this.statsRarity && leaderboardEnabled()) {
      void fetchAchievementRarity().then((r) => {
        if (!r) return;
        this.statsRarity = r;
        if (this.openStack.includes(this.statsPanel)) body.replaceChildren(...renderStats(s, this.statsRarity));
      });
    }
  }

  private buildUpgrades(): void {
    const eyebrow = el('div', { class: 'panel-eyebrow' }, 'PERMANENT META-TREE');
    const h = el('h2', {}, 'UPGRADES');
    const body = el('div', { class: 'upg-body' });
    body.id = 'upg-body';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.upgradesPanel));
    const panel = el('div', { class: 'panel panel-wide' }, eyebrow, h, body, close);
    this.upgradesPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  openUpgrades(): void {
    const s = this.saveRef;
    if (!s) return;
    // the meta-tree (panels/upgrades) — rebuilt from the live save each open; buyMeta
    // re-calls this method, so a purchase re-renders for free.
    const body = this.upgradesPanel.querySelector('#upg-body')!;
    body.replaceChildren(renderUpgrades(s, (id) => this.cb.onBuyMeta(id)));
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
    // §v7 — THE SIX WHO LET IT FALL: the six bosses as a numbered confession timeline.
    body.append(el('div', { class: 'stats-label' }, 'THE SIX WHO LET IT FALL'), renderTheSix());
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
    // intro lead (mock): the creature portraits are still in the render pipeline; entries
    // surface behaviour / role / lore today.
    const lead = el(
      'div',
      { class: 'panel-lead' },
      '⧗ ',
      el('b', {}, 'Biomechanical creature art is in progress'),
      ' — entries show behaviour, role & lore now; the living-machine portraits land with the render pass.',
    );
    this.codexMemories = el('div', { class: 'codex-memories' });
    // the bestiary grids are rebuilt every open (renderBestiary) so the per-kind kill
    // counts + boss VANQUISHED states reflect the live save.
    this.codexBestiary = el('div');
    // READ THE KEY · THE CIPHER (mock): the substitution-cipher explainer + TURING crib legend.
    const cipher = el(
      'div',
      {},
      el('div', { class: 'row-group-title' }, 'READ THE KEY · THE CIPHER'),
      renderCipherLegend(),
    );
    body.append(lead, this.codexMemories, this.codexBestiary, cipher);
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.codexPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.codexPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  // ── BESTIARY SKINS picker (cosmetic enemy reskins) ─────────────────────────
  /** Build the per-kind enemy-skin picker modal. The grid itself is rebuilt every
   *  open from the live save (refreshSkins) — this just lays out the shell. */
  private buildSkins(): void {
    const h = el('h2', {}, 'BESTIARY SKINS');
    const intro = el(
      'div',
      { class: 'codex-frag' },
      'Cosmetic enemy reskins — they change how a threat LOOKS, never how it plays. Each kind has four takes; rarer ones unlock through achievements. (Phase 1: the five heroes.)',
    );
    this.skinsBody = el('div', { class: 'codex-body' });
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.skinsPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, intro, this.skinsBody, close);
    this.skinsPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  private openSkins(): void {
    this.refreshSkins();
    this.openModal(this.skinsPanel);
  }

  // ── CUSTOMIZE (cosmetics) modal — PALETTE + DASH TRAIL pickers ───────────────
  /** Build the CUSTOMIZE modal shell. The palette + dash-trail swatch grids
   *  (this.themeRow / this.trailRow) are populated live in refreshTitle and simply mounted
   *  here; BESTIARY SKINS hops to its own modal. Cosmetics never touch how a run plays. */
  private buildCosmetics(): void {
    const h = el('h2', {}, 'CUSTOMIZE');
    const eyebrow = el('div', { class: 'panel-eyebrow' }, 'LOADOUT · COSMETICS');
    const skinsBtn = el('button', { class: 'btn btn-ghost' }, 'BESTIARY SKINS →');
    skinsBtn.addEventListener('click', () => this.openSkins());
    const note = el('div', { class: 'cosm-note' }, 'Cosmetics are visual-only — they never change how a run plays.');
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.cosmeticsPanel));
    const panel = el(
      'div',
      { class: 'panel' },
      eyebrow,
      h,
      el('div', { class: 'row-group-title' }, 'PALETTE'),
      this.themeRow,
      el('div', { class: 'row-group-title' }, 'DASH TRAIL'),
      this.trailRow,
      note,
      el('div', { class: 'go-row' }, skinsBtn, close),
    );
    this.cosmeticsPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  private openCosmetics(): void {
    this.openModal(this.cosmeticsPanel);
  }

  /** The in-game archetype colour for each ported kind, so a preview matches how
   *  the skin actually reads in play (skins recolour nothing — they wear e.color). */
  private static readonly SKIN_PREVIEW_COLOR: Record<string, string> = {
    darter: '#ff3b6b',
    orbiter: '#22d3ee',
    lancer: '#ff8a3b',
    seeker: '#e879f9',
    warden: '#ff3b6b',
    // Phase 2a — the 5 remaining bosses (archetype colours from the bestiary)
    weaver: '#a855f7',
    beacon: '#38bdf8',
    mirrorblade: '#ef4444',
    hollow: '#6ee7b7',
    sovereign: '#fde047',
    // Phase 2b — the 9 remaining mini-enemies (archetype colours from tune.ts)
    splitter: '#a855f7',
    mini: '#c9a6ff',
    bloomer: '#fbbf24',
    bomber: '#fb7185',
    wisp: '#67e8f9',
    drifter: '#10b981',
    shade: '#f97316',
    brooder: '#a78bfa',
    herald: '#a3e635',
  };

  private static readonly KIND_LABEL: Record<string, string> = {
    darter: 'DARTER',
    orbiter: 'ORBITER',
    lancer: 'LANCER',
    seeker: 'SEEKER',
    warden: 'THE WARDEN',
    // Phase 2a — the 5 remaining bosses
    weaver: 'THE WEAVER',
    beacon: 'THE BEACON',
    mirrorblade: 'THE MIRRORBLADE',
    hollow: 'THE HOLLOW',
    sovereign: 'THE SOVEREIGN',
    // Phase 2b — the 9 remaining mini-enemies
    splitter: 'SPLITTER',
    mini: 'MINI',
    bloomer: 'BLOOMER',
    bomber: 'BOMBER',
    wisp: 'WISP',
    drifter: 'DRIFTER',
    shade: 'SHADE',
    brooder: 'BROODER',
    herald: 'HERALD',
  };

  /** Boss kinds whose gallery art is authored at a large native radius — preview
   *  them at a smaller size (like THE WARDEN) so the card frames the whole body. */
  private static readonly BIG_PREVIEW_KINDS = new Set<string>([
    'warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign',
  ]);

  /** Rebuild the picker grid from the live save: one row per ported kind, four
   *  take-cards each (locked = greyed + requirement, unlocked = selectable; the
   *  equipped one highlighted). Keyboard-operable buttons; reduce-motion respected
   *  by the preview painter (it draws a single frozen frame regardless). */
  refreshSkins(): void {
    const s = this.saveRef;
    if (!this.skinsBody || !s) return;
    this.skinsBody.replaceChildren();
    for (const kind of PORTED_KINDS) {
      const takes = skinsForKind(kind);
      if (takes.length === 0) continue;
      const selectedId = s.selectedSkins[kind] ?? takes[0].id;
      this.skinsBody.append(el('div', { class: 'stats-label' }, UI.KIND_LABEL[kind] ?? kind.toUpperCase()));
      const grid = el('div', { class: 'codex-grid skin-grid' });
      const color = UI.SKIN_PREVIEW_COLOR[kind] ?? '#22d3ee';
      for (const skin of takes) {
        const unlocked = canUnlockSkin(skin, s.achievements);
        const selected = selectedId === skin.id;
        const card = el('button', {
          class: 'codex-entry skin-card' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked'),
          type: 'button',
          'aria-pressed': String(selected),
          'aria-label': `${UI.KIND_LABEL[kind] ?? kind} — ${skin.name} (${skin.rarity}${unlocked ? '' : ', locked'})`,
        });
        card.style.setProperty('--accent', color);
        const canvas = el('canvas', { class: 'skin-preview' }) as HTMLCanvasElement;
        this.paintSkinPreview(canvas, skin, color, unlocked);
        card.append(
          canvas,
          el('div', { class: 'skin-name' }, skin.name),
          el('div', { class: 'skin-rarity rarity-' + skin.rarity }, skin.rarity.toUpperCase()),
          el('div', { class: 'skin-status' }, unlocked ? (selected ? 'EQUIPPED' : 'tap to equip') : skinUnlockHint(skin)),
        );
        card.title = unlocked ? `${skin.name} — ${skin.rarity}` : `${skin.name} — locked: ${skinUnlockHint(skin)}`;
        card.addEventListener('click', () => {
          if (unlocked) this.cb.onSelectSkin(kind, skin.id);
          else this.cb.onUnlockSkin(kind, skin.id);
          // re-render the grid in place so EQUIPPED moves to the tapped card (or the
          // locked toast already fired). saveRef is refreshed by refreshTitle first.
          this.refreshSkins();
        });
        grid.append(card);
      }
      this.skinsBody.append(grid);
    }
  }

  /** Paint a static preview frame of a skin into a small canvas. Builds a minimal
   *  stub Enemy (the only fields a skin draw reads) and renders at 'full' LOD with
   *  reduceMotion forced so the gallery is a calm, non-strobing single frame. */
  private paintSkinPreview(canvas: HTMLCanvasElement, skin: SkinDef, color: string, unlocked: boolean): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 96;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.translate(size / 2, size / 2);
    // a stub enemy carrying only what a skin draw touches (cosmetic — no sim state)
    const stub = {
      kind: skin.kind,
      x: 0,
      y: 0,
      vx: 1,
      vy: 0,
      color,
      angle: 0,
      telegraph: 0,
      isBoss: false,
      elite: false,
      hitFlash: 0,
      spawnTime: 0,
    } as unknown as Enemy;
    const rimColor = threatRim(color, 0.45);
    ctx.strokeStyle = rimColor;
    ctx.fillStyle = darken(color, 0.18);
    ctx.lineWidth = 2;
    const r = UI.BIG_PREVIEW_KINDS.has(skin.kind) ? 16 : 22; // big-native bosses → preview smaller
    ctx.save();
    try {
      skin.draw(ctx, stub, r, {
        rimColor,
        flash: false,
        // a preview RenderOpts: reduceMotion ON (frozen frame), everything else off.
        opts: {
          reduceFlashing: false,
          colorblind: false,
          combo: 0,
          caScale: 0,
          reduceMotion: true,
          clarity: false,
          beatRing: false,
          beatPhase: 0,
          slingshot: false,
          firstLight: 0,
          cipherAssist: false,
        },
        lod: 'full',
        t: 1.2,
      });
    } catch {
      /* a preview should never break the picker */
    }
    ctx.restore();
    if (!unlocked) {
      // dim the locked preview (the card's .locked class also greys it via CSS, but
      // dimming the canvas itself keeps the silhouette legible-yet-clearly-locked)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(8,10,16,0.62)';
      ctx.fillRect(0, 0, size, size);
    }
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
    if (this.saveRef) this.codexBestiary.replaceChildren(...renderBestiary(this.saveRef.killsByKind));
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
    const sub = el(
      'div',
      { class: 'event-flavor' },
      'An optional ascension ladder — more pressure, more score. Heat 0 is free and fair; the rest is the veteran’s chase.',
    );
    const curve = el('div', { class: 'heat-curve' });
    curve.id = 'heat-curve';
    const grid = el('div', { class: 'heat-grid' });
    grid.id = 'heat-grid';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeModal(this.heatPanel));
    const panel = el('div', { class: 'panel panel-wide' }, h, sub, curve, grid, close);
    this.heatPanel = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, panel);
  }

  openHeat(): void {
    const s = this.saveRef;
    if (!s) return;
    const maxMul = HEAT_LEVELS[HEAT_LEVELS.length - 1].scoreMul;
    // score-multiplier CURVE (mock-mainui) — the difficulty → reward trade at a glance,
    // the selected level lit. A static bar row; the cards below are the selectors.
    const curve = this.heatPanel.querySelector('#heat-curve')!;
    curve.replaceChildren();
    for (const lvl of HEAT_LEVELS) {
      const bar = el('div', { class: 'heat-cbar' + (s.selectedHeat === lvl.level ? ' selected' : '') });
      bar.style.setProperty('--accent', lvl.accent);
      bar.title = `H${lvl.level} ${lvl.name} — ×${lvl.scoreMul.toFixed(2)} score`;
      const fill = el('div', { class: 'heat-cbar-fill' });
      fill.style.height = `${Math.round((lvl.scoreMul / maxMul) * 100)}%`;
      bar.append(fill, el('div', { class: 'heat-cbar-lbl' }, String(lvl.level)));
      curve.append(bar);
    }
    const grid = this.heatPanel.querySelector('#heat-grid')!;
    grid.replaceChildren();
    for (const lvl of HEAT_LEVELS) {
      const selected = s.selectedHeat === lvl.level;
      const card = el('button', { class: 'heat-card' + (selected ? ' selected' : '') });
      card.style.setProperty('--accent', lvl.accent);
      // structured MODIFIER chips — the mechanical COST behind the prose desc (penalties
      // in red). Only the active modifiers show, so H0 (COLD) stays clean.
      const chips: HTMLElement[] = [];
      const chip = (t: string, danger = false) => el('span', { class: 'heat-mod' + (danger ? ' danger' : '') }, t);
      if (lvl.enemySpeedAdd > 0) chips.push(chip(`SPEED +${Math.round(lvl.enemySpeedAdd * 100)}%`));
      if (lvl.spawnMulMod < 1) chips.push(chip(`DENSITY +${Math.round((1 - lvl.spawnMulMod) * 100)}%`));
      if (lvl.bossIntervalMod < 1) chips.push(chip(`BOSSES +${Math.round((1 - lvl.bossIntervalMod) * 100)}%`));
      if (lvl.grazeRadiusMod < 1) chips.push(chip(`GRAZE −${Math.round((1 - lvl.grazeRadiusMod) * 100)}%`));
      if (lvl.revivesLost > 0) chips.push(chip(`−${lvl.revivesLost} REVIVE`, true));
      if (lvl.shieldsLost > 0) chips.push(chip(`−${lvl.shieldsLost} ARMOR`, true));
      card.append(
        el('div', { class: 'heat-num' }, lvl.level === 0 ? 'OFF' : `H${lvl.level}`),
        el('div', { class: 'heat-name' }, lvl.name),
        el('div', { class: 'heat-desc' }, lvl.desc),
        ...(chips.length ? [el('div', { class: 'heat-mods' }, ...chips)] : []),
        el('div', { class: 'heat-mul' }, `×${lvl.scoreMul.toFixed(2)} score · ×${lvl.shardMul.toFixed(2)} shards`),
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

  openLeaderboard(prompt = false): void {
    const s = this.saveRef;
    if (!s) return;
    const body = this.leaderPanel.querySelector('#leader-body')!;
    body.replaceChildren();

    // playtest (Nick): a "name your run" framing when opened right after a run with no handle
    if (prompt) body.append(el('div', { class: 'leader-prompt' }, '★ Name your run — your scores post as ANON until you set a handle.'));

    // handle field — always available (names ghost replays + online submissions). Live preview
    // + char counter so you see exactly what will save (and that blank → ANON) AS YOU TYPE,
    // not only on blur. Both listeners route through the shared sanitizeHandle.
    const nameWrap = el('div', { class: 'leader-name' });
    const label = el('label', {}, 'Your handle');
    const input = el('input', { type: 'text', maxlength: '16', value: s.handle, placeholder: 'ACE' }) as HTMLInputElement;
    const hint = el('div', { class: 'leader-hint' });
    const refreshHint = () => {
      const clean = sanitizeHandle(input.value);
      hint.textContent = clean ? `Saves as “${clean}” · ${clean.length}/16` : 'Leave blank to post as ANON';
    };
    refreshHint();
    input.addEventListener('input', refreshHint); // live feedback as you type
    input.addEventListener('change', () => { this.cb.onSetHandle(input.value); refreshHint(); }); // commit on blur/Enter
    nameWrap.append(label, input, hint);
    body.append(nameWrap);
    if (prompt) requestAnimationFrame(() => input.focus());

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
      // PODIUM (mock-mainui) — the top 3 as a medal podium, gold centered + tallest.
      const top = entries.slice(0, 3);
      const medals = ['🥇', '🥈', '🥉'];
      const order = top.length >= 3 ? [1, 0, 2] : top.map((_, i) => i); // silver · gold · bronze
      const podium = el('div', { class: 'leader-podium' });
      for (const i of order) {
        const e = top[i];
        podium.append(el('div', { class: `podium-spot podium-${i + 1}` },
          el('div', { class: 'podium-medal' }, medals[i]),
          el('div', { class: 'podium-name' }, e.name || '—'),
          el('div', { class: 'podium-score' }, e.score.toLocaleString()),
          // wave/heat meta under each podium score (mock pod-w).
          el('div', { class: 'podium-wave' }, `w${e.wave}${e.heat ? ` · H${e.heat}` : ''}`),
        ));
      }
      listWrap.append(podium);

      // STANDING (mock): the player's own position on this board. The backend serves only the
      // top entries (no global rank/percentile), so this is HONEST + board-relative — it shows
      // when your handle appears in the visible board, otherwise a keep-climbing nudge. No
      // fabricated "top X%". A non-ANON handle is required to disambiguate your row.
      const myHandle = sanitizeHandle(s.handle);
      const mine = myHandle ? entries.find((e) => e.name === myHandle) : undefined;
      if (mine) {
        listWrap.append(el('div', { class: 'leader-standing' },
          el('div', { class: 'standing-rank' }, `#${mine.rank ?? entries.indexOf(mine) + 1}`),
          el('div', { class: 'standing-txt' }, 'Your best — ', el('b', {}, mine.score.toLocaleString())),
          el('div', { class: 'standing-pct' }, `of ${entries.length}+ shown`),
        ));
      } else if (myHandle) {
        listWrap.append(el('div', { class: 'leader-standing unranked' },
          el('div', { class: 'standing-txt' }, "You're not on the top board for this mode yet — post a higher run to claim a spot."),
        ));
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
      this.scheduleFit(); // scale the cockpit composition to the viewport (desktop layout)
    } else {
      this.title.classList.remove('boot-in');
      this.stopFirstLightIdle();
      this.heroEl?.classList.remove('first-light');
      // leaving the cockpit: drop the fixed scaled composition so other screens flow normally.
      this.title.classList.remove('fitted');
      const frame = this.title.querySelector('.ck-frame') as HTMLElement | null;
      if (frame) frame.style.transform = '';
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
      let btn: HTMLElement | null;
      if (s === 'title') {
        // on the title, foreground PLAY explicitly (it is the dominant action)
        btn = this.playBtn;
      } else if (s === 'gameover') {
        // run-end: land on THE CHOICE if it's pending (it's the meaningful action),
        // else on DESCEND AGAIN — never silently lose focus on the new go-* buttons.
        // focus THE CHOICE if pending; else the primary DESCEND AGAIN, queried on its OWN
        // class (never .hidden) so a grouped selector's document order can't hand focus to
        // SHARE or silently drop it on a hidden node. Fall back only if it's somehow absent.
        btn = !this.choiceRow.classList.contains('hidden')
          ? this.goCatchBtn
          : ((active.querySelector('.go-descend') as HTMLElement | null) ?? (active.querySelector('.go-fbtn, .go-sbtn') as HTMLElement | null));
      } else {
        btn = active.querySelector('.btn-primary, .perk-card, .btn') as HTMLElement | null;
      }
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
    // tint the whole ring assembly (glow backdrop + orbit rings + hangar floor) to the hull.
    this.ckShipRing.style.color = ship.accent;
    this.shipArtName.textContent = ship.name;
    this.shipArtName.style.color = ship.accent;
    this.shipArtDesc.textContent = ship.desc;
    this.paintHeatPips(save.selectedHeat);
    this.paintArmorPips(save);
    this.buildRowVal.textContent = save.selectedArchetype === 'none' ? 'None Equipped' : archetypeById(save.selectedArchetype).name;

    // per-hull comparison stat bars (mock-mainui) — derive each ship's profile via the
    // canonical deriveStats (ship apply only, no perks/meta) so the bars match the real
    // in-run values, then normalize each stat across the roster (relative strength).
    const SHIP_STAT_KEYS: { key: string; get: (st: RunStats) => number }[] = [
      { key: 'DASH', get: (st) => st.dashLenMul },
      { key: 'STAM', get: (st) => st.staminaSegments },
      { key: 'SPEED', get: (st) => st.maxSpeed },
      { key: 'WIDTH', get: (st) => st.dashHitboxRadius },
      { key: 'REGEN', get: (st) => st.regenPerSec },
    ];
    const shipStats = new Map(SHIPS.map((sh) => [sh.id, deriveStats({}, sh.apply)] as const));
    const statRanges = SHIP_STAT_KEYS.map((m) => {
      const vals = SHIPS.map((sh) => m.get(shipStats.get(sh.id)!));
      return { min: Math.min(...vals), max: Math.max(...vals) };
    });
    this.shipRow.replaceChildren();
    for (const ship of SHIPS) {
      const unlocked = save.unlockedShips.includes(ship.id);
      const selected = save.selectedShip === ship.id;
      const chip = el('button', { class: 'ship-chip' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked') });
      chip.style.setProperty('--accent', ship.accent);
      const glyph = el('canvas', { class: 'ship-glyph' }) as HTMLCanvasElement;
      this.paintShipGlyph(glyph, ship.id, ship.accent);
      const st = shipStats.get(ship.id)!;
      const statBars = el('div', { class: 'ship-stats' });
      SHIP_STAT_KEYS.forEach((m, i) => {
        const r = statRanges[i];
        const norm = r.max > r.min ? (m.get(st) - r.min) / (r.max - r.min) : 0.5;
        // mock: 5 discrete segments lit to the normalised stat (≥1 so the weakest hull reads).
        const lit = Math.max(1, Math.round(norm * 5));
        const track = el('div', { class: 'ship-stat-track' });
        for (let sg = 0; sg < 5; sg++) track.append(el('div', { class: 'ship-stat-seg' + (sg < lit ? ' on' : '') }));
        statBars.append(el('div', { class: 'ship-stat' },
          el('span', { class: 'ship-stat-k' }, m.key),
          track,
        ));
      });
      chip.append(
        el(
          'div',
          { class: 'ship-info' },
          el('div', { class: 'ship-name' }, ship.name),
          el('div', { class: 'ship-desc' }, ship.desc),
          statBars,
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

    // loadout summary cards: the current palette + dash trail at a glance (open the CUSTOMIZE
    // modal for the full pickers). Swatch dots mirror the in-game colours of each cosmetic.
    const selTheme = THEMES.find((t) => t.id === save.selectedTheme) ?? THEMES[0];
    this.cosmThemeName.textContent = selTheme.name;
    this.cosmThemeDot.style.background = `conic-gradient(${selTheme.accent} 0%, ${selTheme.accent2} 50%, ${selTheme.accent} 100%)`;
    const selTrail = TRAILS.find((t) => t.id === save.selectedTrail) ?? TRAILS[0];
    this.cosmTrailName.textContent = selTrail.name;
    this.cosmTrailDot.style.background = `linear-gradient(135deg, ${selTrail.combo ? '#22d3ee' : selTrail.base}, ${selTrail.bright})`;

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
        // the "PB" label is a dim ::before prefix (see .ck-mi-pb::before) so the value reads
        // in the accent and the tag in shadow — render the value only.
        text.append(el('div', { class: 'ck-mi-pb' }, pb));
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

    // mode-rail flavour box — the accent eyebrow + italic body for the selected mode. The head
    // carries the mode accent via the panel's --accent-rgb. The body is mode-authored copy whose
    // only markup is a literal "<br>"; we split on it and build real <br> nodes (no innerHTML, so
    // no XSS surface even though the source is a trusted constant). Falls back to name/desc.
    const fl = modeFlavor(m);
    const body = el('div', { class: 'mode-flavor-body' });
    fl.body.split(/<br\s*\/?>/i).forEach((line, i) => {
      if (i > 0) body.append(el('br'));
      body.append(line);
    });
    this.flavorBox.replaceChildren(el('div', { class: 'mode-flavor-head' }, fl.head), body);

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
    this.descendModeLine.textContent = parts.join('  ·  ');

    // ── selection-accent spring: when the picked mode CHANGES, ease the center column
    //    to the new identity (a light hero swap) and pulse the whole panel once. Gated
    //    under reduce-motion. The first paint after a title show is skipped (prev=null)
    //    so the bootIn reveal owns the entrance, not a swap on top of it. ──
    if (this.prevSelectedMode !== null && this.prevSelectedMode !== m.id && !this.motionOff()) {
      this.replayAnim(this.heroContent, 'swap');
      // arrow-nav re-skins quietly (hero swap only); a click/commit gets the full panel pulse.
      if (!this.quietReskin) this.replayAnim(this.mainPanel, 'pulse');
    }
    this.quietReskin = false;
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
    this.quietReskin = true; // arrow-nav: light hero swap only, skip the heavy panel pulse (mock)
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
    // fresh run → clear any transient gloss display so a stale dismiss-timer from the
    // previous run can't block the next one. The session-seen set is intentionally kept
    // (a gloss is once-ever, even across runs in one session).
    clearTimeout(this.glossTimer);
    this.glossQueue.length = 0;
    this.glossActive = false;
    this.glossEl.classList.remove('show');
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
    // §1.7 — the first time a FUSION (evolution) is actually offered, gloss what it is
    if (cards.some((c) => isEvolution(c))) this.queueGloss('fusion');
    cards.forEach((c, i) => {
      const evo = isEvolution(c);
      const relic = isRelic(c);
      const cls = evo ? 'perk-card perk-card-evo' : relic ? 'perk-card perk-card-relic' : 'perk-card';
      const card = el('button', { class: cls });
      card.style.setProperty('--accent', c.accent);
      // perks/evolutions render the maximalist inline-SVG glyph art (currentColor → --accent
      // tints the whole piece, via innerHTML — static author-controlled markup). Relics keep
      // their cursed emoji; any uncovered key falls back to the old emoji glyph.
      const glyphDiv = el('div', { class: 'perk-glyph' });
      if (relic) {
        glyphDiv.innerHTML = relicGlyphArt((c as { id: RelicId }).id);
      } else {
        const gk = (c as PerkDef).glyph;
        if (hasGlyphArt(gk)) glyphDiv.innerHTML = glyphArt(gk);
        else glyphDiv.textContent = perkGlyph(gk);
      }
      card.append(
        ...(evo ? [el('div', { class: 'perk-tag' }, 'EVOLUTION')] : []),
        ...(relic ? [el('div', { class: 'perk-tag' }, 'CURSED RELIC')] : []),
        glyphDiv,
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

  /** After THE CHOICE commits (game.ts → makeChoice → here): resolve the whole
   *  screen to the chosen ending. The head/line are sourced from
   *  stillpoint.choiceEnding() upstream, so they are faithful by construction.
   *  Plays the committed-resolve wash (a full-screen colour bloom + the ending
   *  head/line) and LOCKS the cards. Under reduce-motion the wash is an instant,
   *  brief held state (no transition). */
  resolveChoice(head: string, line: string): void {
    const which: 'catch' | 'fall' = head === choiceEnding('fall').head ? 'fall' : 'catch';
    this.goChoiceLocked = true;
    this.goScreenInner.classList.add('resolved');
    this.goScreenInner.setAttribute('data-ending', which);
    // lock the world into the ending's mood (CATCH = full dawn, FALL = violet dusk)
    this.goScreenInner.style.setProperty('--lean', which === 'catch' ? '1' : '-1');
    for (const card of [this.goCatchBtn, this.goFallBtn]) {
      const isIt = card.getAttribute('data-choice') === which;
      card.classList.toggle('chosen', isIt);
      card.classList.toggle('dimmed', !isIt);
      card.setAttribute('aria-pressed', String(isIt));
    }
    // the header now reads as the resolved ending too
    this.goHead.textContent = head;
    this.goEyebrow.textContent = which === 'catch' ? '✦ THE LIGHT HELD ✦' : '✦ THE LIGHT RELEASED ✦';
    this.goSub.textContent = line;

    // the committed-resolve wash
    this.goResolveHead.textContent = head;
    this.goResolveLine.textContent = line;
    const rgb = which === 'catch' ? '255,216,132' : '179,155,255';
    const col = which === 'catch' ? '#ffd884' : '#b39bff';
    this.goResolve.style.setProperty('--go-rc', rgb);
    this.goResolveHead.style.color = col;
    this.goResolveHead.style.textShadow = `0 0 44px ${col}99`;
    clearTimeout(this.goResolveTimer);
    this.replayAnim(this.goResolve, 'show'); // CSS gates the keyframe under reduce-motion (held, no fade)
    this.goResolveTimer = window.setTimeout(() => this.goResolve.classList.remove('show'), 3200);
  }

  showGameOver(info: GameOverInfo): void {
    this.displayScore = 0;
    this.goScore.textContent = '0';
    // ── reset the resolve/lean state for a fresh run-end ──
    this.goChoiceLocked = false;
    clearTimeout(this.goResolveTimer);
    this.goResolve.classList.remove('show');
    this.goScreenInner.classList.remove('resolved');
    this.goScreenInner.removeAttribute('data-ending');
    this.goScreenInner.style.setProperty('--lean', '0');
    for (const card of [this.goCatchBtn, this.goFallBtn]) {
      card.classList.remove('chosen', 'dimmed');
      card.setAttribute('aria-pressed', 'false');
    }

    // ── one screen, three faces: won-with-CHOICE · won (no cards) · lost ──
    const face = !info.won ? 'lost' : info.choicePending ? 'pending' : 'won';
    this.goScreenInner.classList.toggle('go-won', info.won);
    this.goScreenInner.classList.toggle('go-lost', !info.won);
    this.goScreenInner.classList.toggle('go-pending', info.choicePending === true);
    this.choiceRow.classList.toggle('hidden', !info.choicePending);

    // ── HEADER brand + the FIRST LIGHT tableau (won) / darker debrief (lost) ──
    if (info.won) {
      this.goHead.textContent = info.choicePending ? 'THE LONGEST DAY' : 'THE LIGHT HOLDS';
      this.goHead.style.color = 'var(--go-gold-hi)';
      this.goEyebrow.textContent = '✦ THE SOVEREIGN HAS FALLEN ✦';
      this.goSub.textContent = info.choicePending
        ? `${info.mode} · the day is yours to keep — or to let go`
        : 'Lancefall remembers itself in full light';
      this.goTabTitle.textContent = 'FIRST LIGHT';
      this.goTabEyebrow.replaceChildren(el('span', { class: 'go-rule' }), info.choicePending ? 'THE LAST CIPHER IS YOURS' : 'THE CITY WAKES', el('span', { class: 'go-rule r' }));
      this.goTabLine.textContent = 'A lamplighter remembers the bells, and how the whole street would answer them.';
    } else {
      this.goHead.textContent = 'THE LIGHT DIMS';
      this.goHead.style.color = 'var(--pink)';
      this.goEyebrow.textContent = '✶ ECHO OF THE FALL ✶';
      this.goSub.textContent = `${info.deathCause}${info.nemesis ? ` · ⚔ nemesis: ${info.nemesis}` : ''}`;
      this.goTabTitle.textContent = 'NIGHTFALL';
      this.goTabEyebrow.replaceChildren(el('span', { class: 'go-rule' }), 'THE CITY SLIPS BACK TO GREY', el('span', { class: 'go-rule r' }));
      this.goTabLine.textContent = 'The bells go quiet. The street forgets, one window at a time.';
    }

    // ── COHERENCE header dial — resolved-full on a win, dimmed on a loss ──
    const cohPct = info.won ? 100 : Math.max(18, Math.min(72, 28 + info.wave * 3));
    this.goCohPct.textContent = `${cohPct}%`;
    this.goScreenInner.style.setProperty('--go-coh', String(cohPct / 100));
    this.goCohFoot.textContent = info.won ? 'THE CITY REMEMBERS ITSELF IN FULL' : 'THE CITY REMEMBERS ONLY FRAGMENTS';

    // ── HEADER stats ──
    this.goHsScore.textContent = info.score.toLocaleString();
    this.goHsCombo.textContent = `×${info.combo}`;
    this.goHsTime.textContent = formatTime(info.time);

    // ── SHARE / ASCEND visibility ──
    this.saveReplayBtn.classList.toggle('hidden', !info.canReplay);
    // ASCEND (NG+ / KEEP GOING) — only relevant on a win once the loop is unlocked
    const ngUnlocked = (this.saveRef?.ngPlusLevel ?? 0) >= 1;
    const ngActive = this.saveRef?.ngPlusActive ?? false;
    const showAscend = info.won && ngUnlocked;
    this.goAscendBtn.classList.toggle('hidden', !showAscend);
    if (showAscend) {
      this.goAscendBtn.classList.toggle('active', ngActive);
      const lvl = this.saveRef?.ngPlusLevel ?? 1;
      this.goAscendBtn.replaceChildren(
        el('span', {}, ngActive ? `★ ASCEND ×${lvl}` : `↑ ASCEND ×${lvl}`),
        el('span', { class: 'go-k' }, ngActive ? 'ON' : 'KEEP GOING'),
      );
    }

    // ── NEW BEST badge + PB delta ──
    this.goBadge.classList.toggle('hidden', !info.newBest);
    this.goBadge.textContent = info.newBest ? '★ NEW BEST ★' : '';
    if (info.newBest && info.pbDelta > 0) {
      this.goDelta.textContent = `+${info.pbDelta.toLocaleString()} over your best!`;
      this.goDelta.style.color = 'var(--green)';
    } else if (info.pbDelta < 0) {
      this.goDelta.textContent = `${info.pbDelta.toLocaleString()} from your best`;
      this.goDelta.style.color = 'var(--text-muted)';
    } else {
      this.goDelta.textContent = '';
    }

    // ── achievement + mutator chips ──
    this.goAch.replaceChildren();
    for (const m of info.mutators) {
      const chip = el('span', { class: 'ach-chip mut-chip' }, `⚡ ${m.name}`);
      chip.style.setProperty('--accent', m.accent);
      this.goAch.append(chip);
    }
    for (const name of info.newAchievements) {
      this.goAch.append(el('span', { class: 'ach-chip' }, `🏆 ${name}`));
    }

    // ── DEBRIEF stat grid ──
    const goStats = [
      stat('final score', info.score.toLocaleString()),
      stat('best combo', `×${info.combo}`),
      stat('coherence', `${cohPct}%`),
      stat('run time', formatTime(info.time)),
      stat('wave', String(info.wave)),
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

    // ── GRADE row (a flavour summary; not scored — the numbers already carry it) ──
    const flawless = info.won && info.hitsTaken === 0;
    const grade = !info.won ? '—' : flawless ? 'S' : info.newBest ? 'A' : 'B';
    this.goGrade.textContent = grade;
    if (info.won) {
      const bits = ['SOVEREIGN'];
      if (flawless) bits.push('NO-HIT');
      bits.push('COHERENCE FULL');
      this.goGradeTitle.textContent = bits.join(' · ');
      this.goGradeNote.textContent = `+${info.shardsEarned} memory shards${info.newBest ? ' · a new personal best' : ''}.`;
    } else {
      this.goGradeTitle.textContent = info.nemesis ? `FELLED BY ${info.nemesis}` : 'THE DESCENT ENDS';
      this.goGradeNote.textContent = `Reached wave ${info.wave}. +${info.shardsEarned} memory shards carried out of the dark.`;
    }

    // ── build line ──
    this.goBuild.replaceChildren(
      el('span', { class: 'go-ship' }, `${info.mode} · ${info.ship}`),
      el('span', { class: 'go-perks' }, info.perks ? ` · ${info.perks}` : ' · no perks taken'),
    );

    void face;
    this.show('gameover');

    // ── score count-up (gated under reduce-motion) ──
    const target = info.score;
    if (this.motionOff()) {
      this.goScore.textContent = target.toLocaleString();
      this.goHsScore.textContent = target.toLocaleString();
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 1000);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(target * eased).toLocaleString();
      this.goScore.textContent = v;
      this.goHsScore.textContent = v;
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
      if (this.puPrevPu !== pu.active) { this.puIcon.innerHTML = powerupGlyphArt(pu.active!); this.puPrevPu = pu.active; }
      this.puIcon.style.color = def.color;
      this.puLabel.textContent = `${def.name} ${Math.ceil(pu.timer)}s`;
      this.puLabel.style.color = def.color;
      this.puFill.style.transform = `scaleX(${Math.max(0, Math.min(1, pu.total > 0 ? pu.timer / pu.total : 0))})`;
      this.puFill.style.background = def.color;
    }

    // §1.7 — surface a first-appearance gloss for any in-combat concept that just
    // appeared (graze / DAYBREAK ready / ARMOR / COHERENCE). Each fires once ever;
    // updateHud only runs while 'playing', so none of these teach during the sandbox.
    for (const id of glossTriggers(world, coherence)) this.queueGloss(id);
  }
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
