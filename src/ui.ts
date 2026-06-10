// DOM overlay UI: title/attract, HUD, pause, game-over, perk draft, settings.
// One canvas always renders behind. HUD updates mutate cached refs only (no
// innerHTML churn) so the 60fps loop stays clean.

import type { World } from './world';
import type { Settings, SaveData } from './save';
import type { PerkDef } from './perks';
import { isEvolution, isRelic, EVOLUTIONS } from './evolutions';
import type { DraftCard, EvolutionDef } from './evolutions';
import type { EventChoice } from './events';
import { HEAT_LEVELS } from './heat';
import { ARCHETYPES, archetypeById } from './archetypes';
import { leaderboardEnabled, fetchLeaderboard } from './api';
import { comboColor } from './render';
import { SHIPS } from './ships';
import { THEMES } from './themes';
import { TRAILS } from './trails';
import { ACHIEVEMENTS } from './achievements';
import { META_NODES, nodeCost } from './meta';
import { MODES, modeById } from './modes';
import { POWERUPS } from './powerups';
import { BESTIARY, CODEX_CATEGORIES } from './bestiary';
import { LORE, fragmentBalance, loreUnlocked } from './lore';
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
  onSetHandle: (name: string) => void;
}

export interface GameOverInfo {
  score: number;
  /** first Sovereign kill → present THE CHOICE (catch the star / let it fall) */
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
  pbDelta: number;
  newAchievements: string[];
  mutators: { name: string; accent: string }[];
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
  private ngBtn!: HTMLButtonElement;
  private heatPanel!: HTMLElement;
  private archetypePanel!: HTMLElement;
  private leaderPanel!: HTMLElement;
  private duelPanel!: HTMLElement;
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
  private puWrap!: HTMLElement;
  private puFill!: HTMLElement;
  private puLabel!: HTMLElement;
  private dailyCaption!: HTMLElement;
  private comboEl!: HTMLElement;
  private comboBar!: HTMLElement;
  private staminaWrap!: HTMLElement;
  private staminaSegs: HTMLElement[] = [];
  private grazeEl!: HTMLElement;
  private bestComboEl!: HTMLElement;
  private soundHint!: HTMLElement;

  // title refs
  private titleBest!: HTMLElement;
  private shipRow!: HTMLElement;
  private themeRow!: HTMLElement;
  private trailRow!: HTMLElement;
  private shardLine!: HTMLElement;

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
    this.buildHeat();
    this.buildArchetype();
    this.buildLeaderboard();
    this.buildDuel();
    // aria-live so the narrator's SOUL payload reaches screen-reader users:
    // toasts are polite (ambient), announces are assertive (emphatic, used sparingly).
    this.toastLayer = el('div', { class: 'toast-layer', role: 'status', 'aria-live': 'polite' });
    this.announceEl = el('div', { class: 'announce', role: 'status', 'aria-live': 'polite' });
    this.root.append(this.hud, this.title, this.pause, this.gameover, this.draft, this.eventPanel, this.settingsPanel, this.statsPanel, this.upgradesPanel, this.howtoPanel, this.codexPanel, this.heatPanel, this.archetypePanel, this.leaderPanel, this.duelPanel, this.toastLayer, this.announceEl);
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
    const topCenter = el('div', { class: 'hud-topcenter' }, this.comboEl, comboBarWrap);

    this.staminaWrap = el('div', { class: 'hud-stamina' });
    this.grazeEl = el('div', { class: 'hud-graze' }, '');
    this.bestComboEl = el('div', { class: 'hud-bestcombo' }, '');
    const bottom = el('div', { class: 'hud-bottom' }, this.grazeEl, this.staminaWrap, this.bestComboEl);

    // OVERDRIVE meter (below the stamina bar)
    this.odLabel = el('div', { class: 'hud-od-label' }, 'REMEMBER');
    this.odFill = el('div', { class: 'hud-od-fill' });
    this.odWrap = el('div', { class: 'hud-overdrive' }, this.odLabel, el('div', { class: 'hud-od-track' }, this.odFill));

    // active POWER-UP badge (hidden unless one is active)
    this.puLabel = el('div', { class: 'hud-pu-label' }, '');
    this.puFill = el('div', { class: 'hud-pu-fill' });
    this.puWrap = el('div', { class: 'hud-powerup' }, this.puLabel, el('div', { class: 'hud-pu-track' }, this.puFill));

    this.hud = el('div', { class: 'hud' }, topLeft, topCenter, bottom, this.odWrap, this.puWrap);
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

  private buildTitle(): void {
    const wordmark = el('h1', { class: 'title-word' }, 'LANCEFALL');
    const tagline = el('p', { class: 'title-tag' }, 'remember the fall');
    const play = el('button', { class: 'btn btn-primary btn-play' }, 'PLAY');
    play.title = 'Endless mode';
    play.addEventListener('click', () => this.cb.onStart(modeById('endless')));
    // mode row: every mode except endless (the big PLAY button)
    const modeRow = el('div', { class: 'mode-row' });
    for (const m of MODES) {
      if (m.id === 'endless') continue;
      const b = el('button', { class: 'btn btn-ghost btn-mode' }, m.name);
      b.title = m.desc;
      b.addEventListener('click', () => this.cb.onStart(m));
      modeRow.append(b);
    }
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
    const heatBtn = el('button', { class: 'btn btn-ghost' }, '🔥 HEAT');
    heatBtn.addEventListener('click', () => this.openHeat());
    const archBtn = el('button', { class: 'btn btn-ghost' }, '◈ BUILD');
    archBtn.addEventListener('click', () => this.openArchetype());
    const leaderBtn = el('button', { class: 'btn btn-ghost' }, '🏅 RANKS');
    leaderBtn.addEventListener('click', () => this.openLeaderboard());
    const duelBtn = el('button', { class: 'btn btn-ghost' }, '⚔ DUEL');
    duelBtn.addEventListener('click', () => this.openDuel());
    this.ngBtn = el('button', { class: 'btn btn-ghost hidden' }, 'NG+') as HTMLButtonElement;
    this.ngBtn.addEventListener('click', () => this.cb.onToggleNgPlus());
    const row = el('div', { class: 'title-row' }, upgradesBtn, statsBtn, heatBtn, archBtn, this.ngBtn, leaderBtn, duelBtn, settingsBtn, how, codexBtn);
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
      el('span', {}, 'overdrive'),
      el('b', {}, 'F / LB'),
    );

    this.title = el(
      'div',
      { class: 'screen screen-title' },
      wordmark,
      tagline,
      play,
      modeRow,
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
    // THE CHOICE — shown only on the first Sovereign kill (catch the star / let it fall)
    const catchBtn = el('button', { class: 'btn btn-primary' }, 'CATCH THE STAR');
    catchBtn.addEventListener('click', () => this.cb.onChoice('catch'));
    const fallBtn = el('button', { class: 'btn btn-ghost' }, 'LET IT FALL');
    fallBtn.addEventListener('click', () => this.cb.onChoice('fall'));
    this.choiceRow = el(
      'div',
      { class: 'go-row go-choice hidden' },
      el('div', { class: 'go-choice-prompt' }, 'The star is falling. Will you catch it?'),
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
    const lifetime = el('div', { class: 'stats-grid' },
      stat(s.highScore.toLocaleString(), 'high score'),
      stat(`x${s.bestCombo}`, 'best combo'),
      stat(String(s.totalRuns), 'runs'),
      stat(s.lifeKills.toLocaleString(), 'total kills'),
      stat(String(s.lifeBoss), 'bosses down'),
      stat(s.lifeShards.toLocaleString(), 'shards earned'),
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
        `◆ ${bal} Memory Fragment${bal === 1 ? '' : 's'} — one is carried out of every descent. Spend them to remember.`,
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
        const btn = el('button', { class: 'btn btn-sm' + (affordable ? ' btn-primary' : '') }, `REMEMBER ◆${e.cost}`);
        if (!affordable) btn.setAttribute('disabled', 'true');
        btn.addEventListener('click', () => this.cb.onUnlockLore(e.id));
        card.append(
          el('div', { class: 'codex-name codex-locked' }, '— forgotten —'),
          el('div', { class: 'codex-blurb codex-locked' }, `A memory of the fall, lost. ◆${e.cost} to remember it.`),
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
      rule('REMEMBER EVERYTHING', 'Kills + grazes charge the bottom meter. When it reads READY, tap F (or gamepad LB) to unleash a time-slowing, screen-clearing nova'),
      rule('Power-ups', 'Bosses and Champions drop timed buffs — run over the glowing pickup to grab it (one active at a time)'),
      rule('Last Breath', 'A fatal hit triggers a one-off bullet-time second wind — dash to safety before it fades'),
      rule('Champions', 'Gold-aura elites are tanky but rain shards — mind the death blast'),
      rule('Bosses', 'Dash through the safe gaps. THE SOVEREIGN (the final boss) is ARMORED — dash through its orbiting CORES to crack it open, then punish the exposed crown'),
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
    const modes: { id: string; name: string }[] = [
      { id: 'endless', name: 'ENDLESS' }, { id: 'daily', name: 'ECHO OF THE FALL' }, { id: 'nightmare', name: 'NIGHTMARE' }, { id: 'bossrush', name: 'BOSS RUSH' },
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

    // daily challenge caption — today's seed + your best for it
    let daily = `Echo of the Fall · ${dateString()}`;
    if (save.dailySeed === seedFromDate() && save.dailyBest > 0) {
      daily += ` · your best ${save.dailyBest.toLocaleString()}`;
    }
    this.dailyCaption.textContent = daily;

    this.shipRow.replaceChildren();
    for (const ship of SHIPS) {
      const unlocked = save.unlockedShips.includes(ship.id);
      const selected = save.selectedShip === ship.id;
      const chip = el('button', { class: 'ship-chip' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked') });
      chip.style.setProperty('--accent', ship.accent);
      chip.append(
        el('div', { class: 'ship-name' }, ship.name),
        el('div', { class: 'ship-desc' }, ship.desc),
        el('div', { class: 'ship-status' }, unlocked ? (selected ? 'EQUIPPED' : 'tap to equip') : `◆ ${ship.unlockShards.toLocaleString()}`),
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
    this.goSub.textContent = info.won ? 'Lancefall remembers itself' : `the kingdom forgets a little more · ${info.deathCause}`;
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
    this.goStats.replaceChildren(
      stat('best combo', `x${info.combo}`),
      stat('wave', String(info.wave)),
      stat('time', formatTime(info.time)),
      stat('◆ shards', `+${info.shardsEarned}`),
      stat(info.daily ? 'daily best' : 'high score', (info.daily ? info.dailyBest : info.highScore).toLocaleString()),
    );
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

  // ── per-frame HUD update ──
  updateHud(world: World, particleDensity: number): void {
    void particleDensity;
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

    this.grazeEl.textContent = world.grazeCount > 0 ? `GRAZE ${world.grazeCount}` : '';
    this.bestComboEl.textContent = world.bestComboRun > 0 ? `best x${world.bestComboRun}` : '';

    // OVERDRIVE meter
    const od = world.overdrive;
    const ready = od.meter >= 1 && od.cooldown <= 0;
    this.odFill.style.transform = `scaleX(${Math.max(0, Math.min(1, od.meter))})`;
    this.odWrap.classList.toggle('od-ready', ready);
    this.odLabel.textContent = od.cooldown > 0 ? `FADING ${Math.ceil(od.cooldown)}s` : ready ? 'REMEMBER EVERYTHING READY [F]' : 'REMEMBER';

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
