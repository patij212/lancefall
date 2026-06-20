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

## P2 — OAuth Identity (Discord + Google sign-in)

This section provisions Discord and Google OAuth for player authentication. The worker
exchanges auth codes for user profiles and upgrades device sessions to authenticated sessions.

### 1. Register a Discord application

1. Go to https://discord.com/developers/applications
2. Click **New Application** and name it (e.g., "lancefall-leaderboard")
3. Navigate to the **OAuth2** tab
4. Under **Valid OAuth2 Redirect URIs**, add:
   ```
   https://<worker>/auth/discord/callback
   ```
   where `<worker>` is your deployed worker origin (e.g., `https://lancefall-leaderboard.patij212.workers.dev`)
5. Copy the **Client ID** and **Client Secret** (generate it if needed) — you'll need both below

The worker requests the `identify` scope to read the user's public Discord profile.

### 2. Register a Google OAuth client

1. Go to https://console.cloud.google.com/apis/credentials
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application** as the application type
4. Under **Authorized redirect URIs**, add:
   ```
   https://<worker>/auth/google/callback
   ```
   (same worker origin as Discord)
5. Copy the **Client ID** and **Client Secret**

If prompted to configure an OAuth consent screen, set it to **External** (or **Internal** if your org manages GCP)
and add basic scopes (`openid`, `profile`). The worker requests `openid profile` for user identity.

### 3. Set the Worker secrets

From the `worker/` directory (or repo root), register each secret:

```bash
cd worker
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Paste each value when prompted. `HMAC_SECRET` (from P1) is also used to sign OAuth state tokens.

Never commit these values anywhere. For local development, add dummy values to `worker/.dev.vars`
(see step 5).

### 4. Redeploy the worker

After setting all four secrets:

```bash
npx wrangler deploy
```

### 5. Local development without real provider apps (optional)

To test the full sign-in → link → cross-device-merge flow locally without real Discord/Google apps,
add `DEV_AUTH=1` and dummy credentials to `worker/.dev.vars`:

```
DEV_AUTH=1
HMAC_SECRET=your-random-string-here
DISCORD_CLIENT_ID=dummy
DISCORD_CLIENT_SECRET=dummy
GOOGLE_CLIENT_ID=dummy
GOOGLE_CLIENT_SECRET=dummy
```

With `DEV_AUTH=1`, the worker provides a fake OAuth shim: start sign-in with `?dev_user=alice&dev_name=Alice`
and the callback skips the real provider, issuing a test session directly. This lets you exercise the full
player-account flow without provisioning live apps.

**Critical:** Never set `DEV_AUTH=1` in production. The `worker/.dev.vars` file is gitignored — only your
local `wrangler dev --local` reads it.

### 6. Redirect URL must match exactly

The most common OAuth error is a mismatch between the redirect URL registered with the provider and the
one the worker uses. Ensure both Discord and Google have the exact same callback URL registered.

The game client points at the worker via `VITE_LEADERBOARD_URL` (set in `.env` or at build time).

---

## P3 — Guards + Account Deletion (added later)

This section is a placeholder. When verified-leaderboard guards are wired up (P3), add:

- Rate-limit and abuse-prevention rules
- Account deletion endpoint + privacy notice
- Verified submission rules (signature validation, replay prevention)

---

*Last updated: P2 shipped (Discord + Google OAuth provisioning).*
