// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as account from './account';
import { defaultSave } from './save';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('account — offline-first (no backend)', () => {
  it('accountEnabled is false with no VITE_LEADERBOARD_URL (test env)', () => {
    account.optIn();
    expect(account.accountEnabled()).toBe(false); // BASE is '' in vitest
  });
  it('boot is a no-op that never throws when offline', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(account.boot()).resolves.toBeUndefined();
    expect(f).not.toHaveBeenCalled(); // never opted in / no backend ⇒ zero requests
  });
  it('flush is a no-op when not enabled', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(account.flush()).resolves.toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('account — opt-in gating', () => {
  it('optIn/optOut toggle the persisted flag', () => {
    expect(account.optedIn()).toBe(false);
    account.optIn();
    expect(account.optedIn()).toBe(true);
    account.optOut();
    expect(account.optedIn()).toBe(false);
  });
});

import { mergeCloud, adopt, noteChange } from './account';
import { onSaveWrite } from './save';
import * as accountMod from './account';

describe('account — adopt re-entry guard (FIX 1 regression)', () => {
  it('adopt() with noteChange as the save listener does NOT schedule a flush timer (re-entry suppressed)', () => {
    // Production wiring: onSaveWrite(noteChange). Stub accountEnabled to true so that
    // noteChange would proceed to wireLifecycle + setTimeout if the adopting guard were absent.
    // With the guard: adopting=true during adopt() → noteChange returns at the FIRST LINE → 0 setTimeouts.
    // Without the guard: noteChange proceeds through to setTimeout → test FAILS (1 call expected).
    vi.spyOn(accountMod, 'accountEnabled').mockReturnValue(true);
    onSaveWrite(noteChange);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    adopt(defaultSave());
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    onSaveWrite(null);
  });
});

describe('account — mergeCloud (pure boot-merge step)', () => {
  it('returns local unchanged when there is no cloud save', () => {
    const l = { ...defaultSave(), highScore: 7 };
    expect(mergeCloud(l, null, 1, 2)).toEqual(l);
  });
  it('merges cloud into local without losing progress', () => {
    const l = { ...defaultSave(), highScore: 7, achievements: ['a'] };
    const c = { ...defaultSave(), highScore: 9, achievements: ['b'] };
    const m = mergeCloud(l, c, 1, 2);
    expect(m.highScore).toBe(9);
    expect(new Set(m.achievements)).toEqual(new Set(['a', 'b']));
  });
});
