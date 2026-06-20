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

## P3 — Verified Leaderboards + Account Deletion + Privacy

### 1. Apply the D1 migration (scores.account_id column)

Re-run the same schema file to pick up the new `account_id` column on the `scores` table:

```bash
cd worker
npx wrangler d1 execute lancefall --remote --file=schema.sql
```

**Note:** If the database was already migrated (e.g., you ran this once for P1 or P2), the single
`ALTER TABLE scores ADD COLUMN account_id` statement will report a benign error:

```
Error: duplicate column name: account_id
```

All other statements in `schema.sql` use `CREATE TABLE IF NOT EXISTS` and are safe to re-run.
You can safely ignore the duplicate-column error — it means the column already exists.
Alternatively, apply just the new line manually:

```bash
npx wrangler d1 execute lancefall --remote --command "ALTER TABLE scores ADD COLUMN account_id TEXT REFERENCES accounts(id)"
```

### 2. What P3 adds (no new secrets required)

No new Wrangler secrets are needed for P3. The features below are live after redeployment:

**Verified leaderboards:**
- Score submissions from authenticated (linked) players attach their `account_id`, surfaced as
  a `verified: true` flag on leaderboard entries.
- Unlinked (anonymous) submissions remain accepted but are shown as unverified.

**Light abuse guards (no additional config):**
- **Per-account rate-limit** — a single account cannot submit more than N scores within a rolling
  window (enforced in the Worker with an in-memory counter backed by a D1 timestamp check).
- **Exact-duplicate dedupe** — identical `(account_id, score, seed)` tuples are silently dropped.
- **Existing plausibility caps** — inherited from the leaderboard worker's existing score-range
  validation (scores outside realistic bounds are rejected).

**Account deletion (`DELETE /account`):**
- Players can delete their account and all associated cloud data (save, verified name, scores) from
  within the game. The endpoint wipes the `accounts` and `saves` rows and nulls the `account_id`
  foreign key on any existing `scores` rows.

### 3. In-game privacy notice + delete action location

A plain-language **privacy note** is now shown in the Account panel in both the anonymous and
linked states. Text:

> Privacy — signing in stores a provider account id and your game progress, used only to sync
> across devices and show a verified name. No third-party analytics. You can delete your account
> anytime to wipe your cloud data.

The **"Delete my account & cloud data"** action is found at:

**SETTINGS → Manage account** (opens the ACCOUNT panel) → **Delete my account & cloud data** button
→ inline confirm step (red CONFIRM button) → deletion executes.

Deletion wipes the player's cloud save and verified name. Local (device) progress is unaffected.

---

*Last updated: P3 shipped (verified leaderboards + guards + account deletion + privacy notice).*
