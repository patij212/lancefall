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
}

export function leaderboardEnabled(): boolean {
  return BASE.length > 0;
}

/** Submit a score. Fire-and-forget — resolves immediately for the caller and
 *  never throws; failures (offline, server down) are swallowed by design. */
export async function submitScore(p: SubmitPayload): Promise<void> {
  if (!BASE || !p.name || p.score <= 0) return;
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

/** Fetch the top entries for a mode (optionally a specific daily date). Returns
 *  [] on any failure so callers can render an empty/offline state. */
export async function fetchLeaderboard(mode: string, daily?: string): Promise<ScoreEntry[]> {
  if (!BASE) return [];
  try {
    const q = new URLSearchParams({ mode });
    if (daily) q.set('daily', daily);
    const r = await fetch(`${BASE}/leaderboard?${q.toString()}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { entries?: ScoreEntry[] };
    return Array.isArray(j.entries) ? j.entries.slice(0, 100) : [];
  } catch {
    return [];
  }
}
