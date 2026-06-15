// Mid-run EVENTS — every minute or so the action pauses and you pick one of a
// few risk/reward choices (a shrine boon, a gamble, a treasure, a champion hunt,
// a cursed bargain). Resolutions mutate the world directly: score/shards, a
// permanent run boon (pushed to world.boons → applied in the stat capstone), a
// free perk, a revive token, or a champion spawn. Pure data + impure resolves;
// no DOM, no audio (the game supplies the juice).

import { rollDraft, applyPerk } from './perks';
import type { RunStats } from './perks';
import type { World } from './world';
import type { Rng } from './rng';
import type { EnemyKind } from './types';

export type RunEventId = 'shrine' | 'gamble' | 'treasure' | 'eliteWave' | 'cursedBargain';

export interface EventChoice {
  id: string;
  name: string;
  desc: string;
  accent: string;
  risk: 'none' | 'low' | 'high';
  resolve: (w: World) => void;
}

export interface RunEventDef {
  id: RunEventId;
  name: string;
  flavor: string;
  accent: string;
  buildChoices: (rng: Rng, w: World) => EventChoice[];
}

function boon(w: World, fn: (s: RunStats) => void): void {
  w.boons.push(fn);
  w.recomputeStats();
}

function grantPerk(w: World): void {
  // draw from eventRng, NOT world.rng — the event fires at player-driven timing
  const pick = rollDraft(w.eventRng, w.stacks, 1)[0];
  if (pick && pick.id !== 'shardcache') applyPerk(w.stacks, pick.id);
  w.recomputeStats();
}

function spawnChampions(w: World, n: number): void {
  const kinds: EnemyKind[] = ['darter', 'orbiter', 'lancer', 'bomber'];
  for (let i = 0; i < n; i++) {
    // every draw here (edge point, kind, spawn facing) routes through eventRng and
    // passes an explicit angle, so a champion hunt never perturbs the seeded waves
    const pt = w.edgeSpawn(w.eventRng);
    const kind = kinds[Math.floor(w.eventRng.next() * kinds.length)];
    w.spawnEnemy(kind, pt.x, pt.y, 1, 1, false, true, w.eventRng.range(0, Math.PI * 2));
  }
}

export const RUN_EVENTS: Record<RunEventId, RunEventDef> = {
  shrine: {
    id: 'shrine',
    name: 'SHRINE OF THE LANCE',
    flavor: 'An old altar hums. Take one blessing — it lasts the run.',
    accent: '#22d3ee',
    buildChoices: () => [
      { id: 'keen', name: 'Keen Spear', desc: '+1 dash damage, permanently.', accent: '#f97316', risk: 'none', resolve: (w) => boon(w, (s) => { s.dashDamage += 1; }) },
      { id: 'reserves', name: 'Deep Reserves', desc: '+1 stamina segment and faster regen.', accent: '#34d399', risk: 'none', resolve: (w) => boon(w, (s) => { s.staminaSegments += 1; s.regenPerSec += 10; }) },
      { id: 'wide', name: 'Wide Lance', desc: '+20% dash length and a wider spear.', accent: '#22d3ee', risk: 'none', resolve: (w) => boon(w, (s) => { s.dashLenMul += 0.2; s.dashHitboxRadius += 6; }) },
    ],
  },
  gamble: {
    id: 'gamble',
    name: 'THE GAMBLER',
    flavor: 'Fortune favors the reckless. Or punishes them.',
    accent: '#fbbf24',
    buildChoices: () => [
      { id: 'safe', name: 'Pocket It', desc: '+3,000 score. No risk.', accent: '#34d399', risk: 'none', resolve: (w) => { w.score += 3000; } },
      {
        id: 'risk', name: 'Double or Nothing', desc: '55%: +12,000 score. 45%: lose 40% of your shards.', accent: '#ef4444', risk: 'high',
        resolve: (w) => { if (w.eventRng.next() < 0.55) w.score += 12000; else w.shards = Math.floor(w.shards * 0.6); },
      },
    ],
  },
  treasure: {
    id: 'treasure',
    name: 'A HIDDEN CACHE',
    flavor: 'Spoils of the fallen. Choose your prize.',
    accent: '#a855f7',
    buildChoices: () => [
      { id: 'shards', name: 'Shard Hoard', desc: '+250 shards toward the meta tree.', accent: '#34d399', risk: 'none', resolve: (w) => { w.shards += 250; } },
      { id: 'power', name: 'Power Core', desc: 'A free perk, drafted at random.', accent: '#ec4899', risk: 'none', resolve: (w) => grantPerk(w) },
      { id: 'glory', name: 'Glory', desc: '+4,000 score.', accent: '#fbbf24', risk: 'none', resolve: (w) => { w.score += 4000; } },
    ],
  },
  eliteWave: {
    id: 'eliteWave',
    name: 'CHAMPION HUNT',
    flavor: 'Champions circle, fat with shards. Do you take the bait?',
    accent: '#fde047',
    buildChoices: () => [
      { id: 'hunt', name: 'Spring the Hunt', desc: 'Summon 3 Champions now — huge bounty if you survive.', accent: '#fde047', risk: 'high', resolve: (w) => spawnChampions(w, 3) },
      { id: 'rest', name: 'Lay Low', desc: 'Skip it. Take +120 shards instead.', accent: '#34d399', risk: 'none', resolve: (w) => { w.shards += 120; } },
    ],
  },
  cursedBargain: {
    id: 'cursedBargain',
    name: 'A CURSED PACT',
    flavor: 'Power has a price. Always.',
    accent: '#ef4444',
    buildChoices: () => [
      { id: 'blood', name: 'Pay in Blood', desc: 'Lose ALL shards now — gain +2 dash damage for the run.', accent: '#ef4444', risk: 'high', resolve: (w) => { w.shards = 0; boon(w, (s) => { s.dashDamage += 2; }); } },
      { id: 'glory', name: 'Pay in Glory', desc: 'Halve your score — gain an extra revive.', accent: '#f97316', risk: 'high', resolve: (w) => { w.score = Math.floor(w.score * 0.5); w.reviveLeft += 1; } },
      { id: 'walk', name: 'Walk Away', desc: 'Refuse the pact. +500 score.', accent: '#94a3b8', risk: 'none', resolve: (w) => { w.score += 500; } },
    ],
  },
};

const EVENT_IDS = Object.keys(RUN_EVENTS) as RunEventId[];

/** Pick a weighted-random event id (uniform for now). */
export function rollEventId(rng: Rng): RunEventId {
  return EVENT_IDS[Math.floor(rng.next() * EVENT_IDS.length)];
}

/** Build the 2-3 choices for an event. */
export function rollEventChoices(id: RunEventId, rng: Rng, w: World): EventChoice[] {
  return RUN_EVENTS[id].buildChoices(rng, w);
}
