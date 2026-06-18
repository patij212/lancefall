// Game modes. Every mode is data (a RunConfig) so the director + game read off
// it instead of a `daily` boolean. Endless/Daily/Nightmare are time-driven;
// Arena and Boss Rush are scripted and WINNABLE (a real victory state).

import type { EnemyKind } from './types';

// v6 §4 — declarative per-mode rules. Optional + additive: an absent `rules` block
// means today's behavior EXACTLY. Wired read sites: events (game.ts rollEventId),
// scoreFrame + suddenDeath (game.ts winRun / waves.ts suddenDeathInset). oneLife /
// biomeLock / perkCadenceMul are RESERVED for future modes — no read site yet, so
// setting one today is a silent no-op. Pure data — rides the Heat/mutator clone
// pipeline by reference (read-only; a future per-run-mutable rule must deep-clone).
export interface ModeRules {
  events?: 'normal' | 'none' | 'curated';
  scoreFrame?: 'cleartime'; // completion-quality scoring (cleartime + folded no-hit bonus)
  suddenDeath?: { afterBoss?: number; graceSeconds?: number };
  ranked?: boolean; // §7 — false = OFF the leaderboards (Casual/Story). ABSENT = ranked (today's behavior).
  casualShields?: number; // §7 — extra ARMOR shields a Casual mode grants so players can SEE the content
  oneLife?: boolean; // reserved — not yet wired
  biomeLock?: number; // reserved — not yet wired
  perkCadenceMul?: number; // reserved — not yet wired
}

export interface RunConfig {
  id: string;
  name: string;
  desc: string;
  seedKind: 'random' | 'date' | 'week'; // 'date' = Daily, 'week' = weekly challenge — both reproducible-for-all
  intensityMul: number; // scales the endless intensity curve
  spawnMul: number; // multiplies spawn interval (smaller = denser)
  bossInterval: number; // seconds between bosses (time-driven modes)
  speedBonus: number; // flat add to enemy/bullet speed multipliers
  shieldStart: number; // seconds before shielded variants appear
  shieldMax: number; // max shielded chance
  shardMul: number; // mode shard multiplier (stacks with meta Treasure Hunter)
  perks: boolean; // perk drafts enabled
  canFail: boolean;
  arena: boolean; // scripted finite winnable gauntlet
  bossrush: boolean; // the bosses back-to-back
  cipherLock?: boolean; // ring-cipher bosses (Warden/Weaver/Beacon) armored until decoded — SOLSTICE PROTOCOL
  rules?: ModeRules; // v6 §4: optional declarative mode rules; absent = today's behavior
  /** Title-rail progressive disclosure: this mode is LOCKED until the player's best-ever
   *  wave (save.deepestWave) reaches this value. Absent/0 = always unlocked. A pure DISPLAY
   *  gate — it never touches the sim, the seed, or scoring; a locked mode is simply not
   *  selectable in the rail. (Reserved alongside oneLife/biomeLock — no schema bump.) */
  unlockedAtWave?: number;
  /** Title-rail flavour line shown in the mode-rail's bottom flavour box (the lower-left
   *  "void filler" from the v7 cockpit mock). DISPLAY-ONLY — never touches sim/seed/scoring.
   *  `flavorHead` is the small accent eyebrow (◇ MODE); `flavor` is the italic body and may
   *  contain a single <br>. Absent fields fall back to the mode name + desc. */
  flavorHead?: string;
  flavor?: string;
}

const ENDLESS: RunConfig = {
  id: 'endless', name: 'ENDLESS', desc: 'Survive as long as you can. The classic.',
  seedKind: 'random', intensityMul: 1, spawnMul: 1, bossInterval: 70, speedBonus: 0,
  shieldStart: 110, shieldMax: 0.35, shardMul: 1, perks: true, canFail: true, arena: false, bossrush: false,
  flavorHead: '◇ ENDLESS', flavor: 'Survive as long as you can.<br>No finish line — only the climb, and how far the light reaches.',
};

export const MODES: RunConfig[] = [
  ENDLESS,
  {
    id: 'arena', name: 'ARENA', desc: '15 hand-built waves + 6 bosses. Clear it to WIN.',
    seedKind: 'random', intensityMul: 1, spawnMul: 1, bossInterval: 45, speedBonus: 0,
    shieldStart: 70, shieldMax: 0.35, shardMul: 1.1, perks: true, canFail: true, arena: true, bossrush: false,
    rules: { scoreFrame: 'cleartime', events: 'none' }, // §4 M3 cleartime + M5 no mid-run events
    flavorHead: '◇ ARENA', flavor: "Fifteen waves stand between you and the spire's light.",
  },
  {
    id: 'daily', name: 'ECHO OF THE FALL', desc: "One citizen's last memory of the fall — the same seed, the same echo, for everyone today.",
    seedKind: 'date', intensityMul: 1, spawnMul: 1, bossInterval: 70, speedBonus: 0,
    shieldStart: 110, shieldMax: 0.35, shardMul: 1, perks: true, canFail: true, arena: false, bossrush: false,
    rules: { events: 'curated' }, // §4 M5 — the Daily echo serves the high-risk pool
    flavorHead: '◇ ECHO OF THE FALL', flavor: "One citizen's last memory of the fall.<br>The same seed, the same echo, for everyone today.",
  },
  {
    // WEEKLY CHALLENGE — a WEEK-STABLE seeded run (snaps to the week's Monday): the same
    // waves + mutators for the whole world all week, a fresh one next Monday. RANKED to the
    // WEEKLY board. Reproducible exactly like the Daily (seedKind:'week' rides every seeded
    // protection — NG+ off, ghost-race its own week PB). A spicier curated mutator rotation.
    id: 'weekly', name: 'WEEKLY SIEGE', desc: 'One seed for the whole world, all week. A spicy mutator set, a fresh siege every Monday. Race the weekly board.',
    seedKind: 'week', intensityMul: 1.05, spawnMul: 0.95, bossInterval: 62, speedBonus: 0.04,
    shieldStart: 100, shieldMax: 0.38, shardMul: 1.3, perks: true, canFail: true, arena: false, bossrush: false,
    rules: { events: 'curated' }, // serves the high-risk pool, like the Daily echo (one eventRng draw)
    flavorHead: '◇ WEEKLY SIEGE', flavor: 'One seed for the whole world, all week.<br>A fresh siege every Monday — race the weekly board.',
  },
  {
    id: 'nightmare', name: 'NIGHTMARE', desc: 'Sudden death — the walls close in, no ARMOR. +75% shards.',
    seedKind: 'random', intensityMul: 1.35, spawnMul: 0.8, bossInterval: 55, speedBonus: 0.12,
    shieldStart: 55, shieldMax: 0.5, shardMul: 1.75, perks: true, canFail: true, arena: false, bossrush: false,
    rules: { suddenDeath: { afterBoss: 1 }, events: 'curated' },
    unlockedAtWave: 5, // §1.1 progressive disclosure — earn NIGHTMARE by reaching wave 5
    flavorHead: '◇ NIGHTMARE', flavor: 'The walls close. The city does not forgive hesitation.',
  },
  {
    id: 'bossrush', name: 'BOSS RUSH', desc: 'All six bosses, back to back. No chaff.',
    seedKind: 'random', intensityMul: 1, spawnMul: 1, bossInterval: 45, speedBonus: 0.06,
    shieldStart: 999, shieldMax: 0, shardMul: 1.3, perks: true, canFail: true, arena: false, bossrush: true,
    rules: { scoreFrame: 'cleartime', events: 'none' }, // §4 M3 cleartime + M5 no mid-run events
  },
  {
    id: 'longestday', name: 'SOLSTICE PROTOCOL',
    desc: 'Every boss is a cipher. Read the key, break the code, and bring back the longest day.',
    seedKind: 'random', intensityMul: 1.05, spawnMul: 1, bossInterval: 38, speedBonus: 0,
    shieldStart: 110, shieldMax: 0.35, shardMul: 1.25, perks: true, canFail: true, arena: false, bossrush: false,
    cipherLock: true,
    unlockedAtWave: 8, // §1.1 progressive disclosure — earn SOLSTICE PROTOCOL by reaching wave 8
    flavorHead: '◇ SOLSTICE PROTOCOL', flavor: 'The cipher shifts. Only the worthy see the pattern.',
  },
  {
    // §7 — CASUAL/STORY. A gentler ENDLESS so anyone can SEE the content (bosses, biomes,
    // the story). OFF the leaderboards (rules.ranked:false → no submission) and with a fat
    // ARMOR cushion. A separate mode/config — it never touches the Daily seed path.
    id: 'casual', name: 'CASUAL', desc: 'See it all — bosses, biomes, the story, the Sovereign. Extra ARMOR, no pressure. Off the leaderboards.',
    // CASUAL is the accessibility mode — its whole job is to let ANYONE reach the ending (the
    // Sovereign + THE CHOICE). Eased well below the survival curve (intensity 0.85→0.62, sparser
    // spawns, 6 ARMOR absorbs) so the full 6-boss arc is genuinely reachable. Off-board, so the
    // soft difficulty can't game the leaderboards.
    seedKind: 'random', intensityMul: 0.62, spawnMul: 1.4, bossInterval: 75, speedBonus: 0,
    shieldStart: 180, shieldMax: 0.2, shardMul: 1, perks: true, canFail: true, arena: false, bossrush: false,
    rules: { ranked: false, casualShields: 6 }, // off-board + 6 extra absorbs
    flavorHead: '◇ CASUAL', flavor: 'See it all — bosses, biomes, the story, the Sovereign.<br>Extra ARMOR, no pressure.',
  },
];

/** Title-rail flavour line for a mode's bottom flavour box. DISPLAY-ONLY heuristic — falls back
 *  to the mode name + desc when a mode hasn't been given explicit `flavorHead`/`flavor` copy.
 *  Returns the `flavor` body which MAY contain a single <br> (the caller renders it as HTML). */
export function modeFlavor(cfg: RunConfig): { head: string; body: string } {
  return {
    head: cfg.flavorHead ?? `◇ ${cfg.name}`,
    body: cfg.flavor ?? cfg.desc,
  };
}

export function modeById(id: string): RunConfig {
  return MODES.find((m) => m.id === id) ?? ENDLESS;
}

/** §7 — does this mode submit to the public leaderboards? ABSENT `rules.ranked` = ranked
 *  (every mode shipped before Casual). Only an explicit `ranked:false` opts a mode OUT.
 *  The SINGLE source of truth shared by the api gate (game.ts) and the modes test. */
export function modeRanked(cfg: RunConfig): boolean {
  return cfg.rules?.ranked !== false;
}

/** Is this a SEEDED, reproducible-for-everyone mode (Daily or Weekly)? The single
 *  predicate the run-setup uses to gate every "stays bit-identical for all" rule:
 *  NG+ stays OFF, the run races/saves its own seeded PB ghost. Random modes return false. */
export function modeSeeded(cfg: RunConfig): boolean {
  return cfg.seedKind === 'date' || cfg.seedKind === 'week';
}

/** v6 §5 — a short difficulty/reward brief derived purely from a RunConfig, for the
 *  title mode-cards. A display heuristic ONLY — keep OUT of tune.ts and any sim path. */
export function modeBrief(cfg: RunConfig): { tier: string; reward: string; note: string } {
  const d = cfg.intensityMul * (1 / cfg.spawnMul) * (1 + cfg.speedBonus);
  const tier = d >= 1.3 ? 'BRUTAL' : d >= 1.1 ? 'HARD' : 'STANDARD';
  const reward = `×${cfg.shardMul} shards`;
  const note = cfg.rules?.ranked === false
    ? 'CASUAL · OFF-BOARD'
    : cfg.arena || cfg.bossrush
      ? 'WINNABLE'
      : cfg.rules?.suddenDeath
        ? 'SUDDEN DEATH'
        : cfg.cipherLock
          ? 'CIPHER'
          : cfg.seedKind === 'week'
            ? 'WEEKLY'
            : cfg.seedKind === 'date'
              ? 'SEEDED'
              : '';
  return { tier, reward, note };
}

export const MAX_DAILY_ATTEMPTS = 3;

/** §4 M4 — Daily best-of-3. Given today's date, the stored attempt-date + count, return
 *  the attempts USED today (0 if the stored date isn't today → a fresh day) and whether
 *  the player is locked out (used >= MAX). Pure — the daily seed is never touched. */
export function rollDailyAttempt(today: string, lastDate: string, attempts: number): { attempts: number; locked: boolean } {
  const used = lastDate === today ? attempts : 0;
  return { attempts: used, locked: used >= MAX_DAILY_ATTEMPTS };
}

/** §5 U2 — the next mode id walking the MODES list with wrap-around (dir<0 = left,
 *  dir>=0 = right). A junk current id falls to the first mode. Pure. */
export function nextModeId(currentId: string, dir: number): string {
  const i = MODES.findIndex((m) => m.id === currentId);
  const cur = i < 0 ? 0 : i;
  const step = dir < 0 ? -1 : 1;
  const n = MODES.length;
  return MODES[(cur + step + n) % n].id;
}

/** §1.1 — the curated title-screen mode CARDS, in display order. A "card" is a UI grouping
 *  over one or two mode ids; `variants[0]` is the card's DEFAULT landed-on variant. Two cards
 *  carry a second variant surfaced via an on-card pill: ENDLESS owns [casual, endless]
 *  (CASUAL·STANDARD difficulty) and ECHO owns [daily, weekly] (DAILY·WEEKLY seed cadence).
 *  The rail is a pure UI concern; MODES stays the full 8-mode data set. */
export const RAIL_CARDS: readonly (readonly string[])[] = [
  ['casual', 'endless'],
  ['arena'],
  ['bossrush'],
  ['daily', 'weekly'],
  ['nightmare'],
  ['longestday'],
];

/** The default (primary) mode id per card, in rail order — digit-jump + nav landing target. */
export const RAIL_CARD_IDS: readonly string[] = RAIL_CARDS.map((c) => c[0]);

/** Every mode id reachable from the rail (all variants, flattened) — the reachability set the
 *  modes test guards against to keep a fully-built mode from being stranded (see WEEKLY). */
export const RAIL_VARIANT_IDS: readonly string[] = RAIL_CARDS.flat();

/** The rail card (variant list) that owns `id`; falls back to the first card for a junk id. */
export function cardForMode(id: string): readonly string[] {
  return RAIL_CARDS.find((c) => c.includes(id)) ?? RAIL_CARDS[0];
}

/** §1.1 progressive disclosure — is this mode unlocked at the player's best-ever wave? A pure
 *  display gate (absent unlockedAtWave = always unlocked). Never touches sim/seed/scoring. */
export function modeUnlocked(cfg: RunConfig, deepestWave: number): boolean {
  return (cfg.unlockedAtWave ?? 0) <= deepestWave;
}

/** §1.1 — step the selected mode along the rail CARDS (dir<0 left / dir>=0 right), wrapping and
 *  SKIPPING locked cards so keyboard/d-pad nav never lands on an unplayable card. Returns the
 *  landing card's PRIMARY id (variants[0]); the UI layer resolves that to the card's remembered
 *  variant. Falls back to the current id if nothing else is unlocked. Pure. */
export function nextRailMode(currentId: string, dir: number, deepestWave: number): string {
  const n = RAIL_CARDS.length;
  const cur = cardForMode(currentId);
  const start = Math.max(0, RAIL_CARDS.indexOf(cur));
  const step = dir < 0 ? -1 : 1;
  for (let k = 1; k <= n; k++) {
    const card = RAIL_CARDS[(((start + step * k) % n) + n) % n];
    if (modeUnlocked(modeById(card[0]), deepestWave)) return card[0];
  }
  return currentId;
}

/** @deprecated transitional alias = RAIL_CARD_IDS so the UI/game consumers compile until they
 *  migrate to RAIL_CARDS (removed in Task 4). */
export const RAIL_MODE_IDS: readonly string[] = RAIL_CARD_IDS;

export type ArenaWave =
  | { kind: 'wave'; budget: number; enemies: EnemyKind[] }
  | { kind: 'boss'; boss: EnemyKind };

/** The 15-wave Arena gauntlet (6 bosses, capped by the Sovereign). Each wave
 *  must be fully cleared to advance. */
export const ARENA_SCRIPT: ArenaWave[] = [
  { kind: 'wave', budget: 6, enemies: ['darter'] },
  { kind: 'wave', budget: 8, enemies: ['darter', 'orbiter'] },
  { kind: 'wave', budget: 10, enemies: ['darter', 'orbiter'] },
  { kind: 'boss', boss: 'warden' },
  { kind: 'wave', budget: 14, enemies: ['darter', 'orbiter', 'splitter'] },
  { kind: 'wave', budget: 16, enemies: ['darter', 'splitter', 'orbiter'] },
  { kind: 'wave', budget: 18, enemies: ['darter', 'orbiter', 'splitter', 'bloomer'] },
  { kind: 'boss', boss: 'weaver' },
  { kind: 'wave', budget: 20, enemies: ['darter', 'orbiter', 'splitter', 'bloomer'] },
  { kind: 'wave', budget: 22, enemies: ['orbiter', 'bloomer', 'splitter'] },
  { kind: 'wave', budget: 24, enemies: ['darter', 'orbiter', 'splitter', 'bloomer'] },
  { kind: 'boss', boss: 'beacon' },
  { kind: 'wave', budget: 24, enemies: ['darter', 'orbiter', 'lancer', 'bloomer'] },
  // WAVE 14 — the pre-mirrorblade climax. Telemetry flagged it as THE arena wall: ~60% of all
  // deaths land here, 63% of them to HERALD walls. It was also the ONLY herald wave at 1/3
  // density (waves 19/20 already run herald at 1/4) — an anomalous spike. Dilute herald to 1/4
  // (a 4th, easy enemy) and trim the budget so the overlapping-wall field thins. Bot-validated:
  // arena death rate at the wall falls 96%→80%, the wave still walls (medWave 14) so the
  // pre-boss climax survives — it's a fairer gauntlet, not a trivialised one.
  { kind: 'wave', budget: 22, enemies: ['drifter', 'lancer', 'herald', 'darter'] },
  { kind: 'boss', boss: 'mirrorblade' },
  { kind: 'wave', budget: 28, enemies: ['drifter', 'shade', 'orbiter', 'bomber'] },
  { kind: 'wave', budget: 30, enemies: ['shade', 'drifter', 'splitter', 'bloomer'] },
  { kind: 'boss', boss: 'hollow' },
  { kind: 'wave', budget: 30, enemies: ['shade', 'drifter', 'herald', 'bomber'] },
  { kind: 'wave', budget: 32, enemies: ['drifter', 'seeker', 'bloomer', 'herald'] },
  { kind: 'boss', boss: 'sovereign' },
];

export const BOSSRUSH_SEQUENCE: EnemyKind[] = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];
