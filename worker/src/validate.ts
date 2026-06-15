// Pure validation for the LANCEFALL leaderboard worker — extracted so it can be unit-tested
// in the main vitest suite (the worker has no D1/Cloudflare deps in here). The board is
// deliberately a "community (unverified)" board: the game is client-authoritative, so this
// only raises the floor — it rejects payloads no real run could produce, without ever
// rejecting a genuine run.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// MUST mirror the mode ids in src/modes.ts MODES (the worker can't import the client).
// 'weekly' is the WEEKLY CHALLENGE — a normal (non-daily) board read this-week via scope=weekly.
export const MODES = new Set(['endless', 'arena', 'daily', 'weekly', 'nightmare', 'bossrush', 'longestday']);

export function sanitizeName(n: unknown): string {
  return (
    String(n ?? '')
      .replace(/[^\w \-]/g, '')
      .slice(0, 16)
      .trim() || 'ANON'
  );
}

/** Valid YYYY-MM-DD that isn't in the future (1 day of timezone slack). */
export function validDaily(d: string, now: number): boolean {
  if (!DATE_RE.test(d)) return false;
  const t = Date.parse(d + 'T00:00:00Z');
  return Number.isFinite(t) && t <= now + 86_400_000;
}

/** Start-of-week (Monday 00:00 UTC) in ms — the weekly-board boundary. */
export function weekStartMs(now: number): number {
  const d = new Date(now);
  const sinceMonday = (d.getUTCDay() + 6) % 7; // 0=Sun..6=Sat → days since Monday
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday);
}

/** Absolute + wave-relative plausibility. Generous by design — a genuine run never trips
 *  it; it only rejects the devtools-crafted "49M on wave 1" class of payload that makes a
 *  client-authoritative board worthless. score must also exceed 0 and fit the hard caps. */
export function capsOk(score: number, wave: number, combo: number, heat: number): boolean {
  if (![score, wave, combo, heat].every((n) => Number.isFinite(n))) return false;
  if (score <= 0 || score > 50_000_000) return false;
  if (wave < 0 || wave > 2000 || combo < 0 || combo > 10_000) return false;
  // an extremely loose ceiling on points-per-progress: half a million baseline, plus
  // generous per-wave / per-combo / per-heat allowances. Real runs sit far under this.
  const plausibleMax = 500_000 + wave * 800_000 + combo * 50_000 + heat * 2_000_000;
  return score <= plausibleMax;
}

/** CORS headers scoped to the LANCEFALL origins (prod + preview deploys + local dev),
 *  reflecting an allowed Origin and otherwise defaulting to the prod site so the game
 *  keeps working while other sites can't submit on a visitor's behalf. */
export function corsHeaders(origin: string): Record<string, string> {
  const ok =
    /^https:\/\/([a-z0-9-]+\.)?lancefall\.pages\.dev$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  return {
    'access-control-allow-origin': ok ? origin : 'https://lancefall.pages.dev',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}
