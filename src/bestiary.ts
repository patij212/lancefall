// The CODEX — a player-facing bestiary of every enemy, elite, and boss, with a
// one-line "what it does + how to beat it" so the roster's depth is discoverable
// from the title. Pure data; rendered by ui.ts. Order = roughly intro order.

export interface CodexEntry {
  id: string;
  name: string;
  cat: 'enemy' | 'special' | 'boss';
  accent: string;
  blurb: string;
}

export const BESTIARY: CodexEntry[] = [
  // ── enemies ──
  { id: 'darter', name: 'Darter', cat: 'enemy', accent: '#ff3b6b', blurb: 'Charges, then lunges in a straight line. Dash through it during the wind-up.' },
  { id: 'orbiter', name: 'Orbiter', cat: 'enemy', accent: '#22d3ee', blurb: 'Circles you and fires aimed shots. Close the distance or dash the bullets.' },
  { id: 'splitter', name: 'Splitter', cat: 'enemy', accent: '#a855f7', blurb: 'Slow drifter that bursts into two fast minis when killed. Mind the spread.' },
  { id: 'mini', name: 'Mini', cat: 'enemy', accent: '#c9a6ff', blurb: 'Tiny fast chasers — spawned by Splitters and Brooders. Sweep them with a dash.' },
  { id: 'bloomer', name: 'Bloomer', cat: 'enemy', accent: '#fbbf24', blurb: 'Stationary; blooms full bullet rings on a timer. Strike between pulses.' },
  { id: 'lancer', name: 'Lancer', cat: 'enemy', accent: '#ff8a3b', blurb: 'Locks its aim, then fires a fast bolt. Sidestep the telegraphed line.' },
  { id: 'bomber', name: 'Bomber', cat: 'enemy', accent: '#fb7185', blurb: 'Chases and detonates a bullet ring on death. Kill it at range, then dash clear.' },
  { id: 'wisp', name: 'Wisp', cat: 'enemy', accent: '#67e8f9', blurb: 'Travels in fast crescent packs. Dash through the gap in the formation.' },
  { id: 'drifter', name: 'Drifter', cat: 'enemy', accent: '#10b981', blurb: 'Mid-range zoner firing curved arc-fans. Read the curve and slip the wavefront.' },
  { id: 'shade', name: 'Shade', cat: 'enemy', accent: '#f97316', blurb: 'Teleporting ambusher — no bullets, but contact-lethal. Watch for the blink tell.' },
  { id: 'brooder', name: 'Brooder', cat: 'enemy', accent: '#a78bfa', blurb: 'Slow carrier that hatches minis (pulsing core tells the hatch). Prioritise it before the screen floods.' },
  // ── special ──
  { id: 'champion', name: 'Champion', cat: 'special', accent: '#fde047', blurb: 'A gold-aura elite: tanky, rains shards, but detonates a volatile ring on death.' },
  // ── bosses ──
  { id: 'warden', name: 'The Warden', cat: 'boss', accent: '#ff3b6b', blurb: 'Rotating bullet spiral, then aimed fans with a rest window. Dash the gaps, punish the rest.' },
  { id: 'weaver', name: 'The Weaver', cat: 'boss', accent: '#a855f7', blurb: 'A pinwheel of arms and pulse rings with a moving safe lane. Thread the lane.' },
  { id: 'beacon', name: 'The Beacon', cat: 'boss', accent: '#38bdf8', blurb: 'A rotating laser sweep (dash the safe arcs), then aimed fans — its damage window.' },
  { id: 'mirrorblade', name: 'The Mirrorblade', cat: 'boss', accent: '#ef4444', blurb: 'A dash-duelist that lunges like you. Dodge the lunge, strike on its recover.' },
  { id: 'hollow', name: 'The Hollow', cat: 'boss', accent: '#6ee7b7', blurb: 'An intangible phantom with echo clones. Only damageable by dashing it during its white Clone-Sync window.' },
  { id: 'sovereign', name: 'The Sovereign', cat: 'boss', accent: '#fde047', blurb: 'The crowned finale: an ARMORED body, three orbiting CORES, and gravity-warped volleys. Shatter all three cores to crack the crown EXPOSED, then punish it.' },
];

export const CODEX_CATEGORIES: { cat: CodexEntry['cat']; label: string }[] = [
  { cat: 'enemy', label: 'ENEMIES' },
  { cat: 'special', label: 'ELITES' },
  { cat: 'boss', label: 'BOSSES' },
];
