# Player Accounts P1 — Anonymous Cloud Save — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, opt-in anonymous cloud save: a pure field-aware merge engine, a defensive client account/session/sync module, and Worker `/hello` + `/save` routes backed by two new D1 tables — with the offline-first game behaving exactly as today when no backend is configured or the player never opts in.

**Architecture:** A pure `src/cloudMerge.ts` (`mergeSaves`) is the single source of truth for combining two `SaveData` blobs field-by-field (never last-write-wins); it is imported by both the client and the Worker. `src/account.ts` mirrors `api.ts`'s fire-and-forget, silently-degrading contract: on boot it does ONE `POST /hello` (validate a stateless HMAC session + fetch the cloud save), merges + adopts, and flushes changes debounced/coalesced on `visibilitychange`/`pagehide`. The Worker gains `worker/src/session.ts` (pure HMAC sign/verify — no KV) and thin `/hello` + `/save` handlers that sanitize every incoming blob through the existing `migrate.ts` discipline before merging server-side and bumping a `rev`.

**Tech Stack:** Vite + vanilla TypeScript, Vitest, Cloudflare Workers + D1, Web Crypto (`crypto.subtle` HMAC-SHA256).

## Global Constraints

- **Offline-first is sacred.** With `VITE_LEADERBOARD_URL` unset, offline, on any 5xx, or for any player who never opts in, the game behaves EXACTLY as today — pure localStorage, never awaits the network. `account.ts` mirrors `api.ts`'s fire-and-forget contract; every call resolves immediately and never throws.
- **Opt-in.** A never-signed-in player makes ZERO new requests. Cloud save does nothing until the player flips the opt-in flag.
- **Free-tier discipline.** Stateless HMAC-signed sessions — **NO Cloudflare KV writes** for sessions. ONE combined `/hello` boot call (validate + return cloud save). Debounced/coalesced session-end save writes (N runs → ~1 write), flushed on `visibilitychange`/`pagehide` with `keepalive`.
- **Determinism untouched.** No sim / `world.rng` is touched. Server-side save validation reuses the pure `migrate.ts` sanitization, NOT the sim.
- **Player-favoring merge.** The merge NEVER loses an unlock or a record. Divergent offline spend favors the player (a minor windfall) per spec §7.1.
- **Don't grow the god-files.** New logic in `cloudMerge.ts` / `account.ts` / `worker/` modules. `api.ts` + `save.ts` get only thin additive hooks.
- **Security.** Sessions signed with `HMAC_SECRET` (Worker env, never the bundle). The Worker sanitizes every incoming save blob before storing.
- **Tests stay green.** The existing suite (1259 tests) and `determinism.test.ts` stay green; `npx tsc --noEmit` stays clean.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/cloudMerge.ts` (NEW, pure) | `mergeSaves(a,b,aAt,bAt)` + the `MERGE_CATEGORIES` map (typed `Record<keyof SaveData, MergeCategory>`) + the spendable reconcile. The crux. |
| `src/cloudMerge.test.ts` (NEW) | Exhaustive merge tests: every category, the shards/fragments reconcile, idempotency, "never loses", the windfall, and the **category-coverage test** that fails on any unmapped `SaveData` field. |
| `src/account.ts` (NEW) | Client account/session/opt-in sync. Additive, fire-and-forget, silently-degrading. boot `/hello`, debounced flush, opt-in/out. |
| `src/account.test.ts` (NEW) | Mocked-fetch: offline no-op, opt-in gating, boot merge+adopt, debounced flush, graceful failure. |
| `src/api.ts` (MODIFY, thin) | Export the existing `deviceId()` so `account.ts` reuses the one anon token (no duplicate). |
| `src/save.ts` (MODIFY, thin) | A save-changed listener hook (`onSaveWrite`) + stamp `lastWrittenAt` in `saveSave` — drives the debounced flush + the `latest` merge resolution. No local-save schema bump. |
| `worker/src/session.ts` (NEW, pure) | `signSession` / `verifySession` — stateless HMAC-SHA256 compact tokens. |
| `src/workerSession.test.ts` (NEW) | Round-trip sign/verify, tamper rejection, expiry — runs in the main vitest suite (imports `../worker/src/session`). |
| `worker/src/accounts.ts` (NEW, pure) | Pure helpers the routes use: `newAccountId()`, the save-blob sanitizer wrapper over `migrateSave`, response shaping. |
| `worker/src/index.ts` (MODIFY) | Thin `POST /hello` + `PUT /save` handlers wired to D1 + `session.ts` + `cloudMerge` + the sanitizer. |
| `worker/schema.sql` (MODIFY) | Append `accounts` + `saves` tables (`IF NOT EXISTS`, idempotent). |
| `worker/wrangler.toml` (MODIFY) | Document the `HMAC_SECRET` var (via `.dev.vars` for local; secret in prod). No secret value committed. |
| `worker/.dev.vars.example` (NEW) | `HMAC_SECRET=dev-only-secret` placeholder for local `wrangler dev`. |
| `worker/ACCOUNTS-SETUP.md` (NEW) | Owner provisioning: the D1 migration apply + the `HMAC_SECRET` secret. (P2/P3 append OAuth + guards.) |
| `panels/account.ts` + SETTINGS | Deferred to P2 (the sign-in UI). P1 ships the engine + a minimal opt-in toggle wired in SETTINGS as one thin row. |

### The merge category map (every `SaveData` field — enumerate ALL, this is the coverage contract)

`MERGE_CATEGORIES: Record<keyof SaveData, MergeCategory>` where
`MergeCategory = 'maxNum' | 'minNonZero' | 'set' | 'perKeyMax' | 'latest' | 'ringHistory' | 'ringLastRuns' | 'shardsSpecial' | 'version'`:

- **maxNum**: `highScore, bestCombo, bestWave, dailyBest, maxHeat, deepestWave, lifeKills, lifeBoss, lifeShards, lifeWins, lifeGrazes, lifeDaybreaks, lifeLastBreath, longestRunSec, mostBossesOneRun, lifeTimeSec, ngPlusLevel, totalRuns, playStreak, bombeLevel, fragmentsSpent`
- **minNonZero**: `fastestArenaSec`
- **set** (string[] union, deduped): `unlockedShips, unlockedThemes, unlockedTrails, unlockedShipSkins, achievements, stillpointLore, stillpointFragments, glossSeen, taught, decryptedWords, solvedPuzzles, solvedDailyCiphers`
- **perKeyMax** (Record<string,number>, per-key max): `meta, bestByMode, killsByKind, nemesis, runsByMode, winsByMode, playDays, bombeBranches`
- **latest** (whichever save was written more recently): `selectedShip, selectedTheme, selectedTrail, selectedMode, selectedHeat, selectedArchetype, selectedSkins, selectedShipSkins, handle, cityMemoryMeter, ngPlusActive, baseShields, stillpointChoice, dailyMutators, dailySeed, dailyAttempts, dailyAttemptDate, lastPlayedDate, firstRunsBeatHint, seenTutorial, seenSandbox`
- **ringHistory**: `runHistory` (union by `date|score|mode`, keep newest 50 by array order)
- **ringLastRuns**: `lastRuns` (one per mode, keep the newer by `sec`-bearing record — newest)
- **shardsSpecial**: `shards` (reconcile: `spent = lifeShards − shards` per save; `merged.shards = max(0, max(lifeShards) − max(spent))`)
- **version**: `version` (take `max`; the result is re-sanitized through `migrateSave` anyway)

> The map is typed `Record<keyof SaveData, MergeCategory>`, so omitting a field is a **compile error**; the runtime coverage test is the belt-and-suspenders.

---

### Task 1: `cloudMerge.ts` — types, category map, and the coverage test

**Files:**
- Create: `src/cloudMerge.ts`
- Test: `src/cloudMerge.test.ts`

**Interfaces:**
- Produces: `export type MergeCategory = 'maxNum'|'minNonZero'|'set'|'perKeyMax'|'latest'|'ringHistory'|'ringLastRuns'|'shardsSpecial'|'version'`; `export const MERGE_CATEGORIES: Record<keyof SaveData, MergeCategory>`.

- [ ] **Step 1: Write the failing coverage test**

```ts
// src/cloudMerge.test.ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { MERGE_CATEGORIES } from './cloudMerge';

describe('cloudMerge — category coverage', () => {
  it('maps EVERY SaveData field to a merge category (fails on any new unmapped field)', () => {
    const keys = Object.keys(defaultSave());
    const unmapped = keys.filter((k) => !(k in MERGE_CATEGORIES));
    expect(unmapped).toEqual([]);
  });
  it('has no stale category entry for a field that no longer exists', () => {
    const keys = new Set(Object.keys(defaultSave()));
    const stale = Object.keys(MERGE_CATEGORIES).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/cloudMerge.test.ts`
Expected: FAIL — cannot resolve `./cloudMerge`.

- [ ] **Step 3: Create `src/cloudMerge.ts` with the typed map**

```ts
// Pure field-aware cloud-save merge — the SINGLE source of truth shared by the client
// (src/account.ts) and the Worker (worker/src/index.ts). Never last-write-wins: each field
// merges by its category so a player can NEVER lose an unlock or a record by playing on a
// second device. Pure + total; imports ONLY the SaveData type (erased at runtime), so the
// Worker can bundle it with no client/DOM dependencies.
import type { SaveData } from './save';

export type MergeCategory =
  | 'maxNum'       // accumulative number → max
  | 'minNonZero'   // best-is-smallest → min of the non-zero values (0 = unset)
  | 'set'          // string[] → union (deduped, order: a then new-from-b)
  | 'perKeyMax'    // Record<string,number> → per-key max
  | 'latest'       // selection/preference → from whichever save was written more recently
  | 'ringHistory'  // runHistory → union by identity, newest 50
  | 'ringLastRuns' // lastRuns → one per mode, newest
  | 'shardsSpecial'// spendable shard balance → reconcile from lifeShards − spent
  | 'version';     // schema version → max

// EVERY SaveData field MUST appear (typed Record<keyof SaveData,...> ⇒ a miss is a compile error).
export const MERGE_CATEGORIES: Record<keyof SaveData, MergeCategory> = {
  version: 'version',
  highScore: 'maxNum', bestCombo: 'maxNum', bestWave: 'maxNum', dailyBest: 'maxNum',
  maxHeat: 'maxNum', deepestWave: 'maxNum', lifeKills: 'maxNum', lifeBoss: 'maxNum',
  lifeShards: 'maxNum', lifeWins: 'maxNum', lifeGrazes: 'maxNum', lifeDaybreaks: 'maxNum',
  lifeLastBreath: 'maxNum', longestRunSec: 'maxNum', mostBossesOneRun: 'maxNum',
  lifeTimeSec: 'maxNum', ngPlusLevel: 'maxNum', totalRuns: 'maxNum', playStreak: 'maxNum',
  bombeLevel: 'maxNum', fragmentsSpent: 'maxNum',
  fastestArenaSec: 'minNonZero',
  unlockedShips: 'set', unlockedThemes: 'set', unlockedTrails: 'set', unlockedShipSkins: 'set',
  achievements: 'set', stillpointLore: 'set', stillpointFragments: 'set', glossSeen: 'set',
  taught: 'set', decryptedWords: 'set', solvedPuzzles: 'set', solvedDailyCiphers: 'set',
  meta: 'perKeyMax', bestByMode: 'perKeyMax', killsByKind: 'perKeyMax', nemesis: 'perKeyMax',
  runsByMode: 'perKeyMax', winsByMode: 'perKeyMax', playDays: 'perKeyMax', bombeBranches: 'perKeyMax',
  selectedShip: 'latest', selectedTheme: 'latest', selectedTrail: 'latest', selectedMode: 'latest',
  selectedHeat: 'latest', selectedArchetype: 'latest', selectedSkins: 'latest',
  selectedShipSkins: 'latest', handle: 'latest', cityMemoryMeter: 'latest', ngPlusActive: 'latest',
  baseShields: 'latest', stillpointChoice: 'latest', dailyMutators: 'latest', dailySeed: 'latest',
  dailyAttempts: 'latest', dailyAttemptDate: 'latest', lastPlayedDate: 'latest',
  firstRunsBeatHint: 'latest', seenTutorial: 'latest', seenSandbox: 'latest',
  runHistory: 'ringHistory',
  lastRuns: 'ringLastRuns',
  shards: 'shardsSpecial',
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/cloudMerge.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cloudMerge.ts src/cloudMerge.test.ts
git commit -m "feat(lancefall): cloudMerge category map + coverage test (P1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `mergeSaves` — the merge engine + exhaustive tests

**Files:**
- Modify: `src/cloudMerge.ts`
- Test: `src/cloudMerge.test.ts`

**Interfaces:**
- Consumes: `MERGE_CATEGORIES`, `defaultSave` (from `./save`).
- Produces: `export function mergeSaves(a: SaveData, b: SaveData, aWrittenAt: number, bWrittenAt: number): SaveData`. Result keys come from `defaultSave()` (so an unknown stray key is dropped); `aWrittenAt`/`bWrittenAt` are epoch-ms write-times used ONLY for `latest` fields (newer wins; tie → `a`).

- [ ] **Step 1: Write the failing merge tests**

```ts
// append to src/cloudMerge.test.ts
import { mergeSaves } from './cloudMerge';
import type { SaveData } from './save';

const mk = (over: Partial<SaveData>): SaveData => ({ ...defaultSave(), ...over });

describe('mergeSaves — categories', () => {
  it('maxNum takes the larger', () => {
    const m = mergeSaves(mk({ highScore: 100 }), mk({ highScore: 250 }), 1, 2);
    expect(m.highScore).toBe(250);
  });
  it('minNonZero takes the smaller non-zero (0 = unset)', () => {
    expect(mergeSaves(mk({ fastestArenaSec: 0 }), mk({ fastestArenaSec: 90 }), 1, 2).fastestArenaSec).toBe(90);
    expect(mergeSaves(mk({ fastestArenaSec: 120 }), mk({ fastestArenaSec: 90 }), 1, 2).fastestArenaSec).toBe(90);
    expect(mergeSaves(mk({ fastestArenaSec: 0 }), mk({ fastestArenaSec: 0 }), 1, 2).fastestArenaSec).toBe(0);
  });
  it('set unions and dedupes', () => {
    const m = mergeSaves(mk({ unlockedShips: ['lance', 'comet'] }), mk({ unlockedShips: ['lance', 'vortex'] }), 1, 2);
    expect([...m.unlockedShips].sort()).toEqual(['comet', 'lance', 'vortex']);
  });
  it('perKeyMax takes the max per key, union of keys', () => {
    const m = mergeSaves(mk({ meta: { hp: 2, dash: 1 } }), mk({ meta: { hp: 1, crit: 3 } }), 1, 2);
    expect(m.meta).toEqual({ hp: 2, dash: 1, crit: 3 });
  });
  it('latest picks the more-recently-written save for selection fields', () => {
    expect(mergeSaves(mk({ selectedShip: 'comet' }), mk({ selectedShip: 'vortex' }), 1, 2).selectedShip).toBe('vortex');
    expect(mergeSaves(mk({ selectedShip: 'comet' }), mk({ selectedShip: 'vortex' }), 5, 2).selectedShip).toBe('comet');
  });
});

describe('mergeSaves — spendable reconcile (the windfall, §7.1)', () => {
  it('shards = max(lifeShards) − max(spent); both devices keep their purchases', () => {
    // A: earned 100, has 40 → spent 60.  B: earned 80, has 10 → spent 70.
    const a = mk({ lifeShards: 100, shards: 40 });
    const b = mk({ lifeShards: 80, shards: 10 });
    const m = mergeSaves(a, b, 1, 2);
    expect(m.lifeShards).toBe(100);
    expect(m.shards).toBe(100 - 70); // 30 — favors the player (max spent, not sum)
  });
  it('never returns a negative balance', () => {
    const m = mergeSaves(mk({ lifeShards: 10, shards: 0 }), mk({ lifeShards: 50, shards: 0 }), 1, 2);
    expect(m.shards).toBeGreaterThanOrEqual(0);
  });
});

describe('mergeSaves — invariants', () => {
  it('idempotent: merge(a, a) deep-equals a (sanitized)', () => {
    const a = mk({ highScore: 9, unlockedShips: ['lance', 'comet'], meta: { hp: 3 }, lifeShards: 50, shards: 20 });
    expect(mergeSaves(a, a, 1, 1)).toEqual(a);
  });
  it('never loses a set member or a record', () => {
    const a = mk({ achievements: ['a', 'b'], highScore: 500 });
    const b = mk({ achievements: ['b', 'c'], highScore: 200 });
    const m = mergeSaves(a, b, 1, 2);
    expect(new Set(m.achievements)).toEqual(new Set(['a', 'b', 'c']));
    expect(m.highScore).toBe(500);
  });
  it('runHistory unions by identity and keeps the newest 50', () => {
    const mkR = (n: number) => ({ score: n, wave: 1, mode: 'endless', won: false, sec: 1, heat: 0, combo: 0, date: '2026-06-2' + (n % 9) });
    const a = mk({ runHistory: Array.from({ length: 40 }, (_, i) => mkR(i)) });
    const b = mk({ runHistory: Array.from({ length: 40 }, (_, i) => mkR(i + 100)) });
    const m = mergeSaves(a, b, 1, 2);
    expect(m.runHistory.length).toBe(50);
  });
  it('lastRuns keeps one entry per mode (the newest by sec)', () => {
    const r = (mode: string, sec: number) => ({ score: 1, wave: 1, mode, won: false, sec, heat: 0, combo: 0, date: '2026-06-20', kills: {}, damage: {}, killedBy: '', bosses: 0, grazes: 0, daybreaks: 0, lastBreath: 0, hitsTaken: 0, powerups: 0 });
    const a = mk({ lastRuns: [r('endless', 10), r('arena', 5)] });
    const b = mk({ lastRuns: [r('endless', 30)] });
    const m = mergeSaves(a, b, 1, 2);
    expect(m.lastRuns.find((x) => x.mode === 'endless')!.sec).toBe(30);
    expect(m.lastRuns.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/cloudMerge.test.ts`
Expected: FAIL — `mergeSaves is not a function`.

- [ ] **Step 3: Implement `mergeSaves`**

```ts
// append to src/cloudMerge.ts
import { defaultSave } from './save';
import type { RunRecord, LastRunDetail } from './save';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function unionSet(a: unknown, b: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const src of [a, b]) {
    if (Array.isArray(src)) for (const x of src) {
      if (typeof x === 'string' && !seen.has(x)) { seen.add(x); out.push(x); }
    }
  }
  return out;
}

function perKeyMax(a: unknown, b: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const src of [a, b]) {
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(out[k] ?? -Infinity, v);
      }
    }
  }
  return out;
}

function mergeRunHistory(a: RunRecord[], b: RunRecord[]): RunRecord[] {
  const seen = new Set<string>();
  const out: RunRecord[] = [];
  // newest-last in each; keep insertion order, then trim to the newest 50.
  for (const r of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!r || typeof r !== 'object') continue;
    const key = `${r.date}|${r.score}|${r.mode}|${r.wave}|${r.combo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.slice(-50);
}

function mergeLastRuns(a: LastRunDetail[], b: LastRunDetail[]): LastRunDetail[] {
  const byMode = new Map<string, LastRunDetail>();
  for (const r of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!r || typeof r !== 'object' || typeof r.mode !== 'string') continue;
    const cur = byMode.get(r.mode);
    if (!cur || num(r.sec) >= num(cur.sec)) byMode.set(r.mode, r);
  }
  return [...byMode.values()];
}

export function mergeSaves(a: SaveData, b: SaveData, aWrittenAt: number, bWrittenAt: number): SaveData {
  const out = defaultSave();
  const bNewer = bWrittenAt > aWrittenAt; // tie → a wins
  const o = out as unknown as Record<string, unknown>;
  const A = a as unknown as Record<string, unknown>;
  const B = b as unknown as Record<string, unknown>;
  for (const key of Object.keys(out) as (keyof SaveData)[]) {
    const cat = MERGE_CATEGORIES[key];
    const av = A[key], bv = B[key];
    switch (cat) {
      case 'version':
      case 'maxNum': o[key] = Math.max(num(av), num(bv)); break;
      case 'minNonZero': {
        const xs = [num(av), num(bv)].filter((n) => n > 0);
        o[key] = xs.length ? Math.min(...xs) : 0; break;
      }
      case 'set': o[key] = unionSet(av, bv); break;
      case 'perKeyMax': o[key] = perKeyMax(av, bv); break;
      case 'latest': o[key] = bNewer ? bv : av; break;
      case 'ringHistory': o[key] = mergeRunHistory(av as RunRecord[], bv as RunRecord[]); break;
      case 'ringLastRuns': o[key] = mergeLastRuns(av as LastRunDetail[], bv as LastRunDetail[]); break;
      case 'shardsSpecial': {
        const spentA = Math.max(0, num(A.lifeShards) - num(A.shards));
        const spentB = Math.max(0, num(B.lifeShards) - num(B.shards));
        const earned = Math.max(num(A.lifeShards), num(B.lifeShards));
        o[key] = Math.max(0, earned - Math.max(spentA, spentB));
        break;
      }
    }
  }
  return out;
}
```

> Note: `latest` copies the chosen save's reference for object/record fields (`selectedSkins`, `selectedShipSkins`, `meta`-style preference maps). That's intentional — preference fields take the newer device wholesale. The result is later re-sanitized by `migrateSave` on adopt/store, which deep-clones via JSON round-trip in the consumers, so no shared-reference aliasing leaks.

- [ ] **Step 4: Run the full file to verify pass**

Run: `npx vitest run src/cloudMerge.test.ts`
Expected: PASS (all merge + reconcile + invariant + coverage tests).

- [ ] **Step 5: tsc + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/cloudMerge.ts src/cloudMerge.test.ts
git commit -m "feat(lancefall): mergeSaves field-aware merge engine + exhaustive tests (P1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Worker stateless HMAC sessions (`worker/src/session.ts`)

**Files:**
- Create: `worker/src/session.ts`
- Test: `src/workerSession.test.ts` (in the main suite, like `workerValidate.test.ts`)

**Interfaces:**
- Produces:
  - `export interface SessionPayload { aid: string; kind: 'anon' | 'linked'; exp: number }`
  - `export async function signSession(p: SessionPayload, secret: string): Promise<string>`
  - `export async function verifySession(token: string | null, secret: string, now: number): Promise<SessionPayload | null>` — returns the payload iff the signature is valid AND `exp > now`, else `null`. Never throws.
  - `export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30` (30 days; refreshed on every `/hello`).

- [ ] **Step 1: Write the failing test**

```ts
// src/workerSession.test.ts
import { describe, it, expect } from 'vitest';
import { signSession, verifySession, SESSION_TTL_MS } from '../worker/src/session';

const SECRET = 'test-secret-please-rotate';

describe('worker session — stateless HMAC', () => {
  it('round-trips a valid token', async () => {
    const exp = 1_000_000 + SESSION_TTL_MS;
    const t = await signSession({ aid: 'acc_1', kind: 'anon', exp }, SECRET);
    const p = await verifySession(t, SECRET, 1_000_000);
    expect(p).toEqual({ aid: 'acc_1', kind: 'anon', exp });
  });
  it('rejects a tampered payload', async () => {
    const t = await signSession({ aid: 'acc_1', kind: 'anon', exp: 9e15 }, SECRET);
    const [body, sig] = t.split('.');
    const forged = `${btoa('{"aid":"admin","kind":"linked","exp":9000000000000}')}.${sig}`;
    expect(await verifySession(forged, SECRET, 0)).toBeNull();
    expect(body.length).toBeGreaterThan(0);
  });
  it('rejects a wrong secret', async () => {
    const t = await signSession({ aid: 'a', kind: 'anon', exp: 9e15 }, SECRET);
    expect(await verifySession(t, 'other-secret', 0)).toBeNull();
  });
  it('rejects an expired token', async () => {
    const t = await signSession({ aid: 'a', kind: 'anon', exp: 500 }, SECRET);
    expect(await verifySession(t, SECRET, 1000)).toBeNull();
  });
  it('rejects malformed / null input without throwing', async () => {
    expect(await verifySession(null, SECRET, 0)).toBeNull();
    expect(await verifySession('garbage', SECRET, 0)).toBeNull();
    expect(await verifySession('a.b.c', SECRET, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/workerSession.test.ts`
Expected: FAIL — cannot resolve `../worker/src/session`.

- [ ] **Step 3: Implement `worker/src/session.ts`**

```ts
// Stateless, signed session tokens for the LANCEFALL account layer. NO KV / no DB read to
// validate — the Worker verifies an HMAC-SHA256 signature locally (cheap, well under the
// 10ms free CPU budget). Token shape: base64url(JSON(payload)) + '.' + base64url(HMAC).
// Uses Web Crypto (crypto.subtle), available in both the Worker runtime and Node 18+ (tests).

export interface SessionPayload {
  aid: string;            // account id
  kind: 'anon' | 'linked';
  exp: number;            // epoch ms; token invalid once now >= exp
}

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days, refreshed each /hello

const enc = new TextEncoder();

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromString(str: string): string {
  return b64urlFromBytes(enc.encode(str));
}
function bytesFromB64url(s: string): Uint8Array | null {
  try {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmac(body: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return new Uint8Array(sig);
}

/** Constant-time compare of two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signSession(p: SessionPayload, secret: string): Promise<string> {
  const body = b64urlFromString(JSON.stringify(p));
  const sig = b64urlFromBytes(await hmac(body, secret));
  return `${body}.${sig}`;
}

export async function verifySession(token: string | null, secret: string, now: number): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return null; // exactly one dot
  const body = token.slice(0, dot);
  const sigBytes = bytesFromB64url(token.slice(dot + 1));
  if (!sigBytes) return null;
  const expected = await hmac(body, secret);
  if (!timingSafeEqual(sigBytes, expected)) return null;
  const json = bytesFromB64url(body);
  if (!json) return null;
  let p: SessionPayload;
  try {
    p = JSON.parse(new TextDecoder().decode(json));
  } catch {
    return null;
  }
  if (!p || typeof p.aid !== 'string' || (p.kind !== 'anon' && p.kind !== 'linked') || typeof p.exp !== 'number') return null;
  if (now >= p.exp) return null;
  return p;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/workerSession.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/session.ts src/workerSession.test.ts
git commit -m "feat(lancefall): stateless HMAC session tokens for the account layer (P1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Worker save sanitizer + account helpers (`worker/src/accounts.ts`)

**Files:**
- Create: `worker/src/accounts.ts`
- Test: `src/workerAccounts.test.ts` (main suite)

**Interfaces:**
- Consumes: `migrateSave`, `defaultSave` (from `../../src/...`), `mergeSaves` (from `../../src/cloudMerge`).
- Produces:
  - `export function newAccountId(): string` — `acc_` + 24 random base36 chars (uses `crypto.getRandomValues`).
  - `export function sanitizeSaveBlob(raw: unknown): SaveData` — JSON-parse-safe wrapper that runs any incoming blob through `migrateSave(raw, defaultSave())`, so a hostile client can't inject a malformed save. Returns a clean `defaultSave()` for non-objects.
  - `export function mergeServerSave(server: SaveData | null, incoming: SaveData, serverAt: number, incomingAt: number): SaveData` — `server` null ⇒ returns `incoming`; else `mergeSaves(server, incoming, serverAt, incomingAt)`.

> This module pulls `migrateSave`/`defaultSave`/`mergeSaves` from `../../src`. They are pure (no DOM at module load), so esbuild (wrangler) bundles them into the Worker. Task 6 verifies the bundle builds.

- [ ] **Step 1: Write the failing test**

```ts
// src/workerAccounts.test.ts
import { describe, it, expect } from 'vitest';
import { newAccountId, sanitizeSaveBlob, mergeServerSave } from '../worker/src/accounts';
import { defaultSave } from './save';

describe('worker accounts helpers', () => {
  it('newAccountId is unique-ish and well-formed', () => {
    const a = newAccountId(), b = newAccountId();
    expect(a).toMatch(/^acc_[a-z0-9]{16,}$/);
    expect(a).not.toBe(b);
  });
  it('sanitizeSaveBlob clamps a hostile blob to a clean save', () => {
    const evil = { highScore: 'NaNwowow', unlockedShips: 'not-an-array', meta: { hp: 'x' }, version: 999 };
    const s = sanitizeSaveBlob(evil);
    expect(typeof s.highScore).toBe('number');
    expect(Array.isArray(s.unlockedShips)).toBe(true);
    expect(s.unlockedShips).toContain('lance');
    expect(s.meta).toEqual({}); // 'x' dropped by coerceNumberRecord
  });
  it('sanitizeSaveBlob returns a default save for junk input', () => {
    expect(sanitizeSaveBlob(null).highScore).toBe(0);
    expect(sanitizeSaveBlob('nope').highScore).toBe(0);
  });
  it('mergeServerSave adopts incoming when the server has none', () => {
    const inc = { ...defaultSave(), highScore: 42 };
    expect(mergeServerSave(null, inc, 0, 1).highScore).toBe(42);
  });
  it('mergeServerSave field-merges two saves (no lost progress)', () => {
    const server = { ...defaultSave(), highScore: 100, achievements: ['a'] };
    const inc = { ...defaultSave(), highScore: 50, achievements: ['b'] };
    const m = mergeServerSave(server, inc, 1, 2);
    expect(m.highScore).toBe(100);
    expect(new Set(m.achievements)).toEqual(new Set(['a', 'b']));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/workerAccounts.test.ts`
Expected: FAIL — cannot resolve `../worker/src/accounts`.

- [ ] **Step 3: Implement `worker/src/accounts.ts`**

```ts
// Pure helpers for the account routes — kept out of index.ts so they're unit-tested in the
// main vitest suite (mirrors worker/src/validate.ts). Reuses the CLIENT's pure migrate.ts
// sanitizer + the shared cloudMerge, so the server-side save discipline can never drift from
// the client's. These imports are pure (no DOM at load) → esbuild bundles them into the Worker.
import type { SaveData } from '../../src/save';
import { defaultSave } from '../../src/save';
import { migrateSave } from '../../src/migrate';
import { mergeSaves } from '../../src/cloudMerge';

export function newAccountId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += b.toString(36);
  return 'acc_' + s.slice(0, 20);
}

/** Run an untrusted incoming save through the same per-field sanitization as the client's
 *  migrate.ts (clamp numbers, dedupe/whitelist sets, drop junk). Total — never throws. */
export function sanitizeSaveBlob(raw: unknown): SaveData {
  return migrateSave(raw, defaultSave());
}

export function mergeServerSave(
  server: SaveData | null,
  incoming: SaveData,
  serverAt: number,
  incomingAt: number,
): SaveData {
  if (!server) return incoming;
  return mergeSaves(server, incoming, serverAt, incomingAt);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/workerAccounts.test.ts`
Expected: PASS (5 tests). Note `newAccountId` regex: adjust if base36 of byte values yields shorter — the slice(0,20) guarantees length; keep `{16,}`.

- [ ] **Step 5: Commit**

```bash
git add worker/src/accounts.ts src/workerAccounts.test.ts
git commit -m "feat(lancefall): worker account helpers — save sanitizer + server merge (P1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: D1 schema — `accounts` + `saves` tables

**Files:**
- Modify: `worker/schema.sql`

- [ ] **Step 1: Append the new tables (idempotent) to `worker/schema.sql`**

```sql

-- ── Player accounts + cloud saves (Player Accounts P1) ──────────────────────────
-- Anonymous-first: a row is created on first /hello keyed by the anon device token.
-- provider/provider_id/name are populated by the P2 OAuth link flow (NULL for anon).
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,         -- random 'acc_...' id
  anon_token    TEXT UNIQUE,              -- the deviceId that created it (nullable after a link-merge)
  provider      TEXT,                     -- 'discord' | 'google' | NULL (anonymous)
  provider_id   TEXT,                     -- stable provider user id
  name          TEXT,                     -- claimed verified name (linked only)
  name_verified INTEGER DEFAULT 0,
  created_at    INTEGER,
  updated_at    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider ON accounts (provider, provider_id);

CREATE TABLE IF NOT EXISTS saves (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id),
  blob        TEXT,        -- the merged SaveData JSON (sanitized server-side)
  rev         INTEGER,     -- monotonic revision (optimistic concurrency)
  updated_at  INTEGER
);
```

- [ ] **Step 2: Verify the SQL parses against a local D1**

Run:
```bash
cd worker && npx wrangler d1 execute lancefall --local --file=schema.sql && cd ..
```
Expected: executes without error (the `IF NOT EXISTS` makes re-runs safe). If wrangler prompts to create the local DB, accept.

- [ ] **Step 3: Commit**

```bash
git add worker/schema.sql
git commit -m "feat(lancefall): D1 accounts + saves tables for cloud save (P1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Worker `/hello` + `/save` routes

**Files:**
- Modify: `worker/src/index.ts`
- Modify: `worker/wrangler.toml` (no secret value — see Task 8)
- Create: `worker/.dev.vars.example`

**Interfaces:**
- `POST /hello` — body `{ device?: string, session?: string }`. Resolve the account: if `session` verifies, use its `aid`; else upsert by `device` (anon token) — SELECT by `anon_token`, INSERT a new `acc_` row if absent. Load the `saves` row. Respond `{ session: <fresh signed anon token>, save: <parsed blob | null>, rev: <number> }`. Exactly: ≤1 write (only on first-ever account creation), ≤2 reads.
- `PUT /save` — `Authorization: Bearer <session>` + body `{ save: SaveData, rev?: number, writtenAt?: number }`. Verify session (401 if invalid). `sanitizeSaveBlob(save)` → load server save → `mergeServerSave(server, incoming, server.updated_at, writtenAt ?? Date.now())` → UPSERT with `rev = serverRev + 1`. Respond `{ save: merged, rev }`. 1 read + 1 write.
- Env gains `HMAC_SECRET: string`. If unset, `/hello` + `/save` return 503 `{ error: 'accounts disabled' }` (the client treats any non-2xx as "stay local").

- [ ] **Step 1: Write the route handlers**

Add to `worker/src/index.ts`:
1. Extend `Env`: `HMAC_SECRET?: string;`.
2. Import: `import { signSession, verifySession, SESSION_TTL_MS } from './session';` and `import { newAccountId, sanitizeSaveBlob, mergeServerSave } from './accounts';`.
3. Add a `bearer(req)` helper: read `Authorization`, strip `Bearer `.
4. Add the two route blocks (place before the final `return json({ error: 'not found' }, 404, cors);`):

```ts
// ── account boot: validate/issue a session + return the cloud save (ONE call) ──
if (req.method === 'POST' && url.pathname === '/hello') {
  if (!env.HMAC_SECRET) return json({ error: 'accounts disabled' }, 503, cors);
  if (!(await rateOk(env, ip, 'post', 20))) return json({ error: 'rate limited' }, 429, cors);
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return json({ error: 'bad json' }, 400, cors); }
  const now = Date.now();
  let aid: string | null = null;
  const sess = await verifySession(typeof b.session === 'string' ? b.session : null, env.HMAC_SECRET, now);
  if (sess) aid = sess.aid;
  if (!aid) {
    const device = sanitizeDevice(b.device);
    if (!device) return json({ error: 'bad device' }, 400, cors);
    const existing = await env.DB.prepare('SELECT id FROM accounts WHERE anon_token = ?').bind(device).first<{ id: string }>();
    if (existing) aid = existing.id;
    else {
      aid = newAccountId();
      await env.DB.prepare('INSERT INTO accounts (id, anon_token, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .bind(aid, device, now, now).run();
    }
  }
  const row = await env.DB.prepare('SELECT blob, rev FROM saves WHERE account_id = ?').bind(aid).first<{ blob: string; rev: number }>();
  let save: unknown = null;
  if (row?.blob) { try { save = JSON.parse(row.blob); } catch { save = null; } }
  const session = await signSession({ aid, kind: sess?.kind ?? 'anon', exp: now + SESSION_TTL_MS }, env.HMAC_SECRET);
  return json({ session, save, rev: row?.rev ?? 0 }, 200, cors);
}

// ── store the cloud save: verify session, sanitize, merge server-side, bump rev ──
if (req.method === 'PUT' && url.pathname === '/save') {
  if (!env.HMAC_SECRET) return json({ error: 'accounts disabled' }, 503, cors);
  if (!(await rateOk(env, ip, 'post', 20))) return json({ error: 'rate limited' }, 429, cors);
  const sess = await verifySession(bearer(req), env.HMAC_SECRET, Date.now());
  if (!sess) return json({ error: 'unauthorized' }, 401, cors);
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return json({ error: 'bad json' }, 400, cors); }
  const incoming = sanitizeSaveBlob(b.save);
  const incomingAt = typeof b.writtenAt === 'number' && Number.isFinite(b.writtenAt) ? b.writtenAt : Date.now();
  const row = await env.DB.prepare('SELECT blob, rev, updated_at FROM saves WHERE account_id = ?').bind(sess.aid).first<{ blob: string; rev: number; updated_at: number }>();
  let server: ReturnType<typeof sanitizeSaveBlob> | null = null;
  if (row?.blob) { try { server = sanitizeSaveBlob(JSON.parse(row.blob)); } catch { server = null; } }
  const merged = mergeServerSave(server, incoming, row?.updated_at ?? 0, incomingAt);
  const rev = (row?.rev ?? 0) + 1;
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO saves (account_id, blob, rev, updated_at) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(account_id) DO UPDATE SET blob = excluded.blob, rev = excluded.rev, updated_at = excluded.updated_at',
  ).bind(sess.aid, JSON.stringify(merged), rev, now).run();
  return json({ save: merged, rev }, 200, cors);
}
```

Add the helper near the top of the module:
```ts
function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
```

- [ ] **Step 2: Create `worker/.dev.vars.example`**

```
# Local-only secret for `wrangler dev`. Copy to worker/.dev.vars (gitignored) and set a value.
# In production this is a Worker SECRET (wrangler secret put HMAC_SECRET), never committed.
HMAC_SECRET=dev-only-insecure-hmac-secret-change-me
# P2 adds: DISCORD_CLIENT_ID/SECRET, GOOGLE_CLIENT_ID/SECRET, DEV_AUTH
```

Then create the real local file (gitignored) so `wrangler dev` works:
```bash
cp worker/.dev.vars.example worker/.dev.vars
```
Ensure `worker/.dev.vars` is gitignored — add to `.gitignore` if absent:
```bash
grep -q '.dev.vars' .gitignore 2>/dev/null || printf '\nworker/.dev.vars\n' >> .gitignore
```

- [ ] **Step 3: Verify the Worker bundle builds (proves the `../../src` imports bundle)**

Run:
```bash
cd worker && npx wrangler deploy --dry-run --outdir=/tmp/lf-worker-build 2>&1 | tail -20 && cd ..
```
Expected: a successful dry-run bundle (no "could not resolve" for `../../src/...`). If it fails to resolve, STOP and report — the fallback is a kept-in-sync copy of `cloudMerge.ts` in `worker/src/` guarded by a golden-vector test (spec §7 permits this).

- [ ] **Step 4: Live `wrangler dev` round-trip smoke**

Run `wrangler dev` (background) with the local D1 + `.dev.vars`, then exercise the routes:
```bash
cd worker && npx wrangler dev --local --port 8799 &
sleep 6
# 1) hello creates an anon account + session
curl -s -XPOST localhost:8799/hello -H 'content-type: application/json' -d '{"device":"devicetokenabc123"}'
# capture the session, then save a blob, then hello again to read it back
```
Expected: `/hello` returns `{session, save:null, rev:0}`; `PUT /save` with the bearer returns `{save, rev:1}`; a second `/hello` returns the stored save. Kill the dev server after. (This is a manual proof; the automated coverage is Tasks 1–4 + the e2e in Task 9.)

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.ts worker/.dev.vars.example .gitignore
git commit -m "feat(lancefall): worker /hello + /save cloud-save routes (P1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Client `account.ts` — opt-in sync (boot + debounced flush)

**Files:**
- Create: `src/account.ts`
- Test: `src/account.test.ts`
- Modify: `src/api.ts` (export `deviceId`)
- Modify: `src/save.ts` (the `onSaveWrite` listener + `lastWrittenAt` stamp)

**Interfaces:**
- `src/api.ts`: change `function deviceId()` → `export function deviceId()`. (One word; no behavior change.)
- `src/save.ts`:
  - `export function onSaveWrite(fn: ((data: SaveData) => void) | null): void` — registers a single listener; `saveSave` calls it after a successful write.
  - In `saveSave`, after `localStorage.setItem`, also `localStorage.setItem('lancefall.save.writtenAt', String(Date.now()))` and invoke the listener (guarded by try/catch so a listener error never breaks a save).
  - `export function savedAt(): number` — reads `lancefall.save.writtenAt` (0 if unset).
- `src/account.ts`:
  - `export function accountEnabled(): boolean` — `BASE.length > 0 && optedIn()`.
  - `export function optedIn(): boolean`, `export function optIn(): void`, `export function optOut(): void` — localStorage `lancefall.cloud === '1'`.
  - `export async function boot(): Promise<void>` — no-op unless `accountEnabled()`. POST `/hello {device, session}`; on success merge cloud into local via `mergeSaves(local, cloud, savedAt(), cloudUpdatedAt)`, adopt (`saveSave(merged)`), store the session + rev; if merged differs from cloud, schedule a flush. Never throws.
  - `export function noteChange(): void` — debounced (~30s) coalesced flush scheduler; also (idempotently) registers `visibilitychange`/`pagehide` handlers that flush immediately with `keepalive`.
  - `export async function flush(): Promise<void>` — no-op unless enabled + have a session; PUT `/save` with the bearer + `{save: loadSave(), rev, writtenAt: savedAt()}`; adopt the returned merged save + rev. Never throws.
  - `export function init(): void` — wires `onSaveWrite(noteChange)` and calls `boot()`. Called once from `main.ts` (a one-line additive hook — but DO NOT add to main.ts in P1's tests; wire it in Task 7 Step 6).

- [ ] **Step 1: Write the failing tests** (mocked fetch + localStorage; offline-first first)

```ts
// src/account.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as account from './account';
import { loadSave, saveSave, defaultSave } from './save';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('account — offline-first (no backend)', () => {
  it('accountEnabled is false with no VITE_LEADERBOARD_URL (test env)', () => {
    account.optIn();
    expect(account.accountEnabled()).toBe(false); // BASE is '' in vitest
  });
  it('boot is a no-op that never throws when offline', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(account.boot()).resolves.toBeUndefined();
    expect(f).not.toHaveBeenCalled(); // never opted in / no backend ⇒ zero requests
  });
  it('flush is a no-op when not enabled', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(account.flush()).resolves.toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('account — opt-in gating', () => {
  it('optIn/optOut toggle the persisted flag', () => {
    expect(account.optedIn()).toBe(false);
    account.optIn();
    expect(account.optedIn()).toBe(true);
    account.optOut();
    expect(account.optedIn()).toBe(false);
  });
});
```

> Note: because `BASE` is empty in the vitest env (vitest.config sets `VITE_LEADERBOARD_URL: ''`), the network-path tests assert the **no-op** contract directly. To test the boot-merge + flush *logic* without a backend, expose the merge step as a separately-tested pure helper:
> add `export function mergeCloud(local: SaveData, cloud: SaveData | null, localAt: number, cloudAt: number): SaveData` (returns `local` when `cloud` is null, else `mergeSaves`). Test it directly:

```ts
import { mergeCloud } from './account';
describe('account — mergeCloud (pure boot-merge step)', () => {
  it('returns local unchanged when there is no cloud save', () => {
    const l = { ...defaultSave(), highScore: 7 };
    expect(mergeCloud(l, null, 1, 2)).toEqual(l);
  });
  it('merges cloud into local without losing progress', () => {
    const l = { ...defaultSave(), highScore: 7, achievements: ['a'] };
    const c = { ...defaultSave(), highScore: 9, achievements: ['b'] };
    const m = mergeCloud(l, c, 1, 2);
    expect(m.highScore).toBe(9);
    expect(new Set(m.achievements)).toEqual(new Set(['a', 'b']));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/account.test.ts`
Expected: FAIL — cannot resolve `./account`.

- [ ] **Step 3: Implement `src/api.ts` export + `src/save.ts` hooks**

`src/api.ts`: change `function deviceId(): string {` → `export function deviceId(): string {`.

`src/save.ts` — add after the `SETTINGS_KEY` const:
```ts
const WRITTEN_AT_KEY = 'lancefall.save.writtenAt';
let saveListener: ((data: SaveData) => void) | null = null;
/** Register a single listener invoked after every successful local-save write (drives the
 *  account layer's debounced cloud flush). Pass null to clear. Additive; no behavior change
 *  when unset. */
export function onSaveWrite(fn: ((data: SaveData) => void) | null): void {
  saveListener = fn;
}
/** Epoch-ms the local save was last written (0 = never). Used as the `latest`-field write-time
 *  in the cloud merge. */
export function savedAt(): number {
  try {
    return Number(localStorage.getItem(WRITTEN_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}
```
and in `saveSave`, after the `localStorage.setItem(SAVE_KEY, ...)` line, before the `catch`:
```ts
    try { localStorage.setItem(WRITTEN_AT_KEY, String(Date.now())); } catch { /* ignore */ }
    if (saveListener) { try { saveListener(data); } catch { /* a listener must never break a save */ } }
```

- [ ] **Step 4: Implement `src/account.ts`**

```ts
// Optional, opt-in cloud save. OFFLINE-FIRST + fire-and-forget — mirrors api.ts exactly:
// with no VITE_LEADERBOARD_URL, never opted in, offline, or on any non-2xx, this is a complete
// no-op and the game stays pure-localStorage. Never blocks the game loop; never throws.
import { mergeSaves } from './cloudMerge';
import { loadSave, saveSave, savedAt, type SaveData } from './save';
import { deviceId } from './api';

const BASE = ((import.meta.env?.VITE_LEADERBOARD_URL as string | undefined) ?? '').replace(/\/+$/, '');
const OPT_KEY = 'lancefall.cloud';
const SESSION_KEY = 'lancefall.session';
const FLUSH_DEBOUNCE_MS = 30_000;

let session = '';
let rev = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleWired = false;

function ls(k: string): string { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } }
function setLs(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

export function optedIn(): boolean { return ls(OPT_KEY) === '1'; }
export function optIn(): void { setLs(OPT_KEY, '1'); }
export function optOut(): void { setLs(OPT_KEY, '0'); }
export function accountEnabled(): boolean { return BASE.length > 0 && optedIn(); }

/** Pure boot-merge step (separately tested): local unchanged when there's no cloud save. */
export function mergeCloud(local: SaveData, cloud: SaveData | null, localAt: number, cloudAt: number): SaveData {
  if (!cloud) return local;
  return mergeSaves(local, cloud, localAt, cloudAt);
}

export async function boot(): Promise<void> {
  if (!accountEnabled()) return;
  session = ls(SESSION_KEY);
  try {
    const r = await fetch(`${BASE}/hello`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: deviceId(), session: session || undefined }),
    });
    if (!r.ok) return;
    const j = (await r.json()) as { session?: string; save?: SaveData | null; rev?: number };
    if (typeof j.session === 'string') { session = j.session; setLs(SESSION_KEY, session); }
    rev = typeof j.rev === 'number' ? j.rev : 0;
    const cloud = (j.save && typeof j.save === 'object') ? (j.save as SaveData) : null;
    if (cloud) {
      const merged = mergeCloud(loadSave(), cloud, savedAt(), Date.now());
      saveSave(merged); // adopt; saveSave stamps writtenAt + fires the listener
      void flush();      // push the merged result back so the cloud has the union too
    }
  } catch { /* offline / blocked — stay local */ }
}

export function noteChange(): void {
  if (!accountEnabled()) return;
  wireLifecycle();
  if (flushTimer) return; // coalesce: N changes in the window → one flush
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, FLUSH_DEBOUNCE_MS);
}

export async function flush(): Promise<void> {
  if (!accountEnabled() || !session) return;
  try {
    const r = await fetch(`${BASE}/save`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
      body: JSON.stringify({ save: loadSave(), rev, writtenAt: savedAt() }),
      keepalive: true,
    });
    if (!r.ok) return;
    const j = (await r.json()) as { save?: SaveData; rev?: number };
    if (typeof j.rev === 'number') rev = j.rev;
    if (j.save && typeof j.save === 'object') saveSave(j.save as SaveData);
  } catch { /* offline / blocked — try again on the next change */ }
}

function wireLifecycle(): void {
  if (lifecycleWired || typeof document === 'undefined') return;
  lifecycleWired = true;
  const onHide = () => { if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; } void flush(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide(); });
  window.addEventListener('pagehide', onHide);
}

/** One-time wiring: register the save listener + boot the session. Call once from main.ts. */
export function init(): void {
  if (!accountEnabled()) return;
  // lazy import to avoid a static save.ts → account.ts cycle is unnecessary (save.ts never
  // imports account.ts); register directly.
  void boot();
}
```

> The `onSaveWrite(noteChange)` registration is done in Task 7 Step 6 wiring (not here) to keep `account.ts` import-only-safe for tests (registering a global listener at import would fire during unrelated tests). Tests import the pure pieces; the wiring is exercised by the e2e.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/account.test.ts src/save.test.ts src/api.test.ts`
Expected: PASS (new account tests + the existing save/api tests still green).

- [ ] **Step 6: Wire `main.ts` (one additive block) — behind the opt-in gate**

In `src/main.ts`, after the save is loaded and the UI is up, add:
```ts
import * as account from './account';
import { onSaveWrite } from './save';
// ... after boot/UI init:
if (account.accountEnabled()) {
  onSaveWrite(account.noteChange);
  account.init();
}
```
(Place it where other one-time boot side-effects live. It is a strict no-op unless the player opted in AND a backend is configured.)

- [ ] **Step 7: tsc + full suite + commit**

Run: `npx tsc --noEmit` (clean) and `npx vitest run` (all green, ≥1259 + new).

```bash
git add src/account.ts src/account.test.ts src/api.ts src/save.ts src/main.ts
git commit -m "feat(lancefall): client account.ts opt-in cloud sync (boot + debounced flush) (P1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: SETTINGS opt-in row + `ACCOUNTS-SETUP.md` + wrangler var

**Files:**
- Modify: `src/panels/settings.ts` (one thin toggle row — "Cloud save (sync this device)")
- Modify: `worker/wrangler.toml` (document the `HMAC_SECRET` requirement in a comment; no value)
- Create: `worker/ACCOUNTS-SETUP.md`

- [ ] **Step 1: Add a Cloud-save toggle to SETTINGS**

In `src/panels/settings.ts`, add a single toggle row (matching the existing toggle pattern in that file) labeled **"Cloud save"** with sublabel "Back up progress to the cloud for this device". It calls `account.optIn()` / `account.optOut()` and, on enable, `account.init()`. Only show the row when `leaderboardEnabled()` (a backend is configured) — otherwise it's inert. Follow the exact toggle markup already used in settings.ts (do not invent a new control). Add a test in `src/panels/settings.test.ts` asserting the row renders + toggling persists the flag (mock localStorage).

- [ ] **Step 2: Document `HMAC_SECRET` in `worker/wrangler.toml`**

Append a comment block (no secret value):
```toml

# ── Player accounts (cloud save) ──
# Requires a secret HMAC key for stateless signed sessions. Set it for prod with:
#   npx wrangler secret put HMAC_SECRET
# For local `wrangler dev`, put it in worker/.dev.vars (gitignored; see .dev.vars.example).
# P2 adds the OAuth client id/secret vars (see ACCOUNTS-SETUP.md).
```

- [ ] **Step 3: Write `worker/ACCOUNTS-SETUP.md` (P1 section)**

Document, for the owner: (1) apply the D1 migration — `cd worker && npx wrangler d1 execute lancefall --remote --file=schema.sql` (idempotent; creates `accounts`+`saves`); (2) set the session secret — `npx wrangler secret put HMAC_SECRET` (a long random string); (3) deploy — `npx wrangler deploy`; (4) the client opt-in is per-device in SETTINGS → "Cloud save". Include a "P2/P3 (OAuth + guards) — added later" placeholder section.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` + `npx vitest run src/panels/settings.test.ts`
Expected: clean + green.

- [ ] **Step 5: Commit**

```bash
git add src/panels/settings.ts src/panels/settings.test.ts worker/wrangler.toml worker/ACCOUNTS-SETUP.md
git commit -m "feat(lancefall): SETTINGS cloud-save opt-in + ACCOUNTS-SETUP.md (P1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: P1 end-to-end verification (live `wrangler dev`)

**Files:** none (verification only; capture the proof in the PR/handoff notes).

- [ ] **Step 1: Full suite + tsc green**

Run: `npx tsc --noEmit` and `npx vitest run`.
Expected: tsc clean; all tests green (≥1259 baseline + the new `cloudMerge`/`workerSession`/`workerAccounts`/`account` suites).

- [ ] **Step 2: Offline path proven unchanged**

Confirm: with `VITE_LEADERBOARD_URL` unset, `accountEnabled()` is false, `boot()`/`flush()` make zero fetches (the `account.test.ts` no-op tests), and the existing `api.test.ts` offline tests still pass. State this explicitly in the handoff.

- [ ] **Step 3: Live two-device merge proof**

With `wrangler dev --local` + `.dev.vars` running and a built client pointed at it (`VITE_LEADERBOARD_URL=http://localhost:8799`):
1. Opt in on "device A" (one browser/profile), play → unlock something → let it flush.
2. Opt in on "device B" with a DIFFERENT `lancefall.device` token but the SAME account is NOT required for P1 (P1 is per-device backup); instead simulate divergence by editing two saves and PUT-ing both with the same session — assert the second `/hello` returns a merged blob that contains BOTH devices' unlocks and the higher records (no lost progress). (Cross-account merge is P2.)
3. Capture the before/after blobs in the handoff as the merge proof.

- [ ] **Step 4: Finalize**

Confirm the god-files weren't grown beyond the thin hooks (api.ts +1 word, save.ts +~12 lines, main.ts +~5 lines, settings.ts +1 row). Update `worker/ACCOUNTS-SETUP.md` if any step drifted. No commit needed unless notes were added.

---

## Self-Review

**Spec coverage (P1 scope = spec §15 "P1", §7 merge, §5 sessions, §6 D1, §9 offline, §10 free-tier):**
- Merge engine + category map + coverage test → Tasks 1–2 ✓ (spec §7, §13).
- Spendable reconcile (shards/fragments) → Task 2 (`shardsSpecial`, `fragmentsSpent`=maxNum) ✓ (§7.1).
- Stateless HMAC sessions, no KV → Task 3 ✓ (§5, §10).
- D1 `accounts`+`saves` → Task 5 ✓ (§6).
- `/hello` (combined boot) + `/save` (server merge + rev + sanitize) → Task 6 ✓ (§5, §7.2, §12).
- Client account.ts offline-first/fire-and-forget + debounced flush + boot → Task 7 ✓ (§2, §7.2, §9).
- Server-side save sanitization via migrate.ts → Task 4 ✓ (§12).
- Opt-in toggle + owner setup doc → Task 8 ✓ (§15, §14).
- Offline-first / free-tier proofs → Task 9 ✓ (§9, §10).

**Placeholder scan:** all code steps contain real code; no TBD/TODO. The SETTINGS row (Task 8 Step 1) references "the existing toggle pattern" rather than inlining markup — the implementer MUST read `settings.ts` first and match it (the file's convention is the contract; inlining a guessed control would violate "follow established patterns"). Flagged as the one read-first step.

**Type consistency:** `mergeSaves(a,b,aAt,bAt)` signature is identical across Tasks 2/4/7. `SessionPayload`/`signSession`/`verifySession` identical across Tasks 3/6. `sanitizeSaveBlob`/`mergeServerSave` identical across Tasks 4/6. `onSaveWrite`/`savedAt` identical across Tasks 7's save.ts edits and account.ts consumers.

**Deferred to P2/P3 (not P1 gaps):** OAuth `/auth/*`, `panels/account.ts` full sign-in UI, cross-account merge, `/score` account binding, verified marker, the plausibility/dedupe/rate guards beyond the existing IP limit, account deletion, privacy note. These are explicitly later phases per spec §15.
