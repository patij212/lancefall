# ACCOUNTS-SETUP — Player Accounts + Cloud Save

Owner-facing setup guide. Follow in order after deploying the leaderboard worker.

---

## P1 — Cloud Save (device-anonymous, session-signed)

### 1. Apply the D1 migration

Run from the repo root or from the `worker/` directory (idempotent — safe to re-run):

```bash
cd worker
npx wrangler d1 execute lancefall --remote --file=schema.sql
```

This creates the `accounts` and `saves` tables (see `worker/schema.sql`). The command is
idempotent — running it again on an already-migrated database is safe.

### 2. Set the session secret

Generate a long random string (32+ characters) and register it as a Wrangler secret:

```bash
npx wrangler secret put HMAC_SECRET
```

Paste your random string when prompted. This secret signs the stateless session tokens
issued by `POST /hello` and validated on `PUT /save`. Never commit the value anywhere.

For local development with `wrangler dev`, add it to `worker/.dev.vars` (gitignored):

```
HMAC_SECRET=your-random-string-here
```

A `.dev.vars.example` file documents the required keys without values.

### 3. Deploy the worker

```bash
npx wrangler deploy
```

Or from the repo root:

```bash
cd worker && npx wrangler deploy
```

### 4. Client opt-in (per-device)

The cloud-save toggle is per-device and lives in **SETTINGS → GAMEPLAY → Cloud save**.
It only appears when `VITE_LEADERBOARD_URL` is set in `.env` (or at build time), i.e.
when a backend is configured. The player opts in on each device independently —
the flag is stored in `localStorage` and is never synced.

---

## P2 / P3 — OAuth + Guards (added later)

This section is a placeholder. When OAuth identity is wired up (P2), add:

- `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` secrets via `npx wrangler secret put`
- The OAuth callback route in the worker (`/auth/callback`)
- Session upgrade: anonymous device session → authenticated user session
- Guard rules (rate-limits, abuse prevention) go here as P3

Refer to the design spec in `docs/superpowers/specs/` for the full P2/P3 plan.

---

*Last updated: P1 shipped (cloud save, device-anonymous sessions).*
