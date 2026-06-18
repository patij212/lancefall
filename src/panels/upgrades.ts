// UPGRADES — the permanent meta-tree, rendered EXACTLY as the v7 mock: three vertical
// branches (MOMENTUM / THE EDGE / FORTUNE) of four tiers each, hanging off a central
// THE LAST LANCE root, wired with SVG links that brighten as you own nodes along them.
// Each branch unlocks DOWNWARD — a tier is buyable only once the tier above it owns a
// level (the mock's gating). This is a UI affordance only: meta.ts (effects/costs/save)
// is untouched, and any node already owned stays shown. Re-rendered each open.

import { el } from './dom';
import type { SaveData } from '../save';
import { META_NODES, metaNode, nodeCost } from '../meta';

interface Branch {
  name: string;
  color: string;
  rgb: string;
  x: number; // tree-space x (0..100)
  nodes: string[]; // META_NODE ids, tier 1 → 4
}

// the 12 META_NODES arranged into the mock's 3 branches (verbatim from cockpit.html TREE).
const BRANCHES: Branch[] = [
  { name: 'MOMENTUM', color: '#22d3ee', rgb: '34,211,238', x: 17, nodes: ['recovery', 'momentum', 'reach', 'ironwill'] },
  { name: 'THE EDGE', color: '#fb923c', rgb: '251,146,60', x: 50, nodes: ['edge', 'grazer', 'memory', 'scavenger'] },
  { name: 'FORTUNE', color: '#4ade80', rgb: '74,222,128', x: 83, nodes: ['treasure', 'headstart', 'fortune', 'secondchance'] },
];
const TY = [13, 36, 56, 76, 95]; // root row + 4 tier rows (tree-space y, 0..100)

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

export function renderUpgrades(s: SaveData, onBuy: (id: string) => void): HTMLElement {
  const root = el('div');
  const lvlOf = (id: string) => s.meta?.[id] ?? 0;

  // ── balance summary (head) ──
  const owned = META_NODES.filter((n) => lvlOf(n.id) > 0).length;
  const totalLevels = META_NODES.reduce((sum, n) => sum + Math.min(lvlOf(n.id), n.maxLevel), 0);
  const maxLevels = META_NODES.reduce((sum, n) => sum + n.maxLevel, 0);
  const sumCard = (k: string, v: string) => el('div', { class: 'upg-sum' }, el('div', { class: 'upg-sum-v' }, v), el('div', { class: 'upg-sum-k' }, k));
  root.append(
    el('div', { class: 'upg-balance' },
      sumCard('Shards', `◆ ${s.shards.toLocaleString()}`),
      sumCard('Nodes Owned', `${owned} / ${META_NODES.length}`),
      sumCard('Total Levels', `${totalLevels} / ${maxLevels}`),
    ),
  );

  // ── branch legend (3) ──
  const legend = el('div', { class: 'upg-legend' });
  for (const b of BRANCHES) {
    const dot = el('i');
    dot.style.background = b.color;
    legend.append(el('span', {}, dot, b.name));
  }
  root.append(legend);

  // ── the tree ──
  const tree = el('div', { class: 'upg-tree' });
  let links = '';
  for (const b of BRANCHES) {
    links += link(50, TY[0], b.x, TY[1], b.color, true, lvlOf(b.nodes[0]) > 0); // root → tier 1
    for (let i = 0; i < 3; i++) {
      links += link(b.x, TY[i + 1], b.x, TY[i + 2], b.color, lvlOf(b.nodes[i]) > 0, lvlOf(b.nodes[i + 1]) > 0);
    }
  }
  const linkLayer = el('div', { class: 'upg-link-layer' });
  linkLayer.innerHTML = `<svg class="upg-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${links}</svg>`;
  tree.append(linkLayer);

  // root node — THE LAST LANCE
  const rootNode = el('div', { class: 'tnode tnode-root' });
  rootNode.style.left = '50%';
  rootNode.style.top = TY[0] + '%';
  const rootFace = el('div', { class: 'tnode-face' });
  rootFace.innerHTML = ICONS.root;
  rootNode.append(el('div', { class: 'tnode-badge' }, rootFace), el('div', { class: 'tnode-name' }, 'THE LAST LANCE'));
  tree.append(rootNode);

  // branch nodes
  for (const b of BRANCHES) {
    b.nodes.forEach((id, i) => {
      const node = metaNode(id);
      if (!node) return;
      const lvl = lvlOf(id);
      // a tier unlocks once the one above owns a level (mock gating); an already-owned node
      // stays unlocked regardless (legacy saves / safety).
      const unlocked = i === 0 || lvlOf(b.nodes[i - 1]) > 0 || lvl > 0;
      const maxed = lvl >= node.maxLevel;
      const cost = nodeCost(node, lvl);
      const afford = unlocked && !maxed && s.shards >= cost;
      const cls = maxed ? ' maxed' : !unlocked ? ' locked' : afford ? ' afford' : lvl > 0 ? ' owned' : '';
      const tn = el('div', { class: 'tnode' + cls, title: node.desc });
      tn.style.left = b.x + '%';
      tn.style.top = TY[i + 1] + '%';
      tn.style.setProperty('--bc', b.color);
      tn.style.setProperty('--bc-rgb', b.rgb);
      tn.style.setProperty('--fill', String(Math.round((lvl / node.maxLevel) * 100)));

      const ring = el('div', { class: 'tnode-ring' });
      const face = el('div', { class: 'tnode-face' });
      face.innerHTML = unlocked ? (ICONS[id] ?? ICONS.fortune) : LOCK_SVG;
      const badge = el('div', { class: 'tnode-badge' }, ring, face);
      if (unlocked) badge.append(el('div', { class: 'tnode-lv' }, `${lvl}/${node.maxLevel}`));

      // cost line — a real button when affordable (keyboard-accessible), else a plain label.
      let costEl: HTMLElement;
      if (afford) {
        costEl = el('button', { class: 'tnode-cost afford', type: 'button' }, `◆ ${cost.toLocaleString()}`);
        costEl.addEventListener('click', (e) => { e.stopPropagation(); onBuy(id); });
        tn.addEventListener('click', () => onBuy(id));
      } else {
        costEl = el('div', { class: 'tnode-cost ' + (maxed ? 'max' : 'lock') }, maxed ? '◆ MAX' : !unlocked ? 'LOCKED' : `◆ ${cost.toLocaleString()}`);
      }
      tn.append(badge, el('div', { class: 'tnode-name' }, node.name), costEl);
      tree.append(tn);
    });
  }
  root.append(tree);
  root.append(
    el('p', { class: 'upg-lead' }, 'Permanent upgrades carry between every descent. Each branch unlocks downward — buy a node to reveal the next. Glowing nodes are affordable.'),
  );
  return root;
}
