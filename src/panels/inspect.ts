// INSPECT A BUILD — paste a Build DNA code (someone hit COPY BUILD) and read back exactly what
// they ran. Pure decode + display; closes the export-only loop. Extracted from ui.ts, including the
// describeBuild() formatter (exported for testing).

import { el } from './dom';
import { decodeBuildDna, type BuildDna } from '../buildDna';
import { PERKS } from '../perks';
import { EVOLUTIONS } from '../evolutions';
import { RELICS } from '../relics';
import { SHIPS } from '../ships';
import { archetypeById } from '../archetypes';
import { HEAT_LEVELS } from '../heat';

export interface InspectPanelDeps {
  /** dismiss the modal. */
  onClose: () => void;
}

export interface InspectPanel {
  readonly root: HTMLElement;
  /** reset the form (clear any prior result + input) and focus it. */
  open(): void;
}

/** Decode a Build DNA into label/value rows for display. */
export function describeBuild(dna: BuildDna): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const perksReg = PERKS as Record<string, { name: string }>;
  const evosReg = EVOLUTIONS as Record<string, { name: string }>;
  const relicsReg = RELICS as Record<string, { name: string }>;
  const stacks = (dna.stacks ?? {}) as Record<string, number>;
  const ship = SHIPS.find((s) => s.id === dna.ship);
  rows.push({ label: 'SHIP', value: ship ? ship.name : dna.ship || '—' });
  if (dna.heat > 0) {
    const lvl = Math.max(0, Math.min(HEAT_LEVELS.length - 1, Math.round(dna.heat)));
    rows.push({ label: 'HEAT', value: `${lvl} · ${HEAT_LEVELS[lvl].name}` });
  }
  if (dna.arch && dna.arch !== 'none') rows.push({ label: 'PATH', value: archetypeById(dna.arch).name });
  const perks = Object.keys(stacks)
    .filter((id) => (stacks[id] ?? 0) > 0 && perksReg[id])
    .map((id) => (stacks[id] > 1 ? `${perksReg[id].name}×${stacks[id]}` : perksReg[id].name));
  if (perks.length) rows.push({ label: 'PERKS', value: perks.join(', ') });
  const evos = (dna.evos ?? []).filter((id) => evosReg[id]).map((id) => evosReg[id].name);
  if (evos.length) rows.push({ label: 'FUSIONS', value: evos.join(', ') });
  const relics = (dna.relics ?? []).filter((id) => relicsReg[id]).map((id) => relicsReg[id].name);
  if (relics.length) rows.push({ label: 'RELICS', value: relics.join(', ') });
  return rows;
}

export function buildInspectPanel(deps: InspectPanelDeps): InspectPanel {
  const h = el('h2', {}, '⧬ INSPECT A BUILD');
  const blurb = el('div', { class: 'event-flavor' }, 'Paste a Build DNA code (a friend hit COPY BUILD) to read exactly what they ran — ship, heat, perks, fusions, relics.');
  const input = el('textarea', { class: 'duel-input', rows: '3', placeholder: 'Paste build code (L1…)…' }) as HTMLTextAreaElement;
  const result = el('div', { class: 'howto-rules' });
  const inspect = el('button', { class: 'btn' }, 'INSPECT');
  inspect.addEventListener('click', () => {
    result.replaceChildren();
    const dna = decodeBuildDna(input.value.trim());
    if (!dna) {
      result.append(el('div', { class: 'event-flavor' }, input.value.trim() ? 'That is not a valid Build DNA code.' : 'Paste a build code first.'));
      return;
    }
    for (const row of describeBuild(dna)) {
      result.append(el('div', { class: 'howto-rule' }, el('b', {}, row.label), el('span', {}, row.value)));
    }
  });
  const close = el('button', { class: 'btn btn-ghost' }, 'CLOSE');
  close.addEventListener('click', () => deps.onClose());
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' },
    el('div', { class: 'panel' }, h, blurb, input, el('div', { class: 'go-row' }, inspect, close), result),
  );

  const open = (): void => {
    result.replaceChildren();
    input.value = '';
    requestAnimationFrame(() => input.focus());
  };

  return { root, open };
}
