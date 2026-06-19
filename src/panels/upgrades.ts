// UPGRADES — the permanent meta-tree: four vertical branches (MOMENTUM / THE EDGE /
// FORTUNE / PARRY) hanging off a central THE LAST LANCE root, wired with SVG links that
// brighten as you own nodes along them. (PARRY runs five tiers deep to its capstone.)
// Each branch unlocks DOWNWARD — a tier is buyable only once the tier above it owns a
// level (the mock's gating). This is a UI affordance only: meta.ts (effects/costs/save)
// is untouched, and any node already owned stays shown. Re-rendered each open.

import { el, reconcile } from './dom';
import type { SaveData } from '../save';
import { META_NODES, metaNode, nodeCost } from '../meta';
import type { Panel } from './panel';

interface Branch {
  name: string;
  color: string;
  rgb: string;
  x: number; // tree-space x (0..100)
  nodes: string[]; // META_NODE ids, tier 1 → 4
}

// the META_NODES arranged into branches (the 3 original mock branches + the PARRY branch).
const BRANCHES: Branch[] = [
  { name: 'MOMENTUM', color: '#22d3ee', rgb: '34,211,238', x: 13, nodes: ['recovery', 'momentum', 'reach', 'ironwill'] },
  { name: 'THE EDGE', color: '#fb923c', rgb: '251,146,60', x: 37, nodes: ['edge', 'grazer', 'memory', 'scavenger'] },
  { name: 'FORTUNE', color: '#4ade80', rgb: '74,222,128', x: 63, nodes: ['treasure', 'headstart', 'fortune', 'secondchance'] },
  { name: 'PARRY', color: '#a5f3fc', rgb: '165,243,252', x: 87, nodes: ['parryReach', 'parryWide', 'parryRecover', 'parryStreak', 'parryPerfect'] },
];
const TY = [9, 24, 40, 56, 72, 88]; // root row + up to 5 tier rows (tree-space y, 0..100)

// per-node icons (mock TICONS), keyed by META_NODE id; plus the hull root + a lock glyph.
const ICONS: Record<string, string> = {
  recovery: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12a7 7 0 1 1 2 4.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 8v4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  momentum: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8h11M4 12h14M4 16h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  reach: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 12h13M13 8l5 4-5 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ironwill: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  edge: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 19L17 5l2 2L7 21Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  grazer: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  memory: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  scavenger: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l2.5 6H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  treasure: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 6-7 12L5 9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  headstart: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 21V4M6 4h11l-2 4 2 4H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fortune: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l2.6 6.2L21 9.7l-5 4.3 1.6 6.6L12 17l-5.6 3.6L8 14 3 9.7l6.4-.5Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  secondchance: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20S4 14.5 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5.5-8 11-8 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 8v5M9.5 10.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  // PARRY branch — guard/shield motifs
  parryReach: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12h12M14 8l5 4-5 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  parryWide: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 12L5 6M12 12l7-6M12 12v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 6a10 10 0 0 1 14 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  parryRecover: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12a7 7 0 1 1 2 4.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 8v4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  parryStreak: '<svg viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h6l-1 8 9-12h-6Z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  parryPerfect: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11.5l2 2 4-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  root: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l3 9-3 2-3-2Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.4"/><path d="M9 13l3 9 3-9" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>',
};
const LOCK_SVG =
  '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.8"/></svg>';

function link(x1: number, y1: number, x2: number, y2: number, color: string, unlocked: boolean, filled: boolean): string {
  const op = filled ? 0.85 : unlocked ? 0.42 : 0.16;
  const w = filled ? 2.4 : unlocked ? 1.8 : 1.4;
  const dash = unlocked ? '' : 'stroke-dasharray="3 4"';
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linecap="round" opacity="${op}" ${dash}/>`;
}

/** Build the meta-tree shell ONCE (balance cards, legend, link layer, root node, the branch
 *  nodes) and return an `update(save)` that morphs it in place: reconcile re-keys the nodes by
 *  meta id, so a purchase re-tints/relevels/unlocks the affected nodes without reflashing the
 *  whole tree. The cost stays a real <button> (disabled when unaffordable) so Enter-to-buy works. */
export function buildUpgradesShell(onBuy: (id: string) => void): { root: HTMLElement; update: (s: SaveData) => void } {
  const root = el('div');

  // ── balance summary (head) — values filled in update() ──
  const sumShards = el('div', { class: 'upg-sum-v' });
  const sumOwned = el('div', { class: 'upg-sum-v' });
  const sumLevels = el('div', { class: 'upg-sum-v' });
  const sumCard = (k: string, v: HTMLElement) => el('div', { class: 'upg-sum' }, v, el('div', { class: 'upg-sum-k' }, k));
  root.append(
    el('div', { class: 'upg-balance' }, sumCard('Shards', sumShards), sumCard('Nodes Owned', sumOwned), sumCard('Total Levels', sumLevels)),
  );

  // ── branch legend (3) — static ──
  const legend = el('div', { class: 'upg-legend' });
  for (const b of BRANCHES) {
    const dot = el('i');
    dot.style.background = b.color;
    legend.append(el('span', {}, dot, b.name));
  }
  root.append(legend);

  // ── the tree shell: link layer (innerHTML refreshed in update) + root node + node layer ──
  const tree = el('div', { class: 'upg-tree' });
  const linkLayer = el('div', { class: 'upg-link-layer' });
  tree.append(linkLayer);

  const rootNode = el('div', { class: 'tnode tnode-root' });
  rootNode.style.left = '50%';
  rootNode.style.top = TY[0] + '%';
  const rootFace = el('div', { class: 'tnode-face' });
  rootFace.innerHTML = ICONS.root;
  rootNode.append(el('div', { class: 'tnode-badge' }, rootFace), el('div', { class: 'tnode-name' }, 'THE LAST LANCE'));
  tree.append(rootNode);

  // dedicated layer so reconcile owns ONLY the branch nodes (display:contents keeps their
  // absolute positioning resolving against .upg-tree, exactly as before).
  const nodeLayer = el('div', { class: 'upg-node-layer' });
  tree.append(nodeLayer);
  root.append(tree);
  root.append(
    el('p', { class: 'upg-lead' }, 'Permanent upgrades carry between every descent. Each branch unlocks downward — buy a node to reveal the next. Glowing nodes are affordable.'),
  );

  // all nodes flattened with branch + tier coords, for reconcile (skip any unknown id).
  const flat = BRANCHES.flatMap((b) => b.nodes.map((id, i) => ({ id, b, i }))).filter((n) => metaNode(n.id));

  const update = (s: SaveData): void => {
    const lvlOf = (id: string) => s.meta?.[id] ?? 0;

    sumShards.textContent = `◆ ${s.shards.toLocaleString()}`;
    sumOwned.textContent = `${META_NODES.filter((n) => lvlOf(n.id) > 0).length} / ${META_NODES.length}`;
    const totalLevels = META_NODES.reduce((sum, n) => sum + Math.min(lvlOf(n.id), n.maxLevel), 0);
    const maxLevels = META_NODES.reduce((sum, n) => sum + n.maxLevel, 0);
    sumLevels.textContent = `${totalLevels} / ${maxLevels}`;

    // links: a cheap SVG string (not the visible flicker source) refreshed wholesale.
    let links = '';
    for (const b of BRANCHES) {
      links += link(50, TY[0], b.x, TY[1], b.color, true, lvlOf(b.nodes[0]) > 0); // root → tier 1
      for (let i = 0; i < b.nodes.length - 1; i++) {
        links += link(b.x, TY[i + 1], b.x, TY[i + 2], b.color, lvlOf(b.nodes[i]) > 0, lvlOf(b.nodes[i + 1]) > 0);
      }
    }
    linkLayer.innerHTML = `<svg class="upg-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${links}</svg>`;

    reconcile(
      nodeLayer,
      flat,
      (n) => n.id,
      (n) => {
        const tn = el('div', { class: 'tnode' });
        tn.style.left = n.b.x + '%';
        tn.style.top = TY[n.i + 1] + '%';
        tn.style.setProperty('--bc', n.b.color);
        tn.style.setProperty('--bc-rgb', n.b.rgb);
        const ring = el('div', { class: 'tnode-ring' });
        const face = el('div', { class: 'tnode-face' });
        const badge = el('div', { class: 'tnode-badge' }, ring, face, el('div', { class: 'tnode-lv' }));
        const cost = el('button', { class: 'tnode-cost', type: 'button' });
        tn.append(badge, el('div', { class: 'tnode-name' }, metaNode(n.id)!.name), cost);
        tn.dataset.afford = '0';
        tn.addEventListener('click', () => { if (tn.dataset.afford === '1') onBuy(n.id); });
        cost.addEventListener('click', (e) => { e.stopPropagation(); if (tn.dataset.afford === '1') onBuy(n.id); });
        return tn;
      },
      (tn, n) => {
        const node = metaNode(n.id)!;
        const lvl = lvlOf(n.id);
        // a tier unlocks once the one above owns a level (mock gating); an already-owned node
        // stays unlocked regardless (legacy saves / safety).
        const unlocked = n.i === 0 || lvlOf(n.b.nodes[n.i - 1]) > 0 || lvl > 0;
        const maxed = lvl >= node.maxLevel;
        const cost = nodeCost(node, lvl);
        const afford = unlocked && !maxed && s.shards >= cost;
        tn.className = 'tnode' + (maxed ? ' maxed' : !unlocked ? ' locked' : afford ? ' afford' : lvl > 0 ? ' owned' : '');
        tn.title = node.desc;
        tn.dataset.afford = afford ? '1' : '0';
        tn.style.setProperty('--fill', String(Math.round((lvl / node.maxLevel) * 100)));
        (tn.querySelector('.tnode-face') as HTMLElement).innerHTML = unlocked ? (ICONS[n.id] ?? ICONS.fortune) : LOCK_SVG;
        const lv = tn.querySelector('.tnode-lv') as HTMLElement;
        lv.classList.toggle('hidden', !unlocked);
        lv.textContent = `${lvl}/${node.maxLevel}`;
        const costEl = tn.querySelector('.tnode-cost') as HTMLButtonElement;
        costEl.className = 'tnode-cost ' + (afford ? 'afford' : maxed ? 'max' : 'lock');
        costEl.disabled = !afford; // unaffordable/maxed/locked → not focusable, no Enter-to-buy
        costEl.textContent = maxed ? '◆ MAX' : !unlocked ? 'LOCKED' : `◆ ${cost.toLocaleString()}`;
      },
    );
  };

  return { root, update };
}

const UPG_ICON =
  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export interface UpgradesPanelDeps {
  /** buy/level a meta node by id. */
  onBuy: (id: string) => void;
  /** dismiss the modal (DONE). */
  onClose: () => void;
}

/** The UPGRADES meta-tree modal: a fixed shell + a live shard-balance pill. The tree itself is the
 *  buildUpgradesShell morph-in-place widget, built lazily on first open and re-`update`d each open
 *  (a purchase re-calls open, so nodes re-tint/relevel without reflashing the whole tree). */
export function buildUpgradesPanel(deps: UpgradesPanelDeps): Panel {
  const icon = el('div', { class: 'panel-head-icon' });
  icon.innerHTML = UPG_ICON;
  const titles = el('div', { class: 'panel-head-titles' }, el('div', { class: 'panel-eyebrow' }, 'PERMANENT META-TREE'), el('h2', { class: 'panel-head-title' }, 'UPGRADES'));
  const balanceEl = el('div', { class: 'panel-balance' }, '◆ 0');
  const head = el('div', { class: 'panel-head' }, icon, titles, balanceEl);
  const body = el('div', { class: 'upg-body' });
  body.id = 'upg-body';
  const close = el('button', { class: 'btn btn-primary' }, 'DONE');
  close.addEventListener('click', () => deps.onClose());
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, el('div', { class: 'panel panel-wide' }, head, body, close));

  let shell: { root: HTMLElement; update: (s: SaveData) => void } | null = null;
  const open = (save: SaveData): void => {
    balanceEl.textContent = `◆ ${save.shards.toLocaleString()} shards`;
    if (!shell) {
      shell = buildUpgradesShell((id) => deps.onBuy(id));
      body.replaceChildren(shell.root);
    }
    shell.update(save);
  };
  return { root, open };
}

