// Online leaderboard client — OFFLINE-FIRST and fire-and-forget. The game must
// work flawlessly with no backend configured: when VITE_LEADERBOARD_URL is unset
// every call is a no-op (submit silently drops, fetches return []), and nothing
// ever blocks the game loop on the network. Point it at a deployed Cloudflare
// Worker (see worker/README.md) to light up global boards + a shared daily seed.

// Configured at build time. Empty string ⇒ leaderboards are simply off.
const BASE = ((import.meta.env?.VITE_LEADERBOARD_URL as string | undefined) ?? '').replace(/\/+$/, '');

export interface ScoreEntry {
  name: string;
  score: number;
  wave: number;
  combo: number;
  heat: number;
  rank?: number;
}

export interface SubmitPayload {
  mode: string;
  name: string;
  score: number;
  wave: number;
  combo: number;
  heat: number;
  daily?: string; // YYYY-MM-DD for daily runs (server scopes the board by day)
  clearTime?: number; // §4 M3 — victory clear time (winnable modes); server may rank by it
  hitsTaken?: number; // §4 M3 — would-be-fatal hits (0 = flawless); winnable modes only
}

export function leaderboardEnabled(): boolean {
  return BASE.length > 0;
}

/** Submit a score. Fire-and-forget — resolves immediately for the caller and
 *  never throws; failures (offline, server down) are swallowed by design. */
export async function submitScore(p: SubmitPayload): Promise<void> {
  // a blank handle is NOT dropped — the worker aggregates it under a single 'ANON'
  // entry (sanitizeName fallback), so a handle-less player's best score still ranks
  // (and the game nudges them to set a handle to claim it). Only no-backend / no-score
  // short-circuit here.
  if (!BASE || p.score <= 0) return;
  try {
    await fetch(`${BASE}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(p),
      keepalive: true, // let it complete even as the page transitions
    });
  } catch {
    /* offline / blocked — the game neither waits nor cares */
  }
}

// ── §v7 achievement rarity ──────────────────────────────────────────────────────────
export interface AchRarity {
  /** distinct devices that have reported any achievement (the rarity denominator) */
  players: number;
  /** achievement id → # of distinct devices that have unlocked it */
  holders: Record<string, number>;
}

/** A stable, anonymous device token (random base36) in localStorage — used ONLY to dedupe
 *  achievement-rarity reports so a player who plays 100 runs counts once per achievement.
 *  Not PII, never sent anywhere but the rarity endpoint. '' if storage is unavailable. */
function deviceId(): string {
  try {
    const k = 'lancefall.device';
    let id = localStorage.getItem(k) ?? '';
    if (!/^[a-z0-9]{8,40}$/.test(id)) {
      id = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24);
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return '';
  }
}

/** Report the player's unlocked-achievement set for the anonymous rarity aggregate.
 *  Fire-and-forget — resolves immediately, never throws, no-op when offline / no backend. */
export async function submitAchievements(ids: string[]): Promise<void> {
  if (!BASE || !ids.length) return;
  const device = deviceId();
  if (!device) return;
  try {
    await fetch(`${BASE}/ach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device, ids }),
      keepalive: true,
    });
  } catch {
    /* offline / blocked — the rarity stat simply stays as-is */
  }
}

/** Fetch the global achievement-rarity aggregate. Returns null on any failure / no backend
 *  so the STATS panel just omits the "% of players" line when offline. */
export async function fetchAchievementRarity(): Promise<AchRarity | null> {
  if (!BASE) return null;
  try {
    const r = await fetch(`${BASE}/ach`);
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<AchRarity>;
    if (typeof j.players !== 'number' || !j.holders || typeof j.holders !== 'object') return null;
    return { players: j.players, holders: j.holders as Record<string, number> };
  } catch {
    return null;
  }
}

/** Fetch the top entries for a mode (optionally a specific daily date). Returns
 *  [] on any failure so callers can render an empty/offline state. */
export async function fetchLeaderboard(mode: string, daily?: string, weekly = false): Promise<ScoreEntry[]> {
  if (!BASE) return [];
  try {
    const q = new URLSearchParams({ mode });
    if (daily) q.set('daily', daily);
    else if (weekly) q.set('scope', 'weekly'); // this-week board (worker filters by ts)
    const r = await fetch(`${BASE}/leaderboard?${q.toString()}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { entries?: ScoreEntry[] };
    return Array.isArray(j.entries) ? j.entries.slice(0, 100) : [];
  } catch {
    return [];
  }
}
