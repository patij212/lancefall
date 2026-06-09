# LANCEFALL leaderboard worker

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/)
backend for global leaderboards. Free-tier friendly. The game works fully offline
without it — this just lights up the **RANKS** screen and online score submission.

## Endpoints
- `POST /score` — `{ mode, name, score, wave, combo, heat, daily? }` → `{ ok: true }`
- `GET /leaderboard?mode=<mode>[&daily=YYYY-MM-DD]` → `{ entries: [{rank,name,score,wave,combo,heat}] }`
- `GET /daily` → `{ seed, date }` (shared daily seed, optional)

## Deploy (one-time, ~5 min)
```bash
cd worker
npm install
npx wrangler login                       # opens a browser to auth your Cloudflare account
npx wrangler d1 create lancefall         # prints a database_id — paste it into wrangler.toml
npx wrangler d1 execute lancefall --remote --file=schema.sql   # create the table
npx wrangler deploy                      # prints your worker URL
```

Then point the game client at it: in the **lancefall** root create `.env` (see
`.env.example`) with:
```
VITE_LEADERBOARD_URL=https://lancefall-leaderboard.<your-subdomain>.workers.dev
```
and rebuild (`npm run build`). The RANKS panel and online submission go live.

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
