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
}

// THE LAST LANCE — the baseline spear: a clean, elongated arrowhead with a center spine.
const LANCE: ShipModel = {
  hull: [
    [1.25, 0],
    [-0.55, 0.55],
    [-0.3, 0],
    [-0.55, -0.55],
  ],
  detail: [
    [0.95, 0],
    [-0.3, 0],
  ],
};

// GLAIVE — glass cannon, wide spear: a forked twin-blade with a haft crossbar.
const GLAIVE: ShipModel = {
  hull: [
    [1.0, 0],
    [0.12, 0.95],
    [-0.6, 0.48],
    [-0.4, 0],
    [-0.6, -0.48],
    [0.12, -0.95],
  ],
  detail: [
    [0.05, 0.62],
    [0.05, -0.62],
  ],
};

// BASTION — tank: a broad, blunt-nosed hexagonal bulwark with a bulkhead line.
const BASTION: ShipModel = {
  hull: [
    [0.82, 0],
    [0.5, 0.72],
    [-0.5, 0.8],
    [-0.82, 0],
    [-0.5, -0.8],
    [0.5, -0.72],
  ],
  detail: [
    [0.18, 0.55],
    [0.18, -0.55],
  ],
};

// TEMPEST — nimble: a slim, deeply swept-back stealth chevron.
const TEMPEST: ShipModel = {
  hull: [
    [1.12, 0],
    [-0.25, 0.5],
    [-0.95, 0.32],
    [-0.55, 0],
    [-0.95, -0.32],
    [-0.25, -0.5],
  ],
};

// PHANTOM — knife-edge: a long, ultra-thin needle/dagger with a blade hairline.
const PHANTOM: ShipModel = {
  hull: [
    [1.35, 0],
    [-0.65, 0.24],
    [-0.42, 0],
    [-0.65, -0.24],
  ],
  detail: [
    [1.05, 0],
    [-0.42, 0],
  ],
};

// REAVER — bloodthirsty: a barbed predator with hooked rear claws.
const REAVER: ShipModel = {
  hull: [
    [1.12, 0],
    [0.05, 0.48],
    [-0.42, 0.9],
    [-0.3, 0.32],
    [-0.6, 0],
    [-0.3, -0.32],
    [-0.42, -0.9],
    [0.05, -0.48],
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
