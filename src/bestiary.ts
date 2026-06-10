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
  { id: 'herald', name: 'Herald', cat: 'enemy', accent: '#a3e635', blurb: 'Locks its aim, then casts a wall of slow bullets with one safe lane — the gap is previewed in the telegraph. Read the lane and dash through it.' },
  // ── special ──
  { id: 'champion', name: 'Champion', cat: 'special', accent: '#fde047', blurb: 'A gold-aura elite: tanky, rains shards, but detonates a volatile ring on death.' },
  // ── bosses ──
  { id: 'warden', name: 'THE WARDEN · Keeper of the Gates', cat: 'boss', accent: '#ff3b6b', blurb: 'Sworn to hold the gates, he barred them from the inside — duty curdled into contempt. "I only locked the doors you forgot to guard."' },
  { id: 'weaver', name: 'THE WEAVER · Spinner of the Lie', cat: 'boss', accent: '#a855f7', blurb: 'Court chronicler who rewove the record until no one remembered the kingdom was worth saving. "I unspun every thread that held you."' },
  { id: 'beacon', name: 'THE BEACON · The Light That Lied', cat: 'boss', accent: '#38bdf8', blurb: 'Signal-keeper who let the call for aid go dark, so no help ever came. "I shone for everyone but you."' },
  { id: 'mirrorblade', name: 'THE MIRRORBLADE · Your Own Doubt', cat: 'boss', accent: '#ef4444', blurb: "Not a person — your doubt made flesh; it lunges as you do, in your own colour. \"You were always going to falter. I'm the proof.\"" },
  { id: 'hollow', name: 'THE HOLLOW · What Grief Left', cat: 'boss', accent: '#6ee7b7', blurb: 'The last mourner, emptied out by grief — untouchable until it remembers it was real. "There was nothing left in me to hold."' },
  { id: 'sovereign', name: 'THE SOVEREIGN · The Crown That Fell First', cat: 'boss', accent: '#fde047', blurb: 'The one who could have saved it and chose the crown instead; now warps gravity to stop you undoing it. "I was the kingdom. I chose to let it end."' },
];

export const CODEX_CATEGORIES: { cat: CodexEntry['cat']; label: string }[] = [
  { cat: 'enemy', label: 'ENEMIES' },
  { cat: 'special', label: 'ELITES' },
  { cat: 'boss', label: 'BOSSES' },
];
