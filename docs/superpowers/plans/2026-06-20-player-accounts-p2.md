# Player Accounts P2 — OAuth Link + Cross-Device — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Builds on P1** (commits `67b8cf6..a6be4e1` already on this branch): `cloudMerge.ts`, `account.ts`, `worker/src/{session,accounts}.ts`, `/hello`+`/save`, the `accounts`/`saves` D1 tables (the `accounts` row already has `provider`/`provider_id`/`name`/`name_verified` columns).

**Goal:** Let a player sign in with **Discord or Google** (OAuth, PKCE + signed state) to link their anonymous account, **merge** an anonymous save into a linked one (cross-device), recover by re-logging-in, and see/claim a verified name — all testable locally via a `DEV_AUTH` shim, with no real provider apps required to develop.

**Architecture:** The Worker runs the whole OAuth dance (it's the only place secrets live). `worker/src/oauth.ts` (pure) holds PKCE (S256), the **stateless signed `state`** (the PKCE verifier + the originating account id ride inside an HMAC-signed, tamper-proof state — no KV), the provider config, and identity extraction. `/auth/<provider>/start` redirects to the provider; `/auth/<provider>/callback` exchanges the code, fetches the stable user id, and **links/merges** using the P1 `mergeSaves` (no progress lost), issues a fresh `linked` session, and redirects back to the game with the session in the URL fragment. The client `account.ts` gains `startLink()` + fragment-adoption on boot + `accountState()`; a new `panels/account.ts` sign-in panel is wired thinly into `ui.ts` (the established panel pattern) and opened from a SETTINGS entry. A `DEV_AUTH=1` shim fakes the provider so the link/merge flow is fully e2e-testable offline.

**Tech Stack:** Cloudflare Workers + D1, Web Crypto (HMAC-SHA256 + SHA-256 for PKCE), Vite + vanilla TS, Vitest.

## Global Constraints

- **Offline-first is sacred.** No backend / never-opted-in / offline → zero new requests and zero behavior change. Sign-in is an explicit opt-in upgrade; failures degrade gracefully (stay anonymous + local). `account.ts` stays fire-and-forget and never throws.
- **Free-tier discipline.** **Stateless** OAuth: the PKCE verifier + originating account ride inside the **HMAC-signed `state`** — **NO KV**, no server-side session store. The token exchange is ONE provider subrequest (wall-time, not CPU). `/hello` stays the single combined boot call.
- **Security (the heart of P2).** OAuth **PKCE (S256) + a signed `state` nonce** (CSRF); verify the provider token **server-side**; **never trust a client-claimed identity**. Bind the link to the account id carried in the *signed* state (a client can't forge it). The session is a Bearer token (not a cookie) so classic CSRF doesn't apply. Secrets (`HMAC_SECRET`, `DISCORD_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`) live in Worker env/secrets — **never the client bundle**. Verified-name uniqueness is enforced **case-folded among linked accounts**.
- **The merge never loses progress.** Linking/merging reuses the P1 pure `mergeSaves` — field-aware, player-favoring, the single source of truth. Merging an anon account into a linked one keeps every unlock/record from both.
- **Determinism untouched.** No sim / `world.rng`. Server save-handling reuses `migrate.ts`/`cloudMerge.ts`, not the sim.
- **Don't grow the god-files.** New logic in `worker/src/oauth.ts`, the worker routes, `src/account.ts`, `src/panels/account.ts`. `ui.ts` gets ONLY the established ~12-line panel-registration wiring (mirroring `buildLeaderboard`/`openLeaderboard` + the `registerModals` list); `settings.ts` gets one "Manage account" button.
- **DEV_AUTH is dev-only.** The shim that fakes the OAuth callback is gated strictly on `env.DEV_AUTH === '1'` and is never enabled in production.
- **Tests stay green.** P1's suite (1293) + new P2 tests green; `npx tsc --noEmit` clean; `determinism.test.ts` unaffected.

---

## File Structure

| File | Responsibility |
|---|---|
| `worker/src/session.ts` (MODIFY, refactor) | Extract the generic compact-token primitives `signCompact(obj, secret)` / `verifyCompact(token, secret)` (b64url+HMAC, timing-safe). `signSession`/`verifySession` re-expressed on top (behavior identical — P1 session tests stay green). Lets `oauth.ts` reuse the same signing for `state` without duplicating the crypto. |
| `worker/src/oauth.ts` (NEW, pure) | PKCE (`pkceVerifier()`, `pkceChallenge(verifier)` S256), `signState`/`verifyState` (via `signCompact`/`verifyCompact` + exp/shape), `PROVIDERS` config (authorize/token/userinfo URLs + scope per provider), `extractIdentity(provider, userinfoJson)` → `{ providerId, name }`. |
| `src/workerOauth.test.ts` (NEW, main suite) | PKCE challenge correctness (known vector), state round-trip + tamper/expiry rejection, provider config presence, identity extraction for discord + google. |
| `worker/src/index.ts` (MODIFY) | `GET /auth/<provider>/start` (+ DEV_AUTH shim), `GET /auth/<provider>/callback` (exchange → identity → link/merge → linked session → redirect). Extend `/hello` to return `account: { kind, name, verified }`. |
| `worker/src/accounts.ts` (MODIFY) | `linkIdentity(...)` orchestration is in index.ts (needs D1), but add a pure `claimName(raw)` sanitizer (reuse the handle rules) + the `mergeForLink(existingSave, currentSave, existingAt, currentAt)` thin wrapper (= `mergeSaves`, names the intent). |
| `src/account.ts` (MODIFY) | `startLink(provider)` (navigate to the worker's `/auth/<provider>/start`), `adoptFragmentSession()` (on load: capture `#lf-account=<session>` → store + strip + re-boot), `accountState()` (from the last `/hello` `account` payload). `boot()` stores the returned `account` info. |
| `src/account.test.ts` (MODIFY) | Tests for `adoptFragmentSession` (pure parse: extracts + strips the fragment; no-op when absent), `accountState` derivation, and the offline-first no-op for `startLink` (no backend → no navigation). |
| `src/panels/account.ts` (NEW, panel) | `buildAccountPanel(deps) → AccountPanel`: shows account state (anonymous vs "Signed in as <name> ✓"), "Sign in with Discord"/"Sign in with Google" buttons, the cloud-save status; a thin panel following the `panels/panel.ts` convention. (Account deletion + privacy note are P3.) |
| `src/panels/account.test.ts` (NEW) | Renders anonymous + linked states; the sign-in buttons call the deps; gated on `leaderboardEnabled()`. |
| `src/ui.ts` (MODIFY, thin ~12 lines) | `buildAccount()` + `openAccount()` + register `[this.accountPanel,'Account']` in `registerModals` — identical to the `buildLeaderboard`/`openLeaderboard` pattern. |
| `src/panels/settings.ts` (MODIFY, thin) | One "Manage account / sign in…" button in the Cloud-save section → `deps.onOpenAccount()`. |
| `worker/ACCOUNTS-SETUP.md` (MODIFY) | Fill the P2 section: register the Discord + Google OAuth apps, the exact redirect URLs, the 4 client id/secret vars, and the `DEV_AUTH` local-dev note. |

### Endpoint contracts (the integration spec the route tasks implement)

- `GET /auth/:provider/start?session=<bearer>&ret=<gameOrigin>` →
  - `provider ∈ {discord, google}` else 400. `ret` must match the CORS allowlist (reuse `corsHeaders`'s origin check) else 400.
  - Resolve the account id: `verifySession(session)` → `aid` (if absent/invalid, 401 — sign-in requires an existing anon session from `/hello`).
  - Build PKCE verifier+challenge; `state = signState({ aid, provider, ret, verifier, nonce, exp: now+600_000 }, HMAC_SECRET)`.
  - **DEV_AUTH shim:** if `env.DEV_AUTH === '1'` and a `dev_user` param is present → SKIP the provider; 302 straight to `…/callback?state=<state>&dev_user=<id>&dev_name=<n>`.
  - Else 302 → provider authorize URL with `client_id, redirect_uri=<workerOrigin>/auth/<provider>/callback, response_type=code, scope, state, code_challenge=<challenge>, code_challenge_method=S256`.
- `GET /auth/:provider/callback?code&state` (or `?dev_user&dev_name&state` under DEV_AUTH) →
  - `verifyState(state)` → `{aid, provider, ret, verifier}` (reject on bad sig/expiry/provider-mismatch → 400).
  - Obtain identity: real path = exchange `code` (+ `code_verifier=verifier`, `client_secret`) at the token endpoint, then GET userinfo, then `extractIdentity`. DEV path = `{ providerId: dev_user, name: claimName(dev_name) }`.
  - **Link/merge** (D1): `existing = SELECT id FROM accounts WHERE provider=? AND provider_id=?`.
    - `existing && existing.id !== aid` → MERGE: load both saves, `merged = mergeForLink(existingSave, currentSave, existingUpdatedAt, currentUpdatedAt)`, store under `existing.id`, delete the current (anon) account's `saves` row + `accounts` row (it's been absorbed). canonical = `existing.id`.
    - `existing && existing.id === aid` → recovery/no-op. canonical = `aid`.
    - else → ATTACH: `UPDATE accounts SET provider=?, provider_id=?, name=?, name_verified=?, updated_at=? WHERE id=aid`. canonical = `aid`.
  - **Name claim:** `name = claimName(identityName)`; keep it only if free case-folded among linked accounts (`SELECT 1 FROM accounts WHERE provider IS NOT NULL AND lower(name)=lower(?) AND id != <canonical>`), else store `NULL` (claimable later). `name_verified = name ? 1 : 0`.
  - Issue `session = signSession({ aid: canonical, kind: 'linked', exp: now+SESSION_TTL_MS })`.
  - 302 → `<ret>#lf-account=<session>&linked=1` (the client adopts it).
- `POST /hello` (extend) → also return `account: { kind: 'anon'|'linked', name: string|null, verified: boolean }` for the resolved account.

---

### Task 1: `oauth.ts` — PKCE, signed state, provider config, identity (+ session refactor)

**Files:**
- Modify: `worker/src/session.ts` (extract `signCompact`/`verifyCompact`)
- Create: `worker/src/oauth.ts`
- Test: `src/workerOauth.test.ts`

**Interfaces:**
- `session.ts` adds: `export async function signCompact(obj: unknown, secret: string): Promise<string>` and `export async function verifyCompact(token: string | null, secret: string): Promise<unknown | null>` (signature-valid → parsed object; else null; never throws). `signSession`/`verifySession` keep their exact signatures + behavior, now implemented via these.
- `oauth.ts` produces:
  - `export type Provider = 'discord' | 'google'`
  - `export function isProvider(s: string): s is Provider`
  - `export async function pkceVerifier(): Promise<string>` (43-char base64url of 32 random bytes)
  - `export async function pkceChallenge(verifier: string): Promise<string>` (base64url(SHA-256(verifier)))
  - `export interface StatePayload { aid: string; provider: Provider; ret: string; verifier: string; nonce: string; exp: number }`
  - `export async function signState(p: StatePayload, secret: string): Promise<string>` (via `signCompact`)
  - `export async function verifyState(token: string | null, secret: string, now: number, provider: Provider): Promise<StatePayload | null>` (sig-valid AND `exp > now` AND `p.provider === provider`, else null)
  - `export const PROVIDERS: Record<Provider, { authorize: string; token: string; userinfo: string; scope: string }>`
  - `export function extractIdentity(provider: Provider, json: unknown): { providerId: string; name: string } | null` (discord: `{id, global_name|username}`; google: `{sub, name}`; null if the id is missing)

- [ ] **Step 1: Write the failing tests**

```ts
// src/workerOauth.test.ts
import { describe, it, expect } from 'vitest';
import { pkceVerifier, pkceChallenge, signState, verifyState, PROVIDERS, isProvider, extractIdentity } from '../worker/src/oauth';

const SECRET = 'oauth-test-secret';

describe('oauth — PKCE (S256)', () => {
  it('challenge is the base64url SHA-256 of the verifier (RFC 7636 test vector)', async () => {
    // RFC 7636 Appendix B verifier → challenge
    const v = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(await pkceChallenge(v)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('verifier is 43 url-safe chars', async () => {
    const v = await pkceVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('oauth — signed state', () => {
  const base = { aid: 'acc_1', provider: 'discord' as const, ret: 'https://lancefall.pages.dev', verifier: 'v', nonce: 'n' };
  it('round-trips when valid + provider matches', async () => {
    const t = await signState({ ...base, exp: 5000 }, SECRET);
    expect(await verifyState(t, SECRET, 1000, 'discord')).toMatchObject({ aid: 'acc_1', provider: 'discord' });
  });
  it('rejects a tampered/expired/wrong-secret/wrong-provider state', async () => {
    const t = await signState({ ...base, exp: 5000 }, SECRET);
    expect(await verifyState(t, 'other', 1000, 'discord')).toBeNull();
    expect(await verifyState(t, SECRET, 9999, 'discord')).toBeNull();       // expired
    expect(await verifyState(t, SECRET, 1000, 'google')).toBeNull();        // provider mismatch
    expect(await verifyState('garbage', SECRET, 1000, 'discord')).toBeNull();
    expect(await verifyState(null, SECRET, 1000, 'discord')).toBeNull();
  });
});

describe('oauth — providers + identity', () => {
  it('has discord + google config with the required URLs', () => {
    for (const p of ['discord', 'google'] as const) {
      expect(PROVIDERS[p].authorize).toMatch(/^https:\/\//);
      expect(PROVIDERS[p].token).toMatch(/^https:\/\//);
      expect(PROVIDERS[p].userinfo).toMatch(/^https:\/\//);
      expect(PROVIDERS[p].scope.length).toBeGreaterThan(0);
    }
    expect(isProvider('discord')).toBe(true);
    expect(isProvider('nope')).toBe(false);
  });
  it('extracts a stable id + name per provider', () => {
    expect(extractIdentity('discord', { id: '123', global_name: 'Ace', username: 'ace#0' })).toEqual({ providerId: '123', name: 'Ace' });
    expect(extractIdentity('discord', { id: '123', username: 'ace' })).toEqual({ providerId: '123', name: 'ace' });
    expect(extractIdentity('google', { sub: 'g-9', name: 'Bea' })).toEqual({ providerId: 'g-9', name: 'Bea' });
    expect(extractIdentity('discord', { username: 'noid' })).toBeNull();
    expect(extractIdentity('google', {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/workerOauth.test.ts`
Expected: FAIL — cannot resolve `../worker/src/oauth`.

- [ ] **Step 3: Refactor `session.ts` to expose `signCompact`/`verifyCompact`**

Extract the b64url + HMAC + timing-safe-compare plumbing already in `session.ts` into:
```ts
export async function signCompact(obj: unknown, secret: string): Promise<string> {
  const body = b64urlFromString(JSON.stringify(obj));
  const sig = b64urlFromBytes(await hmac(body, secret));
  return `${body}.${sig}`;
}
export async function verifyCompact(token: string | null, secret: string): Promise<unknown | null> {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return null;
  const body = token.slice(0, dot);
  const sigBytes = bytesFromB64url(token.slice(dot + 1));
  if (!sigBytes) return null;
  if (!timingSafeEqual(sigBytes, await hmac(body, secret))) return null;
  const json = bytesFromB64url(body);
  if (!json) return null;
  try { return JSON.parse(new TextDecoder().decode(json)); } catch { return null; }
}
```
Re-express `signSession` as `signCompact(p, secret)`; `verifySession` as: `const p = await verifyCompact(token, secret); if (!p || typeof p.aid !== 'string' || (p.kind!=='anon'&&p.kind!=='linked') || typeof p.exp !== 'number' || now >= p.exp) return null; return p;`. Keep the exact `SessionPayload`/exports. **The P1 `src/workerSession.test.ts` must stay green — run it.**

- [ ] **Step 4: Implement `worker/src/oauth.ts`**

```ts
// OAuth (Discord + Google) helpers — PKCE (S256) + a stateless HMAC-signed `state`, the provider
// config, and identity extraction. Pure (Web Crypto only); the routes in index.ts do the network.
// The PKCE verifier + originating account id ride inside the SIGNED state (tamper-proof, no KV).
import { signCompact, verifyCompact } from './session';

export type Provider = 'discord' | 'google';
export function isProvider(s: string): s is Provider { return s === 'discord' || s === 'google'; }

const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function pkceVerifier(): Promise<string> {
  const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return b64url(bytes);
}
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return b64url(new Uint8Array(digest));
}

export interface StatePayload { aid: string; provider: Provider; ret: string; verifier: string; nonce: string; exp: number }
export async function signState(p: StatePayload, secret: string): Promise<string> { return signCompact(p, secret); }
export async function verifyState(token: string | null, secret: string, now: number, provider: Provider): Promise<StatePayload | null> {
  const p = (await verifyCompact(token, secret)) as StatePayload | null;
  if (!p || typeof p.aid !== 'string' || p.provider !== provider || typeof p.exp !== 'number' || typeof p.verifier !== 'string' || typeof p.ret !== 'string') return null;
  if (now >= p.exp) return null;
  return p;
}

export const PROVIDERS: Record<Provider, { authorize: string; token: string; userinfo: string; scope: string }> = {
  discord: { authorize: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token', userinfo: 'https://discord.com/api/users/@me', scope: 'identify' },
  google:  { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', userinfo: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid profile' },
};

export function extractIdentity(provider: Provider, json: unknown): { providerId: string; name: string } | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (provider === 'discord') {
    const id = typeof j.id === 'string' ? j.id : '';
    const name = (typeof j.global_name === 'string' && j.global_name) || (typeof j.username === 'string' && j.username) || '';
    return id ? { providerId: id, name: String(name) } : null;
  }
  const sub = typeof j.sub === 'string' ? j.sub : '';
  const name = typeof j.name === 'string' ? j.name : '';
  return sub ? { providerId: sub, name } : null;
}
```

- [ ] **Step 4b: `claimName` + `mergeForLink` in `accounts.ts`**

```ts
// append to worker/src/accounts.ts
import { mergeSaves } from '../../src/cloudMerge';
/** Sanitize a provider-supplied display name to the same shape as the client handle
 *  (word chars/space/hyphen, trimmed, ≤16). '' when blank/all-junk. */
export function claimName(raw: unknown): string {
  return String(raw ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
}
/** Merge two real saves on link (no "server" side — both are kept fully; write-times only
 *  decide `latest` fields). Names the intent; delegates to the shared pure merge. */
export function mergeForLink(existing: SaveData | null, current: SaveData | null, existingAt: number, currentAt: number): SaveData {
  if (!existing) return current ?? sanitizeSaveBlob(null);
  if (!current) return existing;
  return mergeSaves(existing, current, existingAt, currentAt);
}
```
(Add a test in `src/workerAccounts.test.ts`: `claimName` strips junk/caps length; `mergeForLink` keeps both saves' unlocks.)

- [ ] **Step 5: Run all worker tests + tsc**

Run: `npx vitest run src/workerOauth.test.ts src/workerSession.test.ts src/workerAccounts.test.ts` (all green — the session refactor didn't regress) and `npx tsc --noEmit` (clean).

- [ ] **Step 6: Commit**

```bash
git add worker/src/session.ts worker/src/oauth.ts worker/src/accounts.ts src/workerOauth.test.ts src/workerAccounts.test.ts
git commit -m "feat(lancefall): OAuth PKCE + signed-state + provider config + identity (P2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Worker `/auth/<provider>/start` route (+ DEV_AUTH shim)

**Files:**
- Modify: `worker/src/index.ts`

**Interfaces:** see the `/auth/:provider/start` contract above. Add `DISCORD_CLIENT_ID?`, `DISCORD_CLIENT_SECRET?`, `GOOGLE_CLIENT_ID?`, `GOOGLE_CLIENT_SECRET?`, `DEV_AUTH?` to `Env`.

- [ ] **Step 1: Implement the route**

Add a route block (before the 404). Parse `/auth/<provider>/start`; `isProvider` guard; require `HMAC_SECRET`; resolve `aid` via `verifySession(url.searchParams.get('session'))` (401 if invalid); validate `ret` against the origin allowlist (reuse the regex in `corsHeaders` — extract it to a shared `isAllowedOrigin(origin)` in `validate.ts` and use it both places); build `pkceVerifier()`+`pkceChallenge()`; `state = signState({...})`. Then:
```ts
const redirectUri = `${url.origin}/auth/${provider}/callback`;
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
```

- [ ] **Step 2: Refactor `isAllowedOrigin` into `validate.ts`**

Extract the origin regex from `corsHeaders` into `export function isAllowedOrigin(origin: string): boolean` and have `corsHeaders` + the `ret` check use it. Add a quick test in `src/workerValidate.test.ts` (allows lancefall.pages.dev + localhost; rejects evil.com).

- [ ] **Step 3: Verify the bundle builds + start handler is reachable**

Run: `cd worker && npx wrangler deploy --dry-run --outdir=/tmp/lf-w2 2>&1 | tail -6` (clean bundle).
Run: `npx tsc --noEmit` (clean) + `npx vitest run src/workerValidate.test.ts` (green).

- [ ] **Step 4: Commit**

```bash
git add worker/src/index.ts worker/src/validate.ts src/workerValidate.test.ts
git commit -m "feat(lancefall): /auth start route + PKCE redirect + DEV_AUTH shim (P2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Worker `/auth/<provider>/callback` + link/merge + `/hello` account info

**Files:**
- Modify: `worker/src/index.ts`

**Interfaces:** see the `/auth/:provider/callback` + `/hello` extension contracts above.

- [ ] **Step 1: Implement the callback route**

Parse `/auth/<provider>/callback`; `isProvider` guard; `verifyState(state)` (400 on fail). Obtain identity:
```ts
let identity: { providerId: string; name: string } | null = null;
if (env.DEV_AUTH === '1' && url.searchParams.get('dev_user')) {
  identity = { providerId: url.searchParams.get('dev_user')!, name: claimName(url.searchParams.get('dev_name')) };
} else {
  const code = url.searchParams.get('code');
  if (!code) return json({ error: 'no code' }, 400, cors);
  const tok = await fetch(PROVIDERS[provider].token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: `${url.origin}/auth/${provider}/callback`, code_verifier: st.verifier }) });
  if (!tok.ok) return json({ error: 'token exchange failed' }, 502, cors);
  const access = (await tok.json() as { access_token?: string }).access_token;
  if (!access) return json({ error: 'no access token' }, 502, cors);
  const ui = await fetch(PROVIDERS[provider].userinfo, { headers: { authorization: `Bearer ${access}` } });
  if (!ui.ok) return json({ error: 'userinfo failed' }, 502, cors);
  identity = extractIdentity(provider, await ui.json());
}
if (!identity) return json({ error: 'no identity' }, 502, cors);
```
Then the link/merge D1 logic + name claim + linked session + the `Response.redirect(`${st.ret}#lf-account=${encodeURIComponent(session)}&linked=1`, 302)` per the contract. On ANY failure, redirect back with `#lf-account-error=1` (so the client shows a graceful "sign-in failed, still local" — never a dead end). Use `claimName` + the case-folded uniqueness SELECT.

- [ ] **Step 2: Extend `/hello` to return `account` info**

After resolving `aid`, `SELECT provider, name, name_verified FROM accounts WHERE id=?`; add `account: { kind: provider ? 'linked' : 'anon', name: name ?? null, verified: name_verified === 1 }` to the response. (One extra column on the existing account read — no new query if folded into the account SELECT.)

- [ ] **Step 3: Verify (dry-run bundle + tsc) — live link tested in Task 7**

Run: `cd worker && npx wrangler deploy --dry-run --outdir=/tmp/lf-w3 2>&1 | tail -6` (clean) + `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(lancefall): /auth callback link/account-merge + linked session + /hello account info (P2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Client `account.ts` — startLink, fragment adoption, accountState

**Files:**
- Modify: `src/account.ts`
- Modify: `src/account.test.ts`

**Interfaces:**
- `export function startLink(provider: 'discord' | 'google'): void` — no-op unless `BASE && optedIn()` (sign-in implies cloud-save on). Navigates the top window to `${BASE}/auth/${provider}/start?session=${session}&ret=${encodeURIComponent(location.origin)}`. (Full-page redirect is the most robust; the worker redirects back to `location.origin#lf-account=…`.)
- `export function adoptFragmentSession(): boolean` — pure-ish: if `location.hash` contains `lf-account=<token>`, store it as the session, strip the hash, set rev=0 (a fresh `/hello` re-syncs), and return true (the caller re-runs `boot()`); if `lf-account-error=1`, strip + return false (stay anon). No-op (false) otherwise. Tolerates being called when `location` is a happy-dom stub.
- `export interface AccountState { enabled: boolean; kind: 'anon' | 'linked'; name: string | null; verified: boolean }`
- `export function accountState(): AccountState` — from a module var set by `boot()` from the `/hello` `account` payload (defaults to `{ enabled: accountEnabled(), kind:'anon', name:null, verified:false }`).
- `boot()` stores `j.account` into the module var; `init()` (or main.ts) calls `adoptFragmentSession()` before `boot()` so a return-from-OAuth adopts the linked session first.

- [ ] **Step 1: Write failing tests**

```ts
// add to src/account.test.ts (happy-dom env)
import { adoptFragmentSession, accountState } from './account';
describe('account — OAuth fragment adoption', () => {
  it('adopts + strips an lf-account fragment and stores the session', () => {
    location.hash = '#lf-account=sometoken.sig&linked=1';
    expect(adoptFragmentSession()).toBe(true);
    expect(localStorage.getItem('lancefall.session')).toBe('sometoken.sig');
    expect(location.hash).not.toContain('lf-account');
  });
  it('is a no-op when there is no fragment', () => {
    location.hash = '';
    expect(adoptFragmentSession()).toBe(false);
  });
  it('strips the error fragment and stays anon', () => {
    location.hash = '#lf-account-error=1';
    expect(adoptFragmentSession()).toBe(false);
    expect(location.hash).not.toContain('lf-account-error');
  });
});
describe('account — accountState default', () => {
  it('defaults to anonymous', () => {
    expect(accountState()).toMatchObject({ kind: 'anon', name: null, verified: false });
  });
});
describe('account — startLink offline no-op', () => {
  it('does not navigate when no backend / not opted in', () => {
    // BASE is '' in vitest → startLink must do nothing (no throw)
    expect(() => account.startLink('discord')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then **Step 3: implement** per the interfaces, then **Step 4: run green** (`npx vitest run src/account.test.ts`), **tsc clean**.

> Implementation notes: parse the hash with a small regex `(/[#&]lf-account=([^&]+)/)`; `decodeURIComponent` the token; `history.replaceState(null, '', location.pathname + location.search)` to strip (guard for happy-dom: wrap in try/catch). `startLink` uses `location.assign(url)` (guard/try-catch). Keep every path non-throwing.

- [ ] **Step 5: Wire `main.ts`** — before `account.init()`/`boot()`, call `if (account.adoptFragmentSession()) { /* adopted a linked session */ }` then boot (boot re-syncs). Keep it inside the existing gated block; ~2 added lines.

- [ ] **Step 6: Commit**

```bash
git add src/account.ts src/account.test.ts src/main.ts
git commit -m "feat(lancefall): client startLink + OAuth fragment adoption + accountState (P2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `panels/account.ts` sign-in panel + thin ui.ts wiring + SETTINGS entry

**Files:**
- Create: `src/panels/account.ts`, `src/panels/account.test.ts`
- Modify: `src/ui.ts` (thin), `src/panels/settings.ts` (one button)

**Interfaces:**
- `export interface AccountPanelDeps { onSignIn: (p: 'discord'|'google') => void; onClose: () => void }`
- `export interface AccountPanel extends Panel {}` (`buildAccountPanel(deps) → AccountPanel`, `open(save)` repaints from `account.accountState()`).
- Panel content: an eyebrow + "ACCOUNT" title; a status line ("You're playing anonymously — sign in to sync across devices and claim a verified name." OR "Signed in as <name> ✓ — your progress syncs across devices."); two buttons "Sign in with Discord" / "Sign in with Google" (hidden when already linked, replaced by the verified status); a small cloud-save note. Gate: when `leaderboardEnabled()` is false, show a "Cloud accounts are unavailable in this build" inert note (offline-first). Use the same `.screen … screen-modal hidden` + `.panel` shell as other panels (copy the leaderboard shell structure).

- [ ] **Step 1–4 (TDD):** write `src/panels/account.test.ts` (happy-dom): renders the anonymous state with both sign-in buttons that call `deps.onSignIn`; renders the linked state (stub `account.accountState` to return linked) showing the verified name and hiding the buttons; the DONE button calls `onClose`. Implement `panels/account.ts`. Run green.

- [ ] **Step 5: Thin `ui.ts` wiring (mirror `buildLeaderboard`/`openLeaderboard`):**
```ts
import { buildAccountPanel, type AccountPanel } from './panels/account';
// field: private account!: AccountPanel; private accountPanel!: HTMLElement;
private buildAccount(): void {
  this.account = buildAccountPanel({
    onSignIn: (p) => accountLib.startLink(p),     // import * as accountLib from './account'
    onClose: () => this.closeModal(this.accountPanel),
  });
  this.accountPanel = this.account.root;
}
openAccount(): void { if (!this.saveRef) return; this.account.open(this.saveRef); this.openModal(this.accountPanel); }
```
Call `this.buildAccount()` where the other panels are built; add `[this.accountPanel, 'Account']` to the `registerModals` `labeled` array.

- [ ] **Step 6: SETTINGS entry** — in `panels/settings.ts`, add a `deps.onOpenAccount: () => void`; render a "Manage account" button in the Cloud-save section that calls it; in `ui.ts`'s `buildSettingsPanel({...})` wire `onOpenAccount: () => this.openAccount()`.

- [ ] **Step 7: Verify + commit** — `npx tsc --noEmit` clean; `npx vitest run src/panels/account.test.ts src/panels/settings.test.ts` green; full suite green.
```bash
git add src/panels/account.ts src/panels/account.test.ts src/ui.ts src/panels/settings.ts src/panels/settings.test.ts
git commit -m "feat(lancefall): sign-in panel + thin ui.ts wiring + SETTINGS account entry (P2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> ui.ts is CRLF + shared; use Edit (not sed/gawk). The wiring MUST mirror the existing leaderboard panel exactly — read those lines first. It has zero test coverage, so verify via the dev `__lf` hook / the full build, not a ui.ts unit test.

---

### Task 6: `ACCOUNTS-SETUP.md` — P2 section

**Files:** Modify `worker/ACCOUNTS-SETUP.md`.

- [ ] **Step 1:** Fill the P2 section: (1) register a **Discord** application (OAuth2 → add redirect `https://<worker>/auth/discord/callback`, scope `identify`, copy client id/secret); (2) register a **Google** OAuth client (Authorized redirect `https://<worker>/auth/google/callback`, scopes `openid profile`, copy client id/secret); (3) set the 4 secrets `npx wrangler secret put DISCORD_CLIENT_ID` (etc.); (4) local dev: add `DEV_AUTH=1` + the 4 ids to `worker/.dev.vars` to exercise sign-in without real apps; the game points at the dev worker via `VITE_LEADERBOARD_URL`. Note the redirect URL must EXACTLY match. Commit.

```bash
git add worker/ACCOUNTS-SETUP.md
git commit -m "docs(lancefall): ACCOUNTS-SETUP P2 — Discord/Google OAuth provisioning (P2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: P2 e2e — DEV_AUTH link + cross-account merge proof

**Files:** none (verification only).

- [ ] **Step 1:** tsc clean + full suite green (≥1293 + P2 tests).
- [ ] **Step 2:** Live `wrangler dev --local` with `.dev.vars` containing `HMAC_SECRET` + `DEV_AUTH=1`. Prove the cross-account merge:
  1. Device A: `POST /hello {device:"devA"}` → session `Sa`; `PUT /save` (Sa) a save with `unlockedShips:[lance,comet], highScore:300`.
  2. Device B: `POST /hello {device:"devB"}` → session `Sb`; `PUT /save` (Sb) a DIFFERENT save `unlockedShips:[lance,vortex], highScore:100, achievements:[b]`.
  3. Sign device B in: `GET /auth/discord/start?session=Sb&ret=http://localhost:PORT&dev_user=duser1&dev_name=Ace` → follow the redirect chain to `/callback` → it returns a redirect to `…#lf-account=<linkedSession>` for a NEW linked account; `PUT /save` is not needed — the link merges B's save into the linked account (which is new, so = B's save).
  4. Sign device A in with the SAME `dev_user=duser1`: `GET /auth/discord/start?session=Sa&dev_user=duser1&dev_name=Ace&ret=…` → callback finds the existing linked account (from step 3) → MERGES A's save into it.
  5. `POST /hello {session:<linkedSession from step 4>}` → assert the merged save has BOTH `comet` AND `vortex`, `highScore:300`, `achievements:[b]`, and `account.kind === 'linked'`, `account.name === 'Ace'`, `account.verified === true`. This proves cross-account merge + verified identity with ZERO lost progress.
  (Fall back to asserting via the `cloudMerge`/`oauth` unit tests + a `curl` of just the `/auth` redirects if a full browser round-trip is impractical under wrangler dev; state which path was used.)
- [ ] **Step 3:** Confirm offline-first unchanged (no backend → sign-in buttons inert, zero requests) + god-files not grown (ui.ts only the ~12-line panel wiring). Capture the proof in the e2e report.

---

## Self-Review

**Spec coverage (P2 = spec §4 linked, §5 OAuth, §7 merge-on-link, §11 names):**
- Discord + Google OAuth, PKCE + signed state → Tasks 1–3 ✓ (§5).
- Link / account-merge / recovery → Task 3 (the callback link logic) + Task 7 (proof) ✓ (§4, §7).
- Verified name + case-folded uniqueness → Task 3 (`claimName` + the uniqueness SELECT) ✓ (§5, §11).
- Sign-in panel + SETTINGS entry → Task 5 ✓ (§14).
- DEV_AUTH shim (testable without real apps) → Tasks 2/3/7 ✓ (handoff dev workflow).
- Owner setup doc → Task 6 ✓.
- Offline-first / free-tier (stateless state, no KV) / god-files → Global Constraints, enforced per task ✓.

**Placeholder scan:** the route tasks (2/3) give exact handler code for the non-obvious parts (PKCE redirect params, token exchange, link branching) and reference the contract block for the rest; no TBD. Task 5's ui.ts wiring references the leaderboard pattern (read-first) — flagged.

**Type consistency:** `signState`/`verifyState`/`StatePayload`/`PROVIDERS`/`extractIdentity` identical across Tasks 1/2/3. `signCompact`/`verifyCompact` identical across the session refactor + oauth. `startLink`/`adoptFragmentSession`/`accountState`/`AccountState` identical across Tasks 4/5. `claimName`/`mergeForLink` identical across Tasks 1/3.

**Deferred to P3:** `/score` account binding + verified marker on the board, rate-limit/plausibility/dedupe guards, account deletion + privacy note.
