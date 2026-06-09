// CURSED RELICS — double-edged items offered occasionally in the perk draft.
// Each is a powerful buff with a real downside, applied via world.boons (the
// postApply capstone, after perks/evolutions). Relics ride the same draft chassis
// as perks/evolutions (DraftCard union + isRelic guard). One relic at most per
// run-relic-offer; taken once. The risk/reward layer for the score-chase endgame.

import type { RunStats } from './perks';

export type RelicId = 'glassspear' | 'berserker' | 'hoarder' | 'overcharge' | 'volatile' | 'zealot';

export interface RelicDef {
  id: RelicId;
  name: string;
  desc: string;
  accent: string;
  glyph: string; // raw glyph char (relics render on their own card branch)
  isRelic: true; // discriminant vs PerkDef/EvolutionDef
  apply: (s: RunStats) => void;
}

export const RELICS: Record<RelicId, RelicDef> = {
  glassspear: {
    id: 'glassspear', name: 'GLASS SPEAR', glyph: '🔱', accent: '#67e8f9', isRelic: true,
    desc: '+80% dash length & a wider spear — but dashes cost double and stamina regen is sluggish.',
    apply: (s) => { s.dashLenMul += 0.8; s.dashHitboxRadius += 8; s.dashCostMul *= 2; s.regenPerSec *= 0.65; },
  },
  berserker: {
    id: 'berserker', name: "BERSERKER'S MARK", glyph: '⚔', accent: '#ef4444', isRelic: true,
    desc: '+2 dash damage — but a stamina segment is gone and the spear is thinner.',
    apply: (s) => { s.dashDamage += 2; s.staminaSegments = Math.max(1, s.staminaSegments - 1); s.dashHitboxRadius = Math.max(8, s.dashHitboxRadius - 4); },
  },
  hoarder: {
    id: 'hoarder', name: "HOARDER'S CURSE", glyph: '💰', accent: '#34d399', isRelic: true,
    desc: '×2 shards — but ×0.7 score. Fund the meta, sacrifice the board.',
    apply: (s) => { s.shardMul *= 2; s.scoreMul *= 0.7; },
  },
  overcharge: {
    id: 'overcharge', name: 'OVERCHARGE', glyph: '⚡', accent: '#fbbf24', isRelic: true,
    desc: 'Blazing stamina regen & dash-kill refund — but a much tighter graze.',
    apply: (s) => { s.regenPerSec += 40; s.killStaminaRefund += 30; s.grazeRadius *= 0.7; },
  },
  volatile: {
    id: 'volatile', name: 'VOLATILE CORE', glyph: '💥', accent: '#fb923c', isRelic: true,
    desc: 'Grants chain + nova blasts (or supercharges them) — but dashes cost ×1.5.',
    apply: (s) => { s.chainRadius += 70; s.chainDmg = Math.max(s.chainDmg + 1, 2); s.dashNovaRadius += 70; s.dashCostMul *= 1.5; },
  },
  zealot: {
    id: 'zealot', name: 'ZEALOT', glyph: '✠', accent: '#a855f7', isRelic: true,
    desc: '×1.5 score & a longer combo window — but a thinner, harder-to-land spear.',
    apply: (s) => { s.scoreMul *= 1.5; s.comboWindowBonus += 1; s.dashHitboxRadius = Math.max(8, s.dashHitboxRadius - 5); },
  },
};

export const RELIC_IDS: RelicId[] = Object.keys(RELICS) as RelicId[];

/** Relics not yet taken this run. */
export function availableRelics(taken: RelicId[]): RelicDef[] {
  return RELIC_IDS.filter((id) => !taken.includes(id)).map((id) => RELICS[id]);
}

/** Human-readable list of taken relics, e.g. "GLASS SPEAR, ZEALOT". */
export function describeRelics(taken: RelicId[]): string {
  return taken.map((id) => RELICS[id].name).join(', ');
}
