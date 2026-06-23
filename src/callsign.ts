// Auto-assigned anonymous player callsigns. A nameless save would otherwise collapse into the
// worker's single shared "ANON" leaderboard row; a unique on-theme callsign lets every player
// rank individually with zero setup. Pure: the only randomness is the injected `rand` (defaults
// to Math.random), called at BOOT only — never inside the seeded run simulation.
import { sanitizeHandle, type SaveData } from './save';

/** On-theme, pilot-flavored words (all <= 7 chars, so `WORD-9999` is always <= 16). */
const WORD_POOL = [
  'LANCER', 'PILOT', 'SPEAR', 'VIGIL', 'ECHO', 'ASH', 'DAWN', 'EMBER',
  'NEON', 'COMET', 'NOVA', 'RELAY', 'WARD', 'KITE', 'DUSK', 'GLASS',
  'RONIN', 'WRAITH', 'DRIFT', 'FLARE', 'BLADE', 'HALO', 'ONYX', 'VESPER',
] as const;

/** A unique-ish anonymous callsign like "LANCER-4827". `rand` is injectable only so tests are
 *  deterministic; production passes the default Math.random. The result already satisfies
 *  sanitizeHandle (letters/digit/hyphen, <= 16 chars), so sanitizing it is a no-op. */
export function generateCallsign(rand: () => number = Math.random): string {
  const idx = Math.min(WORD_POOL.length - 1, Math.floor(rand() * WORD_POOL.length));
  const word = WORD_POOL[idx];
  const n = Math.floor(rand() * 9900) + 100; // 100..9999
  return `${word}-${n}`;
}

/** Fill a blank handle with a fresh, sanitized callsign. Mutates `save` and returns true iff it
 *  assigned one; a save that already has a handle (typed or cloud-synced) is left untouched. This
 *  is the single canonical sanitize boundary, mirroring setHandle(). */
export function applyCallsign(save: SaveData, rand: () => number = Math.random): boolean {
  if (save.handle) return false;
  save.handle = sanitizeHandle(generateCallsign(rand));
  return true;
}
