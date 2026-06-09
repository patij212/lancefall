// LANCEFALL leaderboard — a tiny Cloudflare Worker backed by D1.
// Endpoints (all CORS-open, JSON):
//   POST /score        { mode, name, score, wave, combo, heat, daily? }  -> { ok }
//   GET  /leaderboard?mode=<m>[&daily=YYYY-MM-DD]                         -> { entries }
//   GET  /daily                                                          -> { seed, date }
//
// The game is client-authoritative, so scores can't be cryptographically trusted
// on a zero-friction casual board. We apply pragmatic sanity caps + per-handle
// best-only aggregation rather than full replay verification. Deploy: see README.

export interface Env {
  DB: D1Database;
}

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

const MODES = new Set(['endless', 'arena', 'daily', 'nightmare', 'bossrush']);

function sanitizeName(n: unknown): string {
  return (
    String(n ?? '')
      .replace(/[^\w \-]/g, '')
      .slice(0, 16)
      .trim() || 'ANON'
  );
}

interface ScoreRow {
  name: string;
  score: number;
  wave: number;
  combo: number;
  heat: number;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // ── submit a score ──
    if (req.method === 'POST' && url.pathname === '/score') {
      let b: Record<string, unknown>;
      try {
        b = (await req.json()) as Record<string, unknown>;
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      const mode = String(b.mode ?? '');
      if (!MODES.has(mode)) return json({ error: 'bad mode' }, 400);
      const score = Math.floor(Number(b.score) || 0);
      const wave = Math.floor(Number(b.wave) || 0);
      const combo = Math.floor(Number(b.combo) || 0);
      const heat = Math.max(0, Math.min(7, Math.floor(Number(b.heat) || 0)));
      // pragmatic sanity caps — reject implausible client-authoritative payloads
      if (score <= 0 || score > 50_000_000 || wave < 0 || wave > 2000 || combo < 0 || combo > 10_000) {
        return json({ error: 'rejected' }, 422);
      }
      const name = sanitizeName(b.name);
      const daily = mode === 'daily' ? String(b.daily ?? '').slice(0, 10) : null;
      await env.DB.prepare(
        'INSERT INTO scores (mode, daily, name, score, wave, combo, heat, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(mode, daily, name, score, wave, combo, heat, Date.now())
        .run();
      return json({ ok: true });
    }

    // ── read a board (best score per handle, top 100) ──
    if (req.method === 'GET' && url.pathname === '/leaderboard') {
      const mode = url.searchParams.get('mode') ?? '';
      if (!MODES.has(mode)) return json({ error: 'bad mode' }, 400);
      const daily = url.searchParams.get('daily');
      // SQLite bare-column rule: with MAX(score), the other columns come from that row.
      const sql =
        mode === 'daily'
          ? 'SELECT name, MAX(score) AS score, wave, combo, heat FROM scores WHERE mode = ? AND daily = ? GROUP BY name ORDER BY score DESC LIMIT 100'
          : 'SELECT name, MAX(score) AS score, wave, combo, heat FROM scores WHERE mode = ? GROUP BY name ORDER BY score DESC LIMIT 100';
      const stmt =
        mode === 'daily'
          ? env.DB.prepare(sql).bind(mode, daily ?? '')
          : env.DB.prepare(sql).bind(mode);
      const rs = await stmt.all<ScoreRow>();
      const entries = (rs.results ?? []).map((r, i) => ({
        rank: i + 1,
        name: r.name,
        score: r.score,
        wave: r.wave,
        combo: r.combo,
        heat: r.heat,
      }));
      return json({ entries });
    }

    // ── shared daily seed (days-since-epoch) ──
    if (req.method === 'GET' && url.pathname === '/daily') {
      return json({ seed: Math.floor(Date.now() / 86_400_000), date: new Date().toISOString().slice(0, 10) });
    }

    return json({ error: 'not found' }, 404);
  },
};
