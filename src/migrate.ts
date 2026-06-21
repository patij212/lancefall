// Save schema versioning + migration. The single chokepoint every persisted
// field passes through, so adding SaveData fields never re-derives merge logic
// and a future shape change has exactly one place to live.
//
// Strategy: parse → (version-stepped transforms) → default-fill over the current
// defaultSave() → stamp the current version. Unknown/old fields survive the
// spread; missing new fields get their defaults. `base` is injected by the caller
// to keep this module free of a runtime import cycle with save.ts.

import type { SaveData, RunRecord } from './save';
import { MODES } from './modes';
import { PORTED_KINDS, defaultSkinId, skinById, canUnlockSkin } from './skins';
import { GLOSS_IDS } from './gloss';
import { SHIP_SKINS } from './shipSkins';
import { SHIPS } from './ships';
import { AVATAR_IDS } from './render/avatars';

export const SAVE_VERSION = 10;

/** Bring a raw parsed save object up to the current schema. Pure + total. */
export function migrateSave(raw: unknown, base: SaveData): SaveData {
  if (!raw || typeof raw !== 'object') return { ...base };
  const data = raw as Partial<SaveData> & { version?: number };

  // --- version-stepped transforms ---
  // v1 (no `version` field) → v2: no field renames; new fields default-filled by the spread.
  // v2 → v3: added selectedHeat, maxHeat, selectedArchetype, handle — all
  //          default-filled by the spread below; no explicit transform needed.
  // v3 → v4: added unlockedTrails + selectedTrail (cosmetic dash trails) — again
  //          default-filled by the spread; no explicit transform needed.
  // v4 → v5: added the Stillpoint meta (stillpointFragments/Lore/Dossiers,
  //          fragmentsSpent, stillpointChoice, ngPlusLevel/Active, nemesis,
  //          deepestWave). Purely additive → default-filled by the spread; no
  //          explicit transform needed.
  // v5 → v6: reserved the v6-pass fields (selectedMode, dailyAttempts,
  //          dailyAttemptDate, baseShields, cityMemoryMeter, firstRunsBeatHint,
  //          the 4.2 daily-streak pair lastPlayedDate/playStreak, and the §1.2
  //          DASH SANDBOX onboarding flag seenSandbox). Purely additive → an
  //          older v6 save missing seenSandbox default-fills to false (the new
  //          player still gets the sandbox once); the per-field validation loop
  //          below coerces a hand-edited non-boolean seenSandbox back to false,
  //          and resets a hand-edited lastPlayedDate ('' default) / playStreak (≥0
  //          number) to its default. No explicit transform / no version bump needed.
  // v6 → v7: added the STATS v7 RECORDS (longestRunSec, fastestArenaSec,
  //          mostBossesOneRun). Purely additive → an older save missing them
  //          default-fills to 0 via the spread; the per-field loop resets a
  //          non-finite hand-edit, and the clamp below forces a non-negative
  //          integer. No explicit transform needed.
  // v7 → v8: added the cosmetic SHIP SKINS — per-(ship,set) ownership (unlockedShipSkins, keyed
  //          `${shipId}:${setId}`) + a per-ship equipped-set record (selectedShipSkins). Additive:
  //          an older save default-fills to ([], {}); the sanitizers below filter ownership to
  //          real ship+set keys and the equipped record to sets the player actually owns. (A
  //          pre-rework v8 dev save's set-only ids simply drop — those skins are re-acquired.)
  // v8 → v9: added the v9 vigil fields (vigilSince, released, choiceDate). Purely additive → an
  //          older save default-fills (-1 / false / ''); the clamp below forces vigilSince to an
  //          integer >= -1, and the generic loop coerces released (bool) / choiceDate (string).
  // Add future steps here, keyed on `(data.version ?? 1)`.

  const out: SaveData = { ...base, ...data, version: SAVE_VERSION };

  // --- total per-field type validation ---
  // A malformed-but-parseable save (hand-edited, storage-corrupted, or from a newer
  // build) must degrade to a clean default PER FIELD, never crash the first consumer.
  // Any field whose stored type doesn't match its default is reset to the default;
  // the {string:number} records (meta/nemesis) are sanitized value-by-value so a NaN
  // or string level can't poison deriveStats and soft-lock a run.
  const b = base as unknown as Record<string, unknown>;
  const o = out as unknown as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    const bv = b[k];
    const ov = o[k];
    if (k === 'selectedSkins' || k === 'selectedShipSkins') {
      // {string:string} records — NOT number-records; sanitized below.
      continue;
    } else if (Array.isArray(bv)) {
      if (!Array.isArray(ov)) o[k] = bv;
    } else if (bv !== null && typeof bv === 'object') {
      o[k] = coerceNumberRecord(ov, bv as Record<string, number>);
    } else if (typeof bv === 'number') {
      if (typeof ov !== 'number' || !Number.isFinite(ov)) o[k] = bv;
    } else if (typeof bv === 'string') {
      if (typeof ov !== 'string') o[k] = bv;
    } else if (typeof bv === 'boolean') {
      if (typeof ov !== 'boolean') o[k] = bv;
    }
  }
  // the one string field with a constrained domain (THE CHOICE) gets an enum guard
  if (o.stillpointChoice !== 'catch' && o.stillpointChoice !== 'fall' && o.stillpointChoice !== 'none') {
    o.stillpointChoice = b.stillpointChoice;
  }
  // selectedMode must be a REAL mode id (not just any string), or the title highlight
  // desyncs from the launch target (no card lit while PLAY falls back to endless).
  if (!MODES.some((m) => m.id === o.selectedMode)) o.selectedMode = b.selectedMode;
  // selectedAvatar must be a real avatar id (render/avatars registry), else the default 'lance'.
  if (!AVATAR_IDS.includes(o.selectedAvatar as string)) o.selectedAvatar = b.selectedAvatar;
  // 4.2 — playStreak is a count: clamp a hand-edited negative/fractional value to a
  // safe non-negative integer (the generic loop above only checks it's a finite number).
  if (typeof o.playStreak === 'number') o.playStreak = Math.max(0, Math.floor(o.playStreak));
  // v9 — vigilSince is a totalRuns ordinal or the -1 "not holding" sentinel: integer >= -1.
  if (typeof o.vigilSince === 'number') o.vigilSince = Math.max(-1, Math.floor(o.vigilSince));
  else o.vigilSince = b.vigilSince;
  // v9 → v10: THE CITY SPEAKS — citizenDeeds (open-ended id set, deduped like `taught`) + the
  //           seenPremiseCard flag. Additive → the generic loader default-fills; this filters the set.
  out.citizenDeeds = sanitizeTaught(out.citizenDeeds);
  // v7 RECORDS — non-negative integers (whole seconds / counts); the generic loop above only
  // ensured they're finite numbers, so clamp a hand-edited negative/fractional value here.
  for (const k of ['longestRunSec', 'fastestArenaSec', 'mostBossesOneRun', 'lifeTimeSec']) {
    if (typeof o[k] === 'number') o[k] = Math.max(0, Math.floor(o[k] as number));
  }
  // enemy SKINS — a {kind:skinId} record. Build a fresh map: every PORTED kind gets
  // a validated id (a known + UNLOCKED skin for that kind, else the kind's default);
  // unknown kinds in the stored blob are dropped (never added). Old saves missing the
  // field default-fill to every kind's default. Achievements have already been
  // sanitized to a string[] by the generic array branch above.
  const achs = Array.isArray(out.achievements) ? out.achievements : [];
  out.selectedSkins = sanitizeSelectedSkins(out.selectedSkins, achs);
  // §1.7 jargon glosses — keep only known, deduped GlossId strings. The generic loop
  // above already reset a non-array to []; this filters the CONTENTS so a hand-edited
  // blob can't bloat the set or inject a non-id (an unknown id would never match anyway).
  out.glossSeen = sanitizeGlossSeen(out.glossSeen);
  // ACT TWO onboarding — the persisted `taught` set. Keys are open-ended (`verb:*` /
  // `enemy:<kind>` / `boss:<kind>`), so unlike glossSeen we don't whitelist contents
  // (an unknown key simply never matches a live teach); we only keep deduped strings.
  // The generic loop above already reset a non-array to []. Additive → no version bump.
  out.taught = sanitizeTaught(out.taught);
  // v8 additive — BOMBE BRANCHING. Seed the three branches from the legacy bombeLevel (no
  // progress lost); keep bombeLevel as the synced derived total. No version bump.
  {
    const b = (out.bombeBranches ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
    let branches = { thrift: num(b.thrift), speed: num(b.speed), insight: num(b.insight) };
    if (branches.thrift + branches.speed + branches.insight === 0 && (out.bombeLevel ?? 0) > 0) {
      const lvl = out.bombeLevel; // legacy ladder → thrift+speed split
      branches = { thrift: Math.ceil(lvl / 2), speed: Math.floor(lvl / 2), insight: 0 };
    }
    out.bombeBranches = branches;
    out.bombeLevel = branches.thrift + branches.speed + branches.insight;
  }
  // Plan 2 BOMBE — additive. decryptedWords/solvedPuzzles are open-ended string sets (deduped,
  // capped like `taught`); bombeLevel is a non-negative integer (the generic loop only ensured it's
  // a finite number). No version bump — the generic loader already default-filled them.
  // decryptedWords holds up to the FULL intercept vocabulary (~265 words) — its cap must clear
  // that or THE LONGEST DAY (100% master cipher) becomes unreachable. 1024 future-proofs new
  // intercepts without bounding a legitimate complete decryption.
  out.decryptedWords = sanitizeTaught(out.decryptedWords, 1024);
  out.solvedPuzzles = sanitizeTaught(out.solvedPuzzles);
  out.solvedDailyCiphers = sanitizeTaught(out.solvedDailyCiphers);
  if (typeof out.bombeLevel === 'number') out.bombeLevel = Math.max(0, Math.floor(out.bombeLevel));
  // v8 ship-skin cosmetics — per-(ship,set) ownership keyed `${shipId}:${setId}`, plus the
  // per-ship equipped-set record. Both are filtered to real ship + set ids; an equipped entry the
  // player doesn't own (or for an unknown ship/set) is dropped → the plain hull.
  out.unlockedShipSkins = sanitizeShipSkins(out.unlockedShipSkins);
  out.selectedShipSkins = sanitizeSelectedShipSkins(out.selectedShipSkins, out.unlockedShipSkins);
  // v9 DOSSIER tracking — runHistory ring (capped + per-record validated), playDays bounded to
  // the 200 most-recent date keys, per-mode counts clamped to non-negative ints. Additive: the
  // generic coerceNumberRecord pass already cleaned the {string:number} maps to finite values.
  out.runHistory = sanitizeRunHistory(out.runHistory);
  out.playDays = capPlayDays(out.playDays);
  out.runsByMode = clampCounts(out.runsByMode);
  out.winsByMode = clampCounts(out.winsByMode);
  return out;
}

/** Coerce owned ship-skins to valid `${shipId}:${setId}` keys (a real ship + a real, non-'none'
 *  set). Unknown / malformed entries are dropped; the result is deduped. Pure + total. */
function sanitizeShipSkins(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ships = new Set<string>(SHIPS.map((s) => s.id));
  const sets = new Set<string>(SHIP_SKINS.map((s) => s.id));
  const out = raw.filter((x): x is string => {
    if (typeof x !== 'string') return false;
    const i = x.indexOf(':');
    return i > 0 && ships.has(x.slice(0, i)) && sets.has(x.slice(i + 1));
  });
  return [...new Set<string>(out)];
}

/** Coerce the per-ship equipped-set record: a real ship → a set that ship actually OWNS (else
 *  drop it → the plain hull). 'none' is the default and is never stored. Pure + total. */
function sanitizeSelectedShipSkins(raw: unknown, owned: string[]): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const ships = new Set<string>(SHIPS.map((s) => s.id));
  const ownedSet = new Set<string>(owned);
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const ship of Object.keys(src)) {
    if (!ships.has(ship)) continue;
    const set = src[ship];
    if (typeof set === 'string' && set !== 'none' && ownedSet.has(`${ship}:${set}`)) out[ship] = set;
  }
  return out;
}

/** Coerce a stored run-history blob to valid, capped RunRecords (newest-last, max 50). Pure + total. */
function sanitizeRunHistory(raw: unknown): RunRecord[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const out: RunRecord[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const score = num(o.score), wave = num(o.wave), sec = num(o.sec), heat = num(o.heat), combo = num(o.combo);
    if (score === null || wave === null || sec === null || heat === null || combo === null) continue;
    if (typeof o.mode !== 'string' || typeof o.date !== 'string') continue;
    out.push({
      score: Math.max(0, Math.floor(score)), wave: Math.max(0, Math.floor(wave)),
      mode: o.mode, won: o.won === true,
      sec: Math.max(0, Math.floor(sec)), heat: Math.max(0, Math.floor(heat)),
      combo: Math.max(0, Math.floor(combo)), date: o.date,
    });
  }
  return out.slice(-50);
}

/** Clamp a {string:number} record to non-negative integers (values are already finite). Pure. */
function clampCounts(rec: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(rec)) out[k] = Math.max(0, Math.floor(rec[k]));
  return out;
}

/** Keep the 200 most-recent YYYY-MM-DD keys (lexical sort == chronological), clamped. Pure. */
function capPlayDays(rec: Record<string, number>): Record<string, number> {
  const keys = Object.keys(rec).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-200);
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = Math.max(0, Math.floor(rec[k]));
  return out;
}

/** Coerce the persisted act-two teach set to deduped strings (keys are open-ended). Capped
 *  to a sane ceiling so a hand-edited blob can't bloat the save. Pure + total. */
function sanitizeTaught(raw: unknown, cap = 200): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === 'string'))].slice(0, cap);
}

/** Coerce the persisted gloss-seen set to known, deduped GlossId strings. Pure + total. */
function sanitizeGlossSeen(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(GLOSS_IDS);
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && known.has(x)))];
}

/** Coerce a stored enemy-skin map to a clean {kind:skinId} record: only PORTED
 *  kinds are kept; each value must be a SkinDef of that kind that is currently
 *  unlocked (achievement-gated) — anything else (unknown kind, wrong-kind id,
 *  locked id, non-string) resets to the kind's default. Pure + total. */
function sanitizeSelectedSkins(raw: unknown, achievements: string[]): Record<string, string> {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const kind of PORTED_KINDS) {
    const fallback = defaultSkinId(kind);
    const v = src[kind];
    if (typeof v !== 'string') {
      out[kind] = fallback;
      continue;
    }
    const def = skinById(v);
    const ok = def !== null && def.kind === kind && canUnlockSkin(def, achievements);
    out[kind] = ok ? v : fallback;
  }
  return out;
}

/** Keep only the finite-number entries of a {string:number} record (meta/nemesis).
 *  A NaN / string / object level would otherwise flow into deriveStats and corrupt
 *  every derived stat — turn that corruption into a clean drop instead. */
function coerceNumberRecord(ov: unknown, fallback: Record<string, number>): Record<string, number> {
  if (!ov || typeof ov !== 'object' || Array.isArray(ov)) return { ...fallback };
  const src = ov as Record<string, unknown>;
  const clean: Record<string, number> = {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
  }
  return clean;
}
