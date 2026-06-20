// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { buildAccountPanel, type AccountPanelDeps } from './account';
import * as account from '../account';

// Hoist the api mock so vi.mock can reference it.
const { leaderboardEnabled } = vi.hoisted(() => ({
  leaderboardEnabled: vi.fn(() => true),
}));

// The panel now imports leaderboardEnabled from ../api to gate the "unavailable" note.
// Default: backend is present (leaderboardEnabled=true).
vi.mock('../api', () => ({ leaderboardEnabled }));

const makeDeps = (over: Partial<AccountPanelDeps> = {}): AccountPanelDeps => ({
  onSignIn: vi.fn(),
  onClose: vi.fn(),
  onDelete: vi.fn().mockResolvedValue(undefined),
  ...over,
});

const mockSave = {} as import('../save').SaveData;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  leaderboardEnabled.mockReturnValue(true); // reset between tests
});

describe('buildAccountPanel', () => {
  beforeEach(() => {
    // Backend is present (leaderboardEnabled=true) and player is anonymous.
    leaderboardEnabled.mockReturnValue(true);
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: false, // opt-in state is irrelevant — panel gates on leaderboardEnabled() now
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

  it('anonymous state: shows both sign-in buttons (even when not opted-in)', () => {
    // leaderboardEnabled=true but accountState.enabled=false (not opted in yet).
    // The panel must still show the buttons — clicking them is the opt-in gesture.
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
    // No backend configured → inert unavailable note regardless of opt-in state.
    leaderboardEnabled.mockReturnValue(false);
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    expect(panel.root.textContent).toContain('unavailable');
    const signInBtns = [...panel.root.querySelectorAll('button')].filter(
      (b) => b.textContent?.includes('Discord') || b.textContent?.includes('Google'),
    );
    expect(signInBtns).toHaveLength(0);
  });

  it('linked state: shows delete button', () => {
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: true,
      kind: 'linked',
      name: 'ACE',
      verified: true,
    });
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    const deleteBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('delete'),
    );
    expect(deleteBtn).toBeDefined();
  });

  it('linked state: delete button shows inline confirm, not immediate deletion', () => {
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: true,
      kind: 'linked',
      name: 'ACE',
      verified: true,
    });
    const d = makeDeps();
    const panel = buildAccountPanel(d);
    panel.open(mockSave);
    const deleteBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('delete'),
    ) as HTMLButtonElement;
    deleteBtn.click();
    // onDelete must NOT be called yet — confirm step should appear first
    expect(d.onDelete).not.toHaveBeenCalled();
    // Confirm button should now be visible
    const confirmBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('confirm'),
    );
    expect(confirmBtn).toBeDefined();
  });

  it('linked state: confirming deletion calls deps.onDelete', () => {
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: true,
      kind: 'linked',
      name: 'ACE',
      verified: true,
    });
    const d = makeDeps();
    const panel = buildAccountPanel(d);
    panel.open(mockSave);
    const deleteBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('delete'),
    ) as HTMLButtonElement;
    deleteBtn.click();
    const confirmBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('confirm'),
    ) as HTMLButtonElement;
    confirmBtn.click();
    expect(d.onDelete).toHaveBeenCalled();
  });

  it('linked state: cancel from confirm hides the confirm, no deletion', () => {
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: true,
      kind: 'linked',
      name: 'ACE',
      verified: true,
    });
    const d = makeDeps();
    const panel = buildAccountPanel(d);
    panel.open(mockSave);
    const deleteBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('delete'),
    ) as HTMLButtonElement;
    deleteBtn.click();
    const cancelBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('cancel'),
    ) as HTMLButtonElement;
    cancelBtn.click();
    expect(d.onDelete).not.toHaveBeenCalled();
    // Confirm row gone, delete button back
    const confirmBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('confirm'),
    );
    expect(confirmBtn).toBeUndefined();
  });

  it('anonymous state: shows privacy note', () => {
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    const note = panel.root.querySelector('.account-privacy');
    expect(note).not.toBeNull();
    expect(note?.textContent).toContain('Privacy');
    expect(note?.textContent).toContain('No third-party analytics');
  });

  it('linked state: shows privacy note', () => {
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: true,
      kind: 'linked',
      name: 'ACE',
      verified: true,
    });
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    const note = panel.root.querySelector('.account-privacy');
    expect(note).not.toBeNull();
    expect(note?.textContent).toContain('Privacy');
  });

  it('linked state: confirm delete button has btn-danger class', () => {
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: true,
      kind: 'linked',
      name: 'ACE',
      verified: true,
    });
    const d = makeDeps();
    const panel = buildAccountPanel(d);
    panel.open(mockSave);
    const deleteBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('delete'),
    ) as HTMLButtonElement;
    deleteBtn.click();
    const confirmBtn = panel.root.querySelector('.account-confirm-btn') as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn.classList.contains('btn-danger')).toBe(true);
  });

  it('anonymous state without opted-in: no delete button shown', () => {
    // anonymous + not opted in → nothing to delete
    vi.spyOn(account, 'accountState').mockReturnValue({
      enabled: false,
      kind: 'anon',
      name: null,
      verified: false,
    });
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    const deleteBtn = [...panel.root.querySelectorAll('button')].find(
      (b) => b.textContent?.toLowerCase().includes('delete'),
    );
    expect(deleteBtn).toBeUndefined();
  });

  it('open() can be called multiple times (repaints in place)', () => {
    vi.spyOn(account, 'accountState')
      .mockReturnValueOnce({ enabled: false, kind: 'anon', name: null, verified: false })
      .mockReturnValueOnce({ enabled: true, kind: 'linked', name: 'LANCE', verified: true });
    const panel = buildAccountPanel(makeDeps());
    panel.open(mockSave);
    expect(panel.root.textContent).toContain('anonymously');
    panel.open(mockSave);
    expect(panel.root.textContent).toContain('LANCE');
  });
});
