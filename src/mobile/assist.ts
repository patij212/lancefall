// Pure aim-assist magnetism for touch. Given the player's manual aim point and the live
// enemies, return a (possibly) nudged aim point. PURE & deterministic — no rng, no clock —
// so replays/ghosts that record the resolved aim stay bit-identical.

export type AssistMode = 'off' | 'subtle' | 'strong';

export interface AssistTarget {
  x: number;
  y: number;
  radius: number;
  active: boolean;
}

/** Structurally satisfied by Pool<Enemy> (forEachActive). */
export interface AssistEnemies {
  forEachActive(cb: (e: AssistTarget) => void): void;
}

export interface AssistResult {
  x: number;
  y: number;
  usedStrong: boolean;
}

const DEG = Math.PI / 180;
// coneCos = cos(half-angle): an enemy counts only if its bearing is within the cone of aim.
// Subtle = a tight forward cone, gentle blend. Strong = whole-screen lock, hard blend.
const CFG = {
  subtle: { coneCos: Math.cos(40 * DEG), range: 460, blend: 0.4 },
  strong: { coneCos: -1, range: 1000, blend: 0.9 },
} as const;

function pickTarget(
  px: number,
  py: number,
  ax: number,
  ay: number,
  enemies: AssistEnemies,
  coneCos: number,
  range: number,
): AssistTarget | null {
  let best: AssistTarget | null = null;
  let bestScore = Infinity;
  enemies.forEachActive((e) => {
    if (!e.active) return;
    const dx = e.x - px;
    const dy = e.y - py;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > range) return;
    const dot = (dx / d) * ax + (dy / d) * ay; // cos(angle between aim dir and enemy bearing)
    if (dot < coneCos) return; // outside the cone
    // lower is better: nearer + bigger + more-aligned wins
    const score = d - e.radius * 6 - dot * 80;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  });
  return best;
}

export function applyAssist(
  aimX: number,
  aimY: number,
  px: number,
  py: number,
  enemies: AssistEnemies,
  mode: AssistMode,
): AssistResult {
  if (mode === 'off') return { x: aimX, y: aimY, usedStrong: false };
  const cfg = CFG[mode];
  const aimAng = Math.atan2(aimY - py, aimX - px);
  const aimDist = Math.max(1, Math.hypot(aimX - px, aimY - py));
  const t = pickTarget(px, py, Math.cos(aimAng), Math.sin(aimAng), enemies, cfg.coneCos, cfg.range);
  if (!t) return { x: aimX, y: aimY, usedStrong: false };
  const tgtAng = Math.atan2(t.y - py, t.x - px);
  let delta = tgtAng - aimAng;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const ang = aimAng + delta * cfg.blend;
  return {
    x: px + Math.cos(ang) * aimDist,
    y: py + Math.sin(ang) * aimDist,
    usedStrong: mode === 'strong',
  };
}
