// Optional, opt-in cloud save. OFFLINE-FIRST + fire-and-forget — mirrors api.ts exactly:
// with no VITE_LEADERBOARD_URL, never opted in, offline, or on any non-2xx, this is a complete
// no-op and the game stays pure-localStorage. Never blocks the game loop; never throws.
import { mergeSaves } from './cloudMerge';
import { loadSave, saveSave, savedAt, type SaveData } from './save';
import { deviceId } from './api';

const BASE = ((import.meta.env?.VITE_LEADERBOARD_URL as string | undefined) ?? '').replace(/\/+$/, '');
const OPT_KEY = 'lancefall.cloud';
const SESSION_KEY = 'lancefall.session';
const FLUSH_DEBOUNCE_MS = 30_000;

let session = '';
let rev = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleWired = false;
let adopting = false;

export interface AccountState {
  enabled: boolean;
  kind: 'anon' | 'linked';
  name: string | null;
  verified: boolean;
}

let _accountState: AccountState = { enabled: false, kind: 'anon', name: null, verified: false };

/** Adopt a server/merged save without re-triggering the noteChange flush timer. */
export function adopt(save: SaveData): void { adopting = true; try { saveSave(save); } finally { adopting = false; } }

function ls(k: string): string { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } }
function setLs(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

export function optedIn(): boolean { return ls(OPT_KEY) === '1'; }
/** Current session token, or '' if not established / storage unavailable. */
export function getSession(): string { return ls(SESSION_KEY); }
export function optIn(): void { setLs(OPT_KEY, '1'); }
export function optOut(): void { setLs(OPT_KEY, '0'); }
export function accountEnabled(): boolean { return BASE.length > 0 && optedIn(); }

/** Pure boot-merge step (separately tested): local unchanged when there's no cloud save. */
export function mergeCloud(local: SaveData, cloud: SaveData | null, localAt: number, cloudAt: number): SaveData {
  if (!cloud) return local;
  return mergeSaves(local, cloud, localAt, cloudAt);
}

export async function boot(): Promise<void> {
  if (!accountEnabled()) return;
  session = ls(SESSION_KEY);
  try {
    const r = await fetch(`${BASE}/hello`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: deviceId(), session: session || undefined }),
    });
    if (!r.ok) return;
    const j = (await r.json()) as { session?: string; save?: SaveData | null; rev?: number; updatedAt?: number; account?: { kind?: string; name?: string | null; verified?: boolean } };
    if (typeof j.session === 'string') { session = j.session; setLs(SESSION_KEY, session); }
    rev = typeof j.rev === 'number' ? j.rev : 0;
    if (j.account && typeof j.account === 'object') {
      _accountState = {
        enabled: true,
        kind: j.account.kind === 'linked' ? 'linked' : 'anon',
        name: typeof j.account.name === 'string' ? j.account.name : null,
        verified: j.account.verified === true,
      };
    }
    const cloud = (j.save && typeof j.save === 'object') ? (j.save as SaveData) : null;
    const cloudAt = typeof j.updatedAt === 'number' ? j.updatedAt : 0;
    if (cloud) {
      const merged = mergeCloud(loadSave(), cloud, savedAt(), cloudAt);
      adopt(merged); // adopt without re-triggering the flush timer
      void flush();  // push the merged result back so the cloud has the union too
    }
  } catch { /* offline / blocked — stay local */ }
}

/** Navigate to the OAuth provider's login page.
 *  Sign-in implies opt-in — clicking a sign-in button IS the consent gesture.
 *  No-op when there is no backend (BASE=''); the device token is always forwarded
 *  so the worker can resolve/create the anon account even with no prior session. Never throws. */
export function startLink(provider: 'discord' | 'google'): void {
  try {
    if (!BASE) return;
    optIn(); // sign-in implies enabling cloud save
    const url = `${BASE}/auth/${provider}/start?session=${encodeURIComponent(session)}&device=${encodeURIComponent(deviceId())}&ret=${encodeURIComponent(location.origin)}`;
    location.assign(url);
  } catch { /* ignore */ }
}

/** Inspect location.hash for OAuth return tokens. Stores the new session and strips the hash.
 *  Returns true if a token was adopted (caller should re-run boot()), false otherwise.
 *  Safe to call in happy-dom / SSR — all DOM access is guarded. Never throws. */
export function adoptFragmentSession(): boolean {
  try {
    const hash = (typeof location !== 'undefined' ? location.hash : '') ?? '';
    // Error path: strip + return false
    if (hash.includes('lf-account-error')) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* happy-dom */ }
      return false;
    }
    // Success path: extract token
    const m = hash.match(/[#&]lf-account=([^&]+)/);
    if (!m) return false;
    const token = decodeURIComponent(m[1]);
    setLs(SESSION_KEY, token);
    session = token;
    rev = 0; // a fresh /hello will re-sync
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* happy-dom */ }
    return true;
  } catch { return false; }
}

/** Current account state (defaults to anonymous until boot() sets it from /hello). */
export function accountState(): AccountState {
  return { ..._accountState, enabled: accountEnabled() };
}

export function noteChange(): void {
  if (adopting) return;
  if (!accountEnabled()) return;
  wireLifecycle();
  if (flushTimer) return; // coalesce: N changes in the window → one flush
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, FLUSH_DEBOUNCE_MS);
}

export async function flush(): Promise<void> {
  if (!accountEnabled() || !session) return;
  try {
    const r = await fetch(`${BASE}/save`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
      body: JSON.stringify({ save: loadSave(), rev, writtenAt: savedAt() }),
      keepalive: true,
    });
    if (!r.ok) return;
    const j = (await r.json()) as { save?: SaveData; rev?: number };
    if (typeof j.rev === 'number') rev = j.rev;
    if (j.save && typeof j.save === 'object') adopt(j.save as SaveData);
  } catch { /* offline / blocked — try again on the next change */ }
}

function wireLifecycle(): void {
  if (lifecycleWired || typeof document === 'undefined') return;
  lifecycleWired = true;
  const onHide = () => { if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; } void flush(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide(); });
  window.addEventListener('pagehide', onHide);
}

/** Delete the current account and all cloud data. Returns true on success, false on any
 *  failure (offline, no backend, no session). Never throws. */
export async function deleteAccount(): Promise<boolean> {
  try {
    if (!accountEnabled() || !session) return false;
    const r = await fetch(`${BASE}/account`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${session}` },
    });
    if (!r.ok) return false;
    // Clear local account state
    session = '';
    rev = 0;
    setLs(SESSION_KEY, '');
    optOut();
    _accountState = { enabled: accountEnabled(), kind: 'anon', name: null, verified: false };
    return true;
  } catch { return false; }
}

/** One-time wiring: register the save listener + boot the session. Call once from main.ts. */
export function init(): void {
  if (!accountEnabled()) return;
  void boot();
}
