// Progressive first-run onboarding. Instead of dumping all tips up front, hints
// surface contextually as the player performs each action for the first time:
// charge a dash, land a dash, then learn graze + combo decay. Pure + ordered —
// only the hint matching the CURRENT step's trigger advances the sequence, so the
// tips always appear in a sensible order regardless of exact timing.

export type OnboardTrigger = 'start' | 'dash' | 'kill' | 'comboBreak';

export interface OnboardHint {
  step: number;
  trigger: OnboardTrigger;
  text: string;
}

export const ONBOARDING: OnboardHint[] = [
  { step: 0, trigger: 'start', text: 'Hold to charge — release to DASH through enemies.' },
  { step: 1, trigger: 'dash', text: 'Skewer several enemies in one dash to build a COMBO.' },
  { step: 2, trigger: 'kill', text: 'Graze bullets — skim them without being hit — to refill stamina.' },
  { step: 3, trigger: 'comboBreak', text: 'Keep chaining: your combo decays if you stop killing.' },
];

export const ONBOARDING_STEPS = ONBOARDING.length;

/** Grid B — the very first prompt a brand-new player sees, surfaced as the BIG center
 *  callout (not just a toast) so the core verb can't be missed. Paired with a short
 *  no-fail opening grace (see ONBOARD.firstRunGrace) so they can practise without dying. */
export const FIRST_DASH_PROMPT = 'HOLD then RELEASE to DASH';

/** The hint to show if `trigger` fires while at `step` (else null). */
export function hintFor(step: number, trigger: OnboardTrigger): OnboardHint | null {
  const h = ONBOARDING[step];
  return h && h.trigger === trigger ? h : null;
}

/** C5 (v6 §1) — the dash-on-the-beat teaching nudge. */
export const BEAT_HINT_TEXT = 'Dash ON THE BEAT — release as the ring tightens to bloom the city.';

/** C5 — for a player's first few runs, auto-show the beat-ring and offer a one-time
 *  dash-on-beat hint (a soft nudge, NOT flipping the rhythmAssist default). Pure. */
export function beatTeachState(runs: number, capRing: number, capHint: number): { ring: boolean; hint: boolean } {
  return { ring: runs < capRing, hint: runs < capHint };
}

// ── ACT TWO — persisted, just-in-time teaching of the deeper game ──────────────
// The depth pass tripled the mechanical surface: a second verb (PARRY), an
// overcharge (HEAVY), a rhythm/COHERENCE layer, and twelve enemy + six boss reads.
// The dash sequence above teaches the FIRST run; this teaches everything else the
// FIRST TIME it actually matters — each line firing ONCE EVER, gated by a persisted
// `taught` set in the save (see save.ts). Like the rest of this module it is PURE:
// the Game hands in the persisted set + the event that just happened, and these
// functions pick the line to surface. NO DOM, NO rng — onboarding must never
// perturb the seeded sim (the Daily stays bit-identical).

/** A single contextual teach result: the persisted key to mark + the line to show. */
export interface TeachHit {
  /** the persisted `taught`-set id — fires once ever */
  key: string;
  /** the one-line copy surfaced on the existing toast/gloss UI */
  text: string;
}

/** The event that surfaces a depth-verb teach the first time it happens in play. */
export type TeachTrigger = 'fullCharge' | 'parryable' | 'onBeatAction';

export interface VerbTeach {
  /** persisted teach id (also shared with the sandbox for `verb:parry`) */
  key: string;
  trigger: TeachTrigger;
  text: string;
}

/** The three depth verbs, taught contextually the first time the player can use them.
 *  `verb:parry` is intentionally shared with the sandbox parry beat — whichever teaches
 *  it first marks the key, so it's never doubled (a sandbox-skipper still learns it here). */
export const VERB_TEACHES: VerbTeach[] = [
  { key: 'verb:heavy', trigger: 'fullCharge', text: 'Keep holding PAST full charge for a HEAVY thrust — it phases through the pattern.' },
  { key: 'verb:parry', trigger: 'parryable', text: 'Shots incoming — PARRY (right-click / K) to deflect them, and counter.' },
  { key: 'verb:coherence', trigger: 'onBeatAction', text: 'On the BEAT builds COHERENCE — the City wakes and your guard widens. Chain on-beat hits for a streak.' },
];

/** One-line reads surfaced the first time each enemy KIND appears. The six reworked
 *  roles are the priority; the keepers (orbiter/herald/seeker/bloomer) get optional
 *  one-liners too. Plain bodies (drifter/mini/lancer) are intentionally absent — no
 *  read means no teach (enemyReadFor returns null). */
export const ENEMY_READS: Record<string, string> = {
  darter: 'DARTER — it counter-lunges if you dash AT it. Bait the lunge, then punish.',
  splitter: 'SPLITTER — PARRY it to shatter it into combo fodder; a plain dash just clears it.',
  bomber: "BOMBER — it self-detonates. Kill it from range or dash THROUGH it; don't greed the kill.",
  shade: 'SHADE — harmless until it strikes. Read the flash, then dash through it.',
  brooder: 'BROODER — it hatches drones. Kill the source fast before the swarm grows.',
  wisp: 'WISP — a swarm. Weave through to graze; one dash sweeps the cluster.',
  orbiter: 'ORBITER — it lays a mine zone. Avoid the field; strike through the gaps.',
  herald: 'HERALD — it raises a wall. Find the open lane and dash the gap.',
  seeker: 'SEEKER — it homes on you. Keep moving and break its lock with a dash.',
  bloomer: 'BLOOMER — it fires a rotating wedge. Slip into the quiet gap between spokes.',
};

/** One-line reads surfaced as each boss arrives (on the existing boss-incoming surface). */
export const BOSS_READS: Record<string, string> = {
  warden: 'WARDEN — armoured up front. Flank to its rear to land real damage.',
  weaver: 'WEAVER — thread lanes close in. Dash a gap before they seal.',
  beacon: 'BEACON — sweeping beams. Dash the safe arc between the sweeps.',
  mirrorblade: 'MIRRORBLADE — PARRY its lunge to stagger the duel, then strike.',
  hollow: 'HOLLOW — kill its echoes to expose the core.',
  sovereign: 'SOVEREIGN — break the cores to drop its guard.',
};

export const ENEMY_READ_PREFIX = 'enemy:';
export const BOSS_READ_PREFIX = 'boss:';

export function enemyReadKey(kind: string): string {
  return ENEMY_READ_PREFIX + kind;
}
export function bossReadKey(kind: string): string {
  return BOSS_READ_PREFIX + kind;
}

/** The once-ever gate: has `key` NOT been taught yet (i.e. it's absent from the persisted set)? */
export function shouldTeach(key: string, taught: readonly string[]): boolean {
  return !taught.includes(key);
}

/** The untaught verb teach for `trigger`, or null if there is none / it's already taught. */
export function verbTeachFor(trigger: TeachTrigger, taught: readonly string[]): TeachHit | null {
  for (const t of VERB_TEACHES) {
    if (t.trigger === trigger && shouldTeach(t.key, taught)) return { key: t.key, text: t.text };
  }
  return null;
}

/** The untaught read for an enemy `kind` on first sighting, or null (unknown kind / already taught). */
export function enemyReadFor(kind: string, taught: readonly string[]): TeachHit | null {
  const text = ENEMY_READS[kind];
  if (!text) return null;
  const key = enemyReadKey(kind);
  return shouldTeach(key, taught) ? { key, text } : null;
}

/** The untaught read for a boss `kind` on arrival, or null (unknown boss / already taught). */
export function bossReadFor(kind: string, taught: readonly string[]): TeachHit | null {
  const text = BOSS_READS[kind];
  if (!text) return null;
  const key = bossReadKey(kind);
  return shouldTeach(key, taught) ? { key, text } : null;
}
