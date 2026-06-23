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

describe('account — init', () => {
  it('does not fire onSettled when accounts are disabled (no double-assign)', () => {
    // BASE is '' in vitest ⇒ accountEnabled() is false ⇒ init early-returns before boot/.finally.
    // main.ts relies on this contract: the disabled path must NOT run the callback (it assigns the
    // callsign inline in its else-branch instead, so the callback firing here would double-run it).
    let called = false;
    account.init(() => { called = true; });
    expect(called).toBe(false);
  });
  it('is callable with no argument (back-compat)', () => {
    expect(() => account.init()).not.toThrow();
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

describe('account — OAuth fragment adoption', () => {
  beforeEach(() => {
    location.hash = '';
  });
  it('adopts + strips an lf-account fragment and stores the session', () => {
    location.hash = '#lf-account=sometoken.sig&linked=1';
    expect(account.adoptFragmentSession()).toBe(true);
    expect(localStorage.getItem('lancefall.session')).toBe('sometoken.sig');
    expect(location.hash).not.toContain('lf-account');
  });
  it('is a no-op when there is no fragment', () => {
    location.hash = '';
    expect(account.adoptFragmentSession()).toBe(false);
  });
  it('strips the error fragment and stays anon', () => {
    location.hash = '#lf-account-error=1';
    expect(account.adoptFragmentSession()).toBe(false);
    expect(location.hash).not.toContain('lf-account-error');
  });
});

describe('account — accountState default', () => {
  it('defaults to anonymous', () => {
    expect(account.accountState()).toMatchObject({ kind: 'anon', name: null, verified: false });
  });
});

describe('account — startLink offline no-op', () => {
  it('does not navigate when no backend / not opted in', () => {
    // BASE is '' in vitest → startLink must do nothing (no throw)
    expect(() => account.startLink('discord')).not.toThrow();
  });
});

describe('account — deleteAccount (offline no-op)', () => {
  it('returns false without throwing when offline (BASE is empty)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    // BASE is '' in vitest env → deleteAccount is a no-op
    const result = await account.deleteAccount();
    expect(result).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it('never throws even if fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net fail')));
    await expect(account.deleteAccount()).resolves.toBe(false);
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

describe('account — signOut + onAccountChange (live login/logout reflection)', () => {
  it('signOut returns to anonymous, opts out, and clears the session', () => {
    account.optIn();
    localStorage.setItem('lancefall.session', 'sometoken.sig');
    account.signOut();
    expect(account.optedIn()).toBe(false);
    expect(account.getSession()).toBe('');
    expect(account.accountState().kind).toBe('anon');
    expect(account.accountState().name).toBe(null);
  });
  it('onAccountChange fires when the account state changes (e.g. signOut)', () => {
    const spy = vi.fn();
    account.onAccountChange(spy);
    account.signOut();
    expect(spy).toHaveBeenCalled();
    account.onAccountChange(null); // unregister so it can't bleed into later tests
  });
  it('signOut never throws', () => {
    expect(() => account.signOut()).not.toThrow();
  });
});
