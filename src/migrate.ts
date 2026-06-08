// Save schema versioning + migration. The single chokepoint every persisted
// field passes through, so adding SaveData fields never re-derives merge logic
// and a future shape change has exactly one place to live.
//
// Strategy: parse → (version-stepped transforms) → default-fill over the current
// defaultSave() → stamp the current version. Unknown/old fields survive the
// spread; missing new fields get their defaults. `base` is injected by the caller
// to keep this module free of a runtime import cycle with save.ts.

import type { SaveData } from './save';

export const SAVE_VERSION = 2;

/** Bring a raw parsed save object up to the current schema. Pure + total. */
export function migrateSave(raw: unknown, base: SaveData): SaveData {
  if (!raw || typeof raw !== 'object') return { ...base };
  const data = raw as Partial<SaveData> & { version?: number };

  // --- version-stepped transforms ---
  // v1 (no `version` field) → v2: no field renames; new fields are default-filled
  // by the spread below. Add future steps here, keyed on `(data.version ?? 1)`.

  return { ...base, ...data, version: SAVE_VERSION };
}
