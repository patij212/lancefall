# Player Accounts, Cloud Save & Verified Leaderboards — design spec

> **Status:** approved in brainstorming (2026-06-20). Goals locked by the owner: **(1) never lose progress / cross-device cloud save**, and **(2) trustworthy leaderboards — verified names you own**, with **anti-cheat kept light ("protection within reason")**. NOT social, NOT monetization. The whole thing must stay **offline-first** (the game already works flawlessly with no backend) and **comfortably within Cloudflare's free plan for several thousand daily players.**

---

## 1. Overview

Add optional player accounts so a signed-in player's full progression follows them across devices, and so the leaderboard shows verified, owned names instead of spoofable free-text handles. It extends infrastructure that already exists — a Cloudflare **Worker + D1** backend (`worker/`, called offline-first from `src/api.ts`) and an anonymous **device token** (`deviceId()` in `api.ts`). Accounts are **progressive and opt-in**: every player keeps playing exactly as today with zero friction; cloud save + a verified name are an *upgrade* the player chooses.

## 2. Principles & hard constraints

- **Offline-first is sacred.** With no backend configured, offline, or for any player who never opts in, the game behaves **exactly as today** — pure localStorage, no blocking on the network. The account layer is **additive and fire-and-forget**, like `api.ts` already is.
- **Opt-in.** Cloud save and accounts do nothing until the player enables them. A purely-anonymous, never-signed-in player makes **zero new requests** (only the existing leaderboard submit).
- **Free-tier discipline (see §10).** Stateless signed sessions (no KV writes), debounced session-end save writes (not per-run), a combined boot call. Designed to stay under Workers' 100k-requests/day free cap for several thousand DAU.
- **Determinism untouched.** None of this runs in the seeded sim or draws `world.rng`. The Daily stays bit-identical. (Server-side save *validation* reuses the pure `migrate.ts` discipline, not the sim.)
- **Player-favoring merge.** The cloud-save merge **never loses an unlock or a record**; in rare divergent-offline-spend cases it favors the player (§7).
- **Don't grow the god-files.** New client logic in a focused `src/account.ts` + a thin `src/cloudMerge.ts` (pure); Worker logic in `worker/` modules; `save.ts`/`ui.ts` touched thinly.

## 3. Architecture

```
┌─ Client (the game, on Cloudflare Pages — free/unlimited static) ─────────────┐
│  save.ts (localStorage, unchanged)                                            │
│  account.ts   — anon token, session, opt-in sync (boot + debounced flush)     │
│  cloudMerge.ts — PURE field-aware merge(local, cloud) → merged (heavily tested)│
│  api.ts        — existing leaderboard client (gains an account-bound submit)  │
└──────────────────────────────────────────────────────────────────────────────┘
            │  HTTPS, fire-and-forget, signed session header
            ▼
┌─ Cloudflare Worker (worker/) ────────────────────────────────────────────────┐
│  /hello   — validate session + return cloud save (one boot call)              │
│  /save    — PUT: merge(server, incoming) → store; GET handled by /hello       │
│  /auth/*  — OAuth start + callback (Discord, Google), link/merge accounts      │
│  /score, /leaderboard, /ach — existing, gains account binding + light guards  │
│  D1: accounts, saves (+ existing leaderboard tables)                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

All new client code is **defensive + non-blocking**: any failure (offline, 5xx, no backend) silently degrades to localStorage. The game loop never awaits the network.

## 4. Account model — progressive, anonymous-first

1. **Anonymous (default, today):** the existing `deviceId` localStorage token. The player plays + cloud-saves on *this device* once they opt in; on the leaderboard they're **provisional/unverified** (the current ANON behavior).
2. **Linked (opt-in upgrade):** a "**Sign in to sync across devices + claim a verified name**" button runs **Discord or Google OAuth**. The Worker links the provider identity to the current account (or, if that provider already has an account, **merges the two saves** — §7). The player is now **cross-device** and owns a **verified name**.
3. **Recovery:** signing in with the same provider on any device re-attaches the account (and merges whatever local progress that device had).

## 5. Auth & sessions

- **Anonymous account:** `POST /hello` with the `deviceId` → the Worker upserts an anonymous `accounts` row → returns a **stateless signed session token** (an HMAC-signed compact token: `{accountId, anon|linked, exp}` signed with a Worker secret). Stored in localStorage; sent as an `Authorization` header on every call. **No KV, no DB write per request** to validate — the Worker verifies the signature locally (cheap, < 10 ms CPU).
- **OAuth (Discord + Google), PKCE + state:** `GET /auth/<provider>/start` → redirect to the provider with a PKCE challenge + a signed state nonce. `GET /auth/<provider>/callback` → exchange code (a single subrequest — wall-time, not CPU), fetch the provider's stable user id, then **link**: if no account has this provider id, attach it to the current session's account; if one does, **merge** the current account's save into it and switch the session to it. Returns a fresh `linked` session token.
- **Name ownership:** a linked account may claim a name; the Worker enforces uniqueness among linked accounts (case-folded) so a verified name can't be impersonated. Anonymous players keep the existing free-text handle (shown unverified).
- **CSRF/abuse:** OAuth `state` nonce + PKCE; the session token is a bearer token (not a cookie) so classic CSRF doesn't apply; per-account + per-IP rate limits on `/save` and `/auth` (§8, done without per-request KV writes — a short in-memory/Worker-local or D1-counter guard).

## 6. Data model (D1)

```sql
CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,         -- random id
  anon_token    TEXT UNIQUE,              -- the deviceId that created it (nullable after link merges)
  provider      TEXT,                     -- 'discord' | 'google' | NULL (anonymous)
  provider_id   TEXT,                     -- stable provider user id; UNIQUE(provider, provider_id)
  name          TEXT,                     -- claimed verified name (linked only); UNIQUE case-folded
  name_verified INTEGER DEFAULT 0,
  created_at     INTEGER,
  updated_at     INTEGER
);
CREATE UNIQUE INDEX idx_provider ON accounts(provider, provider_id);

CREATE TABLE saves (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id),
  blob        TEXT,        -- the merged SaveData JSON (validated/sanitized server-side)
  rev         INTEGER,     -- monotonic revision (optimistic concurrency)
  updated_at  INTEGER
);
```

Existing leaderboard tables gain a nullable `account_id` + a `verified` flag (§8). Saves are ~10–20 KB JSON → **5 GB free storage holds ~250k+ accounts** (non-issue).

## 7. Cloud save sync + the field-aware merge (the crux)

`SaveData` is almost entirely **accumulative**, so the merge is **field-aware, never last-write-wins**, so a player can *never* lose an unlock or a record by playing on a second device. The merge is a **pure function `mergeSaves(a, b, aWrittenAt, bWrittenAt): SaveData`** in `src/cloudMerge.ts` — a **single shared module imported by both the client and the Worker** (one source of truth; if the Worker build can't reach `src/`, a kept-in-sync copy guarded by a shared golden-vector test, so behavior can never drift). It's driven by a per-field **category map** so adding a future field forces a deliberate choice (default = the safe union/max). *Selection* fields resolve to whichever save was **written more recently** — the client stamps its local save's write-time (a `lastWrittenAt` it tracks in localStorage), and the `saves` row carries `updated_at`.

| Category | Rule | Fields |
|---|---|---|
| **Accumulative number** | **max** | highScore, bestCombo, bestWave, dailyBest, maxHeat, deepestWave, lifeKills/Boss/Shards/Wins/Grazes/Daybreaks/LastBreath, longestRunSec, mostBossesOneRun, lifeTimeSec, ngPlusLevel, totalRuns, playStreak, bombeLevel |
| **Best-is-smallest** | **min of non-zero** (0 = unset) | fastestArenaSec |
| **Set (string[])** | **union (deduped)** | unlockedShips/Themes/Trails/ShipSkins, achievements, stillpointLore, stillpointFragments, glossSeen, taught, decryptedWords, solvedPuzzles |
| **Per-key number record** | **per-key max** | meta (node levels), bestByMode, killsByKind, nemesis, runsByMode, winsByMode, playDays |
| **Selection / preference** | **latest by the save's write-time** | selectedShip/Theme/Trail/Mode/Heat/Archetype, selectedSkins, selectedShipSkins, handle, cityMemoryMeter, ngPlusActive, baseShields, stillpointChoice, dailyMutators, dailySeed/dailyAttempts/dailyAttemptDate, lastPlayedDate, firstRunsBeatHint, seenTutorial/seenSandbox |
| **Bounded ring** | **union by key, keep newest N** | runHistory (by date+score), lastRuns (one per mode, newest) |
| **Spendable balance** | **reconcile from earned − spent (§7.1)** | shards; fragments balance (collected set − `fragmentsSpent` counter) |

### 7.1 Spendable economies (the one genuinely tricky part)
Balances aren't monotonic, so we reconcile from their monotonic components:
- **Shards:** `spent = lifeShards − shards` per device → `merged.lifeShards = max(earned)`, `merged_spent = max(spent)`, `merged.shards = max(0, merged.lifeShards − merged_spent)`.
- **Fragments:** collected is a **set** (`stillpointFragments`, union = exact) and `fragmentsSpent` is a **counter** (max) → `balance = |union| − max(fragmentsSpent)`.
- **`meta` levels / `bombeLevel`** are taken at **per-node max** (you keep every upgrade either device bought).

**The honest stance (locked):** the merge **favors the player and never removes progress.** In the rare case of *divergent offline spending on two devices* (buy node X on A, node Y on B, both offline), the player keeps **both** upgrades while `merged_spent` is only the max of the two — a small windfall. That is the correct trade for a single-player progression game (better than ever clawing back an unlock), and we **minimize divergence by syncing eagerly when online** (boot `/hello` + flush on meaningful change). We explicitly do **not** build operational-transform/CRDT machinery for a save file.

### 7.2 Sync triggers (free-tier-shaped)
- **Boot:** one `POST /hello` → `{ session, cloudSave }`; client computes `mergeSaves(local, cloud)`, adopts it, and (if it differs from cloud) schedules a flush. **One request.**
- **Flush:** debounced + coalesced — on **meaningful change** (a run ends, an unlock, a purchase, THE CHOICE) flush at most once per ~30 s and on `visibilitychange`/`pagehide` (`keepalive`). Turns N runs into ~1 write. `PUT /save` sends the local save; the Worker **merges server-side** too (concurrent devices) and bumps `rev`.
- **Conflict:** optimistic `rev`; on mismatch the Worker merges and returns the merged blob + new `rev` (never rejects → never blocks the player).

## 8. Verified leaderboards + light anti-cheat ("within reason")

Per the owner: keep it light. The protection is:
1. **Verified identity (the main one):** a linked account's submissions carry its `account_id` + owned `name`; the board shows a **verified** marker. You can't submit under a name you don't own. Anonymous handles still rank (as today) but unverified.
2. **Rate limiting:** per-account + per-IP caps on `/score` and `/save` (e.g. a few submits/min) — implemented without per-request KV writes.
3. **Plausibility bounds:** the Worker rejects scores outside sane envelopes for the mode/wave/time (e.g. score vs wave ceiling, clearTime ≥ a floor, no negative/NaN) — cheap arithmetic, no sim.
4. **Dedupe:** ignore exact-duplicate resubmits.

**Explicitly out of scope (deferred / not now):** server-side **deterministic replay validation** (re-simulating a run in the Worker). It's powerful but exceeds the 10 ms free CPU budget and is more than the owner wants. If ever pursued, it'd need the paid plan or a lighter checkpoint-hash sampling — a separate spec.

## 9. Offline-first / no-backend behavior

- `VITE_LEADERBOARD_URL` unset, offline, or 5xx → `account.ts` is a complete no-op; the game is localStorage-only and never waits. (Mirror `api.ts`'s contract exactly.)
- A player who never clicks "sign in / enable cloud save" incurs **no new requests**.
- Sign-in failures degrade gracefully (stay anonymous + local).

## 10. Free-tier budget (verified 2026-06-20)

| Resource | Free limit | Our use | Verdict |
|---|---|---|---|
| Workers requests | **100,000 / day** | ~12–15 / signed-in DAU (boot + per-run score + 1 debounced save) | the ceiling; comfortable to **~6–7k signed-in DAU**, then **Workers Paid $5/mo removes the cap** |
| Workers CPU | 10 ms / req | sig-verify + 1–2 D1 queries + JSON | fine (no sim) |
| D1 rows written | **100,000 / day** | ~7 / DAU (1 save + score inserts) | looser than requests (~14k DAU) |
| D1 reads / storage | 5M/day · 5 GB | trivial · ~15 KB/save | non-issue |
| KV writes | **1,000 / day** | **0 (stateless sessions)** | avoided by design |
| Pages (the game) | unlimited | the static bundle | free |

**Levers baked in:** stateless signed sessions (no KV), opt-in sync (non-signers cost nothing), debounced session-end writes (N runs → 1 write), a combined `/hello` boot call, Pages for the static game. **Launch needs no paid plan;** crossing ~6–7k signed-in DAU is a $5/mo switch, not a re-architecture.

## 11. Privacy & data

- Store the **minimum**: a provider user id (+ optionally email if a provider returns it — we don't need it; prefer not to store it). The save blob is the player's own game progress.
- **Account deletion:** a `DELETE /account` endpoint + an in-game "delete my account & cloud data" action that wipes the `accounts` + `saves` rows.
- A short **privacy note** in-game (what's stored, why, how to delete). No third-party analytics added.

## 12. Security

- Session token = HMAC-signed (Worker secret), short-ish expiry + silent refresh on `/hello`.
- OAuth: PKCE + signed `state`; verify the provider token server-side; never trust client-claimed identity.
- **Server-side save validation:** the Worker runs the incoming blob through the **same per-field sanitization discipline as `migrate.ts`** (clamp numbers, dedupe/whitelist sets, drop junk) before storing — a hostile client can't inject a malformed save that poisons another device.
- Secrets (`HMAC_SECRET`, OAuth client secrets) live in Worker env/secrets, never in the client bundle.

## 13. Testing

- **`cloudMerge.ts` is the test centerpiece** — a pure function, exhaustively unit-tested: union/max/min/per-key/latest categories; the **spendable reconcile** (shards earned−spent, fragments set−counter); the player-favoring windfall edge; idempotency (`merge(a,a)==a`), commutativity where expected, and "never loses a set member or a record." Add a category-coverage test that **fails if a new `SaveData` field has no merge rule** (forces a deliberate choice).
- **account.ts** — mocked fetch: offline no-op, boot merge+adopt, debounced flush, session handling, graceful failure.
- **Worker** — route tests (Minitest/Vitest in `worker/`): `/hello`, `/save` merge + `rev`, `/auth` link + account-merge, the light guards (rate-limit, plausibility, dedupe), server-side save sanitization, account deletion.
- **Offline/no-backend** path asserts zero behavior change.
- Existing suite (1193+) stays green; determinism test unaffected (no sim/rng touched).

## 14. Structural mandate (where the work goes)

| Concern | Where | Notes |
|---|---|---|
| Pure field-aware merge | **`src/cloudMerge.ts`** (NEW, pure) | the crux; mirrored by a Worker copy/import |
| Client account/session/sync | **`src/account.ts`** (NEW) | additive + fire-and-forget, like `api.ts` |
| Leaderboard submit binding | extend **`src/api.ts`** | add the session/account header + verified flag |
| localStorage hook | thin in **`save.ts`** (a save-changed signal for the debounced flush) | no schema bump for the local save |
| Sign-in / account UI | a small **`panels/account.ts`** (panel convention) + a thin SETTINGS entry | do NOT grow `ui.ts`; reuse the panel pattern |
| Worker routes + D1 | **`worker/`** modules + a migration for the new tables | follow the existing worker structure |
| Free-tier guards | **`worker/`** (rate-limit, plausibility, sanitize) | no per-request KV writes |

## 15. Phasing (incremental, each shippable)

- **P1 — Anonymous cloud save:** `account.ts` + `cloudMerge.ts` + `/hello` + `/save` + the D1 `accounts`/`saves` tables + opt-in toggle. Delivers single-device cloud **backup** + the merge engine.
- **P2 — OAuth link + cross-device:** `/auth/discord`, `/auth/google`, the link/merge flow, the sign-in panel, recovery. Delivers **cross-device** + a verified identity.
- **P3 — Verified leaderboard + light guards:** bind `/score` to the account, the verified marker, rate-limit + plausibility + dedupe, account deletion + privacy note. Delivers goal #2.

## 16. Out of scope (YAGNI)

Social graph / friends / profiles; monetization / entitlements / payments; server-side deterministic replay anti-cheat; syncing device-local **Settings** (audio/a11y stay per-device); email/password auth; KV/Durable-Objects-based sessions.

## 17. Decisions locked (from brainstorming)

- Goals: **cross-device cloud save + verified-name leaderboards**; **light anti-cheat ("within reason")**.
- Model: **progressive, anonymous-first, opt-in**; sign-in via **Discord + Google OAuth**.
- Merge: **field-aware, player-favoring**, with the spendable reconcile + the accepted minor-windfall trade.
- Infra: **extend the existing Cloudflare Worker + D1**; **stateless signed sessions** (no KV); **must launch on the free plan** for several thousand DAU; **$5/mo Workers Paid** is the only scaling lever and isn't needed to launch.
- Offline-first + determinism are non-negotiable and untouched.
