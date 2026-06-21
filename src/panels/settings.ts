// SETTINGS — audio / visuals / gameplay / access / controls, grouped into tabbed sections with
// perf PRESETS and keyboard rebinding. Extracted from ui.ts. The host owns the actual settings
// object + persistence (via the `patch` dep) and the global key handler; this panel owns the form.
// Key-capture runs internally but is mirrored to the host (`setRebinding`) so its in-run key handler
// ignores keys mid-capture. City memory lives on SaveData (not Settings), so it's re-synced on open.

import { el } from './dom';
import { defaultKeyBindings } from '../input';
import { TRACKS, type SoundtrackId } from '../soundtracks';
import type { Settings } from '../save';
import { leaderboardEnabled } from '../api';
import * as account from '../account';

type RebindAction = 'dash' | 'overdrive' | 'parry' | 'pause';

export interface SettingsPanelDeps {
  /** the live settings object (mutated in place by patch — held by reference). */
  settings: Settings;
  /** apply a settings patch (host persists + notifies the game). */
  patch: (p: Partial<Settings>) => void;
  /** current city-memory-meter pref (lives on SaveData, not Settings). */
  cityMemory: () => boolean;
  onToggleCityMemory: (v: boolean) => void;
  /** signal the host a key-capture is in flight (null = done) so its key handler ignores keys. */
  setRebinding: (action: RebindAction | null) => void;
  /** ACT TWO — clear the persisted teach flags (taught set + seenSandbox + glosses + first-run
   *  flags) so the whole onboarding replays from scratch on the next descent. */
  onReplayTutorial: () => void;
  /** open the ACCOUNT sign-in panel. */
  onOpenAccount: () => void;
  /** dismiss the modal (DONE). */
  onClose: () => void;
}

export interface SettingsPanel {
  readonly root: HTMLElement;
  /** re-sync the city-memory toggle to the live save (build runs before a save loads). */
  syncCityMemory(): void;
}

function keyLabel(keys: string[]): string {
  const one = (k: string) =>
    k === ' ' ? 'SPACE' : k === 'escape' ? 'ESC' : k === 'arrowleft' ? '←' : k === 'arrowright' ? '→' : k === 'arrowup' ? '↑' : k === 'arrowdown' ? '↓' : k.toUpperCase();
  return keys.map(one).join(' / ');
}

export function buildSettingsPanel(deps: SettingsPanelDeps): SettingsPanel {
  const h = el('h2', {}, 'SETTINGS');
  const s = deps.settings;

  // slider returns { row, input } so a PRESET can re-sync the displayed value
  const fmtSliderVal = (v: number) => String(Math.round(v * 100) / 100);
  const slider = (label: string, min: number, max: number, step: number, val: number, on: (v: number) => void) => {
    const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val) }) as HTMLInputElement;
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
  const shakeS = slider('Screen shake', 0, 1.5, 0.05, s.shake, (v) => deps.patch({ shake: v }));
  const chromaS = slider('Chromatic aberration', 0, 1, 0.05, s.chromAberration, (v) => deps.patch({ chromAberration: v }));
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
    b.addEventListener('click', () => { deps.patch({ particleDensity: d }); setDensity(d); });
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
      deps.patch(p);
      chromaS.input.value = String(p.chromAberration);
      shakeS.input.value = String(p.shake);
      chromaS.input.dispatchEvent(new Event('input'));
      shakeS.input.dispatchEvent(new Event('input'));
      setDensity(p.particleDensity);
      presetRow.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    });
    presetRow.append(b);
  }
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
      deps.patch({ soundtrack: id });
      trackWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    });
    trackWrap.append(b);
  }

  // HUD layout — EDGES (spread to the corners) vs CENTRAL (a compact inward cluster)
  const hudLayoutWrap = el('div', { class: 'setting' }, el('span', {}, 'HUD layout'));
  for (const id of ['edges', 'central'] as const) {
    const b = el('button', { class: 'btn btn-ghost btn-sm' + (s.hudLayout === id ? ' active' : '') }, id.toUpperCase());
    b.addEventListener('click', () => {
      deps.patch({ hudLayout: id });
      hudLayoutWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    });
    hudLayoutWrap.append(b);
  }

  // City-memory is backed by SaveData (not Settings); re-synced on open via syncCityMemory().
  const cityMemRow = toggle('City memory meter', deps.cityMemory(), (v) => deps.onToggleCityMemory(v));
  const cityMemInput = cityMemRow.querySelector('input') as HTMLInputElement;

  // Cloud save — only shown when a backend is configured (VITE_LEADERBOARD_URL set).
  // The opt-in flag lives in localStorage (per-device, never synced).
  let cloudSaveRow: HTMLElement | null = null;
  let manageAccountRow: HTMLElement | null = null;
  if (leaderboardEnabled()) {
    const cloudInput = el('input', { type: 'checkbox' }) as HTMLInputElement;
    cloudInput.checked = account.optedIn();
    cloudInput.addEventListener('change', () => {
      if (cloudInput.checked) { account.optIn(); account.init(); }
      else { account.optOut(); }
    });
    const labelSpan = el('span', {},
      el('span', {}, 'Cloud save'),
      el('small', { class: 'setting-sublabel' }, 'Back up progress to the cloud for this device'),
    );
    cloudSaveRow = el('label', { class: 'setting setting-toggle', 'data-testid': 'cloud-save-row' }, labelSpan, cloudInput);
    const manageBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-testid': 'manage-account-btn' }, 'Manage account');
    manageBtn.addEventListener('click', () => deps.onOpenAccount());
    manageAccountRow = el('div', { class: 'setting' }, el('span', {}, 'Account'), manageBtn);
  }

  // ACT TWO — Tutorial hints toggle + a one-tap "Replay tutorial" that re-arms the whole
  // onboarding (sandbox + verb/enemy/boss reads + glosses) on the next descent.
  const replayBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Replay tutorial') as HTMLButtonElement;
  replayBtn.addEventListener('click', () => {
    deps.onReplayTutorial();
    replayBtn.textContent = 'Tutorial reset ✓';
    replayBtn.disabled = true;
  });
  const replayRow = el('label', { class: 'setting' }, el('span', {}, 'Onboarding'), replayBtn);

  // ── key rebinding (keyboard only; gamepad/touch unchanged) ──
  let rebinding: RebindAction | null = null;
  const rebindBtns: Array<{ action: RebindAction; btn: HTMLButtonElement }> = [];
  const refreshKeyLabels = () => {
    for (const { action, btn } of rebindBtns) btn.textContent = keyLabel(s.keymap[action]);
  };
  const rebindRow = (label: string, action: RebindAction) => {
    const btn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, keyLabel(s.keymap[action])) as HTMLButtonElement;
    rebindBtns.push({ action, btn });
    btn.addEventListener('click', () => {
      if (rebinding) return; // one capture at a time
      rebinding = action;
      deps.setRebinding(action);
      btn.classList.add('active');
      btn.textContent = 'press a key…';
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation(); // swallow the capture key so it can't also trigger the old binding
        window.removeEventListener('keydown', onKey, true);
        rebinding = null;
        deps.setRebinding(null);
        btn.classList.remove('active');
        const k = e.key.toLowerCase();
        if (k !== 'escape') deps.patch({ keymap: { ...s.keymap, [action]: [k] } });
        refreshKeyLabels();
      };
      window.addEventListener('keydown', onKey, true);
    });
    return el('label', { class: 'setting' }, el('span', {}, label), btn);
  };
  const resetKeys = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Reset keys to default');
  resetKeys.addEventListener('click', () => { deps.patch({ keymap: defaultKeyBindings() }); refreshKeyLabels(); });

  // ── tabbed SECTIONS (mock-mainui) — group related settings; one section visible at a time ──
  const sect = (id: string, ...kids: HTMLElement[]) => el('div', { class: 'set-sect', 'data-sect': id }, ...kids);
  const sections: { id: string; name: string; el: HTMLElement }[] = [
    { id: 'audio', name: 'AUDIO', el: sect('audio',
      slider('Master volume', 0, 1, 0.05, s.master, (v) => deps.patch({ master: v })).row,
      slider('SFX volume', 0, 1, 0.05, s.sfx, (v) => deps.patch({ sfx: v })).row,
      slider('Music volume', 0, 1, 0.05, s.music, (v) => deps.patch({ music: v })).row,
      trackWrap) },
    { id: 'visuals', name: 'VISUALS', el: sect('visuals',
      shakeS.row,
      slider('HUD scale', 0.8, 1.8, 0.05, s.hudScale, (v) => deps.patch({ hudScale: v })).row,
      hudLayoutWrap,
      chromaS.row, densityWrap) },
    { id: 'gameplay', name: 'GAMEPLAY', el: sect('gameplay',
      toggle('Slingshot dash (alt style)', s.dashStyle === 'slingshot', (v) => deps.patch({ dashStyle: v ? 'slingshot' : 'lance' })),
      toggle('Tutorial hints', s.tutorialHints, (v) => deps.patch({ tutorialHints: v })),
      toggle('Boss Rush ciphers', s.bossRushCiphers, (v) => deps.patch({ bossRushCiphers: v })),
      replayRow,
      cityMemRow,
      ...(cloudSaveRow ? [cloudSaveRow] : []),
      ...(manageAccountRow ? [manageAccountRow] : [])) },
    { id: 'access', name: 'ACCESS', el: sect('access',
      toggle('Reduce flashing', s.reduceFlashing, (v) => deps.patch({ reduceFlashing: v })),
      toggle('Reduce motion', s.reduceMotion, (v) => deps.patch({ reduceMotion: v })),
      toggle('Colorblind shapes', s.colorblind, (v) => deps.patch({ colorblind: v })),
      toggle('Clarity (high contrast)', s.clarity, (v) => deps.patch({ clarity: v })),
      toggle('Beat ring (rhythm assist)', s.rhythmAssist, (v) => deps.patch({ rhythmAssist: v }))) },
    { id: 'controls', name: 'CONTROLS', el: sect('controls',
      toggle('Controller rumble', s.rumble, (v) => deps.patch({ rumble: v })),
      rebindRow('Dash', 'dash'), rebindRow('Overdrive', 'overdrive'), rebindRow('Parry', 'parry'), rebindRow('Pause', 'pause'),
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
  close.addEventListener('click', () => deps.onClose());
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, el('div', { class: 'panel panel-wide' }, h, presetRow, tabRow, body, close));
  showSect('audio'); // default to the AUDIO tab

  const syncCityMemory = (): void => { cityMemInput.checked = deps.cityMemory(); };

  return { root, syncCityMemory };
}
