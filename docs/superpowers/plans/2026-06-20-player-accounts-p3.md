# Player Accounts P3 — Verified Leaderboards + Light Guards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`. **Builds on P1 + P2** (already on this branch): the `accounts`/`saves` tables, stateless HMAC sessions, the `/hello`+`/save`+`/auth/*` routes, `account.ts`, `panels/account.ts`. The existing leaderboard (`/score`, `/leaderboard`, `scores` table, `api.ts`, `panels/leaderboard.ts`) predates accounts.

**Goal:** Make the leaderboard **trustworthy**: a linked account's submissions carry its identity and show a **verified ✓** marker under the **owned name you can't be impersonated on**; add **light "within reason" anti-cheat** (per-account + per-IP rate-limit without new per-request KV, plausibility bounds — already present — and exact-duplicate dedupe); and let a player **delete their account + cloud data** with a short **privacy note** in-game.

**Architecture:** `scores` gains a nullable `account_id`. `/score` accepts the session bearer (optional — anon submits still work exactly as today): for a linked account it **overrides the submitted name with the account's owned verified name** and stamps `account_id`, so the board keys verified entries by `account_id` (an impostor using the same name string groups separately and stays unverified). `/leaderboard` groups by `COALESCE(account_id, name)` and returns a `verified` flag per entry. The client `api.ts` attaches the session header (fire-and-forget, unchanged offline contract); the RANKS panel shows a ✓. A `DELETE /account` route + an account-panel "Delete my account & cloud data" action wipe the rows; a privacy note lives in the account panel. Guards are pure + D1-counter based (no new KV).

**Tech Stack:** Cloudflare Workers + D1, Vite + vanilla TS, Vitest.

## Global Constraints

- **Offline-first sacred.** No backend / never-opted-in / offline → zero behavior change. **Anonymous score submission works EXACTLY as today** (the session header is optional; an anon submit is unchanged). `api.ts` stays fire-and-forget, never throws.
- **Free-tier discipline.** The per-account rate-limit + dedupe use **D1 reads on the `scores` table (no NEW per-request KV writes)**; the existing per-IP KV `rateOk` is pre-existing and reused as-is. No extra boot calls.
- **Security.** A verified name **can't be impersonated**: only the linked account's own submissions (carrying its `account_id`, overridden to its owned name) are marked verified; a free-text impostor using the same string groups separately and is unverified. Plausibility bounds (existing `capsOk`) reject impossible payloads. `DELETE /account` verifies the session and only deletes the session's own account. Parameterized SQL everywhere.
- **Determinism untouched.** No sim/world.rng; the Daily stays bit-identical. (Score submission has never been in the sim.)
- **The merge / accounts model is untouched** — P3 only reads the account's name/verified + adds a deletion route.
- **Don't grow the god-files.** New guard logic in `worker/src/validate.ts` (pure) + the `/score`/`/leaderboard`/`DELETE /account` route bodies; `api.ts` thin (session header + `verified` field); `panels/leaderboard.ts` gets the ✓ marker; the deletion action + privacy note go in `panels/account.ts`.
- **Tests stay green.** P1+P2 suite (1324) + new P3 tests green; `npx tsc --noEmit` clean.
- **P2 carry-over (address here):** on a recovery re-link, don't wipe an existing verified name when the freshly-claimed name now collides (`worker/src/index.ts` link branch). Fold this one-line guard into Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `worker/schema.sql` (MODIFY) | `ALTER TABLE scores ADD COLUMN account_id TEXT;` guarded so re-apply is safe; an index on `(account_id)` is optional (skip — the board scan is small). |
| `worker/src/validate.ts` (MODIFY, pure) | `dedupeKey(...)` / a pure `withinPerAccountLimit(count, limit)` helper if useful; keep `capsOk` as-is (plausibility already covered). Add tests. |
| `worker/src/index.ts` (MODIFY) | `/score`: read the optional session → resolve a linked account → override name + stamp `account_id`; per-account rate-limit (D1 count) + exact-dup dedupe (D1). `/leaderboard`: group by `COALESCE(account_id, name)`, return `verified`. `DELETE /account`: verify session → delete the account's `saves` + `accounts` rows (+ null its `scores.account_id`). The P2 name-collision guard. |
| `src/api.ts` (MODIFY, thin) | `submitScore` attaches `Authorization: Bearer <session>` when present (from `account.getSession()`); `ScoreEntry` gains `verified?: boolean`; `fetchLeaderboard` passes it through. |
| `src/account.ts` (MODIFY, thin) | `export function getSession(): string` (the stored session, '' if none) for the submit header; `export async function deleteAccount(): Promise<boolean>` (DELETE /account, then clear local session + opt-out; fire-and-forget, never throws). |
| `src/panels/leaderboard.ts` (MODIFY) | Render a small ✓ "verified" marker next to entries with `verified === true` (match the existing row markup). |
| `src/panels/account.ts` (MODIFY) | A "Delete my account & cloud data" action (with a confirm step) calling `deps.onDelete` → `account.deleteAccount()`; a short **privacy note** ("What we store: a provider user id + your game progress. Why: cross-device sync + a verified name. Delete anytime — this wipes your cloud data."). |
| `worker/ACCOUNTS-SETUP.md` (MODIFY) | Fill the P3 section: the `scores.account_id` migration (re-run `schema.sql`), a note that verified boards + guards + deletion are now live, and the privacy-note location. |

### The verified-board read (the key query)

```sql
SELECT name, MAX(score) AS score, wave, combo, heat,
       CASE WHEN account_id IS NOT NULL THEN 1 ELSE 0 END AS verified
FROM scores
WHERE mode = ? [AND daily = ? | AND ts >= ?]
GROUP BY COALESCE(account_id, name)
ORDER BY score DESC LIMIT 100
```
- Linked entries group by `account_id` (their `name` is the owned verified name `/score` stamped); anon entries group by `name` (unchanged). An impostor submitting the same name string has a NULL `account_id` → groups separately → `verified = 0`. SQLite's bare-column rule takes `name`/`account_id` from the `MAX(score)` row.

---

### Task 1: D1 `scores.account_id` + verified-board read

**Files:** Modify `worker/schema.sql`, `worker/src/index.ts`.

- [ ] **Step 1: Add the column (idempotent-safe apply).** Append to `schema.sql`:
```sql

-- Player Accounts P3 — bind a score to a linked account (nullable; anon scores leave it NULL).
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; guard the re-apply by ignoring the duplicate-column
-- error (the owner applies the whole file; a fresh DB adds it, a re-apply is a harmless no-op).
ALTER TABLE scores ADD COLUMN account_id TEXT;
```
> Note for the apply: on a DB that already has the column, this single statement errors with "duplicate column name". Document in ACCOUNTS-SETUP that a re-apply may report that one benign error, OR (preferred) instruct the owner to run just this line guarded. To keep the local-D1 verification clean, the implementer should apply it to a FRESH local D1 (delete `.wrangler/state` for the test or use a new DB) and confirm `node:sqlite` parses the full file on a fresh DB.

- [ ] **Step 2: Change the `/leaderboard` read** to the verified-board query above (3 variants: all-time, daily, weekly) — add `account_id` to the SELECT/GROUP BY and the `verified` CASE column; map `verified: r.verified === 1` into each entry. Keep the edge-cache + rate-limit path intact (the cached body now includes `verified`).

- [ ] **Step 3: Verify.** Fresh local D1: `node:sqlite` parses `schema.sql`; `npx tsc --noEmit` clean; worker dry-run bundle clean. (Live verified read proven in Task 6 e2e.)

- [ ] **Step 4: Commit.**
```bash
git add worker/schema.sql worker/src/index.ts
git commit -m "feat(lancefall): scores.account_id + verified-board read (P3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `/score` binds the account + light guards (+ the P2 name-collision carry-over)

**Files:** Modify `worker/src/index.ts`, `worker/src/validate.ts` (+ `src/workerValidate.test.ts`).

**Interfaces:**
- `/score` (extend): read the OPTIONAL `Authorization: Bearer <session>`; if it verifies → `aid`; `SELECT name, name_verified FROM accounts WHERE id=aid`; if the account is linked with a verified name → **override `name` with the owned name** and set `account_id = aid` on the insert. If no/invalid session → behave EXACTLY as today (anon, `account_id` NULL). NEVER reject a submit for lacking a session.
- **Per-account rate-limit (no new KV):** when `aid` is present, `SELECT COUNT(*) AS n FROM scores WHERE account_id=? AND ts > ?` (last 60s); if `n >= ACCOUNT_RATE_LIMIT` (e.g. 10/min) → 429. (The existing per-IP KV `rateOk` still applies to all submits.)
- **Dedupe:** `SELECT 1 FROM scores WHERE mode=? AND name=? AND score=? AND wave=? AND combo=? AND ts > ?` (last ~5 min); if found → return `{ ok: true, deduped: true }` 200 WITHOUT inserting (an exact-duplicate resubmit is a silent no-op, not an error).
- **Plausibility:** keep the existing `capsOk` (no change — it already rejects impossible payloads).

- [ ] **Step 1: Pure guard helpers + tests** in `validate.ts`: `export const ACCOUNT_RATE_LIMIT = 10; export const DEDUPE_WINDOW_MS = 300_000; export const ACCOUNT_RATE_WINDOW_MS = 60_000;` and a pure `export function dedupeKey(b: {mode:string;name:string;score:number;wave:number;combo:number}): string` (used only if a hashing approach is cleaner; otherwise the SQL WHERE is the dedupe). Add a `workerValidate.test.ts` case asserting the constants + that `capsOk` still rejects an implausible payload (regression). (The D1-backed rate/dedupe are integration-tested in Task 6.)

- [ ] **Step 2: Implement the `/score` extension** per the interfaces. Resolve the session via `verifySession(bearer(req))` (the `bearer` helper exists from P1). On a linked+verified account, override the name; stamp `account_id`. Apply the per-account rate-limit + dedupe BEFORE the insert. All SQL parameterized.

- [ ] **Step 3: P2 carry-over** — in the `/auth/callback` link branch, when claiming a name that now collides with ANOTHER account, do NOT overwrite an already-`name_verified` account's existing name with NULL: only set `name=NULL` if the account had no verified name before; otherwise keep the existing name. (One conditional around the existing UPDATE.) A comment cites the P2 final review.

- [ ] **Step 4: Verify** — tsc clean; `npx vitest run src/workerValidate.test.ts` green; worker dry-run bundle clean.

- [ ] **Step 5: Commit.**
```bash
git add worker/src/index.ts worker/src/validate.ts src/workerValidate.test.ts
git commit -m "feat(lancefall): /score account binding + per-account rate-limit + dedupe + verified name override (P3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Client — session header on submit + `verified` field + RANKS ✓ marker

**Files:** Modify `src/api.ts`, `src/account.ts`, `src/panels/leaderboard.ts` (+ tests).

**Interfaces:**
- `src/account.ts`: `export function getSession(): string` — returns the stored session token ('' if none).
- `src/api.ts`: `submitScore` — when `account.getSession()` is non-empty, add `authorization: Bearer <session>` to the POST headers; otherwise unchanged (anon). `ScoreEntry` gains `verified?: boolean`; `fetchLeaderboard` maps `j.entries[].verified` through. The offline no-op contract is unchanged (BASE empty → still a no-op).
- `src/panels/leaderboard.ts`: in the entry-row render, when `entry.verified` is true, append a small ✓ verified marker next to the name (match the row's existing markup; a `<span class="rank-verified" title="Verified account">✓</span>` or similar — read the file to match its style).

> `api.ts` importing `account.ts`: `account.ts` already imports from `api.ts` (deviceId). To avoid a cycle, `getSession` reads localStorage directly — so `api.ts` can read the session WITHOUT importing `account.ts`: add a tiny local `sessionToken()` in `api.ts` that reads `localStorage.getItem('lancefall.session')` (guarded), rather than importing account. (Keeps the existing api→nothing dependency direction.)

- [ ] **Step 1: Tests** — `src/api.test.ts`: with BASE empty, `submitScore` is still a no-op (unchanged). Add a `fetchLeaderboard` test that a `verified` field round-trips through the mapping (mock a response). `src/panels/leaderboard.test.ts`: an entry with `verified:true` renders the ✓ marker; without it, no marker.
- [ ] **Step 2: Implement** the `sessionToken()` reader + header in `api.ts`, `ScoreEntry.verified`, the `getSession` export in `account.ts`, and the ✓ in `panels/leaderboard.ts`.
- [ ] **Step 3: Verify** — tsc clean; `npx vitest run src/api.test.ts src/panels/leaderboard.test.ts` green; full suite green; `npm run build` succeeds.
- [ ] **Step 4: Commit.**
```bash
git add src/api.ts src/account.ts src/panels/leaderboard.ts src/api.test.ts src/panels/leaderboard.test.ts
git commit -m "feat(lancefall): submit with session header + verified ✓ marker on RANKS (P3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Account deletion — `DELETE /account` + client + panel action

**Files:** Modify `worker/src/index.ts`, `src/account.ts`, `src/panels/account.ts` (+ tests).

**Interfaces:**
- Worker `DELETE /account` (Authorization bearer): `verifySession` (401 if invalid) → `DB.batch([DELETE FROM saves WHERE account_id=?, UPDATE scores SET account_id=NULL WHERE account_id=?, DELETE FROM accounts WHERE id=?])` (the score rows STAY on the board as anon — we wipe the LINK + the personal cloud data, not other players' board history). Return `{ ok: true }`. If `HMAC_SECRET` unset → 503.
- `src/account.ts`: `export async function deleteAccount(): Promise<boolean>` — `DELETE ${BASE}/account` with the bearer; on success clear `lancefall.session`, set rev=0, `optOut()`, reset `_accountState` to anonymous; returns true. Fire-and-forget-safe (never throws; returns false on failure).
- `src/panels/account.ts`: a "Delete my account & cloud data" button (styled as a destructive/secondary action) that asks for confirm (a two-click confirm or a small inline "Are you sure? — Confirm/Cancel"), then calls `deps.onDelete` → `account.deleteAccount()`, then repaints the panel to the anonymous state. Only shown when linked OR opted-in (there's something to delete).

- [ ] **Step 1: Tests** — `src/account.test.ts`: `deleteAccount` is a no-op returning false when offline (BASE empty), never throws. `src/panels/account.test.ts`: the delete button appears in the linked state, the confirm flow calls `deps.onDelete`, and the panel can repaint to anonymous afterward (stub `account.accountState`/`deleteAccount`).
- [ ] **Step 2: Implement** the route, the client `deleteAccount`, and the panel action + confirm.
- [ ] **Step 3: Verify** — tsc clean; focused tests green; worker dry-run bundle clean; full suite green; `npm run build` succeeds.
- [ ] **Step 4: Commit.**
```bash
git add worker/src/index.ts src/account.ts src/panels/account.ts src/account.test.ts src/panels/account.test.ts
git commit -m "feat(lancefall): DELETE /account + in-game delete-my-data action (P3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Privacy note + ACCOUNTS-SETUP P3 section

**Files:** Modify `src/panels/account.ts`, `worker/ACCOUNTS-SETUP.md` (+ panel test touch).

- [ ] **Step 1: Privacy note** — add a short, plain-language note to `panels/account.ts` (visible in both anon + linked states, e.g. a small `.account-privacy` block): *"Privacy: signing in stores a provider user id + your game progress, used only to sync across devices and show a verified name. No third-party analytics. Delete your account anytime to wipe your cloud data."* A test asserts the note renders.
- [ ] **Step 2: ACCOUNTS-SETUP P3 section** — document: the `scores.account_id` migration (re-run `schema.sql`; note the one benign "duplicate column" error on an already-migrated DB, or apply just the ALTER once); that verified boards + the light guards (per-account rate-limit, dedupe, existing plausibility) + account deletion are now live; the in-game privacy note + delete action location. No new secrets for P3.
- [ ] **Step 3: Verify + commit** — `npx vitest run src/panels/account.test.ts` green; tsc clean.
```bash
git add src/panels/account.ts src/panels/account.test.ts worker/ACCOUNTS-SETUP.md
git commit -m "feat(lancefall): in-game privacy note + ACCOUNTS-SETUP P3 (P3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: P3 e2e — verified submit + guards reject junk + deletion

**Files:** none (verification only).

- [ ] **Step 1:** tsc clean + full suite green (≥1324 + P3 tests) + `npm run build` succeeds.
- [ ] **Step 2:** Offline path unchanged: `submitScore` with BASE='' is still a no-op (api.test); anon submit (no session) still works against the worker exactly as today.
- [ ] **Step 3:** Live `wrangler dev --local` (`.dev.vars` with HMAC_SECRET + DEV_AUTH=1). Prove:
  1. **Verified submit:** sign in (DEV shim) → get a linked session with name "Ace" → `POST /score` (Bearer the linked session) `{mode:endless, name:"whatever", score:5000, wave:8, combo:20, heat:2}` → then `GET /leaderboard?mode=endless` → assert the entry shows `name:"Ace"` (overridden to the owned name) AND `verified:true`.
  2. **Impostor stays unverified:** `POST /score` with NO session, `name:"Ace", score:9999` → `GET /leaderboard` → the anon "Ace" entry groups SEPARATELY and is `verified:false` (it did NOT steal the verified marker).
  3. **Guards reject junk:** an implausible `POST /score` (e.g. `score:49000000, wave:1`) → 422 (capsOk). A burst of >10 submits/min from the linked account → a 429 (per-account rate-limit). An exact-duplicate resubmit → `{ok:true, deduped:true}` and the board count doesn't double.
  4. **Deletion:** `DELETE /account` (Bearer the linked session) → `{ok:true}`; a subsequent `POST /hello {session:<that>}` issues a fresh ANON account (the linked one is gone) and the verified board entry's row remains but is now `account_id NULL` → unverified.
  (Fall back to unit-level proof + partial curl if a step is impractical under wrangler dev; state which path.)
- [ ] **Step 4:** Confirm god-files not grown (api.ts thin, ui.ts untouched in P3), offline-first unchanged. Capture the proof in the e2e report.

---

## Self-Review

**Spec coverage (P3 = spec §8 verified board + guards, §11 deletion + privacy):**
- Verified identity on the board (owned name + ✓, no impersonation) → Tasks 1–3 ✓ (§8.1).
- Rate limiting (per-account D1-count + the existing per-IP KV) → Task 2 ✓ (§8.2).
- Plausibility bounds (existing `capsOk`) → unchanged, regression-tested in Task 2 ✓ (§8.3).
- Dedupe (exact-duplicate resubmit ignored) → Task 2 ✓ (§8.4).
- Account deletion (`DELETE /account` + in-game action) → Task 4 ✓ (§11).
- Privacy note → Task 5 ✓ (§11).
- Owner setup → Task 5 ✓.
- Offline-first (anon submit unchanged) / free-tier (no new KV) / god-files → Global Constraints + Task 6 proof.
- P2 carry-over (name-collision on re-link) → Task 2 Step 3 ✓.

**Placeholder scan:** the verified-board query + the guard SQL are given exactly; the panel markers reference "match the existing markup" (read-first) — flagged. No TBD.

**Type consistency:** `ScoreEntry.verified`/`getSession`/`deleteAccount` identical across Tasks 3/4. `account_id` column + the `verified` CASE identical across Tasks 1/2. The `DELETE /account` batch identical across Task 4.

**Explicitly out of scope (spec §8 deferred):** server-side deterministic replay validation (re-simulating a run) — not free-CPU-friendly; a separate future spec.
