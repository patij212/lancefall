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
