# LANCEFALL leaderboard worker

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/)
backend for global leaderboards, **optional player accounts** (Discord/Google OAuth → a verified
handle), and **cross-device cloud save**. Free-tier friendly. The game works fully offline without
it — this just lights up the **RANKS** screen, online score submission, and (when `HMAC_SECRET` is
set) account sign-in + cloud save.

## Endpoints

**Leaderboards + stats (no login):**
- `POST /score` — `{ mode, name, score, wave, combo, heat, daily? }` → `{ ok: true }`
- `GET /leaderboard?mode=<mode>[&daily=YYYY-MM-DD][&scope=weekly]` → `{ entries: [{rank,name,score,wave,combo,heat,verified}] }` (best per handle, top 100, edge-cached). `verified:true` = the score belongs to a linked account; an entry reusing a verified name without the account groups separately as `verified:false`.
- `GET /daily` → `{ seed, date }` (shared daily seed)
- `POST /ach` — report unlocked achievement ids (anonymous, device-keyed) for rarity stats → `{ ok: true }`
- `GET /ach` → `{ players, holders: { id: count } }` (achievement rarity, edge-cached)

**Accounts + cloud save** (require `HMAC_SECRET`; return `503 accounts disabled` without it):
- `POST /hello` — account boot in one call: validates/issues a stateless session token and returns the cloud save → `{ session, save, rev, updatedAt, account }`
- `PUT /save` — store the cloud save (Bearer session; sanitized + server-side merged; bumps `rev`) → `{ save, rev }`
- `GET /auth/<provider>/start` — begin OAuth (PKCE) for `discord` or `google` (a `DEV_AUTH` shim covers local dev)
- `GET /auth/<provider>/callback` — OAuth callback → links the account to a verified handle
- `DELETE /account` — delete the account and its data (privacy / right-to-erasure)

## Deploy
The D1 database (`lancefall`), its schema, and the KV namespace (`lancefall-rl`)
are **already provisioned** in the Cloudflare account (done via the Cloudflare MCP),
and their ids are wired into `wrangler.toml`. Only the Worker script upload remains,
which needs an interactive login:
```bash
cd worker
npm install
npx wrangler login     # opens a browser to auth your Cloudflare account
npx wrangler deploy    # uploads the script (D1 + KV already bound) → prints your worker URL
```

<details><summary>If you ever need to re-provision from scratch</summary>

```bash
npx wrangler d1 create lancefall                                # paste database_id into wrangler.toml
npx wrangler d1 execute lancefall --remote --file=schema.sql
npx wrangler kv namespace create RL                             # paste id into wrangler.toml
```
</details>

Then point the game client at it: in the **lancefall** root create `.env` (see
`.env.example`) with:
```
VITE_LEADERBOARD_URL=https://lancefall-leaderboard.<your-subdomain>.workers.dev
```
and rebuild (`npm run build`). The RANKS panel and online submission go live.

## Accounts + cloud save (optional)
Sign-in and cloud save activate **only if** the worker has an `HMAC_SECRET` (used to sign stateless
session tokens — no KV needed for sessions). OAuth additionally needs per-provider app credentials.
Set them as Worker secrets:
```bash
npx wrangler secret put HMAC_SECRET            # any long random string — signs session tokens
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```
You create the Discord + Google OAuth apps yourself (the one non-automatable step) and register each
callback URL — `https://<your-worker>/auth/discord/callback` and `.../auth/google/callback`. The
`accounts` + `saves` tables ship in `schema.sql` (applied with the D1 schema above). Without
`HMAC_SECRET` the account endpoints return `503` and the board/score endpoints keep working — the
game is fully playable with accounts off.

## Rate limiting (recommended for a public board)
IP rate-limiting (20 POST/min, 120 GET/min) activates automatically **if** a KV
namespace is bound. It's optional — the worker runs fine without it:
```bash
npx wrangler kv namespace create RL    # prints an id
# uncomment the [[kv_namespaces]] block in wrangler.toml and paste the id, then redeploy
npx wrangler deploy
```
Invalid `daily` dates and out-of-range scores are always rejected (400/422).

## Anti-cheat note
The run is client-authoritative, so scores are validated pragmatically (sanity caps on
score/wave/combo, handle sanitization, best-per-handle aggregation) rather than with full
server-side replay — the right trade-off for a casual board. **Identity**, however, *is* verifiable:
linking a Discord/Google account (signed, stateless HMAC sessions) earns a `verified` flag and an
impostor-proof handle on the board (an unlinked entry reusing a verified name groups separately as
`verified:false`). The scores themselves remain unverified.

## Local dev
```bash
npx wrangler dev          # runs the worker locally with a local D1
```
