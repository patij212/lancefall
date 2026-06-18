// UPGRADES — the permanent meta-tree, as a branching SKILL-TREE (the v7 mock look).
// Extracted from ui.ts. The 12 META_NODES are grouped into four thematic disciplines,
// each a vertical branch off a central root, wired with SVG links that brighten as you
// own nodes along them. PURELY VISUAL grouping: every node stays independently buyable
// (no unlock-downward gating), so balance/progression is unchanged — the links just show
// the path you've started. Re-rendered each open (buyMeta re-calls openUpgrades).

import { el } from './dom';
import type { SaveData } from '../save';
import { META_NODES, metaNode, nodeCost } from '../meta';

interface Branch {
  name: string;
  color: string;
  x: number; // tree-space x (0..100)
  nodes: string[]; // META_NODE ids, shallow → deep
}

const BRANCHES: Branch[] = [
  { name: 'MOBILITY', color: '#22d3ee', x: 16, nodes: ['momentum', 'reach', 'ironwill'] },
  { name: 'OFFENSE', color: '#fb923c', x: 39, nodes: ['edge', 'memory', 'scavenger'] },
  { name: 'SUSTAIN', color: '#34d399', x: 61, nodes: ['recovery', 'grazer', 'secondchance'] },
  { name: 'FORTUNE', color: '#c084fc', x: 84, nodes: ['treasure', 'fortune', 'headstart'] },
];
const TY = [10, 37, 62, 87]; // root row + 3 node rows (tree-space y, 0..100)

function link(x1: number, y1: number, x2: number, y2: number, color: string, bright: boolean): string {
  const op = bright ? 0.7 : 0.16;
  const w = bright ? 2.2 : 1.4;
  const dash = bright ? '' : 'stroke-dasharray="3 4"';
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linecap="round" opacity="${op}" ${dash}/>`;
}

export function renderUpgrades(s: SaveData, onBuy: (id: string) => void): HTMLElement {
  const root = el('div');
  const lvlOf = (id: string) => s.meta?.[id] ?? 0;

  // ── balance summary ──
  const owned = META_NODES.filter((n) => lvlOf(n.id) > 0).length;
  const totalLevels = META_NODES.reduce((sum, n) => sum + Math.min(lvlOf(n.id), n.maxLevel), 0);
  const maxLevels = META_NODES.reduce((sum, n) => sum + n.maxLevel, 0);
  const sumCard = (k: string, v: string) => el('div', { class: 'upg-sum' }, el('div', { class: 'upg-sum-v' }, v), el('div', { class: 'upg-sum-k' }, k));
  root.append(
    el('div', { class: 'upg-balance' },
      sumCard('Shards', `◆ ${s.shards.toLocaleString()}`),
      sumCard('Nodes Owned', `${owned}/${META_NODES.length}`),
      sumCard('Total Levels', `${totalLevels}/${maxLevels}`),
    ),
  );

  // ── branch legend ──
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
    links += link(50, TY[0], b.x, TY[1], b.color, true); // root → first node (always lit)
    links += link(b.x, TY[1], b.x, TY[2], b.color, lvlOf(b.nodes[0]) > 0);
    links += link(b.x, TY[2], b.x, TY[3], b.color, lvlOf(b.nodes[1]) > 0);
  }
  const linkLayer = el('div', { class: 'upg-link-layer' });
  linkLayer.innerHTML = `<svg class="upg-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${links}</svg>`;
  tree.append(linkLayer);

  // root node — THE LANCE
  const rootNode = el('div', { class: 'tnode tnode-root' });
  rootNode.style.left = '50%';
  rootNode.style.top = TY[0] + '%';
  rootNode.append(el('div', { class: 'tnode-badge' }, '◆'), el('div', { class: 'tnode-name' }, 'THE LANCE'));
  tree.append(rootNode);

  // branch nodes
  for (const b of BRANCHES) {
    b.nodes.forEach((id, i) => {
      const node = metaNode(id);
      if (!node) return;
      const lvl = lvlOf(id);
      const maxed = lvl >= node.maxLevel;
      const cost = nodeCost(node, lvl);
      const afford = !maxed && s.shards >= cost;
      const cls = maxed ? ' maxed' : afford ? ' afford' : lvl > 0 ? ' owned' : '';
      const tn = el('div', { class: 'tnode' + cls, title: node.desc });
      tn.style.left = b.x + '%';
      tn.style.top = TY[i + 1] + '%';
      tn.style.setProperty('--bc', b.color);
      tn.style.setProperty('--fill', `${Math.round((lvl / node.maxLevel) * 100)}%`);
      const badge = el('div', { class: 'tnode-badge' }, el('span', { class: 'tnode-lv' }, `${lvl}/${node.maxLevel}`));
      const costBtn = el('button', { class: 'tnode-cost' + (afford ? ' afford' : '') }, maxed ? '◆ MAX' : `◆ ${cost.toLocaleString()}`);
      if (maxed) costBtn.setAttribute('disabled', 'true');
      else costBtn.addEventListener('click', () => onBuy(id));
      tn.append(badge, el('div', { class: 'tnode-name' }, node.name), costBtn);
      tree.append(tn);
    });
  }
  root.append(tree);
  root.append(
    el('p', { class: 'upg-lead' }, 'Permanent upgrades carry between every descent. Four disciplines — deepen any of them; a brighter link marks a path you have started.'),
  );
  return root;
}
