# HANDOFF — Player Accounts, Cloud Save & Verified Leaderboards (full implementation)

> The design is **done and approved** — see the spec: `docs/superpowers/specs/2026-06-20-player-accounts-design.md`. **Read it first; it is the source of truth.** This handoff is the *execution* layer: how to build all three phases end-to-end, what the agent owns vs. what the owner must provision (OAuth apps, secrets, deploy), the dev/test workflow, and the hard gates (offline-first, free-tier discipline, the player-favoring merge). Do **not** re-litigate the design — implement it.

---

## PROMPT (paste this to spawn the agent)

> Implement **Player Accounts + Cloud Save + Verified Leaderboards** for THE LAST LANCE (lancefall), fully, per the approved spec `docs/superpowers/specs/2026-06-20-player-accounts-design.md` and this handoff (`docs/HANDOFF-player-accounts.md`). The design is settled — build it, don't redesign it.
>
> **Work in an isolated git worktree off `v6`** (this is a large, long-running feature — `superpowers:using-git-worktrees`). Then use `superpowers:writing-plans` to produce a plan **per phase** (P1/P2/P3 below), and `superpowers:subagent-driven-development` (or `executing-plans`) to implement each task TDD. The whole thing extends the **existing Cloudflare Worker + D1** (`worker/`) and the offline-first client (`src/api.ts`).
>
> **Build it in three shippable phases, in order:** **P1** — anonymous opt-in cloud save: the pure field-aware merge (`src/cloudMerge.ts`), the client `src/account.ts` (anon token → stateless signed session → boot `/hello` + debounced session-end flush), the Worker `/hello` + `/save` routes, and the D1 `accounts`/`saves` tables. **P2** — `/auth/discord` + `/auth/google` OAuth (PKCE + signed state), the link/account-merge flow, recovery, and a small sign-in panel (`panels/account.ts`) + a SETTINGS entry. **P3** — bind `/score` to the account, the verified-name marker, and the light "within reason" guards (per-account/IP rate-limit, plausibility bounds, dedupe) + account deletion + a privacy note. Each phase ends green and self-contained.
>
> **HARD GATES — do not violate:** **(1) Offline-first is sacred** — with no backend, offline, or for any player who never opts in, the game behaves EXACTLY as today (pure localStorage, never awaits the network); `account.ts` mirrors `api.ts`'s fire-and-forget, silently-degrading contract. **(2) Free-tier discipline** — **stateless HMAC-signed sessions, NO Cloudflare KV** (its 1,000 writes/day would blow first); **debounced session-end save writes** (coalesce N runs → ~1 write, flush on `visibilitychange`/`pagehide` with `keepalive`); a **combined `/hello`** boot call (session-validate + return cloud save in one request); the static game stays on Pages. (3) **The merge is the test centerpiece** — `cloudMerge.ts` is PURE and exhaustively unit-tested: the union/max/min/per-key/latest categories, the **spendable reconcile** (shards = `lifeShards` − spent; fragments = collected-set − `fragmentsSpent`), idempotency `merge(a,a)==a`, "never loses a set member or a record", the **player-favoring windfall** trade (§7.1), AND a **category-coverage test that FAILS if a new `SaveData` field has no merge rule**. (4) **Determinism untouched** — none of this runs in the seeded sim or draws `world.rng`; the Daily stays bit-identical; server-side save validation reuses the pure `migrate.ts` sanitization discipline, NOT the sim. (5) **Security** — sessions signed with a Worker secret; OAuth PKCE + signed `state`; verify provider tokens server-side; **secrets live in Worker env/secrets, never in the client bundle**; the Worker **sanitizes every incoming save blob** (clamp numbers / dedupe-whitelist sets) before storing. (6) **Don't grow the god-files** — new logic in `cloudMerge.ts` / `account.ts` / `panels/account.ts` / `worker/` modules; `api.ts` + `save.ts` + `ui.ts` get only thin additive hooks.
>
> **You build all the code + tests + local verification + a `worker/ACCOUNTS-SETUP.md`. The OWNER provisions the live bits** (register the Discord + Google OAuth apps, set the Worker secrets `HMAC_SECRET` + the OAuth client id/secret + redirect URLs, apply the D1 migration, deploy). So: build it to consume env/secrets, develop + test against **`wrangler dev` + a local D1 + a dev-auth shim** (a `DEV_AUTH=1` path that fakes the OAuth callback locally so you can exercise P2/P3 without real provider apps), and document exactly what the owner must set. Do NOT hardcode secrets or block on credentials you can't get.
>
> Verify each phase: `npx tsc --noEmit` clean; `npx vitest run` (1193+) green incl. the new `cloudMerge`/`account`/worker-route tests; the **offline / no-backend path proven unchanged**; an end-to-end `wrangler dev` walk-through of the phase (anon save round-trips + merges two divergent saves without losing progress; OAuth link merges two accounts; a score submits verified; the light guards reject junk). Commit per task with the Co-Authored-By trailer. When all three phases are green locally, hand back to the owner with the SETUP doc — **the owner does the OAuth provisioning + the prod deploy** (never deploy or commit secrets yourself).

---

## What's approved (don't redesign — implement)

Read the spec for the full detail. The locked decisions:
- **Progressive, anonymous-first, opt-in.** Non-signers cost zero new requests. "Sign in (Discord/Google) to sync + claim a verified name" is the upgrade.
- **Field-aware, player-favoring merge** (the crux). Spendable reconcile from earned−spent; accept a rare minor windfall rather than ever remove progress.
- **Stateless signed sessions (no KV); session-end debounced writes; combined `/hello`.** Launches on Cloudflare **free** for several thousand DAU; **$5/mo Workers Paid** only past ~6–7k DAU, not needed to launch.
- **Light anti-cheat:** verified identity + rate-limit + plausibility + dedupe. **No** server re-simulation (deferred; not free-CPU-friendly).
- **Offline-first + determinism are non-negotiable and untouched.**

## Structural mandate (where the code goes)

| Concern | Where | Notes |
|---|---|---|
| Pure field-aware merge (THE crux) | **`src/cloudMerge.ts`** (NEW, pure) | shared by client + Worker (or a copy guarded by a shared golden-vector test); category map + the coverage test |
| Client account / session / opt-in sync | **`src/account.ts`** (NEW) | additive, fire-and-forget, silently-degrading — mirror `api.ts` |
| Sign-in / account / delete UI | **`src/panels/account.ts`** (NEW, panel convention) + a thin SETTINGS row | do NOT grow `ui.ts` |
| Leaderboard submit binding | extend **`src/api.ts`** (thin) | add the session header + the verified flag |
| Local-save "changed" signal | thin in **`src/save.ts`** | drives the debounced flush; no local-save schema bump |
| Worker routes + D1 schema/migration | **`worker/`** modules + a migration | `/hello`, `/save`, `/auth/*`, extend `/score`; `accounts` + `saves` tables; the light guards + the save sanitizer |
| Owner setup | **`worker/ACCOUNTS-SETUP.md`** (NEW) | OAuth app registration, the exact secrets/vars, migration + deploy steps |

## Owner-side vs agent-side (be explicit — don't get blocked)

**Agent builds + verifies locally:** all client + Worker code, all tests, the `wrangler dev` + local-D1 + dev-auth-shim workflow, the full local e2e of each phase, and `worker/ACCOUNTS-SETUP.md`.

**Owner provisions (the agent cannot):** registering the **Discord** + **Google** OAuth applications; setting the Worker **secrets** (`HMAC_SECRET`, `DISCORD_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`) + the redirect URLs in `wrangler.toml`/dashboard; applying the **D1 migration** to the live DB; the **prod deploy**. The agent's code must read these from env and fail *gracefully* (stay offline/anon) when they're absent, and the dev-auth shim must let the agent exercise P2/P3 without them.

## Dev / test workflow

- **Local Worker:** `wrangler dev` against a **local D1** (`wrangler d1 ... --local`) + the new migration; a `DEV_AUTH=1` shim that simulates the OAuth callback so the link/merge flow is testable without real provider apps.
- **Client points at the dev Worker** via `VITE_LEADERBOARD_URL` (already the pattern); with it unset, everything stays offline (prove this path).
- **Tests:** `cloudMerge` (exhaustive, the centerpiece) + `account` (mocked fetch: offline no-op, boot merge+adopt, debounced flush, graceful failure) + Worker route tests in `worker/` (`/hello`, `/save` merge+`rev`, `/auth` link+account-merge, the guards, the save sanitizer, deletion). The existing suite (1193+) and `determinism.test.ts` stay green.

## Coordination

- **Use a worktree off `v6`** — this feature is large and long-running, and several agents are live in the shared tree. Most new code is NEW files; the few shared touches (`api.ts`, `save.ts`, `ui.ts`) are small + additive and merge cleanly. If you ever work in the shared tree instead, `git status` first, never `git add -A`, content-filter your hunks (`lancefall-shared-tree-staging`).
- **Never commit secrets** or a populated `.env`/`wrangler.toml` with real values; use `.dev.vars`/secrets + a `.example`.

## Definition of done (per phase + overall)

- **P1:** a player can opt in; their save round-trips to D1 and **two divergent saves merge with zero lost progress** (the merge tests + a live `wrangler dev` proof); offline still behaves identically; tsc + tests green.
- **P2:** "Sign in with Discord/Google" links the account, **merges** an anon save into a linked one, works across two browsers/devices, recovers on re-login; the sign-in panel + SETTINGS entry exist; tsc + tests green.
- **P3:** the leaderboard shows **verified** owned names, the light guards reject spoofed/implausible/duplicate/rate-exceeding submits, account deletion wipes the data, the privacy note is present; tsc + tests green.
- **Overall:** offline-first + determinism provably untouched; god-files not grown; **free-tier discipline held** (no KV, debounced session-end writes, combined boot call); `worker/ACCOUNTS-SETUP.md` lets the owner provision OAuth + secrets + deploy in a few steps. The agent hands back green-locally; **the owner provisions the live OAuth apps/secrets and runs the prod deploy.**
