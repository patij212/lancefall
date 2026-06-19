// Boss telegraph / finale overlays — the NEW per-boss draw bits added by the
// behavior-phase rework live here (NOT inline in the 2500-line render.ts). Each
// function draws in the boss-CENTRE frame (ctx already translated to e.x,e.y,
// unrotated) and is a no-op unless its boss is in the relevant state, so the call
// sites in render.ts stay one-liner delegations. No allocation per frame; motion
// is gated by the passed `reduceMotion` flag (a11y) — telegraphs stay legible.

import { SOVEREIGN, BEACON } from '../tune';
import { sovereignFinale } from '../sovereign';
import type { Enemy } from '../types';

/** NOVA SPIRAL wind-up tracers — faint rotating arms along the angles the spiral
 *  is about to fire, ramping in over the telegraph (phase 1, subPhase 0). Gives the
 *  formerly zero-warning spiral a readable tell. `reduceMotion` → a steady fan. */
export function drawNovaSpiralTelegraph(ctx: CanvasRenderingContext2D, e: Enemy, reduceMotion: boolean): void {
  if (e.kind !== 'sovereign' || e.phase !== 1 || e.subPhase !== 0) return;
  const t = e.telegraph || 0; // 0..1 wind-up progress (novaSpiralTelegraphFrac)
  if (t <= 0) return;
  const reach = 2200 * t; // arms grow outward as the wind-up completes
  const lead = reduceMotion ? 0 : SOVEREIGN.spiralSpin * t * 3; // hint of the impending spin
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 1 + 2 * t;
  ctx.globalAlpha = 0.12 + 0.5 * t;
  for (let i = 0; i < SOVEREIGN.spiralArms; i++) {
    const a = e.angle + lead + (i / SOVEREIGN.spiralArms) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
    ctx.stroke();
  }
  ctx.restore();
}

/** FINALE tint — a pulsing crimson aura while the Sovereign is in its sub-25%
 *  "everything at once" crescendo (cores no longer reform). A felt escalation cue. */
export function drawSovereignFinaleTint(ctx: CanvasRenderingContext2D, e: Enemy, reduceMotion: boolean): void {
  if (!sovereignFinale(e)) return;
  const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(e.spawnTime * 9);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.18 + 0.22 * pulse;
  ctx.strokeStyle = '#ff5a5a';
  ctx.lineWidth = 4 + 3 * pulse;
  ctx.beginPath();
  ctx.arc(0, 0, e.radius * (1.7 + 0.12 * pulse), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** BEACON enraged counter-beam — the perpendicular 2nd diameter (the rotating cross
 *  the low-HP sweep gains). Mirrors the +π/2 arm in beamHitsPoint(arms=2). Drawn in
 *  the boss-centre frame; telegraphs/fires in lockstep with the primary beam. */
export function drawBeaconCounterBeam(ctx: CanvasRenderingContext2D, e: Enemy, enraged: boolean): void {
  if (!enraged || e.kind !== 'beacon' || e.phase !== 0 || e.subPhase === 2) return;
  const active = e.subPhase === 1;
  const tele = e.telegraph || 0;
  const w = active ? BEACON.beamWidth : 5;
  ctx.save();
  ctx.rotate(e.angle + Math.PI / 2); // the perpendicular diameter
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = active ? 0.85 : 0.25 + 0.45 * tele;
  ctx.fillStyle = active ? '#bfefff' : '#38bdf8';
  ctx.fillRect(-3000, -w / 2, 6000, w);
  if (active) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-3000, -w / 6, 6000, w / 3);
  }
  ctx.restore();
}
