// Save schema versioning + migration. The single chokepoint every persisted
// field passes through, so adding SaveData fields never re-derives merge logic
// and a future shape change has exactly one place to live.
//
// Strategy: parse → (version-stepped transforms) → default-fill over the current
// defaultSave() → stamp the current version. Unknown/old fields survive the
// spread; missing new fields get their defaults. `base` is injected by the caller
// to keep this module free of a runtime import cycle with save.ts.

import type { SaveData } from './save';
import { MODES } from './modes';

export const SAVE_VERSION = 6;

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
    if (Array.isArray(bv)) {
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
  // 4.2 — playStreak is a count: clamp a hand-edited negative/fractional value to a
  // safe non-negative integer (the generic loop above only checks it's a finite number).
  if (typeof o.playStreak === 'number') o.playStreak = Math.max(0, Math.floor(o.playStreak));
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
