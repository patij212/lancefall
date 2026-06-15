// DOM overlay UI: title/attract, HUD, pause, game-over, perk draft, settings.
// One canvas always renders behind. HUD updates mutate cached refs only (no
// innerHTML churn) so the 60fps loop stays clean.

import type { World } from './world';
import type { Settings, SaveData } from './save';
import { PERKS } from './perks';
import type { PerkDef } from './perks';
import { isEvolution, isRelic, EVOLUTIONS } from './evolutions';
import { RELICS } from './relics';
import { decodeBuildDna } from './buildDna';
import type { BuildDna } from './buildDna';
import type { DraftCard, EvolutionDef } from './evolutions';
import type { EventChoice } from './events';
import { HEAT_LEVELS } from './heat';
import { ARCHETYPES, archetypeById } from './archetypes';
import { leaderboardEnabled, fetchLeaderboard } from './api';
import { comboColor } from './render';
import { TRACKS, type SoundtrackId } from './soundtracks';
import { SHIPS } from './ships';
import { drawShipSilhouette } from './shipModels';
import { THEMES } from './themes';
import { TRAILS } from './trails';
import { ACHIEVEMENTS } from './achievements';
import { META_NODES, nodeCost } from './meta';
import { MODES, modeById, modeBrief, MAX_DAILY_ATTEMPTS, nextModeId } from './modes';
import { dailyMutatorPreview } from './mutators';
import { cityMemoryFill } from './renderMath';
import { POWERUPS } from './powerups';
import { BESTIARY, CODEX_CATEGORIES } from './bestiary';
import { audioCredits } from './audioManifest';
import { LORE, fragmentBalance, loreUnlocked } from './lore';
import { decodeView } from './cipherDecode';
import type { RunConfig } from './modes';
import { dateString, seedFromDate } from './rng';
import { TUNE } from './tune';

export interface UICallbacks {
  onStart: (cfg: RunConfig) => void;
  onRestart: () => void;
  onResume: () => void;
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
  onHeatChange: (level: number) => void;
  onArchetypeChange: (id: string) => void;
  onSelectMode: (id: string) => void;
  onToggleCityMemory: (v: boolean) => void;
  onSetHandle: (name: string) => void;
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
  private announceEl!: HTMLElement;
  private choiceRow!: HTMLElement;
  private saveReplayBtn!: HTMLButtonElement;
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
    // aria-live so the narrator's SOUL payload reaches screen-reader users:
    // toasts are polite (ambient), announces are assertive (emphatic, used sparingly).
    this.toastLayer = el('div', { class: 'toast-layer', role: 'status', 'aria-live': 'polite' });
    this.announceEl = el('div', { class: 'announce', role: 'status', 'aria-live': 'polite' });
    this.root.append(this.hud, this.title, this.pause, this.gameover, this.draft, this.eventPanel, this.settingsPanel, this.statsPanel, this.upgradesPanel, this.howtoPanel, this.codexPanel, this.creditsPanel, this.fallPanel, this.heatPanel, this.archetypePanel, this.leaderPanel, this.duelPanel, this.inspectPanel, this.toastLayer, this.announceEl);
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
    this.show('title');
  }

  private buildHud(): void {
    this.scoreEl = el('div', { class: 'hud-score' }, '0');
    this.waveEl = el('div', { class: 'hud-wave' }, 'WAVE 1');
    this.dailyBadge = el('div', { class: 'hud-daily hidden' }, '◆ ECHO');
    this.mutatorRow = el('div', { class: 'hud-mutators' });
    const topLeft = el('div', { class: 'hud-topleft' }, this.scoreEl, this.waveEl, this.dailyBadge, this.mutatorRow);

    this.comboEl = el('div', { class: 'hud-combo' }, '');
    this.comboBar = el('div', { class: 'hud-combo-fill' });
    const comboBarWrap = el('div', { class: 'hud-combo-bar' }, this.comboBar);
    this.beatPip = el('div', { class: 'hud-beatpip' });
    const topCenter = el('div', { class: 'hud-topcenter' }, this.comboEl, comboBarWrap, this.beatPip);

    this.staminaWrap = el('div', { class: 'hud-stamina' });
    this.shieldsWrap = el('div', { class: 'hud-shields' });
    this.grazeEl = el('div', { class: 'hud-graze' }, '');
    this.bestComboEl = el('div', { class: 'hud-bestcombo' }, '');
    this.cityMemFill = el('div', { class: 'hud-citymem-fill' });
    this.cityMemWrap = el('div', { class: 'hud-citymem' }, this.cityMemFill);
    const bottom = el('div', { class: 'hud-bottom' }, this.grazeEl, this.staminaWrap, this.shieldsWrap, this.cityMemWrap, this.bestComboEl);

    // OVERDRIVE meter (below the stamina bar)
    this.odLabel = el('div', { class: 'hud-od-label' }, 'DAYBREAK');
    this.odFill = el('div', { class: 'hud-od-fill' });
    this.odWrap = el('div', { class: 'hud-overdrive' }, this.odLabel, el('div', { class: 'hud-od-track' }, this.odFill));

    // active POWER-UP badge (hidden unless one is active)
    this.puLabel = el('div', { class: 'hud-pu-label' }, '');
    this.puFill = el('div', { class: 'hud-pu-fill' });
    this.puWrap = el('div', { class: 'hud-powerup' }, this.puLabel, el('div', { class: 'hud-pu-track' }, this.puFill));

    // CIPHER-LOCK readout — the code to break, in required dash order (boss fights)
    this.cipherEl = el('div', { class: 'hud-cipher' });

    this.hud = el('div', { class: 'hud' }, topLeft, topCenter, bottom, this.odWrap, this.puWrap, this.cipherEl);
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

  private buildTitle(): void {
    const wordmark = el('h1', { class: 'title-word' }, 'LANCEFALL');
    const subtitle = el('p', { class: 'title-sub' }, 'THE LAST KEY');
    const tagline = el('p', { class: 'title-tag' }, 'break the code. bring back the day.');
    const play = el('button', { class: 'btn btn-primary btn-play' }, 'PLAY');
    this.playBtn = play;
    play.addEventListener('click', () => {
      const s = this.saveRef;
      this.cb.onStart(modeById(s ? s.selectedMode : 'endless'));
    });
    // mode grid: every mode is a selectable card; the one PLAY launches the persisted
    // choice. Populated in refreshTitle (needs save.selectedMode for the .selected highlight).
    this.modeGrid = el('div', { class: 'mode-grid', role: 'group', 'aria-label': 'Select game mode' });
    const settingsBtn = el('button', { class: 'btn btn-ghost' }, 'SETTINGS');
    settingsBtn.addEventListener('click', () => this.openSettings());
    const upgradesBtn = el('button', { class: 'btn btn-ghost' }, 'UPGRADES');
    upgradesBtn.addEventListener('click', () => this.openUpgrades());
    const statsBtn = el('button', { class: 'btn btn-ghost' }, 'STATS');
    statsBtn.addEventListener('click', () => this.openStats());
    const how = el('button', { class: 'btn btn-ghost' }, 'HOW TO PLAY');
    how.addEventListener('click', () => this.showHowTo());
    const codexBtn = el('button', { class: 'btn btn-ghost' }, '📖 CODEX');
    codexBtn.addEventListener('click', () => this.showCodex());
    const creditsBtn = el('button', { class: 'btn btn-ghost' }, '♪ CREDITS');
    creditsBtn.addEventListener('click', () => this.showCredits());
    const fallBtn = el('button', { class: 'btn btn-ghost' }, '◈ THE FALL');
    fallBtn.addEventListener('click', () => this.showFall());
    const heatBtn = el('button', { class: 'btn btn-ghost' }, '🔥 HEAT');
    heatBtn.addEventListener('click', () => this.openHeat());
    const archBtn = el('button', { class: 'btn btn-ghost' }, '◈ BUILD');
    archBtn.addEventListener('click', () => this.openArchetype());
    const leaderBtn = el('button', { class: 'btn btn-ghost' }, '🏅 RANKS');
    leaderBtn.addEventListener('click', () => this.openLeaderboard());
    const duelBtn = el('button', { class: 'btn btn-ghost' }, '⚔ DUEL');
    duelBtn.addEventListener('click', () => this.openDuel());
    const inspectBtn = el('button', { class: 'btn btn-ghost' }, '⧬ INSPECT');
    inspectBtn.addEventListener('click', () => this.openInspect());
    this.ngBtn = el('button', { class: 'btn btn-ghost hidden' }, 'NG+') as HTMLButtonElement;
    this.ngBtn.addEventListener('click', () => this.cb.onToggleNgPlus());
    const row = el('div', { class: 'title-row' }, upgradesBtn, statsBtn, heatBtn, archBtn, this.ngBtn, leaderBtn, duelBtn, inspectBtn, settingsBtn, how, codexBtn, fallBtn, creditsBtn);
    this.dailyCaption = el('div', { class: 'daily-caption' }, '');
    this.titleBest = el('div', { class: 'title-best' }, '');
    this.shardLine = el('div', { class: 'title-shards' }, '');
    this.shipRow = el('div', { class: 'ship-row' });
    const shipSection = el('div', { class: 'ship-section' }, el('div', { class: 'ship-label' }, 'SHIP'), this.shipRow);
    this.themeRow = el('div', { class: 'theme-row' });
    const themeSection = el('div', { class: 'ship-section' }, el('div', { class: 'ship-label' }, 'PALETTE'), this.themeRow);
    this.trailRow = el('div', { class: 'theme-row' });
    const trailSection = el('div', { class: 'ship-section' }, el('div', { class: 'ship-label' }, 'DASH TRAIL'), this.trailRow);
    this.soundHint = el('div', { class: 'sound-hint' }, '♪ click PLAY to enable sound');

    const legend = el(
      'div',
      { class: 'title-legend' },
      el('span', {}, 'move'),
      el('b', {}, 'WASD / arrows / stick'),
      el('span', {}, 'dash'),
      el('b', {}, 'hold + release  ·  mouse / Space / RT'),
      el('span', {}, 'daybreak'),
      el('b', {}, 'F / LB'),
    );

    this.title = el(
      'div',
      { class: 'screen screen-title' },
      wordmark,
      subtitle,
      tagline,
      play,
      this.modeGrid,
      row,
      this.dailyCaption,
      shipSection,
      themeSection,
      trailSection,
      legend,
      this.titleBest,
      this.shardLine,
      this.soundHint,
    );
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
    this.saveReplayBtn = el('button', { class: 'btn btn-ghost hidden' }, 'SAVE GIF ⬇') as HTMLButtonElement;
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

    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.closeSettings());
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.settingsPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
  }

  private buildStats(): void {
    const h = el('h2', {}, 'STATS');
    const body = el('div', { class: 'stats-body' });
    body.id = 'stats-body';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.statsPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.statsPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
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
    this.statsPanel.classList.remove('hidden');
  }

  private buildUpgrades(): void {
    const h = el('h2', {}, 'UPGRADES');
    const bal = el('div', { class: 'upg-balance' }, '');
    bal.id = 'upg-balance';
    const body = el('div', { class: 'upg-body' });
    body.id = 'upg-body';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.upgradesPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel panel-wide' }, h, bal, body, close);
    this.upgradesPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
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
    this.upgradesPanel.classList.remove('hidden');
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
    this.settingsPanel.classList.remove('hidden');
  }
  private closeSettings(): void {
    this.settingsPanel.classList.add('hidden');
  }

  private buildHowTo(): void {
    const h = el('h2', {}, 'HOW TO PLAY');
    const body = el('div', { class: 'howto-body' });
    body.id = 'howto-body';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.howtoPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.howtoPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
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
    close.addEventListener('click', () => this.creditsPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.creditsPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
  }

  private showCredits(): void {
    this.creditsPanel.classList.remove('hidden');
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
    close.addEventListener('click', () => this.fallPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.fallPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
  }

  private showFall(): void {
    this.fallPanel.classList.remove('hidden');
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
      this.duelPanel.classList.add('hidden');
      input.value = '';
      this.cb.onAcceptChallenge(code);
    });
    const close = el('button', { class: 'btn btn-ghost' }, 'CANCEL');
    close.addEventListener('click', () => this.duelPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel' }, h, blurb, input, el('div', { class: 'go-row' }, accept, close));
    this.duelPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
  }

  private openDuel(): void {
    this.duelPanel.classList.remove('hidden');
    const input = this.duelPanel.querySelector('.duel-input') as HTMLTextAreaElement | null;
    input?.focus();
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
    close.addEventListener('click', () => this.inspectPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel' }, h, blurb, input, el('div', { class: 'go-row' }, inspect, close), result);
    this.inspectPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
  }

  private openInspect(): void {
    this.inspectPanel.classList.remove('hidden');
    const result = this.inspectPanel.querySelector('.howto-rules');
    result?.replaceChildren(); // clear any prior inspection
    const input = this.inspectPanel.querySelector('.duel-input') as HTMLTextAreaElement | null;
    if (input) input.value = '';
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
    close.addEventListener('click', () => this.codexPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.codexPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
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
    this.codexPanel.classList.remove('hidden');
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
    this.howtoPanel.classList.remove('hidden');
  }

  private buildHeat(): void {
    const h = el('h2', {}, 'HEAT ASCENSION');
    const sub = el('div', { class: 'event-flavor' }, 'Crank the difficulty for a bigger score multiplier. Your call — every run.');
    const grid = el('div', { class: 'heat-grid' });
    grid.id = 'heat-grid';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.heatPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel panel-wide' }, h, sub, grid, close);
    this.heatPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
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
    this.heatPanel.classList.remove('hidden');
  }

  private buildArchetype(): void {
    const h = el('h2', {}, 'BUILD ARCHETYPE');
    const sub = el('div', { class: 'event-flavor' }, 'Bias your perk draft toward a build path. Or stay FREESTYLE and take what comes.');
    const grid = el('div', { class: 'heat-grid' });
    grid.id = 'arch-grid';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.archetypePanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel panel-wide' }, h, sub, grid, close);
    this.archetypePanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
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
    this.archetypePanel.classList.remove('hidden');
  }

  private buildLeaderboard(): void {
    const h = el('h2', {}, 'LEADERBOARD');
    const body = el('div', { class: 'leader-body' });
    body.id = 'leader-body';
    const close = el('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.leaderPanel.classList.add('hidden'));
    const panel = el('div', { class: 'panel panel-wide' }, h, body, close);
    this.leaderPanel = el('div', { class: 'screen screen-dim screen-settings hidden' }, panel);
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
      this.leaderPanel.classList.remove('hidden');
      return;
    }

    const modeRow = el('div', { class: 'leader-modes' });
    const scopeRow = el('div', { class: 'leader-modes' });
    const listWrap = el('div', { class: 'leader-list' }, el('div', { class: 'event-flavor' }, 'Loading…'));
    // must mirror src/modes.ts MODES (and the worker's MODES allow-set) so every
    // submittable mode is also viewable — ARENA + SOLSTICE PROTOCOL were submitted
    // but had no board tab.
    const modes: { id: string; name: string }[] = [
      { id: 'endless', name: 'ENDLESS' }, { id: 'arena', name: 'ARENA' }, { id: 'daily', name: 'ECHO OF THE FALL' }, { id: 'nightmare', name: 'NIGHTMARE' }, { id: 'bossrush', name: 'BOSS RUSH' }, { id: 'longestday', name: 'SOLSTICE PROTOCOL' },
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
      b.addEventListener('click', () => { curMode = m.id; void load(); });
      modeRow.append(b);
    }
    body.append(modeRow, scopeRow, listWrap);
    void load();
    this.leaderPanel.classList.remove('hidden');
  }

  // ── screen control ──
  private current: ScreenId = 'title';
  show(s: ScreenId): void {
    this.current = s;
    this.title.classList.toggle('hidden', s !== 'title');
    this.pause.classList.toggle('hidden', s !== 'paused');
    this.gameover.classList.toggle('hidden', s !== 'gameover');
    this.draft.classList.toggle('hidden', s !== 'draft');
    this.eventPanel.classList.toggle('hidden', s !== 'event');
    this.hud.classList.toggle('hidden', s !== 'playing');
    // any screen transition dismisses the modals so they can't block play
    this.settingsPanel.classList.add('hidden');
    this.statsPanel.classList.add('hidden');
    this.upgradesPanel.classList.add('hidden');
    this.howtoPanel.classList.add('hidden');
    this.heatPanel.classList.add('hidden');
    this.archetypePanel.classList.add('hidden');
    this.leaderPanel.classList.add('hidden');
    if (s !== 'paused') {
      this.pauseRestartArmed = false;
    }
    // move keyboard focus to the active screen's primary action
    const active = { title: this.title, paused: this.pause, gameover: this.gameover, draft: this.draft, event: this.eventPanel, playing: null }[s];
    if (active) {
      const btn = active.querySelector('.btn-primary, .perk-card, .btn') as HTMLElement | null;
      btn?.focus();
    }
  }

  refreshTitle(save: SaveData): void {
    this.saveRef = save;
    this.titleBest.textContent =
      save.highScore > 0
        ? `BEST ${save.highScore.toLocaleString()}  ·  x${save.bestCombo} combo`
        : 'no runs yet — go make a mess';
    const arch = save.selectedArchetype && save.selectedArchetype !== 'none' ? `  ·  ◈ ${archetypeById(save.selectedArchetype).name}` : '';
    this.shardLine.textContent = `◆ ${save.shards.toLocaleString()} shards${save.selectedHeat > 0 ? `  ·  🔥 HEAT ${save.selectedHeat}` : ''}${arch}`;
    // NG+ toggle — appears only once the Sovereign has been felled
    const ngUnlocked = save.ngPlusLevel >= 1;
    this.ngBtn.classList.toggle('hidden', !ngUnlocked);
    this.ngBtn.classList.toggle('btn-primary', save.ngPlusActive);
    this.ngBtn.textContent = save.ngPlusActive ? `★ NG+${save.ngPlusLevel}` : `NG+${save.ngPlusLevel} off`;

    // daily challenge caption — today's seed + your best + best-of-3 attempts
    let daily = `Echo of the Fall · ${dateString()}`;
    if (save.dailySeed === seedFromDate() && save.dailyBest > 0) {
      daily += ` · your best ${save.dailyBest.toLocaleString()}`;
    }
    const dUsed = save.dailyAttemptDate === dateString() ? save.dailyAttempts : 0;
    daily += dUsed >= MAX_DAILY_ATTEMPTS ? ` · ${MAX_DAILY_ATTEMPTS}/${MAX_DAILY_ATTEMPTS} done today` : ` · Attempt ${dUsed + 1}/${MAX_DAILY_ATTEMPTS}`;
    this.dailyCaption.textContent = daily;

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

    // v6 §5 — mode-cards: every mode selectable + persisted; roving tabindex for kbd/pad
    // nav; the SELECTED card shows a Heat chip + (Daily) a seed + read-only mutator preview.
    this.modeGrid.replaceChildren();
    for (const m of MODES) {
      const selected = save.selectedMode === m.id;
      const brief = modeBrief(m);
      const card = el('button', {
        class: 'mode-card' + (selected ? ' selected' : ''),
        'aria-pressed': String(selected),
        tabindex: selected ? '0' : '-1',
      });
      card.append(
        el('div', { class: 'mode-card-name' }, m.name),
        el('div', { class: 'mode-card-tier' }, `${brief.tier}${brief.note ? ` · ${brief.note}` : ''}`),
        el('div', { class: 'mode-card-desc' }, m.desc),
        el('div', { class: 'mode-card-reward' }, brief.reward),
      );
      if (selected) {
        const foot = el('div', { class: 'mode-card-foot' });
        const heat = el('button', { class: 'mode-card-heat' }, save.selectedHeat > 0 ? `🔥 HEAT ${save.selectedHeat}` : '🔥 HEAT');
        heat.addEventListener('click', (e) => { e.stopPropagation(); this.openHeat(); });
        foot.append(heat);
        if (m.seedKind === 'date') {
          foot.append(el('span', { class: 'mode-card-seed' }, `seed ${seedFromDate()}`));
          for (const mut of dailyMutatorPreview(seedFromDate())) {
            const chip = el('span', { class: 'mode-card-mut' }, mut.name);
            chip.style.setProperty('--accent', mut.accent);
            foot.append(chip);
          }
        }
        card.append(foot);
      }
      card.title = m.desc;
      card.addEventListener('click', () => this.cb.onSelectMode(m.id));
      this.modeGrid.append(card);
    }
    this.playBtn.title = 'Play ' + modeById(save.selectedMode).name;
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

  /** §5 U2 — step the selected mode-card left/right (keyboard/gamepad), persist, focus it. */
  moveModeSelection(dir: number): void {
    const s = this.saveRef;
    if (!s) return;
    this.cb.onSelectMode(nextModeId(s.selectedMode, dir)); // persists → refreshTitle rebuilds the grid
    (this.modeGrid.querySelector('.mode-card.selected') as HTMLElement | null)?.focus();
  }

  hideSoundHint(): void {
    this.soundHint.style.display = 'none';
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
