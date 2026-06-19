// Player spear-state visuals — pulled OUT of the 2500-line render.ts so the god-file
// holds no inline spear drawing (it only delegates here). Draws: the dash spear line +
// streaking ghost trail, the lingering Afterimage ghost, the charge aim guide (+ HEAVY
// LANCE overcharge fill / SLINGSHOT load tether), and the PARRY deflect arc. All juice
// is a11y-gated (steady alpha, never a per-frame strobe). No allocation per frame.

import { TUNE } from '../tune';
import type { World } from '../world';
import { effectiveParryArc } from '../parry';
import { trailGhostColor, type TrailDef } from '../trails';
import { trailBrightness, spearNeonLift } from '../renderMath';
import { shipModel, traceShipPath } from '../shipModels';
import { mix } from './colorMix';

// How far the dash SPEAR LINE leans from the combo-tier colour toward the equipped trail's
// colour, for non-combo (cosmetic) trails. Kept partial so the combo-tier signal (the line's
// hue climbing with the chain) is still readable — the trail just colours it. The default PULSE
// trail tracks the combo colour, so it is unaffected (the line stays pure combo).
const SPEAR_TRAIL_LEAN = 0.3;

/** The dash spear-line colour: the combo-tier colour, leaned toward the equipped trail so the
 *  chosen trail is felt on the dash's signature stroke (PULSE / combo-tracking trails are left
 *  as the pure combo colour). Pure + exported for unit testing. */
export function spearLineColor(comboCol: string, trail: TrailDef): string {
  return trail.combo ? comboCol : mix(comboCol, trail.base, SPEAR_TRAIL_LEAN);
}

export interface SpearDeps {
  coherence: number;
  reduceFlashing: boolean;
  clarity: boolean;
  slingshot: boolean;
  trail: TrailDef;
  themeAccent2: string;
  comboCol: string; // comboColor(world.combo), resolved by the caller (render.ts owns the table)
}

export function drawSpear(ctx: CanvasRenderingContext2D, world: World, d: SpearDeps): void {
  const p = world.player;
  const model = shipModel(world.shipId);

  // dash spear line + streaking ship afterimages (the "snap" of the dash)
  if (p.phase === 'dashing') {
    const col = spearLineColor(d.comboCol, d.trail);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col;
    ctx.lineWidth = TUNE.dash.hitboxRadius * 0.8;
    ctx.lineCap = 'round';
    ctx.globalAlpha = spearNeonLift(d.coherence, d.reduceFlashing, d.clarity); // C4 — momentum lights the spear
    ctx.beginPath();
    ctx.moveTo(p.dashFromX, p.dashFromY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();

    // ghost silhouettes along the travelled segment — crisp outlines that
    // read as a streak of ships, fading toward the tail
    const gsr = TUNE.player.spriteRadius;
    const blaze = Math.min(1, world.combo / 50); // the trail intensifies as the chain climbs
    const ghosts = 5 + Math.round(2 * blaze); // 5 → 7 (denser streak so the trail reads clearly)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ghostBase = trailGhostColor(d.trail, d.themeAccent2);
    ctx.strokeStyle = blaze > 0.5 ? mix(ghostBase, '#ffffff', (blaze - 0.5) * 2) : ghostBase;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    // the ink-ribbon trail dims as coherence drops (fixed high under Clarity)
    const tb = trailBrightness(d.coherence, d.reduceFlashing, d.clarity);
    for (let i = 1; i <= ghosts; i++) {
      const t = i / (ghosts + 1);
      const gx = p.dashFromX + (p.x - p.dashFromX) * t;
      const gy = p.dashFromY + (p.y - p.dashFromY) * t;
      const s = 0.7 + 0.3 * t; // ghosts grow toward the ship
      ctx.globalAlpha = Math.min(1, (0.32 + 0.45 * t) * (1 + 0.5 * blaze) * tb);
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(p.angle);
      ctx.scale(s, s);
      traceShipPath(ctx, model.hull, gsr);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // afterimage ghost
  if (world.ghostTimer > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#a855f7';
    // fade across the ghost's actual lifetime (WRAITH stretches afterimageSec well past 0.5)
    ctx.globalAlpha = Math.min(1, 0.45 * (world.ghostTimer / Math.max(0.01, world.stats.afterimageSec)));
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(world.ghostX0, world.ghostY0);
    ctx.lineTo(world.ghostX1, world.ghostY1);
    ctx.stroke();
    ctx.restore();
  }

  // charge aim guide
  if (p.phase === 'charging') {
    const len = TUNE.dash.minLen + (TUNE.dash.maxLen - TUNE.dash.minLen) * p.charge * world.stats.dashLenMul;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.strokeStyle = `rgba(120,220,255,${0.25 + 0.4 * p.charge})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    // arrowhead
    ctx.fillStyle = `rgba(150,230,255,${0.4 + 0.5 * p.charge})`;
    ctx.beginPath();
    ctx.moveTo(len + 10, 0);
    ctx.lineTo(len - 4, 7);
    ctx.lineTo(len - 4, -7);
    ctx.closePath();
    ctx.fill();
    // HEAVY LANCE OVERCHARGE — once at full charge, keep holding: an amber glow FILLS
    // along the spear as the overcharge builds, then locks solid + a bright tip when the
    // heavy arms. a11y: a steady fill/glow (never a strobe) so it survives reduceFlashing.
    if (p.charge >= 1 - 1e-6 && TUNE.dash.heavyOverchargeTime > 0) {
      const prog = Math.min(1, p.overcharge / TUNE.dash.heavyOverchargeTime);
      const armed = prog >= 1 - 1e-6;
      ctx.strokeStyle = armed ? 'rgba(253,224,71,0.9)' : `rgba(253,224,71,${0.2 + 0.5 * prog})`;
      ctx.lineWidth = 2 + 1.5 * prog;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len * prog, 0); // the amber fills toward the tip as you overcharge
      ctx.stroke();
      if (armed) {
        ctx.fillStyle = 'rgba(255,240,150,0.95)';
        ctx.beginPath();
        ctx.arc(len, 0, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // SLINGSHOT — the load tether stretched BACKWARD (the tension you're building)
    if (d.slingshot) {
      const loadLen = 14 + 56 * p.charge; // the band stretches as you load
      ctx.strokeStyle = `rgba(255,180,90,${0.35 + 0.5 * p.charge})`;
      ctx.lineWidth = 1.5 + 2 * p.charge;
      ctx.beginPath();
      ctx.moveTo(-6, -6);
      ctx.lineTo(-loadLen, 0);
      ctx.lineTo(-6, 6);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,210,140,${0.5 + 0.4 * p.charge})`;
      ctx.beginPath();
      ctx.arc(-loadLen, 0, 2.5 + 1.5 * p.charge, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // PARRY deflect arc — a thin neon wedge in front of aim while the active window is live.
  // The on-beat success FLASH is the existing player-anchored beat ring (coherenceBeatFlash),
  // so here we only draw the arc itself. a11y: steady alpha keyed to the window, no strobe.
  if (p.parryActive) {
    // the EFFECTIVE arc: coherence + meta widen it toward a full circle (flow-state made visible)
    const arc = effectiveParryArc(d.coherence, world.stats.parryReach, world.stats.parryHalfAngle);
    const activeFrac = Math.max(0, Math.min(1, (p.parryTime - TUNE.parry.recover) / TUNE.parry.active));
    const flow = Math.max(0, Math.min(1, d.coherence)); // cyan → gold + thicker as the guard widens
    const a = d.reduceFlashing ? 0.4 : 0.3 + 0.45 * activeFrac; // bright at the open, easing across the window
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, arc.reach, -arc.halfAngle, arc.halfAngle);
    ctx.closePath();
    ctx.fillStyle = 'rgba(103,232,249,0.22)';
    ctx.fill();
    ctx.strokeStyle = flow > 0.5 ? mix('#a5f3fc', '#fde047', (flow - 0.5) * 2) : '#a5f3fc';
    ctx.lineWidth = 2 + 1.5 * flow;
    ctx.stroke();
    ctx.restore();
  }
}
