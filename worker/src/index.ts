// LANCEFALL leaderboard — a tiny Cloudflare Worker backed by D1.
// Endpoints (JSON, CORS scoped to the LANCEFALL origins):
//   POST /score        { mode, name, score, wave, combo, heat, daily? }  -> { ok }
//   GET  /leaderboard?mode=<m>[&daily=YYYY-MM-DD][&scope=weekly]         -> { entries }
//   POST /ach          { device, ids: string[] }                        -> { ok }
//   GET  /ach                                                           -> { players, holders }
//   GET  /daily                                                          -> { seed, date }
//
// The game is client-authoritative, so this is a COMMUNITY (unverified) board: scores
// can't be cryptographically trusted on a zero-friction casual board. We apply pragmatic
// sanity + plausibility caps (validate.ts) and per-handle best-only aggregation rather than
// full replay verification (which is infeasible — the ghost is a position trace, not inputs).
import { MODES, DATE_RE, sanitizeName, validDaily, weekStartMs, capsOk, corsHeaders, boardCacheKey, BOARD_CACHE_TTL, sanitizeDevice, sanitizeAchIds, ACH_CACHE_TTL } from './validate';

export interface Env {
  DB: D1Database;
  /** optional KV namespace for IP rate-limiting; if unbound, limiting is skipped */
  RL?: KVNamespace;
}

/** Soft IP rate limit via KV (eventually-consistent, best-effort). Allows all if
 *  KV isn't configured, so the worker deploys and runs without it. */
async function rateOk(env: Env, ip: string, bucket: string, limit: number): Promise<boolean> {
  if (!env.RL) return true;
  const key = `rl:${bucket}:${ip}`;
  const cur = parseInt((await env.RL.get(key)) || '0', 10);
  if (cur >= limit) return false;
  await env.RL.put(key, String(cur + 1), { expirationTtl: 60 });
  return true;
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

interface ScoreRow {
  name: string;
  score: number;
  wave: number;
  combo: number;
  heat: number;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const ip = req.headers.get('CF-Connecting-IP') || 'anon';
    const cors = corsHeaders(req.headers.get('Origin') || '');

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // ── submit a score ──
    if (req.method === 'POST' && url.pathname === '/score') {
      if (!(await rateOk(env, ip, 'post', 20))) return json({ error: 'rate limited' }, 429, cors);
      let b: Record<string, unknown>;
      try {
        b = (await req.json()) as Record<string, unknown>;
      } catch {
        return json({ error: 'bad json' }, 400, cors);
      }
      const mode = String(b.mode ?? '');
      if (!MODES.has(mode)) return json({ error: 'bad mode' }, 400, cors);
      const score = Math.floor(Number(b.score) || 0);
      const wave = Math.floor(Number(b.wave) || 0);
      const combo = Math.floor(Number(b.combo) || 0);
      const heat = Math.max(0, Math.min(7, Math.floor(Number(b.heat) || 0)));
      // pragmatic sanity + wave-relative plausibility — reject implausible payloads
      if (!capsOk(score, wave, combo, heat)) return json({ error: 'rejected' }, 422, cors);
      const name = sanitizeName(b.name);
      let daily: string | null = null;
      if (mode === 'daily') {
        daily = String(b.daily ?? '').slice(0, 10);
        if (!validDaily(daily, Date.now())) return json({ error: 'bad daily date' }, 400, cors);
      }
      await env.DB.prepare(
        'INSERT INTO scores (mode, daily, name, score, wave, combo, heat, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(mode, daily, name, score, wave, combo, heat, Date.now())
        .run();
      return json({ ok: true }, 200, cors);
    }

    // ── read a board (best score per handle, top 100) ──
    if (req.method === 'GET' && url.pathname === '/leaderboard') {
      const mode = url.searchParams.get('mode') ?? '';
      if (!MODES.has(mode)) return json({ error: 'bad mode' }, 400, cors);
      const daily = url.searchParams.get('daily');
      if (daily !== null && !DATE_RE.test(daily)) return json({ error: 'bad daily date' }, 400, cors);

      // Edge cache: serve a recent board straight from the Cloudflare edge so repeated reads
      // don't re-run the GROUP BY scan over D1 (the free-tier rows-read ceiling — the first
      // thing a launch spike exhausts). Keyed only on result-affecting params; CORS is
      // re-attached per request and never cached. A cache HIT skips BOTH the D1 query and the
      // KV rate-limit write, so the cheap path stays cheap.
      const cache = caches.default;
      const cacheKey = new Request(boardCacheKey(url), { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-cache': 'HIT', ...cors },
        });
      }

      if (!(await rateOk(env, ip, 'get', 120))) return json({ error: 'rate limited' }, 429, cors);
      // SQLite bare-column rule: with MAX(score), the other columns come from that row.
      // scope=weekly restricts a non-daily board to the current calendar week.
      const scope = url.searchParams.get('scope');
      const SELECT = 'SELECT name, MAX(score) AS score, wave, combo, heat FROM scores';
      const TAIL = 'GROUP BY name ORDER BY score DESC LIMIT 100';
      let stmt: D1PreparedStatement;
      if (mode === 'daily') {
        stmt = env.DB.prepare(`${SELECT} WHERE mode = ? AND daily = ? ${TAIL}`).bind(mode, daily ?? '');
      } else if (scope === 'weekly') {
        stmt = env.DB.prepare(`${SELECT} WHERE mode = ? AND ts >= ? ${TAIL}`).bind(mode, weekStartMs(Date.now()));
      } else {
        stmt = env.DB.prepare(`${SELECT} WHERE mode = ? ${TAIL}`).bind(mode);
      }
      const rs = await stmt.all<ScoreRow>();
      const entries = (rs.results ?? []).map((r, i) => ({
        rank: i + 1,
        name: r.name,
        score: r.score,
        wave: r.wave,
        combo: r.combo,
        heat: r.heat,
      }));
      const body = JSON.stringify({ entries });
      // store WITHOUT CORS (origin-agnostic) + a short s-maxage; CORS is re-attached below
      // and on every future HIT, so the shared cached board serves any allowed origin.
      const cacheable = new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json', 'Cache-Control': `public, s-maxage=${BOARD_CACHE_TTL}` },
      });
      ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-cache': 'MISS', ...cors },
      });
    }

    // ── §v7 report unlocked achievements (anonymous rarity aggregate) ──
    // Append-only: one (device, achievement) row each. INSERT OR IGNORE means re-reporting
    // the same set is a cheap no-op, and a player who plays 100 runs still counts once per
    // achievement. The device token only dedupes — it's a random client string, not PII.
    if (req.method === 'POST' && url.pathname === '/ach') {
      if (!(await rateOk(env, ip, 'post', 20))) return json({ error: 'rate limited' }, 429, cors);
      let b: Record<string, unknown>;
      try {
        b = (await req.json()) as Record<string, unknown>;
      } catch {
        return json({ error: 'bad json' }, 400, cors);
      }
      const device = sanitizeDevice(b.device);
      if (!device) return json({ error: 'bad device' }, 400, cors);
      const ids = sanitizeAchIds(b.ids);
      if (ids.length) {
        const now = Date.now();
        await env.DB.batch(
          ids.map((id) =>
            env.DB.prepare('INSERT OR IGNORE INTO ach_unlocks (device, id, ts) VALUES (?, ?, ?)').bind(device, id, now),
          ),
        );
      }
      return json({ ok: true }, 200, cors);
    }

    // ── §v7 achievement rarity: { players, holders: { id: count } } ──
    // holders[id] = # of DISTINCT devices with that achievement (PRIMARY KEY (device,id) ⇒
    // COUNT(*) per id IS the distinct-device count). Edge-cached like the board.
    if (req.method === 'GET' && url.pathname === '/ach') {
      const cache = caches.default;
      const cacheKey = new Request(`${url.origin}/ach`, { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-cache': 'HIT', ...cors },
        });
      }
      if (!(await rateOk(env, ip, 'get', 120))) return json({ error: 'rate limited' }, 429, cors);
      const pr = await env.DB.prepare('SELECT COUNT(DISTINCT device) AS n FROM ach_unlocks').first<{ n: number }>();
      const players = Math.max(0, Math.floor(Number(pr?.n ?? 0)));
      const rs = await env.DB.prepare('SELECT id, COUNT(*) AS c FROM ach_unlocks GROUP BY id').all<{ id: string; c: number }>();
      const holders: Record<string, number> = {};
      for (const r of rs.results ?? []) holders[r.id] = Math.max(0, Math.floor(Number(r.c)));
      const body = JSON.stringify({ players, holders });
      const cacheable = new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json', 'Cache-Control': `public, s-maxage=${ACH_CACHE_TTL}` },
      });
      ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-cache': 'MISS', ...cors },
      });
    }

    // ── shared daily seed (days-since-epoch) ──
    if (req.method === 'GET' && url.pathname === '/daily') {
      return json(
        { seed: Math.floor(Date.now() / 86_400_000), date: new Date().toISOString().slice(0, 10) },
        200,
        cors,
      );
    }

    return json({ error: 'not found' }, 404, cors);
  },
};
