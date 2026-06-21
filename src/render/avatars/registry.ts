// Avatar visual layer — the registry (the STABLE interface the rest of the game
// wires into; see design §5.1). Pure: no save/ui/game imports. The integration
// track (avatarUnlocks.ts, panels/avatar.ts, cockpit) depends on these names.

import { frame, type AvatarTier } from './frame';
import { esc } from './primitives';

import { scene as lance } from './scenes/lance';
import { scene as ring } from './scenes/ring';
import { scene as beat } from './scenes/beat';
import { scene as fall } from './scenes/fall';
import { scene as graze } from './scenes/graze';
import { scene as comet } from './scenes/comet';
import { scene as skyline } from './scenes/skyline';
import { scene as chevron } from './scenes/chevron';
import { scene as warden } from './scenes/warden';
import { scene as weaver } from './scenes/weaver';
import { scene as beacon } from './scenes/beacon';
import { scene as mirrorblade } from './scenes/mirrorblade';
import { scene as hollow } from './scenes/hollow';
import { scene as sovereign } from './scenes/sovereign';
import { scene as codebreaker } from './scenes/codebreaker';
import { scene as remember } from './scenes/remember';
import { scene as choice } from './scenes/choice';
import { scene as vigil } from './scenes/vigil';
import { scene as heat } from './scenes/heat';
import { scene as untouched } from './scenes/untouched';
import { scene as daybreak } from './scenes/daybreak';
import { scene as lastbreath } from './scenes/lastbreath';
import { scene as solstice } from './scenes/solstice';
import { scene as eternal } from './scenes/eternal';
import { scene as drownedbell } from './scenes/drownedbell';

export type { AvatarTier };
export type AvatarGroup = 'free' | 'boss' | 'cipher' | 'pilot' | 'special';

/** Inputs threaded to every scene builder. Pure & deterministic. */
export interface SceneCtx {
  uid: string;
  accent: string;
  animated: boolean;
  variant: 'full' | 'tile';
}

export interface AvatarVisual {
  id: string;
  name: string;
  tier: AvatarTier;
  accent: string;
  group: AvatarGroup;
  /** signature motion verb — for docs/preview labelling */
  motion: string;
  /** human text for locked tiles ("Fell the Warden") — NO save logic here */
  unlockHint: string;
  /** bespoke hex-window content (frame supplies backdrop + glass cap) */
  scene: (ctx: SceneCtx) => string;
}

export const AVATAR_VISUALS: AvatarVisual[] = [
  // ── FREE — the sigil set (tier I) ──
  { id: 'lance', name: 'THE LANCE', tier: 1, accent: '#7df9ff', group: 'free', motion: 'strike', unlockHint: 'Yours from the first run', scene: lance },
  { id: 'ring', name: 'COHERENCE', tier: 1, accent: '#7df9ff', group: 'free', motion: 'resonance', unlockHint: 'Yours from the first run', scene: ring },
  { id: 'beat', name: 'THE BEAT', tier: 1, accent: '#7df9ff', group: 'free', motion: 'pulse', unlockHint: 'Yours from the first run', scene: beat },
  { id: 'fall', name: 'LANCEFALL', tier: 1, accent: '#9bb6ff', group: 'free', motion: 'fall', unlockHint: 'Yours from the first run', scene: fall },
  { id: 'graze', name: 'GRAZE', tier: 1, accent: '#7df9ff', group: 'free', motion: 'skim', unlockHint: 'Yours from the first run', scene: graze },
  { id: 'comet', name: 'DASH', tier: 1, accent: '#7df9ff', group: 'free', motion: 'dash', unlockHint: 'Yours from the first run', scene: comet },
  { id: 'skyline', name: 'THE CITY', tier: 1, accent: '#7df9ff', group: 'free', motion: 'flicker', unlockHint: 'Yours from the first run', scene: skyline },
  { id: 'chevron', name: 'VANGUARD', tier: 1, accent: '#7df9ff', group: 'free', motion: 'climb', unlockHint: 'Yours from the first run', scene: chevron },

  // ── THE SIX WHO LET IT FALL — boss crests (tier II; Sovereign tier III) ──
  { id: 'warden', name: "THE WARDEN'S SEAL", tier: 2, accent: '#ff3b6b', group: 'boss', motion: 'gate', unlockHint: 'Fell THE WARDEN', scene: warden },
  { id: 'weaver', name: "THE WEAVER'S KNOT", tier: 2, accent: '#a855f7', group: 'boss', motion: 'weave', unlockHint: 'Fell THE WEAVER', scene: weaver },
  { id: 'beacon', name: 'THE DARK BEACON', tier: 2, accent: '#38bdf8', group: 'boss', motion: 'sweep', unlockHint: 'Fell THE BEACON', scene: beacon },
  { id: 'mirrorblade', name: 'THE MIRRORBLADE', tier: 2, accent: '#ef4444', group: 'boss', motion: 'mirror', unlockHint: 'Fell THE MIRRORBLADE', scene: mirrorblade },
  { id: 'hollow', name: 'THE HOLLOW', tier: 2, accent: '#6ee7b7', group: 'boss', motion: 'implode', unlockHint: 'Fell THE HOLLOW', scene: hollow },
  { id: 'sovereign', name: 'THE FALLEN CROWN', tier: 3, accent: '#fde047', group: 'boss', motion: 'shatter', unlockHint: 'Fell THE SOVEREIGN — or made THE CHOICE', scene: sovereign },

  // ── THE CITY REMEMBERS — decryption line (tier II) ──
  { id: 'codebreaker', name: 'THE CODEBREAKER', tier: 2, accent: '#8b7dff', group: 'cipher', motion: 'rotate', unlockHint: 'Decrypt a quarter of the city', scene: codebreaker },
  { id: 'remember', name: 'REMEMBER EVERYTHING', tier: 2, accent: '#7df9ff', group: 'cipher', motion: 'rise', unlockHint: 'Decrypt every word', scene: remember },
  { id: 'choice', name: 'THE CHOICE', tier: 2, accent: '#fde047', group: 'cipher', motion: 'balance', unlockHint: 'Reach the Stillpoint', scene: choice },
  { id: 'vigil', name: 'THE VIGIL', tier: 2, accent: '#ffd76b', group: 'cipher', motion: 'hold', unlockHint: 'Keep the Vigil', scene: vigil },

  // ── THE PILOT — prestige line (tier II; Eternal tier III) ──
  { id: 'heat', name: 'HEATFORGED', tier: 2, accent: '#ff7a3b', group: 'pilot', motion: 'burn', unlockHint: 'Survive Heat 5', scene: heat },
  { id: 'untouched', name: 'UNTOUCHED', tier: 2, accent: '#bff8ff', group: 'pilot', motion: 'shield', unlockHint: 'Clear a run flawless', scene: untouched },
  { id: 'daybreak', name: 'DAYBREAK', tier: 2, accent: '#ffd76b', group: 'pilot', motion: 'flare', unlockHint: 'Trigger 50 Overdrives', scene: daybreak },
  { id: 'lastbreath', name: 'LAST BREATH', tier: 2, accent: '#7df9ff', group: 'pilot', motion: 'clutch', unlockHint: 'Survive 25 Last Breaths', scene: lastbreath },
  { id: 'solstice', name: 'SOLSTICE', tier: 2, accent: '#fde047', group: 'pilot', motion: 'shine', unlockHint: 'Win THE LONGEST DAY', scene: solstice },
  { id: 'eternal', name: 'ETERNAL', tier: 3, accent: '#fff3c0', group: 'pilot', motion: 'eternal', unlockHint: 'Begin again — or fell all six', scene: eternal },

  // ── FROM THE DEEP — a recovered secret ──
  { id: 'drownedbell', name: 'THE DROWNED BELL', tier: 2, accent: '#2dd4bf', group: 'special', motion: 'toll', unlockHint: 'Remember the whole city — and keep the Vigil', scene: drownedbell },
];

export const AVATAR_IDS: readonly string[] = AVATAR_VISUALS.map((a) => a.id);

const BY_ID = new Map(AVATAR_VISUALS.map((a) => [a.id, a]));

export function avatarVisual(id: string): AvatarVisual | undefined {
  return BY_ID.get(id);
}

export const DEFAULT_AVATAR = 'lance';

export interface RenderAvatarOpts {
  size?: number;
  animated?: boolean;
  variant?: 'full' | 'tile';
  uid?: string;
}

/** Full medallion SVG string: frame(tier,accent,uid) + scene(ctx). Generates a
 *  deterministic uid, namespaces all ids, carries role="img" + title/desc. Falls
 *  back to DEFAULT_AVATAR for an unknown id (never throws). */
export function renderAvatar(id: string, opts: RenderAvatarOpts = {}): string {
  const v = avatarVisual(id) ?? BY_ID.get(DEFAULT_AVATAR)!;
  const size = opts.size ?? 96;
  const variant = opts.variant ?? 'full';
  const animated = opts.animated !== false && variant !== 'tile';
  const uid = opts.uid ?? `${v.id}_${variant}_${animated ? 'a' : 's'}_${size}`;
  const ctx: SceneCtx = { uid, accent: v.accent, animated, variant };
  const medallion = frame(v.tier, v.accent, uid, { animated, variant }, v.scene(ctx));
  const title = esc(v.name);
  const desc = esc(`${v.name} — ${v.group} sigil, tier ${v.tier}, ${v.motion} motion`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="${size}" height="${size}" ` +
    `role="img" aria-label="${title}" class="lf-avatar">` +
    `<title>${title}</title><desc>${desc}</desc>` +
    `<g transform="translate(120,120)">${medallion}</g></svg>`
  );
}
