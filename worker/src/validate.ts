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
  // trim BEFORE the 16-cap (mirrors the client's sanitizeHandle) so leading/trailing spaces
  // can't eat real characters; blank/all-junk → 'ANON' (the worker's display name for blanks).
  return (
    String(n ?? '')
      .replace(/[^\w \-]/g, '')
      .trim()
      .slice(0, 16) || 'ANON'
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

// ── §v7 achievement-rarity aggregate ──────────────────────────────────────────────
// An anonymous "% of players who have this" stat. To make rarity = holders / players
// count UNIQUE reporters (not raw POSTs), the client sends a stable random device token;
// the worker stores one (device, achievement) row each, append-only (achievements never
// un-unlock). The token is not PII — a random base36 string scoped to the rarity endpoint.

/** A client-generated device token used ONLY to dedupe rarity reports. Accept 8–40 chars
 *  of [a-z0-9] (lowercased); reject anything else. Returns the clean token or null. */
export function sanitizeDevice(d: unknown): string | null {
  const s = String(d ?? '').toLowerCase();
  return /^[a-z0-9]{8,40}$/.test(s) ? s : null;
}

/** Sanitize a reported achievement-id set: keep [a-z0-9_]{1,40} ids, dedupe, cap to 64
 *  (the roster is ~28; the cap is a hard anti-bloat ceiling). Pure + total. */
export function sanitizeAchIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x === 'string' && /^[a-z0-9_]{1,40}$/.test(x)) seen.add(x);
    if (seen.size >= 64) break;
  }
  return [...seen];
}

// ── §P3 anti-cheat constants ────────────────────────────────────────────────────────────
// All three are exported and tested in src/workerValidate.test.ts (regression guard).

/** Max score submissions per linked account within ACCOUNT_RATE_WINDOW_MS (D1 count, no KV). */
export const ACCOUNT_RATE_LIMIT = 10;

/** Rate-limit window in ms (60 s). */
export const ACCOUNT_RATE_WINDOW_MS = 60_000;

/** Dedupe window in ms (5 min): an exact-duplicate resubmit within this window is silently
 *  ignored (ok:true, deduped:true) so a retry-on-disconnect doesn't insert twice. */
export const DEDUPE_WINDOW_MS = 300_000;

/** Edge-cache TTL (seconds) for GET /ach — rarity drifts slowly, so cache it far longer
 *  than a live board; 5 minutes keeps the GROUP BY scan off D1 under any read spike. */
export const ACH_CACHE_TTL = 300;

/** Edge-cache TTL (seconds) for GET /leaderboard. Repeated board reads serve from the
 *  Cloudflare edge instead of re-running the GROUP BY scan over D1 — D1's free-tier
 *  rows-read budget is the first ceiling, so this is the single biggest cheap win for
 *  surviving a launch spike. Short enough that a new high score shows within a minute. */
export const BOARD_CACHE_TTL = 45;

/** Origin-agnostic edge-cache key for a /leaderboard request. Depends ONLY on the params
 *  that change the result — mode, scope (weekly vs all-time), daily date — normalized and
 *  ordered, so every player shares ONE cached board and a stray/extra query param can't
 *  fragment (or poison) the cache. CORS is re-attached per request and never cached. */
export function boardCacheKey(url: URL): string {
  const mode = url.searchParams.get('mode') ?? '';
  const scope = url.searchParams.get('scope') === 'weekly' ? 'weekly' : '';
  const daily = url.searchParams.get('daily') ?? '';
  return `${url.origin}/leaderboard?mode=${encodeURIComponent(mode)}&scope=${scope}&daily=${encodeURIComponent(daily)}`;
}

/** Returns true for origins allowed to make cross-origin requests to the Worker:
 *  the LANCEFALL prod + preview subdomain + local dev (localhost / 127.0.0.1). */
export function isAllowedOrigin(origin: string): boolean {
  return (
    /^https:\/\/([a-z0-9-]+\.)?lancefall\.pages\.dev$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  );
}

/** CORS headers scoped to the LANCEFALL origins (prod + preview deploys + local dev),
 *  reflecting an allowed Origin and otherwise defaulting to the prod site so the game
 *  keeps working while other sites can't submit on a visitor's behalf. */
export function corsHeaders(origin: string): Record<string, string> {
  const ok = isAllowedOrigin(origin);
  return {
    'access-control-allow-origin': ok ? origin : 'https://lancefall.pages.dev',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    vary: 'Origin',
  };
}
