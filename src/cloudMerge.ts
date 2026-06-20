// Pure field-aware cloud-save merge — the SINGLE source of truth shared by the client
// (src/account.ts) and the Worker (worker/src/index.ts). Never last-write-wins: each field
// merges by its category so a player can NEVER lose an unlock or a record by playing on a
// second device. Pure + total; imports ONLY the SaveData type (erased at runtime), so the
// Worker can bundle it with no client/DOM dependencies.
import type { SaveData, RunRecord, LastRunDetail } from './save';
import { defaultSave } from './save';

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

// ─── merge helpers ───────────────────────────────────────────────────────────

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
