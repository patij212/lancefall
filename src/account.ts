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

/** Adopt a server/merged save without re-triggering the noteChange flush timer. */
export function adopt(save: SaveData): void { adopting = true; try { saveSave(save); } finally { adopting = false; } }

function ls(k: string): string { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } }
function setLs(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

export function optedIn(): boolean { return ls(OPT_KEY) === '1'; }
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
    const j = (await r.json()) as { session?: string; save?: SaveData | null; rev?: number; updatedAt?: number };
    if (typeof j.session === 'string') { session = j.session; setLs(SESSION_KEY, session); }
    rev = typeof j.rev === 'number' ? j.rev : 0;
    const cloud = (j.save && typeof j.save === 'object') ? (j.save as SaveData) : null;
    const cloudAt = typeof j.updatedAt === 'number' ? j.updatedAt : 0;
    if (cloud) {
      const merged = mergeCloud(loadSave(), cloud, savedAt(), cloudAt);
      adopt(merged); // adopt without re-triggering the flush timer
      void flush();  // push the merged result back so the cloud has the union too
    }
  } catch { /* offline / blocked — stay local */ }
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

/** One-time wiring: register the save listener + boot the session. Call once from main.ts. */
export function init(): void {
  if (!accountEnabled()) return;
  void boot();
}
