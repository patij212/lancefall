// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { buildAccountPanel, type AccountPanelDeps } from './account';
import * as account from '../account';

const makeDeps = (over: Partial<AccountPanelDeps> = {}): AccountPanelDeps => ({
  onSignIn: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

const mockSave = {} as import('../save').SaveData;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('buildAccountPanel', () => {
  beforeEach(() => {
    // Stub accountState to return an online-anonymous state by default (enabled=true so
    // the sign-in buttons render; in real prod this means cloud save is configured + opted-in).
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: true,
      kind: 'anon',
      name: null,
      verified: false,
    });
  });

  it('renders the panel shell with ACCOUNT title', () => {
    const panel = buildAccountPanel(makeDeps());
    expect(panel.root.classList.contains('screen')).toBe(true);
    expect(panel.root.classList.contains('screen-modal')).toBe(true);
    expect(panel.root.classList.contains('hidden')).toBe(true);
    expect(panel.root.querySelector('.panel')).not.toBeNull();
    expect(panel.root.querySelector('.panel-head-title')?.textContent).toBe('ACCOUNT');
  });

  it('anonymous state: shows both sign-in buttons', () => {
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    const btns = [...panel.root.querySelectorAll('button')].filter(
      (b) => b.textContent?.includes('Discord') || b.textContent?.includes('Google'),
    );
    expect(btns).toHaveLength(2);
  });

  it('anonymous state: Discord sign-in button calls onSignIn("discord")', () => {
    const d = makeDeps();
    const panel = buildAccountPanel(d);
    panel.open(mockSave);
    const btn = [...panel.root.querySelectorAll('button')].find((b) => b.textContent?.includes('Discord')) as HTMLButtonElement;
    btn.click();
    expect(d.onSignIn).toHaveBeenCalledWith('discord');
  });

  it('anonymous state: Google sign-in button calls onSignIn("google")', () => {
    const d = makeDeps();
    const panel = buildAccountPanel(d);
    panel.open(mockSave);
    const btn = [...panel.root.querySelectorAll('button')].find((b) => b.textContent?.includes('Google')) as HTMLButtonElement;
    btn.click();
    expect(d.onSignIn).toHaveBeenCalledWith('google');
  });

  it('anonymous state: shows anonymous status text', () => {
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    expect(panel.root.textContent).toContain('anonymously');
  });

  it('linked state: shows verified name + hides sign-in buttons', () => {
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: true,
      kind: 'linked',
      name: 'ACE',
      verified: true,
    });
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    expect(panel.root.textContent).toContain('ACE');
    expect(panel.root.textContent).toContain('✓');
    const signInBtns = [...panel.root.querySelectorAll('button')].filter(
      (b) => b.textContent?.includes('Discord') || b.textContent?.includes('Google'),
    );
    expect(signInBtns).toHaveLength(0);
  });

  it('DONE button calls onClose', () => {
    const d = makeDeps();
    const panel = buildAccountPanel(d);
    panel.open(mockSave);
    const doneBtn = [...panel.root.querySelectorAll('button')].find((b) => b.textContent === 'DONE') as HTMLButtonElement;
    doneBtn.click();
    expect(d.onClose).toHaveBeenCalled();
  });

  it('when leaderboardEnabled()=false shows offline note and no sign-in buttons', () => {
    // accountState.enabled=false (leaderboardEnabled → false)
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: false,
      kind: 'anon',
      name: null,
      verified: false,
    });
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    expect(panel.root.textContent).toContain('unavailable');
    const signInBtns = [...panel.root.querySelectorAll('button')].filter(
      (b) => b.textContent?.includes('Discord') || b.textContent?.includes('Google'),
    );
    expect(signInBtns).toHaveLength(0);
  });

  it('open() can be called multiple times (repaints in place)', () => {
    // override the beforeEach stub with a sequence
    vi.spyOn(account, 'accountState')
      .mockReturnValueOnce({ enabled: true, kind: 'anon', name: null, verified: false })
      .mockReturnValueOnce({ enabled: true, kind: 'linked', name: 'LANCE', verified: true });
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    expect(panel.root.textContent).toContain('anonymously');
    panel.open(mockSave);
    expect(panel.root.textContent).toContain('LANCE');
  });
});
