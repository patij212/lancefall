# LANCEFALL leaderboard worker

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/)
backend for global leaderboards. Free-tier friendly. The game works fully offline
without it — this just lights up the **RANKS** screen and online score submission.

## Endpoints
- `POST /score` — `{ mode, name, score, wave, combo, heat, daily? }` → `{ ok: true }`
- `GET /leaderboard?mode=<mode>[&daily=YYYY-MM-DD]` → `{ entries: [{rank,name,score,wave,combo,heat}] }`
- `GET /daily` → `{ seed, date }` (shared daily seed, optional)

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
The run is client-authoritative, so scores are validated pragmatically (sanity
caps on score/wave/combo, handle sanitization, best-per-handle aggregation) rather
than with full server-side replay. That's the right trade-off for a casual,
zero-login board; if abuse becomes a problem, add a signed session token issued at
run start and verified on submit.

## Local dev
```bash
npx wrangler dev          # runs the worker locally with a local D1
```
