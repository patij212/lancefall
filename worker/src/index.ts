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
import { MODES, DATE_RE, sanitizeName, validDaily, weekStartMs, capsOk, corsHeaders, isAllowedOrigin, boardCacheKey, BOARD_CACHE_TTL, sanitizeDevice, sanitizeAchIds, ACH_CACHE_TTL, ACCOUNT_RATE_LIMIT, ACCOUNT_RATE_WINDOW_MS, DEDUPE_WINDOW_MS } from './validate';
import { signSession, verifySession, SESSION_TTL_MS } from './session';
import { newAccountId, sanitizeSaveBlob, mergeServerSave, claimName, mergeForLink } from './accounts';
import { signState, verifyState, pkceVerifier, pkceChallenge, PROVIDERS, isProvider, extractIdentity } from './oauth';

export interface Env {
  DB: D1Database;
  /** optional KV namespace for IP rate-limiting; if unbound, limiting is skipped */
  RL?: KVNamespace;
  HMAC_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Set to '1' in .dev.vars to enable the DEV_AUTH shim (fakes the OAuth provider). NEVER set in production. */
  DEV_AUTH?: string;
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

function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

interface ScoreRow {
  name: string;
  score: number;
  wave: number;
  combo: number;
  heat: number;
  account_id?: string | null;
  verified: number;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const ip = req.headers.get('CF-Connecting-IP') || 'anon';
    const cors = corsHeaders(req.headers.get('Origin') || '');

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // ── submit a score ──
    if (req.method === 'POST' && url.pathname === '/score') {
      // Per-IP rate limit (existing, KV-backed, applies to ALL submits including anon).
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
      // Name + daily resolved from the submitted payload (anon defaults).
      let name = sanitizeName(b.name);
      let accountId: string | null = null;
      let daily: string | null = null;
      if (mode === 'daily') {
        daily = String(b.daily ?? '').slice(0, 10);
        if (!validDaily(daily, Date.now())) return json({ error: 'bad daily date' }, 400, cors);
      }

      // ── §P3 account binding (OPTIONAL — anon path unchanged on any failure) ──
      // Read the Bearer session if present; if it verifies to a linked+verified account,
      // override the submitted name with the owned verified name and stamp account_id.
      // A missing or invalid session is the normal anon path — NEVER reject a submit for it.
      if (env.HMAC_SECRET) {
        const sess = await verifySession(bearer(req), env.HMAC_SECRET, Date.now());
        if (sess) {
          const acct = await env.DB.prepare(
            'SELECT name, name_verified FROM accounts WHERE id = ?',
          ).bind(sess.aid).first<{ name: string | null; name_verified: number }>();
          if (acct && acct.name_verified === 1 && acct.name) {
            // Verified account: use the owned name + stamp account_id for the verified board column.
            name = acct.name;
            accountId = sess.aid;

            // Per-account rate-limit (D1 count, no extra KV namespace required).
            // Counts submissions in the last ACCOUNT_RATE_WINDOW_MS for this account.
            const rateRow = await env.DB.prepare(
              'SELECT COUNT(*) AS n FROM scores WHERE account_id = ? AND ts > ?',
            ).bind(sess.aid, Date.now() - ACCOUNT_RATE_WINDOW_MS).first<{ n: number }>();
            if ((rateRow?.n ?? 0) >= ACCOUNT_RATE_LIMIT) {
              return json({ error: 'rate limited' }, 429, cors);
            }
          }
          // Else: session valid but account has no verified name → treat as anon (accountId stays null).
        }
        // Else: no/invalid session → anon path (accountId null, submitted name used as-is).
      }

      // ── Dedupe: exact-duplicate resubmit within DEDUPE_WINDOW_MS is a silent no-op ──
      // Covers network retries without inserting duplicate rows for the same run.
      const dupeRow = await env.DB.prepare(
        'SELECT 1 FROM scores WHERE mode = ? AND name = ? AND score = ? AND wave = ? AND combo = ? AND ts > ?',
      ).bind(mode, name, score, wave, combo, Date.now() - DEDUPE_WINDOW_MS).first();
      if (dupeRow) return json({ ok: true, deduped: true }, 200, cors);

      await env.DB.prepare(
        'INSERT INTO scores (mode, daily, name, score, wave, combo, heat, ts, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(mode, daily, name, score, wave, combo, heat, Date.now(), accountId)
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
      // Verified-board read: linked entries group by account_id (their stored name is the owned
      // verified name); anon entries group by name. An impostor reusing a verified name has NULL
      // account_id → groups separately → verified:0.
      const scope = url.searchParams.get('scope');
      const SELECT = 'SELECT name, MAX(score) AS score, wave, combo, heat, CASE WHEN account_id IS NOT NULL THEN 1 ELSE 0 END AS verified FROM scores';
      const TAIL = 'GROUP BY COALESCE(account_id, name) ORDER BY score DESC LIMIT 100';
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
        verified: r.verified === 1,
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

    // ── account boot: validate/issue a session + return the cloud save (ONE call) ──
    if (req.method === 'POST' && url.pathname === '/hello') {
      if (!env.HMAC_SECRET) return json({ error: 'accounts disabled' }, 503, cors);
      if (!(await rateOk(env, ip, 'post', 20))) return json({ error: 'rate limited' }, 429, cors);
      let b: Record<string, unknown>;
      try { b = (await req.json()) as Record<string, unknown>; } catch { return json({ error: 'bad json' }, 400, cors); }
      const now = Date.now();
      let aid: string | null = null;
      const sess = await verifySession(typeof b.session === 'string' ? b.session : null, env.HMAC_SECRET, now);
      if (sess) aid = sess.aid;
      if (!aid) {
        const device = sanitizeDevice(b.device);
        if (!device) return json({ error: 'bad device' }, 400, cors);
        const existing = await env.DB.prepare('SELECT id FROM accounts WHERE anon_token = ?').bind(device).first<{ id: string }>();
        if (existing) aid = existing.id;
        else {
          aid = newAccountId();
          await env.DB.prepare('INSERT INTO accounts (id, anon_token, created_at, updated_at) VALUES (?, ?, ?, ?)')
            .bind(aid, device, now, now).run();
        }
      }
      const row = await env.DB.prepare('SELECT blob, rev, updated_at FROM saves WHERE account_id = ?').bind(aid).first<{ blob: string; rev: number; updated_at: number }>();
      let save: unknown = null;
      if (row?.blob) { try { save = sanitizeSaveBlob(JSON.parse(row.blob)); } catch { save = null; } }
      // Extend: fetch account identity fields to return account state to the client.
      const acctRow = await env.DB.prepare('SELECT provider, name, name_verified FROM accounts WHERE id = ?').bind(aid).first<{ provider: string | null; name: string | null; name_verified: number }>();
      const account = {
        kind: (acctRow?.provider ? 'linked' : 'anon') as 'anon' | 'linked',
        name: acctRow?.name ?? null,
        verified: acctRow?.name_verified === 1,
      };
      const sessionKind: 'anon' | 'linked' = acctRow?.provider ? 'linked' : 'anon';
      const session = await signSession({ aid, kind: sessionKind, exp: now + SESSION_TTL_MS }, env.HMAC_SECRET);
      return json({ session, save, rev: row?.rev ?? 0, updatedAt: row?.updated_at ?? 0, account }, 200, cors);
    }

    // ── store the cloud save: verify session, sanitize, merge server-side, bump rev ──
    if (req.method === 'PUT' && url.pathname === '/save') {
      if (!env.HMAC_SECRET) return json({ error: 'accounts disabled' }, 503, cors);
      if (!(await rateOk(env, ip, 'post', 20))) return json({ error: 'rate limited' }, 429, cors);
      const sess = await verifySession(bearer(req), env.HMAC_SECRET, Date.now());
      if (!sess) return json({ error: 'unauthorized' }, 401, cors);
      let b: Record<string, unknown>;
      try { b = (await req.json()) as Record<string, unknown>; } catch { return json({ error: 'bad json' }, 400, cors); }
      const incoming = sanitizeSaveBlob(b.save);
      const incomingAt = typeof b.writtenAt === 'number' && Number.isFinite(b.writtenAt) ? b.writtenAt : Date.now();
      const row = await env.DB.prepare('SELECT blob, rev, updated_at FROM saves WHERE account_id = ?').bind(sess.aid).first<{ blob: string; rev: number; updated_at: number }>();
      let server: ReturnType<typeof sanitizeSaveBlob> | null = null;
      if (row?.blob) { try { server = sanitizeSaveBlob(JSON.parse(row.blob)); } catch { server = null; } }
      const merged = mergeServerSave(server, incoming, row?.updated_at ?? 0, incomingAt);
      const stored = sanitizeSaveBlob(merged);
      const rev = (row?.rev ?? 0) + 1;
      const now = Date.now();
      await env.DB.prepare(
        'INSERT INTO saves (account_id, blob, rev, updated_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(account_id) DO UPDATE SET blob = excluded.blob, rev = excluded.rev, updated_at = excluded.updated_at',
      ).bind(sess.aid, JSON.stringify(stored), rev, now).run();
      return json({ save: stored, rev }, 200, cors);
    }

    // ── OAuth start: PKCE redirect (or DEV_AUTH shim) ──
    // GET /auth/<provider>/start?session=<bearer>&device=<token>&ret=<gameOrigin>[&dev_user=<id>&dev_name=<n>]
    // A valid session is preferred; if absent, the device token is used to resolve/create the anon account
    // (mirrors /hello) so a first-time player who has never called /hello can still sign in.
    const startMatch = url.pathname.match(/^\/auth\/([^/]+)\/start$/);
    if (req.method === 'GET' && startMatch) {
      const provider = startMatch[1];
      if (!isProvider(provider)) return json({ error: 'unknown provider' }, 400, cors);
      if (!env.HMAC_SECRET) return json({ error: 'accounts disabled' }, 503, cors);
      const now = Date.now();
      let aid: string | null = null;
      // Prefer a valid existing session.
      const sess = await verifySession(url.searchParams.get('session'), env.HMAC_SECRET, now);
      if (sess) {
        aid = sess.aid;
      } else {
        // Fall back to device token — upsert an anon account exactly like /hello does.
        const device = sanitizeDevice(url.searchParams.get('device'));
        if (device) {
          const existing = await env.DB.prepare('SELECT id FROM accounts WHERE anon_token = ?').bind(device).first<{ id: string }>();
          if (existing) {
            aid = existing.id;
          } else {
            aid = newAccountId();
            await env.DB.prepare('INSERT INTO accounts (id, anon_token, created_at, updated_at) VALUES (?, ?, ?, ?)')
              .bind(aid, device, now, now).run();
          }
        }
      }
      if (!aid) return json({ error: 'unauthorized' }, 401, cors);
      // Validate the return origin against the CORS allowlist (prevents open redirects).
      const ret = url.searchParams.get('ret') ?? '';
      let retOrigin = '';
      try { retOrigin = new URL(ret).origin; } catch { /* invalid URL */ }
      if (!ret || !isAllowedOrigin(retOrigin)) return json({ error: 'bad ret' }, 400, cors);
      // Build PKCE pair + entropy nonce.
      const verifier = await pkceVerifier();
      const challenge = await pkceChallenge(verifier);
      const nonceBytes = new Uint8Array(8);
      crypto.getRandomValues(nonceBytes);
      const nonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const state = await signState({ aid, provider, ret, verifier, nonce, exp: Date.now() + 600_000 }, env.HMAC_SECRET);
      const redirectUri = `${url.origin}/auth/${provider}/callback`;
      // DEV_AUTH shim: if enabled and dev_user is set, skip the real provider and redirect
      // directly to the callback with fake identity params (for local end-to-end testing).
      if (env.DEV_AUTH === '1' && url.searchParams.get('dev_user')) {
        const u = encodeURIComponent(url.searchParams.get('dev_user')!);
        const n = encodeURIComponent(url.searchParams.get('dev_name') ?? '');
        return Response.redirect(`${redirectUri}?state=${encodeURIComponent(state)}&dev_user=${u}&dev_name=${n}`, 302);
      }
      const clientId = provider === 'discord' ? env.DISCORD_CLIENT_ID : env.GOOGLE_CLIENT_ID;
      if (!clientId) return json({ error: 'provider not configured' }, 503, cors);
      const auth = new URL(PROVIDERS[provider].authorize);
      auth.searchParams.set('client_id', clientId);
      auth.searchParams.set('redirect_uri', redirectUri);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('scope', PROVIDERS[provider].scope);
      auth.searchParams.set('state', state);
      auth.searchParams.set('code_challenge', challenge);
      auth.searchParams.set('code_challenge_method', 'S256');
      return Response.redirect(auth.toString(), 302);
    }

    // ── OAuth callback: token exchange → identity → link/merge → linked session → redirect ──
    // GET /auth/<provider>/callback?code=<code>&state=<state>
    // DEV path: GET /auth/<provider>/callback?dev_user=<id>&dev_name=<n>&state=<state>
    // On ANY error after ret is known, redirect to ${ret}#lf-account-error=1 (graceful, never dead-end).
    const callbackMatch = url.pathname.match(/^\/auth\/([^/]+)\/callback$/);
    if (req.method === 'GET' && callbackMatch) {
      const provider = callbackMatch[1];
      if (!isProvider(provider)) return json({ error: 'unknown provider' }, 400, cors);
      if (!env.HMAC_SECRET) return json({ error: 'accounts disabled' }, 503, cors);

      const stateParam = url.searchParams.get('state');
      const now = Date.now();
      const st = await verifyState(stateParam, env.HMAC_SECRET, now, provider);
      // state invalid → 400 (no ret to redirect back to safely)
      if (!st) return json({ error: 'invalid state' }, 400, cors);
      const ret = st.ret;

      try {
        // ── Obtain identity ──
        let identity: { providerId: string; name: string } | null = null;
        if (env.DEV_AUTH === '1' && url.searchParams.get('dev_user')) {
          // DEV path: trust the shim params (but still sanitize name through claimName).
          identity = {
            providerId: url.searchParams.get('dev_user')!,
            name: claimName(url.searchParams.get('dev_name')),
          };
        } else {
          const code = url.searchParams.get('code');
          if (!code) return Response.redirect(`${ret}#lf-account-error=1`, 302);
          const clientId = provider === 'discord' ? env.DISCORD_CLIENT_ID : env.GOOGLE_CLIENT_ID;
          const clientSecret = provider === 'discord' ? env.DISCORD_CLIENT_SECRET : env.GOOGLE_CLIENT_SECRET;
          if (!clientId || !clientSecret) return Response.redirect(`${ret}#lf-account-error=1`, 302);
          // Exchange the authorization code for an access token (PKCE: include code_verifier).
          const tok = await fetch(PROVIDERS[provider].token, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              code,
              grant_type: 'authorization_code',
              redirect_uri: `${url.origin}/auth/${provider}/callback`,
              code_verifier: st.verifier,
            }),
          });
          if (!tok.ok) return Response.redirect(`${ret}#lf-account-error=1`, 302);
          const access = (await tok.json() as { access_token?: string }).access_token;
          if (!access) return Response.redirect(`${ret}#lf-account-error=1`, 302);
          // Fetch the stable user identity from the provider's userinfo endpoint.
          const ui = await fetch(PROVIDERS[provider].userinfo, {
            headers: { authorization: `Bearer ${access}` },
          });
          if (!ui.ok) return Response.redirect(`${ret}#lf-account-error=1`, 302);
          identity = extractIdentity(provider, await ui.json());
        }
        if (!identity) return Response.redirect(`${ret}#lf-account-error=1`, 302);

        const { providerId, name: rawName } = identity;
        const { aid } = st;

        // ── Link/merge (D1) ──
        // Check if this provider identity is already linked to any account.
        const existing = await env.DB.prepare(
          'SELECT id FROM accounts WHERE provider = ? AND provider_id = ?',
        ).bind(provider, providerId).first<{ id: string }>();

        let canonical: string;

        if (existing && existing.id !== aid) {
          // MERGE: the provider identity belongs to a DIFFERENT account (returning player on a new device).
          // Load both saves, merge them into the existing (linked) account, then delete the anon account.
          const existingRow = await env.DB.prepare('SELECT blob, rev, updated_at FROM saves WHERE account_id = ?')
            .bind(existing.id).first<{ blob: string; rev: number; updated_at: number }>();
          const currentRow = await env.DB.prepare('SELECT blob, updated_at FROM saves WHERE account_id = ?')
            .bind(aid).first<{ blob: string; updated_at: number }>();
          let existingSave: ReturnType<typeof sanitizeSaveBlob> | null = null;
          if (existingRow?.blob) { try { existingSave = sanitizeSaveBlob(JSON.parse(existingRow.blob)); } catch { existingSave = null; } }
          let currentSave: ReturnType<typeof sanitizeSaveBlob> | null = null;
          if (currentRow?.blob) { try { currentSave = sanitizeSaveBlob(JSON.parse(currentRow.blob)); } catch { currentSave = null; } }
          const merged = mergeForLink(existingSave, currentSave, existingRow?.updated_at ?? 0, currentRow?.updated_at ?? 0);
          const storedMerged = sanitizeSaveBlob(merged);
          const mergeNow = Date.now();
          // Write merged save under the existing account, delete the anon account entirely.
          await env.DB.batch([
            env.DB.prepare(
              'INSERT INTO saves (account_id, blob, rev, updated_at) VALUES (?, ?, ?, ?) ' +
              'ON CONFLICT(account_id) DO UPDATE SET blob = excluded.blob, rev = excluded.rev, updated_at = excluded.updated_at',
            ).bind(existing.id, JSON.stringify(storedMerged), (existingRow?.rev ?? 0) + 1, mergeNow),
            // DELETE the absorbed anon account's saves and account rows.
            env.DB.prepare('DELETE FROM saves WHERE account_id = ?').bind(aid),
            env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(aid),
          ]);
          canonical = existing.id;
        } else if (existing && existing.id === aid) {
          // RECOVERY / NO-OP: same device re-linking the same provider identity.
          canonical = aid;
        } else {
          // ATTACH: first time linking this provider to this (anon) account.
          // Name claim deferred — set tentatively, uniqueness check below.
          canonical = aid;
        }

        // ── Name claim: sanitize + check uniqueness among linked accounts (case-folded) ──
        // P2 final review + P3 Task 2 review: on a collision we PRESERVE canonical's existing
        // name/name_verified rather than wiping them. A returning VERIFIED player (MERGE/RECOVERY)
        // must never lose their owned identity just because another account holds the same name.
        const claimedName = claimName(rawName);
        let claimOk = false;
        if (claimedName) {
          // A name is only kept if no OTHER linked account already holds it (case-folded).
          const conflict = await env.DB.prepare(
            'SELECT 1 FROM accounts WHERE provider IS NOT NULL AND lower(name) = lower(?) AND id != ?',
          ).bind(claimedName, canonical).first();
          if (!conflict) claimOk = true;
        }

        // ── Update accounts row: attach provider + name (or refresh on recovery) ──
        // For the MERGE case canonical = existing.id which already has provider/provider_id; update name anyway.
        // ONLY update name/name_verified when there is a fresh, non-colliding name to claim.
        // Otherwise set only provider/provider_id/updated_at — leave canonical's existing name untouched.
        const now2 = Date.now();
        if (claimOk) {
          await env.DB.prepare(
            'UPDATE accounts SET provider = ?, provider_id = ?, name = ?, name_verified = 1, updated_at = ? WHERE id = ?',
          ).bind(provider, providerId, claimedName, now2, canonical).run();
        } else {
          await env.DB.prepare(
            'UPDATE accounts SET provider = ?, provider_id = ?, updated_at = ? WHERE id = ?',
          ).bind(provider, providerId, now2, canonical).run();
        }

        // ── Issue a linked session and redirect back to the game ──
        const session = await signSession({ aid: canonical, kind: 'linked', exp: now + SESSION_TTL_MS }, env.HMAC_SECRET);
        return Response.redirect(`${ret}#lf-account=${encodeURIComponent(session)}&linked=1`, 302);

      } catch {
        // Any unexpected failure → graceful degradation (client stays anonymous, no dead-end).
        return Response.redirect(`${ret}#lf-account-error=1`, 302);
      }
    }

    // ── DELETE /account: wipe the session's own cloud save + account row; scores stay (anon) ──
    if (req.method === 'DELETE' && url.pathname === '/account') {
      if (!env.HMAC_SECRET) return json({ error: 'accounts disabled' }, 503, cors);
      if (!(await rateOk(env, ip, 'post', 20))) return json({ error: 'rate limited' }, 429, cors);
      const sess = await verifySession(bearer(req), env.HMAC_SECRET, Date.now());
      if (!sess) return json({ error: 'unauthorized' }, 401, cors);
      const { aid } = sess;
      await env.DB.batch([
        env.DB.prepare('DELETE FROM saves WHERE account_id = ?').bind(aid),
        env.DB.prepare('UPDATE scores SET account_id = NULL WHERE account_id = ?').bind(aid),
        env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(aid),
      ]);
      return json({ ok: true }, 200, cors);
    }

    return json({ error: 'not found' }, 404, cors);
  },
};
