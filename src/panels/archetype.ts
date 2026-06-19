// BUILD — the run-identity / archetype picker. Extracted from ui.ts: a card per archetype showing
// its perk-draft weighting + the fusion it builds toward. Shell built once; open(save) repaints the
// cards for the selected archetype. Selecting one calls back (host persists + re-opens).

import { el } from './dom';
import { ARCHETYPES } from '../archetypes';
import { PERKS, type PerkDef } from '../perks';
import type { SaveData } from '../save';
import type { Panel } from './panel';

export interface ArchetypePanelDeps {
  /** commit the chosen archetype (the host persists it). */
  onSelect: (id: string) => void;
  /** dismiss the modal (DONE). */
  onClose: () => void;
}

const BUILD_ICON =
  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 3v9l8-4.5M12 12v9M12 12L4 7.5" stroke="currentColor" stroke-width="1.2" opacity="0.55"/></svg>';

// archetype id → the fusion it builds toward (mock ARCH_W).
const FUSION: Record<string, string> = { impaler: 'IMPALER', chain: 'SUPERNOVA', flow: 'PERPETUAL', bulwark: 'AEGIS', none: 'Any fusion reachable' };

export function buildArchetypePanel(deps: ArchetypePanelDeps): Panel {
  const icon = el('div', { class: 'panel-head-icon' });
  icon.innerHTML = BUILD_ICON;
  const head = el('div', { class: 'panel-head' }, icon, el('div', { class: 'panel-head-titles' }, el('div', { class: 'panel-eyebrow' }, 'RUN IDENTITY'), el('h2', { class: 'panel-head-title' }, 'BUILD')));
  const lead = el('p', { class: 'panel-lead' }, 'Pick a run identity to weight your perk draft toward a fusion. FREESTYLE drafts whatever appears — no penalty.');
  const grid = el('div', { class: 'p-grid cols2 arch-grid' });
  grid.id = 'arch-grid';
  const close = el('button', { class: 'btn btn-primary' }, 'DONE');
  close.addEventListener('click', () => deps.onClose());
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, el('div', { class: 'panel panel-wide' }, head, lead, grid, close));

  const open = (save: SaveData): void => {
    const perks = PERKS as Record<string, PerkDef>;
    grid.replaceChildren();
    for (const a of ARCHETYPES) {
      const selected = save.selectedArchetype === a.id;
      const hx = a.accent.replace('#', '');
      const n = parseInt(hx.length === 3 ? hx.split('').map((c) => c + c).join('') : hx, 16);
      const card = el('button', { class: 'p-card arch-card' + (selected ? ' sel' : ''), type: 'button' });
      card.style.setProperty('--ca', a.accent);
      card.style.setProperty('--ca-rgb', `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`);

      const dot = el('span', { class: 'p-dot' });
      dot.style.background = a.accent;
      dot.style.color = a.accent;
      const top = el('div', { class: 'p-card-top' }, dot, el('div', { class: 'p-card-name' }, a.name));
      const desc = el('div', { class: 'p-card-desc' }, a.desc);

      // perk-weight bars (the draft bias), or a uniform note for FREESTYLE.
      const weights = Object.entries(a.weights) as [string, number][];
      let bias: HTMLElement;
      if (weights.length) {
        bias = el('div', { class: 'arch-weights' });
        const mx = Math.max(...weights.map(([, w]) => w));
        for (const [pid, w] of weights) {
          const fill = el('div', { class: 'hbar-fill' });
          fill.style.width = `${Math.round((w / mx) * 100)}%`;
          bias.append(el('div', { class: 'arch-hbar' }, el('div', { class: 'hbar-k' }, perks[pid]?.name ?? pid), el('div', { class: 'hbar-track' }, fill)));
        }
      } else {
        bias = el('div', { class: 'arch-uniform' }, 'Uniform odds — every perk equally likely.');
      }

      const foot = el('div', { class: 'p-card-foot' },
        el('span', { class: 'arch-foot-k' }, 'BUILDS TOWARD'),
        el('span', { class: 'cdx-tag' }, `◆ ${FUSION[a.id] ?? '—'}`),
      );
      card.append(top, desc, bias, foot);
      card.addEventListener('click', () => deps.onSelect(a.id));
      grid.append(card);
    }
  };

  return { root, open };
}
