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

/** Sanitize a provider-supplied display name to the same shape as the client handle
 *  (word chars/space/hyphen, trimmed, ≤16). '' when blank/all-junk. */
export function claimName(raw: unknown): string {
  return String(raw ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
}

/** Merge two real saves on link (no "server" side — both are kept fully; write-times only
 *  decide `latest` fields). Names the intent; delegates to the shared pure merge. */
export function mergeForLink(existing: SaveData | null, current: SaveData | null, existingAt: number, currentAt: number): SaveData {
  if (!existing) return current ?? sanitizeSaveBlob(null);
  if (!current) return existing;
  return mergeSaves(existing, current, existingAt, currentAt);
}
