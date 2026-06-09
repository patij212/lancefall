// BUILD DNA — encode a run's build (ship + perks + evolutions + relics + heat +
// archetype) into a short shareable base64url string, and decode it back. Pure
// codec, no DOM. A version tag ('L1') lets the format evolve without breaking old
// strings. Round-trips losslessly; decode is total (returns null on garbage).

import type { PerkStacks } from './perks';

export interface BuildDna {
  v: number; // payload schema version
  ship: string;
  heat: number;
  arch: string;
  stacks: PerkStacks;
  evos: string[];
  relics: string[];
}

const TAG = 'L1'; // outer format tag

function b64urlEncode(s: string): string {
  // btoa works on latin1; build payloads are ASCII (ids/numbers), so this is safe.
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64);
}

export function encodeBuildDna(b: BuildDna): string {
  return TAG + b64urlEncode(JSON.stringify(b));
}

export function decodeBuildDna(s: string): BuildDna | null {
  try {
    const trimmed = s.trim();
    if (!trimmed.startsWith(TAG)) return null;
    const obj = JSON.parse(b64urlDecode(trimmed.slice(TAG.length))) as Partial<BuildDna>;
    if (!obj || typeof obj.ship !== 'string' || typeof obj.heat !== 'number') return null;
    return {
      v: obj.v ?? 1,
      ship: obj.ship,
      heat: obj.heat,
      arch: typeof obj.arch === 'string' ? obj.arch : 'none',
      stacks: (obj.stacks && typeof obj.stacks === 'object' ? obj.stacks : {}) as PerkStacks,
      evos: Array.isArray(obj.evos) ? obj.evos : [],
      relics: Array.isArray(obj.relics) ? obj.relics : [],
    };
  } catch {
    return null;
  }
}
