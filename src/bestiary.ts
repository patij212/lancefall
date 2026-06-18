// The CODEX — a player-facing bestiary of every enemy, elite, and boss, with a
// one-line "what it does + how to beat it" so the roster's depth is discoverable
// from the title. Pure data; rendered by ui.ts. Order = roughly intro order.

export interface CodexEntry {
  id: string;
  name: string;
  cat: 'enemy' | 'special' | 'boss';
  accent: string;
  blurb: string;
  /** short role tag shown as a chip in the CODEX (RUSHER / ZONER / …). Bosses omit it
   *  (they show their episode numeral + a VANQUISHED state instead). */
  role?: string;
}

export const BESTIARY: CodexEntry[] = [
  // ── enemies ──
  { id: 'darter', name: 'Darter', cat: 'enemy', accent: '#ff3b6b', role: 'RUSHER', blurb: 'Charges, then lunges in a straight line. Dash through it during the wind-up.' },
  { id: 'orbiter', name: 'Orbiter', cat: 'enemy', accent: '#22d3ee', role: 'ZONER', blurb: 'Circles you and fires aimed shots. Close the distance or dash the bullets.' },
  { id: 'splitter', name: 'Splitter', cat: 'enemy', accent: '#a855f7', role: 'SPLITTER', blurb: 'Slow drifter that bursts into two fast minis when killed. Mind the spread.' },
  { id: 'mini', name: 'Mini', cat: 'enemy', accent: '#c9a6ff', role: 'SWARM', blurb: 'Tiny fast chasers — spawned by Splitters and Brooders. Sweep them with a dash.' },
  { id: 'bloomer', name: 'Bloomer', cat: 'enemy', accent: '#fbbf24', role: 'TURRET', blurb: 'Stationary; blooms full bullet rings on a timer. Strike between pulses.' },
  { id: 'lancer', name: 'Lancer', cat: 'enemy', accent: '#ff8a3b', role: 'SNIPER', blurb: 'Locks its aim, then fires a fast bolt. Sidestep the telegraphed line.' },
  { id: 'bomber', name: 'Bomber', cat: 'enemy', accent: '#fb7185', role: 'KAMIKAZE', blurb: 'Chases and detonates a bullet ring on death. Kill it at range, then dash clear.' },
  { id: 'wisp', name: 'Wisp', cat: 'enemy', accent: '#67e8f9', role: 'SWARM', blurb: 'Travels in fast crescent packs. Dash through the gap in the formation.' },
  { id: 'drifter', name: 'Drifter', cat: 'enemy', accent: '#10b981', role: 'ZONER', blurb: 'Mid-range zoner firing curved arc-fans. Read the curve and slip the wavefront.' },
  { id: 'shade', name: 'Shade', cat: 'enemy', accent: '#f97316', role: 'AMBUSHER', blurb: 'Teleporting ambusher — no bullets, but contact-lethal. Watch for the blink tell.' },
  { id: 'brooder', name: 'Brooder', cat: 'enemy', accent: '#a78bfa', role: 'CARRIER', blurb: 'Slow carrier that hatches minis (pulsing core tells the hatch). Prioritise it before the screen floods.' },
  { id: 'herald', name: 'Herald', cat: 'enemy', accent: '#a3e635', role: 'GATEKEEPER', blurb: 'Locks its aim, then casts a wall of slow bullets with one safe lane — the gap is previewed in the telegraph. Read the lane and dash through it.' },
  { id: 'seeker', name: 'Seeker', cat: 'enemy', accent: '#e879f9', role: 'HOMING', blurb: 'Fires a slow homing bolt that curves after you, then flies straight. Dash through it (i-frames) or juke wide — it can\'t out-turn a committed dodge.' },
  // ── special ──
  { id: 'champion', name: 'Champion', cat: 'special', accent: '#fde047', role: 'ELITE', blurb: 'A gold-aura elite: tanky, rains shards, but detonates a volatile ring on death.' },
  // ── bosses ──
  { id: 'warden', name: 'THE WARDEN · Keeper of the First Gate', cat: 'boss', accent: '#ff3b6b', blurb: 'Sworn to hold the gates, he barred them from the inside — duty curdled into contempt. "I bolted the gate and the first wheel from the inside. I called it duty."' },
  { id: 'weaver', name: 'THE WEAVER · Spinner of the Lie', cat: 'boss', accent: '#a855f7', blurb: 'Court cryptographer who enciphered the record until no one could read the kingdom was worth saving. "I enciphered every thread that held you. I thought scrambling the loss was mercy."' },
  { id: 'beacon', name: 'THE BEACON · The Light That Lied', cat: 'boss', accent: '#38bdf8', blurb: 'Signal-keeper who let the call for aid go dark — the key it carried never sent. "I let the signal go dark. I still hear it asking."' },
  { id: 'mirrorblade', name: 'THE MIRRORBLADE · Your Own Doubt', cat: 'boss', accent: '#ef4444', blurb: "Not a person — your doubt made flesh; it lunges as you do, in your own colour, because it learned you. \"I learned you move for move. Tell me which of us is real.\"" },
  { id: 'hollow', name: 'THE HOLLOW · What Grief Left', cat: 'boss', accent: '#6ee7b7', blurb: 'The last mourner, emptied by grief — its key shows for only the instant it forgets itself. "There was nothing left in me to hold."' },
  { id: 'sovereign', name: 'THE SOVEREIGN · The Crown That Fell First', cat: 'boss', accent: '#fde047', blurb: 'The one who could have unlocked it all and kept the crown instead; now warps gravity to stop you reading the last cipher. "I was the key to everything. I chose to lose it."' },
];

export const CODEX_CATEGORIES: { cat: CodexEntry['cat']; label: string }[] = [
  { cat: 'enemy', label: 'ENEMIES' },
  { cat: 'special', label: 'ELITES' },
  { cat: 'boss', label: 'BOSSES' },
];
