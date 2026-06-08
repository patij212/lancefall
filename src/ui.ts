// DOM overlay UI: title/attract, HUD, pause, game-over, perk draft, settings.
// One canvas always renders behind. HUD updates mutate cached refs only (no
// innerHTML churn) so the 60fps loop stays clean.

import type { World } from './world';
import type { Settings, SaveData } from './save';
import type { PerkDef } from './perks';
import { comboColor } from './render';
import { SHIPS } from './ships';
import { TUNE } from './tune';

export interface UICallbacks {
  onStart: (daily: boolean) => void;
  onRestart: () => void;
  onResume: () => void;
  onQuit: () => void;
  onPick: (index: number) => void;
  onCopyScore: () => void;
  onSettingsChange: (s: Settings) => void;
  onSelectShip: (id: string) => void;
  onUnlockShip: (id: string) => void;
}

export interface GameOverInfo {
  score: number;
  combo: number;
  wave: number;
  time: number;
  newBest: boolean;
  daily: boolean;
  highScore: number;
  shardsEarned: number;
}

type ScreenId = 'title' | 'playing' | 'paused' | 'gameover' | 'draft';

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
  private gameover!: HTMLElement;
  private draft!: HTMLElement;
  private settingsPanel!: HTMLElement;
  private toastLayer!: HTMLElement;
  private hud!: HTMLElement;

  // hud refs
  private scoreEl!: HTMLElement;
  private waveEl!: HTMLElement;
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
  private shardLine!: HTMLElement;

  // gameover refs
  private goScore!: HTMLElement;
  private goStats!: HTMLElement;
  private goBadge!: HTMLElement;

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
    this.buildSettings();
    this.toastLayer = el('div', { class: 'toast-layer' });
    this.root.append(this.hud, this.title, this.pause, this.gameover, this.draft, this.settingsPanel, this.toastLayer);
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
    const topLeft = el('div', { class: 'hud-topleft' }, this.scoreEl, this.waveEl);

    this.comboEl = el('div', { class: 'hud-combo' }, '');
    this.comboBar = el('div', { class: 'hud-combo-fill' });
    const comboBarWrap = el('div', { class: 'hud-combo-bar' }, this.comboBar);
    const topCenter = el('div', { class: 'hud-topcenter' }, this.comboEl, comboBarWrap);

    this.staminaWrap = el('div', { class: 'hud-stamina' });
    this.grazeEl = el('div', { class: 'hud-graze' }, '');
    this.bestComboEl = el('div', { class: 'hud-bestcombo' }, '');
    const bottom = el('div', { class: 'hud-bottom' }, this.grazeEl, this.staminaWrap, this.bestComboEl);

    this.hud = el('div', { class: 'hud' }, topLeft, topCenter, bottom);
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
    const tagline = el('p', { class: 'title-tag' }, 'thread death itself');
    const play = el('button', { class: 'btn btn-primary btn-play' }, 'PLAY');
    play.addEventListener('click', () => this.cb.onStart(false));
    const daily = el('button', { class: 'btn btn-ghost' }, 'DAILY SEED');
    daily.addEventListener('click', () => this.cb.onStart(true));
    const settingsBtn = el('button', { class: 'btn btn-ghost' }, 'SETTINGS');
    settingsBtn.addEventListener('click', () => this.openSettings());
    const how = el('button', { class: 'btn btn-ghost' }, 'HOW TO PLAY');
    how.addEventListener('click', () => this.showHowTo());
    const row = el('div', { class: 'title-row' }, daily, settingsBtn, how);
    this.titleBest = el('div', { class: 'title-best' }, '');
    this.shardLine = el('div', { class: 'title-shards' }, '');
    this.shipRow = el('div', { class: 'ship-row' });
    const shipSection = el('div', { class: 'ship-section' }, el('div', { class: 'ship-label' }, 'SHIP'), this.shipRow);
    this.soundHint = el('div', { class: 'sound-hint' }, '♪ click PLAY to enable sound');

    const legend = el(
      'div',
      { class: 'title-legend' },
      el('span', {}, 'move'),
      el('b', {}, 'WASD / arrows / stick'),
      el('span', {}, 'dash'),
      el('b', {}, 'hold + release  ·  mouse / Space / RT'),
    );

    this.title = el(
      'div',
      { class: 'screen screen-title' },
      wordmark,
      tagline,
      play,
      row,
      shipSection,
      legend,
      this.titleBest,
      this.shardLine,
      this.soundHint,
    );
  }

  private buildPause(): void {
    const h = el('h2', {}, 'PAUSED');
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
    const panel = el('div', { class: 'panel' }, h, resume, settingsBtn, restart, quit);
    this.pause = el('div', { class: 'screen screen-dim' }, panel);
  }

  private buildGameOver(): void {
    const h = el('h2', { class: 'go-head' }, 'YOU FELL');
    this.goBadge = el('div', { class: 'go-badge' }, '');
    this.goScore = el('div', { class: 'go-score' }, '0');
    this.goStats = el('div', { class: 'go-stats' }, '');
    const again = el('button', { class: 'btn btn-primary' }, 'AGAIN');
    again.addEventListener('click', () => this.cb.onRestart());
    const copy = el('button', { class: 'btn btn-ghost' }, 'COPY SCORE');
    copy.addEventListener('click', () => this.cb.onCopyScore());
    const menu = el('button', { class: 'btn btn-ghost' }, 'MENU');
    menu.addEventListener('click', () => this.cb.onQuit());
    const row = el('div', { class: 'go-row' }, again, copy, menu);
    const panel = el('div', { class: 'panel' }, h, this.goBadge, this.goScore, this.goStats, row);
    this.gameover = el('div', { class: 'screen screen-dim' }, panel);
  }

  private buildDraft(): void {
    const h = el('h2', { class: 'draft-head' }, 'CHOOSE A PERK');
    const cards = el('div', { class: 'draft-cards' });
    cards.id = 'draft-cards';
    const panel = el('div', { class: 'panel panel-wide' }, h, cards);
    this.draft = el('div', { class: 'screen screen-dim' }, panel);
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
      toggle('Reduce flashing', s.reduceFlashing, (v) => this.patch({ reduceFlashing: v })),
      toggle('Reduce motion', s.reduceMotion, (v) => this.patch({ reduceMotion: v })),
      toggle('Colorblind shapes', s.colorblind, (v) => this.patch({ colorblind: v })),
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

  private showHowTo(): void {
    this.toast('Hold to charge a dash, release to spear. Chain kills for combo. Graze bullets for stamina.');
  }

  // ── screen control ──
  private current: ScreenId = 'title';
  show(s: ScreenId): void {
    this.current = s;
    this.title.classList.toggle('hidden', s !== 'title');
    this.pause.classList.toggle('hidden', s !== 'paused');
    this.gameover.classList.toggle('hidden', s !== 'gameover');
    this.draft.classList.toggle('hidden', s !== 'draft');
    this.hud.classList.toggle('hidden', s !== 'playing');
    // any screen transition dismisses the settings modal so it can't block play
    this.settingsPanel.classList.add('hidden');
    if (s !== 'paused') {
      this.pauseRestartArmed = false;
    }
    // move keyboard focus to the active screen's primary action
    const active = { title: this.title, paused: this.pause, gameover: this.gameover, draft: this.draft, playing: null }[s];
    if (active) {
      const btn = active.querySelector('.btn-primary, .perk-card, .btn') as HTMLElement | null;
      btn?.focus();
    }
  }

  refreshTitle(save: SaveData): void {
    this.titleBest.textContent =
      save.highScore > 0
        ? `BEST ${save.highScore.toLocaleString()}  ·  x${save.bestCombo} combo`
        : 'no runs yet — go make a mess';
    this.shardLine.textContent = `◆ ${save.shards.toLocaleString()} shards`;

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
  }

  hideSoundHint(): void {
    this.soundHint.style.display = 'none';
  }

  showDraft(cards: PerkDef[]): void {
    const wrap = this.draft.querySelector('#draft-cards')!;
    wrap.replaceChildren();
    cards.forEach((c, i) => {
      const card = el('button', { class: 'perk-card' });
      card.style.setProperty('--accent', c.accent);
      card.append(
        el('div', { class: 'perk-glyph' }, perkGlyph(c.glyph)),
        el('div', { class: 'perk-name' }, c.name),
        el('div', { class: 'perk-desc' }, c.desc),
        el('div', { class: 'perk-key' }, String(i + 1)),
      );
      card.addEventListener('click', () => this.cb.onPick(i));
      wrap.append(card);
    });
    this.show('draft');
  }

  showGameOver(info: GameOverInfo): void {
    this.displayScore = 0;
    this.goScore.textContent = '0';
    this.goBadge.classList.toggle('hidden', !info.newBest);
    this.goBadge.textContent = info.newBest ? '★ NEW BEST ★' : '';
    this.goStats.replaceChildren(
      stat('best combo', `x${info.combo}`),
      stat('wave', String(info.wave)),
      stat('time', formatTime(info.time)),
      stat('◆ shards', `+${info.shardsEarned}`),
      stat('high score', info.highScore.toLocaleString()),
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
      fill.parentElement!.classList.toggle('empty', world.player.stamina < per);
    }

    this.grazeEl.textContent = world.grazeCount > 0 ? `GRAZE ${world.grazeCount}` : '';
    this.bestComboEl.textContent = world.bestComboRun > 0 ? `best x${world.bestComboRun}` : '';
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
    gem: '◆',
  };
  return map[g];
}
