// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { buildSettingsPanel, type SettingsPanelDeps } from './settings';
import type { Settings } from '../save';
import * as account from '../account';

const settings = (): Settings =>
  ({
    master: 0.8, sfx: 0.8, music: 0.8, shake: 1, chromAberration: 0.6, hudScale: 1,
    particleDensity: 'med', soundtrack: 'aurora', dashStyle: 'lance',
    reduceFlashing: false, reduceMotion: false, colorblind: false, clarity: false,
    rhythmAssist: false, tutorialHints: true, rumble: true, keymap: { dash: [' '], overdrive: ['e'], parry: ['k'], pause: ['escape'] },
  }) as unknown as Settings;

const deps = (over: Partial<SettingsPanelDeps> = {}): SettingsPanelDeps => ({
  settings: settings(), patch: vi.fn(), cityMemory: () => true, onToggleCityMemory: vi.fn(), setRebinding: vi.fn(), onReplayTutorial: vi.fn(), onClose: vi.fn(), ...over,
});

const toggleInput = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('.setting')].find((s) => s.querySelector('span')?.textContent === label)?.querySelector('input') as HTMLInputElement;

afterEach(() => document.body.replaceChildren());

describe('buildSettingsPanel', () => {
  it('renders the five section tabs, AUDIO open by default', () => {
    const panel = buildSettingsPanel(deps());
    expect([...panel.root.querySelectorAll('.set-tabs button')].map((b) => b.textContent)).toEqual(['AUDIO', 'VISUALS', 'GAMEPLAY', 'ACCESS', 'CONTROLS']);
    expect(panel.root.querySelector('.set-sect[data-sect="audio"]')?.classList.contains('hidden')).toBe(false);
    expect(panel.root.querySelector('.set-sect[data-sect="visuals"]')?.classList.contains('hidden')).toBe(true);
  });

  it('a toggle patches the matching setting', () => {
    const d = deps();
    const panel = buildSettingsPanel(d);
    const t = toggleInput(panel.root, 'Reduce motion');
    t.checked = true;
    t.dispatchEvent(new Event('change'));
    expect(d.patch).toHaveBeenCalledWith({ reduceMotion: true });
  });

  it('switches the visible section on tab click', () => {
    const panel = buildSettingsPanel(deps());
    ([...panel.root.querySelectorAll('.set-tabs button')].find((b) => b.textContent === 'VISUALS') as HTMLElement).click();
    expect(panel.root.querySelector('.set-sect[data-sect="visuals"]')?.classList.contains('hidden')).toBe(false);
    expect(panel.root.querySelector('.set-sect[data-sect="audio"]')?.classList.contains('hidden')).toBe(true);
  });

  it('key rebind: enter capture → press key → patch keymap + clear', () => {
    const d = deps();
    const panel = buildSettingsPanel(d);
    document.body.append(panel.root);
    const dashBtn = [...panel.root.querySelectorAll('.setting')].find((s) => s.querySelector('span')?.textContent === 'Dash')?.querySelector('button') as HTMLButtonElement;
    dashBtn.click();
    expect(d.setRebinding).toHaveBeenCalledWith('dash');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Q' }));
    expect(d.patch).toHaveBeenCalledWith({ keymap: expect.objectContaining({ dash: ['q'] }) });
    expect(d.setRebinding).toHaveBeenCalledWith(null);
  });

  it('syncCityMemory re-checks the toggle from the save', () => {
    let mem = false;
    const panel = buildSettingsPanel(deps({ cityMemory: () => mem }));
    expect(toggleInput(panel.root, 'City memory meter').checked).toBe(false);
    mem = true;
    panel.syncCityMemory();
    expect(toggleInput(panel.root, 'City memory meter').checked).toBe(true);
  });

  it('the Tutorial hints toggle patches tutorialHints', () => {
    const d = deps();
    const panel = buildSettingsPanel(d);
    const t = toggleInput(panel.root, 'Tutorial hints');
    expect(t.checked).toBe(true);
    t.checked = false;
    t.dispatchEvent(new Event('change'));
    expect(d.patch).toHaveBeenCalledWith({ tutorialHints: false });
  });

  it('Replay tutorial → onReplayTutorial, then the button disables', () => {
    const d = deps();
    const panel = buildSettingsPanel(d);
    const btn = [...panel.root.querySelectorAll('.setting button')].find((b) => b.textContent === 'Replay tutorial') as HTMLButtonElement;
    btn.click();
    expect(d.onReplayTutorial).toHaveBeenCalled();
    expect(btn.disabled).toBe(true);
  });

  it('DONE → onClose', () => {
    const d = deps();
    const panel = buildSettingsPanel(d);
    (panel.root.querySelector('.btn-primary') as HTMLElement).click();
    expect(d.onClose).toHaveBeenCalled();
  });
});

// ── Cloud save opt-in (account module, isolated from the settings UI) ─────────
// The Cloud-save row in settings.ts is gated on leaderboardEnabled() (BASE !== '').
// In test env VITE_LEADERBOARD_URL is unset → BASE = '' → the row is absent.
// We test (a) the row is absent when no backend is configured, and
//         (b) the underlying account.optIn/optOut/optedIn contract works correctly.
describe('Cloud save row + account opt-in', () => {
  beforeEach(() => {
    // ensure a clean localStorage state for account keys
    try { localStorage.clear(); } catch { /* ignore in environments without localStorage */ }
  });

  it('Cloud save row is absent when no backend is configured (leaderboardEnabled()=false)', () => {
    const panel = buildSettingsPanel(deps());
    // leaderboardEnabled() is false in test env (BASE='') so the row must not render
    expect(panel.root.querySelector('[data-testid="cloud-save-row"]')).toBeNull();
  });

  it('account.optedIn() is false by default', () => {
    expect(account.optedIn()).toBe(false);
  });

  it('account.optIn() persists the opt-in flag', () => {
    account.optIn();
    expect(account.optedIn()).toBe(true);
  });

  it('account.optOut() clears the opt-in flag', () => {
    account.optIn();
    account.optOut();
    expect(account.optedIn()).toBe(false);
  });
});
