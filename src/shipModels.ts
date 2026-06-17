// Ship silhouettes — one distinct hull per roster ship so the six read at a glance
// (and stay distinguishable by SHAPE, not just colour, for colorblind players). Pure
// geometry only: points are in sprite-radius units with the NOSE pointing +x (the
// renderer translates to the player, rotates by aim, and scales by spriteRadius). No
// rng, no state — a cosmetic lookup, safe to call every frame.

export type Pt = readonly [number, number];

export interface ShipModel {
  /** closed outline, nose at +x, in sprite-radius units */
  hull: ReadonlyArray<Pt>;
  /** optional inner accent stroke (open polyline) — a spine/bulkhead for character */
  detail?: ReadonlyArray<Pt>;
  /** optional bright cockpit/reactor dot (a focal glint) */
  core?: Pt;
}

// THE LAST LANCE — the baseline spear: a clean, elongated arrowhead with a center spine
// and a cockpit glint just behind the tip.
const LANCE: ShipModel = {
  hull: [
    [1.32, 0],
    [-0.5, 0.5],
    [-0.26, 0],
    [-0.5, -0.5],
  ],
  detail: [
    [1.0, 0],
    [-0.26, 0],
  ],
  core: [0.42, 0],
};

// GLAIVE — glass cannon, wide spear: a broad aggressive spearhead that leads with a sharp
// nose, flares to wide shoulders, then tapers to a forked swallowtail (two rear-swept
// tines over a shallow notch), with an engraved spine. Wide and bladed — a thrown spear,
// not a needle (kept clearly distinct from PHANTOM's thin dagger + REAVER's clawed rear).
const GLAIVE: ShipModel = {
  hull: [
    [1.45, 0],
    [0.55, 0.5],
    [-0.2, 0.4],
    [-0.9, 0.52],
    [-0.45, 0],
    [-0.9, -0.52],
    [-0.2, -0.4],
    [0.55, -0.5],
  ],
  detail: [
    [1.2, 0],
    [-0.3, 0],
  ],
};

// BASTION — tank: a broad armoured warship — a pointed ram-prow, heavy forward-swept
// wing-sponsons, a wide weighted stern and a forward bridge core. Heavy and shielded,
// but unmistakably a ship (not a crest).
const BASTION: ShipModel = {
  hull: [
    [1.15, 0],
    [0.6, 0.32],
    [0.55, 0.7],
    [0.18, 0.5],
    [-0.4, 0.46],
    [-0.5, 0.78],
    [-0.82, 0.5],
    [-0.78, 0],
    [-0.82, -0.5],
    [-0.5, -0.78],
    [-0.4, -0.46],
    [0.18, -0.5],
    [0.55, -0.7],
    [0.6, -0.32],
  ],
  detail: [
    [0.7, 0],
    [-0.3, 0],
  ],
  core: [0.42, 0],
};

// TEMPEST — nimble: a sharp-nosed interceptor with a slim fuselage and wings swept far
// back. Reads as the fast one.
const TEMPEST: ShipModel = {
  hull: [
    [1.2, 0],
    [0.1, 0.32],
    [-0.35, 0.62],
    [-0.7, 0.2],
    [-0.5, 0],
    [-0.7, -0.2],
    [-0.35, -0.62],
    [0.1, -0.32],
  ],
  detail: [
    [0.9, 0],
    [-0.45, 0],
  ],
  core: [0.48, 0],
};

// PHANTOM — knife-edge: a long, ultra-thin blade with a cross-guard and pommel near the
// rear. Reads unmistakably as a dagger.
const PHANTOM: ShipModel = {
  hull: [
    [1.4, 0],
    [-0.35, 0.16],
    [-0.5, 0.4],
    [-0.62, 0.12],
    [-0.62, -0.12],
    [-0.5, -0.4],
    [-0.35, -0.16],
  ],
  detail: [
    [1.1, 0],
    [-0.4, 0],
  ],
};

// REAVER — bloodthirsty: a fanged predator with hooked rear claws and a deep central
// notch. Barbed and asymmetric-looking.
const REAVER: ShipModel = {
  hull: [
    [1.18, 0],
    [-0.05, 0.45],
    [-0.35, 0.95],
    [-0.25, 0.3],
    [-0.6, 0],
    [-0.25, -0.3],
    [-0.35, -0.95],
    [-0.05, -0.45],
  ],
  detail: [
    [0.92, 0],
    [-0.3, 0],
  ],
};

const MODELS: Record<string, ShipModel> = {
  lance: LANCE,
  glaive: GLAIVE,
  bastion: BASTION,
  tempest: TEMPEST,
  phantom: PHANTOM,
  reaver: REAVER,
};

/** The hull + detail geometry for a ship id (falls back to THE LAST LANCE). Pure. */
export function shipModel(id: string): ShipModel {
  return MODELS[id] ?? LANCE;
}

/** Trace a ship-model path (points in sprite-radius units) scaled by `scale`, leaving the
 *  path OPEN — the caller closes it for a filled hull or strokes it for a detail line. */
export function traceShipPath(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>, scale: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * scale, pts[0][1] * scale);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * scale, pts[i][1] * scale);
}

export interface SilhouetteStyle {
  fill: string;
  stroke: string;
  lineWidth?: number;
  /** inner accent stroke colour (omit to skip the detail line) */
  detail?: string | null;
  /** cockpit/reactor dot colour (omit to skip the core glint) */
  core?: string | null;
}

/** Draw a ship's silhouette (hull + optional detail + optional core) at the CURRENT
 *  transform origin, scaled by `scale`. The caller owns translate/rotate. Shared by the
 *  in-game renderer and the title ship-select chips so the look never drifts. */
export function drawShipSilhouette(
  ctx: CanvasRenderingContext2D,
  id: string,
  scale: number,
  style: SilhouetteStyle,
): void {
  const m = shipModel(id);
  const lw = style.lineWidth ?? 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  traceShipPath(ctx, m.hull, scale);
  ctx.closePath();
  ctx.fillStyle = style.fill;
  ctx.fill();
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
  if (m.detail && style.detail) {
    ctx.strokeStyle = style.detail;
    ctx.lineWidth = lw * 0.55;
    traceShipPath(ctx, m.detail, scale);
    ctx.stroke();
  }
  if (m.core && style.core) {
    ctx.fillStyle = style.core;
    ctx.beginPath();
    ctx.arc(m.core[0] * scale, m.core[1] * scale, scale * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}
