// STATS dossier — the lifetime numbers as a rich, animated, graph-driven page (v9). Builds on the
// pure derivations in statsDerive.ts (radar/archetype/trend/heatmap/modes) and the canvas share
// card in statsShare.ts. Sections reveal on scroll (graceful: never leaves content hidden) and
// animate (count-ups, draw-on line, radar pop, bar grows, heatmap fade). The achievement GRID
// lives in the CODEX; STATS keeps the completion donut in the hero.

import { el, stat } from './dom';
import type { SaveData } from '../save';
import type { Enemy } from '../types';
import { ACHIEVEMENTS } from '../achievements';
import { bossName } from '../boss';
import { modeById } from '../modes';
import { heatLevel } from '../heat';
import type { Panel } from './panel';
import { SHIPS } from '../ships';
import { THEMES } from '../themes';
import { TRAILS } from '../trails';
import { META_NODES } from '../meta';
import { ALL_SKINS, canUnlockSkin } from '../skins';
import {
  radarAxes, archetypeName, trendDeltaPct, narratorLine, fmtDuration, heatmapWindow, modeStats,
} from './statsDerive';
import { renderShareCard } from './statsShare';

const BOSS_KINDS = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];
const BOSS_COLOR: Record<string, string> = {
  warden: '#ff3b6b', weaver: '#a855f7', beacon: '#38bdf8', mirrorblade: '#ef4444', hollow: '#6ee7b7', sovereign: '#fde047',
};
const KILL_PALETTE = ['#22d3ee', '#34d399', '#818cf8', '#fb923c', '#f472b6', '#f87171', '#fbbf24', '#a855f7', '#38bdf8', '#94a3b8'];

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();
const prettyKind = (k: string): string => k.split(/[-_]/).map(titleCase).join(' ');
const foeName = (k: string): string => (BOSS_KINDS.includes(k) ? bossName(k as Enemy['kind']) : prettyKind(k));

const reduce = (): boolean => document.documentElement.classList.contains('reduce-motion');

// ── shared hover tooltip (one node, appended to body) ───────────────────────────
let tipEl: HTMLElement | null = null;
function showTip(html: string, x: number, y: number): void {
  if (!tipEl) { tipEl = el('div', { class: 'st-tip' }); document.body.appendChild(tipEl); }
  tipEl.innerHTML = html;
  tipEl.style.opacity = '1';
  tipEl.style.left = `${x + 14}px`;
  tipEl.style.top = `${y + 14}px`;
}
function hideTip(): void { if (tipEl) tipEl.style.opacity = '0'; }

// ── animation primitives (all gated by reduce-motion → jump to final) ───────────
function countUp(node: HTMLElement, target: number, prefix = '', suffix = '', dur = 850): void {
  const final = (): void => { node.textContent = `${prefix}${Number.isFinite(target) ? target.toLocaleString() : ''}${suffix}`; };
  if (reduce() || !Number.isFinite(target)) { final(); return; }
  const t0 = performance.now();
  const ease = (k: number): number => 1 - Math.pow(1 - k, 3);
  let done = false;
  const step = (t: number): void => {
    if (done) return;
    const k = Math.min(1, (t - t0) / dur);
    node.textContent = `${prefix}${Math.round(target * ease(k)).toLocaleString()}${suffix}`;
    if (k < 1) requestAnimationFrame(step); else done = true;
  };
  requestAnimationFrame(step);
  setTimeout(() => { done = true; final(); }, dur + 120); // guarantee the final value even if rAF never paints
}
function growBar(fill: HTMLElement, pct: number): void {
  if (reduce()) { fill.style.width = `${pct}%`; return; }
  fill.style.width = '0%';
  fill.style.transition = 'width 0.6s cubic-bezier(0.22,0.61,0.36,1)';
  // setTimeout (not rAF) so the final width is always set even in a non-painting tab.
  setTimeout(() => { fill.style.width = `${pct}%`; }, 30);
}

interface Built { node: HTMLElement; animate: () => void; }
const NOOP = (): void => {};

// ── HERO: donut + count-up stats + chips + share button ─────────────────────────
function buildHero(s: SaveData): Built {
  const got = ACHIEVEMENTS.filter((a) => s.achievements.includes(a.id)).length;
  const total = ACHIEVEMENTS.length;
  const ratio = total ? got / total : 0;
  const R = 40, C = 2 * Math.PI * R, off = (C * (1 - ratio)).toFixed(1);

  const ring = el('div', { class: 'st-ring' });
  ring.innerHTML =
    `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="8"/>` +
    `<circle class="st-ring-arc" cx="50" cy="50" r="${R}" fill="none" stroke="#fde047" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/></svg>` +
    `<div class="st-ring-c"><div class="st-ring-pct">0%</div><div class="st-ring-lbl">${got}/${total}</div></div>`;

  const winRate = s.totalRuns > 0 ? Math.round((s.lifeWins / s.totalRuns) * 100) : NaN;
  const hi = stat('high score', '0');
  (hi.querySelector('.go-stat-v') as HTMLElement).style.color = 'var(--cyan)';
  const combo = stat('best combo', '0');
  const runs = stat('runs survived', '0');
  const win = stat('win rate', '—');
  const grid = el('div', { class: 'stats-hero-grid' }, hi, combo, runs, win);

  const chips = el('div', { class: 'st-chips' });
  chips.innerHTML =
    `<div class="st-chip"><span class="st-chip-ic">⏱</span><div><div class="st-chip-k">Time in the City</div><div class="st-chip-v">${fmtDuration(s.lifeTimeSec)}</div></div></div>` +
    `<div class="st-chip streak"><span class="st-chip-ic">🔥</span><div><div class="st-chip-k">Day streak</div><div class="st-chip-v">${s.playStreak} day${s.playStreak === 1 ? '' : 's'}</div></div></div>` +
    (s.ngPlusLevel > 0 ? `<div class="st-chip ngp"><span class="st-chip-ic">↻</span><div><div class="st-chip-k">NG+ loop</div><div class="st-chip-v">${s.ngPlusLevel}</div></div></div>` : '');

  const share = el('button', { class: 'st-share-btn', type: 'button' }, '⤴ Share card');
  share.addEventListener('click', () => renderShareCard(s));

  const right = el('div', { class: 'st-hero-right' }, grid, chips);
  const node = el('div', { class: 'stats-hero' }, ring, right, share);

  const animate = (): void => {
    const arc = ring.querySelector('.st-ring-arc') as HTMLElement;
    const pct = ring.querySelector('.st-ring-pct') as HTMLElement;
    if (reduce()) { arc.style.strokeDashoffset = off; pct.textContent = `${Math.round(ratio * 100)}%`; } else {
      arc.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.22,0.61,0.36,1)';
      setTimeout(() => { arc.style.strokeDashoffset = off; }, 30);
      countUp(pct, Math.round(ratio * 100), '', '%');
    }
    countUp(hi.querySelector('.go-stat-v') as HTMLElement, s.highScore);
    countUp(combo.querySelector('.go-stat-v') as HTMLElement, s.bestCombo, '×');
    countUp(runs.querySelector('.go-stat-v') as HTMLElement, s.totalRuns);
    countUp(win.querySelector('.go-stat-v') as HTMLElement, winRate, '', '%');
  };
  return { node, animate };
}

// ── PERFORMANCE: score-trend area chart + playstyle radar ───────────────────────
function buildTrend(s: SaveData): Built {
  const runs = s.runHistory;
  const card = el('div', { class: 'st-card' });
  const delta = trendDeltaPct(runs);
  const deltaHTML = delta === null ? '' :
    `<span class="st-delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)}% vs first runs</span>`;
  card.innerHTML = `<div class="st-card-h"><span class="st-card-t">Score Trend</span><span style="display:flex;gap:8px;align-items:center">${deltaHTML}<span class="st-card-sub">last <b>${runs.length}</b> · best <b>${s.highScore.toLocaleString()}</b></span></span></div>`;

  if (runs.length < 5) {
    card.appendChild(el('div', { class: 'st-trend-empty' }, 'Play a few runs — your score trend will chart here.'));
    return { node: card, animate: NOOP };
  }

  const W = 680, H = 168, pad = 8, padB = 14;
  const scores = runs.map((r) => r.score);
  const min = Math.min(...scores) * 0.9;
  const max = Math.max(Math.max(...scores), s.highScore) * 1.04;
  const X = (i: number): number => pad + (i / (runs.length - 1)) * (W - 2 * pad);
  const Y = (v: number): number => H - padB - ((v - min) / (max - min || 1)) * (H - pad - padB);
  let line = '', area = `M ${X(0)} ${H - padB}`;
  runs.forEach((r, i) => { const px = X(i).toFixed(1), py = Y(r.score).toFixed(1); line += (i ? ' L ' : 'M ') + px + ' ' + py; area += ' L ' + px + ' ' + py; });
  area += ` L ${X(runs.length - 1)} ${H - padB} Z`;
  const pbY = Y(s.highScore).toFixed(1);
  const dots = runs.map((r, i) => (r.won ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(r.score).toFixed(1)}" r="3" fill="#4ade80" stroke="#03050d" stroke-width="1"/>` : '')).join('');
  const holder = el('div');
  holder.innerHTML =
    `<svg class="st-trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="stTg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(34,211,238,0.34)"/><stop offset="100%" stop-color="rgba(34,211,238,0)"/></linearGradient></defs>` +
    `<line x1="${pad}" y1="${pbY}" x2="${W - pad}" y2="${pbY}" stroke="#fde047" stroke-width="1" stroke-dasharray="3 4" opacity="0.55"/>` +
    `<path d="${area}" fill="url(#stTg)" class="st-trend-area" style="opacity:0"/>` +
    `<path d="${line}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="st-trend-line" style="filter:drop-shadow(0 0 4px rgba(34,211,238,0.5))"/>` +
    `<g class="st-trend-dots" style="opacity:0">${dots}</g>` +
    `<line class="st-trend-scrub" x1="0" y1="${pad}" x2="0" y2="${H - padB}" stroke="rgba(34,211,238,0.5)" stroke-width="1" style="opacity:0"/>` +
    `<circle class="st-trend-pt" r="4" fill="#22d3ee" stroke="#03050d" stroke-width="1.5" style="opacity:0"/>` +
    `<rect class="st-trend-hit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/></svg>`;
  const svg = holder.firstElementChild as SVGSVGElement;
  card.appendChild(svg);
  card.appendChild(el('div', { class: 'st-trend-legend' }));
  (card.lastChild as HTMLElement).innerHTML =
    `<span><i class="win"></i>Win</span><span><i class="pb"></i>All-time best</span><span><i style="background:#22d3ee"></i>Run score</span>`;

  const lineEl = svg.querySelector('.st-trend-line') as SVGPathElement;
  const areaEl = svg.querySelector('.st-trend-area') as HTMLElement;
  const dotsEl = svg.querySelector('.st-trend-dots') as HTMLElement;
  const scrub = svg.querySelector('.st-trend-scrub') as SVGLineElement;
  const pt = svg.querySelector('.st-trend-pt') as SVGCircleElement;
  const hit = svg.querySelector('.st-trend-hit') as SVGRectElement;
  hit.addEventListener('mousemove', (e) => {
    const rc = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(runs.length - 1, Math.round(((e.clientX - rc.left) / rc.width) * (runs.length - 1))));
    const r = runs[i];
    const px = X(i), py = Y(r.score);
    scrub.setAttribute('x1', String(px)); scrub.setAttribute('x2', String(px)); scrub.style.opacity = '1';
    pt.setAttribute('cx', String(px)); pt.setAttribute('cy', String(py)); pt.style.opacity = '1';
    showTip(`Run ${i + 1}/${runs.length} · <b>${r.score.toLocaleString()}</b><br>${modeById(r.mode).name} · wave ${r.wave} · <span class="${r.won ? 'o-win' : 'o-loss'}">${r.won ? 'WON' : 'fell'}</span>`, e.clientX, e.clientY);
  });
  hit.addEventListener('mouseleave', () => { hideTip(); scrub.style.opacity = '0'; pt.style.opacity = '0'; });

  const animate = (): void => {
    if (reduce()) { areaEl.style.opacity = '1'; dotsEl.style.opacity = '1'; lineEl.style.strokeDashoffset = '0'; return; }
    const len = typeof lineEl.getTotalLength === 'function' ? lineEl.getTotalLength() : 0;
    if (len > 0) { lineEl.style.strokeDasharray = String(len); lineEl.style.strokeDashoffset = String(len); }
    setTimeout(() => {
      lineEl.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)';
      lineEl.style.strokeDashoffset = '0';
      areaEl.style.transition = 'opacity 0.9s ease 0.3s'; areaEl.style.opacity = '1';
      dotsEl.style.transition = 'opacity 0.5s ease 1s'; dotsEl.style.opacity = '1';
    }, 30);
  };
  return { node: card, animate };
}

function buildRadar(s: SaveData): Built {
  const card = el('div', { class: 'st-card' });
  card.innerHTML = `<div class="st-card-h"><span class="st-card-t">Playstyle</span><span class="st-card-sub">your lean</span></div>`;
  const W = 300, H = 188, cx = 150, cy = 92, R = 66;
  const axes = radarAxes(s);
  const ang = (i: number): number => ((-90 + i * (360 / axes.length)) * Math.PI) / 180;
  const P = (i: number, r: number): [string, string] => [(cx + Math.cos(ang(i)) * R * r).toFixed(1), (cy + Math.sin(ang(i)) * R * r).toFixed(1)];
  let grid = '', spk = '', lab = '';
  [0.25, 0.5, 0.75, 1].forEach((rr) => { grid += `<polygon points="${axes.map((_, i) => P(i, rr).join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,0.07)"/>`; });
  axes.forEach((a, i) => {
    const [ex, ey] = P(i, 1);
    spk += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="rgba(255,255,255,0.06)"/>`;
    const [lx, ly] = P(i, 1.34);
    const anchor = Math.abs(+lx - cx) < 6 ? 'middle' : (+lx > cx ? 'start' : 'end');
    lab += `<text x="${lx}" y="${+ly - 1}" text-anchor="${anchor}" class="st-radar-l">${a.name}</text><text x="${lx}" y="${+ly + 9}" text-anchor="${anchor}" class="st-radar-v">${a.value}</text>`;
  });
  const shape = axes.map((a, i) => P(i, a.norm).join(',')).join(' ');
  const verts = axes.map((a, i) => { const [px, py] = P(i, a.norm); return `<circle cx="${px}" cy="${py}" r="2.6" fill="#22d3ee"/>`; }).join('');
  const holder = el('div');
  holder.innerHTML =
    `<svg class="st-radar-svg" viewBox="0 0 ${W} ${H}"><defs><radialGradient id="stRg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(34,211,238,0.45)"/><stop offset="100%" stop-color="rgba(129,140,248,0.18)"/></radialGradient></defs>${grid}${spk}` +
    `<g class="st-radar-shape" style="transform-origin:${cx}px ${cy}px;transform:scale(0.02)"><polygon points="${shape}" fill="url(#stRg)" stroke="#22d3ee" stroke-width="1.6" style="filter:drop-shadow(0 0 5px rgba(34,211,238,0.5))"/>${verts}</g>${lab}</svg>`;
  card.appendChild(holder.firstElementChild as SVGSVGElement);
  card.appendChild(el('div', { class: 'st-radar-arch' }, el('div', { class: 'st-radar-arch-l' }, 'Playstyle'), el('div', { class: 'st-radar-arch-n' }, archetypeName(s))));
  const shapeEl = card.querySelector('.st-radar-shape') as HTMLElement;
  const animate = (): void => {
    if (reduce()) { shapeEl.style.transform = 'scale(1)'; return; }
    shapeEl.style.transition = 'transform 0.8s cubic-bezier(0.34,1.4,0.5,1)';
    setTimeout(() => { shapeEl.style.transform = 'scale(1)'; }, 30);
  };
  return { node: card, animate };
}

function buildPerformance(s: SaveData): Built {
  const trend = buildTrend(s);
  const radar = buildRadar(s);
  const node = el('div', { class: 'st-wow-row' }, trend.node, radar.node);
  return { node, animate: () => { trend.animate(); radar.animate(); } };
}

// ── ACTIVITY heatmap ────────────────────────────────────────────────────────────
const WD = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const heatLvl = (c: number): number => (c <= 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : c <= 3 ? 3 : 4);

function buildActivity(s: SaveData): Built {
  const days = heatmapWindow(s.playDays, new Date());
  const wrap = el('div', { class: 'st-heat-wrap' });
  wrap.appendChild(el('div', { class: 'st-heat-top' },
    el('span', { class: 'st-card-t' }, 'Activity · last 26 weeks'),
    (() => { const b = el('span', { class: 'st-streak' }); b.innerHTML = `<span class="fire">🔥</span><span class="num">${s.playStreak}</span><span class="lbl">day streak</span>`; return b; })(),
  ));
  const body = el('div', { class: 'st-heat-body' });
  const cal = el('div', { class: 'st-heat-cal' });

  // pad the start so rows align to weekday (Sun row 0)
  const firstDow = new Date(days[0].date + 'T00:00:00').getDay();
  const cells: (typeof days[number] | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (const d of days) cells.push(d);

  // month labels per column (week)
  const months = el('div', { class: 'st-heat-months' });
  const cols = Math.ceil(cells.length / 7);
  let lastMon = -1;
  for (let c = 0; c < cols; c++) {
    const cell = cells[c * 7] ?? cells.slice(c * 7, c * 7 + 7).find(Boolean) ?? null;
    const span = el('span', { class: 'st-heat-mon' });
    if (cell) { const m = new Date(cell.date + 'T00:00:00').getMonth(); if (m !== lastMon) { span.textContent = MON[m]; lastMon = m; } }
    months.appendChild(span);
  }
  cal.appendChild(months);

  const rowwrap = el('div', { class: 'st-heat-rowwrap' });
  const wd = el('div', { class: 'st-heat-wd' });
  for (const d of WD) wd.appendChild(el('span', {}, d));
  rowwrap.appendChild(wd);
  const grid = el('div', { class: 'st-heat-grid' });
  const cellEls: HTMLElement[] = [];
  for (const day of cells) {
    if (!day) { grid.appendChild(el('div', { class: 'st-heat-cell pad' })); continue; }
    const lvl = heatLvl(day.count);
    const c = el('div', { class: 'st-heat-cell' + (lvl ? ` l${lvl}` : '') });
    const ds = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    c.addEventListener('mousemove', (e) => showTip(`${ds} · <b>${day.count}</b> run${day.count === 1 ? '' : 's'}`, e.clientX, e.clientY));
    c.addEventListener('mouseleave', hideTip);
    grid.appendChild(c);
    cellEls.push(c);
  }
  rowwrap.appendChild(grid);
  cal.appendChild(rowwrap);
  body.appendChild(cal);

  // right-side mini-summary
  const total30 = days.slice(-30).reduce((t, d) => t + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;
  const busiest = Math.max(0, ...days.map((d) => d.count));
  const mini = el('div', { class: 'st-heat-mini' });
  mini.innerHTML =
    `<div class="m"><div class="mk">This month</div><div class="mv">${total30} run${total30 === 1 ? '' : 's'}</div></div>` +
    `<div class="m"><div class="mk">Active days</div><div class="mv">${activeDays}</div></div>` +
    `<div class="m"><div class="mk">Busiest day</div><div class="mv">${busiest} run${busiest === 1 ? '' : 's'}</div></div>`;
  body.appendChild(mini);
  wrap.appendChild(body);

  const legend = el('div', { class: 'st-heat-legend' });
  legend.innerHTML = `Less <span class="sw st-heat-cell"></span><span class="sw st-heat-cell l1"></span><span class="sw st-heat-cell l2"></span><span class="sw st-heat-cell l3"></span><span class="sw st-heat-cell l4"></span> More`;
  wrap.appendChild(legend);

  const animate = (): void => {
    if (reduce()) return;
    cellEls.forEach((c, i) => { c.style.opacity = '0'; c.style.transition = 'opacity 0.3s'; setTimeout(() => { c.style.opacity = '1'; }, i * 4); });
  };
  return { node: wrap, animate };
}

// ── BY MODE table ───────────────────────────────────────────────────────────────
function buildModes(s: SaveData): Built {
  const rows = modeStats(s).filter((m) => m.plays > 0 || m.best > 0);
  if (!rows.length) return { node: el('div', { class: 'st-empty' }, 'No modes played yet.'), animate: NOOP };
  const tbl = el('div', { class: 'st-modes' });
  const head = el('div', { class: 'st-mrow head' });
  head.innerHTML = `<span></span><span>Mode</span><span class="r">Plays</span><span>Win rate</span><span class="r">Best</span>`;
  tbl.appendChild(head);
  const fills: [HTMLElement, number][] = [];
  for (const m of rows) {
    const row = el('div', { class: 'st-mrow' });
    row.innerHTML =
      `<span class="st-mdot" style="background:${m.color};color:${m.color}"></span>` +
      `<span class="st-mname">${m.name}</span>` +
      `<span class="st-mplays">${m.plays}</span>` +
      `<span class="st-mwin"><span class="st-mwin-track"><span class="st-mwin-fill" style="width:0%"></span></span><span class="st-mwin-v">${m.winPct}%</span></span>` +
      `<span class="st-mbest">${m.best.toLocaleString()}</span>`;
    tbl.appendChild(row);
    fills.push([row.querySelector('.st-mwin-fill') as HTMLElement, m.winPct]);
  }
  return { node: tbl, animate: () => fills.forEach(([f, p]) => growBar(f, p)) };
}

// ── ranked bars (nemesis / kills) ───────────────────────────────────────────────
function buildBars(rows: [string, number, string][], suffix: 'x' | ''): Built {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  const wrap = el('div', { class: 'st-bars' });
  const fills: [HTMLElement, number][] = [];
  for (const [k, n, color] of rows) {
    const row = el('div', { class: 'st-bar' });
    const pct = Math.max(5, (n / max) * 100);
    row.innerHTML = `<div class="st-bar-k">${k}</div><div class="st-bar-track"><div class="st-bar-fill" style="width:0%;background:${color};color:${color}"></div></div><div class="st-bar-v">${suffix === 'x' ? n.toLocaleString() + ' ✕' : n.toLocaleString()}</div>`;
    wrap.appendChild(row);
    fills.push([row.querySelector('.st-bar-fill') as HTMLElement, pct]);
  }
  return { node: wrap, animate: () => fills.forEach(([f, p]) => growBar(f, p)) };
}

// ── COMBAT 8-cell grid ──────────────────────────────────────────────────────────
function buildCombat(s: SaveData): Built {
  const ups: [HTMLElement, number][] = [];
  const grid = el('div', { class: 'stat-cells' });
  const numCell = (k: string, v: number, cls = ''): void => {
    const cell = el('div', { class: 'stat-cell' }, el('div', { class: `stat-cell-v ${cls}` }, '0'), el('div', { class: 'stat-cell-k' }, k));
    grid.appendChild(cell);
    ups.push([cell.querySelector('.stat-cell-v') as HTMLElement, v]);
  };
  const textCell = (k: string, v: string): void => {
    grid.appendChild(el('div', { class: 'stat-cell' }, el('div', { class: 'stat-cell-v' }, v), el('div', { class: 'stat-cell-k' }, k)));
  };
  numCell('Total Kills', s.lifeKills);
  numCell('Bosses Down', s.lifeBoss);
  numCell('Shards Earned', s.lifeShards, 'green');
  numCell('Bullets Grazed', s.lifeGrazes, 'accent');
  numCell('DAYBREAKs Fired', s.lifeDaybreaks, 'gold');
  numCell('Last-Breath Saves', s.lifeLastBreath, 'accent');
  numCell('Runs Won', s.lifeWins, 'green');
  textCell('Time Played', fmtDuration(s.lifeTimeSec));
  return { node: grid, animate: () => ups.forEach(([n, v]) => countUp(n, v)) };
}

// ── RECORDS grid ────────────────────────────────────────────────────────────────
function buildRecords(s: SaveData): Built {
  const rec = (k: string, v: string, small?: string): HTMLElement => {
    const val = el('div', { class: 'rec-v' }, v);
    if (small) val.append(el('small', {}, ` ${small}`));
    return el('div', { class: 'rec' }, el('div', { class: 'rec-k' }, k), val);
  };
  const heat = s.maxHeat > 0 ? heatLevel(s.maxHeat) : null;
  const node = el('div', { class: 'rec-grid' },
    rec('Deepest Wave', s.deepestWave > 0 ? String(s.deepestWave) : '—'),
    rec('Highest Heat', heat ? `H${heat.level}` : 'OFF', heat ? `· ${titleCase(heat.name)}` : undefined),
    rec('Longest Run', s.longestRunSec > 0 ? mmss(s.longestRunSec) : '—'),
    rec('Fastest Arena', s.fastestArenaSec > 0 ? mmss(s.fastestArenaSec) : '—'),
    rec('Biggest Combo', s.bestCombo > 0 ? `×${s.bestCombo}` : '—'),
    rec('Bosses · One Run', s.mostBossesOneRun > 0 ? String(s.mostBossesOneRun) : '—'),
  );
  return { node, animate: NOOP };
}

// ── COLLECTION completion bars ──────────────────────────────────────────────────
function buildCollection(s: SaveData): Built {
  const got = ACHIEVEMENTS.filter((a) => s.achievements.includes(a.id)).length;
  const skinsGot = ALL_SKINS.filter((sk) => canUnlockSkin(sk, s.achievements)).length;
  const metaGot = Object.values(s.meta).filter((v) => v > 0).length;
  const rows: [string, number, number][] = [
    ['Ships', s.unlockedShips.length, SHIPS.length],
    ['Dash Trails', s.unlockedTrails.length, TRAILS.length],
    ['Themes', s.unlockedThemes.length, THEMES.length],
    ['Enemy Skins', skinsGot, ALL_SKINS.length],
    ['Meta Nodes', metaGot, META_NODES.length],
    ['Achievements', got, ACHIEVEMENTS.length],
  ];
  const grid = el('div', { class: 'st-coll-grid' });
  const fills: [HTMLElement, number][] = [];
  for (const [k, g, t] of rows) {
    const done = t > 0 && g >= t;
    const pct = t > 0 ? (g / t) * 100 : 0;
    const row = el('div', { class: 'st-coll-row' + (done ? ' done' : '') });
    row.innerHTML = `<div class="st-coll-top"><span class="st-coll-k">${k}</span><span class="st-coll-v"><b>${g}</b> / ${t}</span></div><div class="st-coll-track"><div class="st-coll-fill" style="width:0%"></div></div>`;
    grid.appendChild(row);
    fills.push([row.querySelector('.st-coll-fill') as HTMLElement, pct]);
  }
  return { node: grid, animate: () => fills.forEach(([f, p]) => growBar(f, p)) };
}

// ── reveal-on-scroll (graceful: never leaves content hidden) ─────────────────────
function setupReveal(sections: HTMLElement[]): void {
  const revealNow = (sec: HTMLElement): void => {
    if (sec.classList.contains('in')) return;
    sec.classList.add('in');
    ANIM.get(sec)?.();
  };
  const mounted = sections[0]?.isConnected;
  if (reduce() || !('IntersectionObserver' in window) || !mounted) { sections.forEach(revealNow); return; }
  // The top blocks are always above the fold on open → reveal them immediately, independent of
  // layout timing, so the dossier is NEVER blank (content carries its own animated zero-state).
  sections.slice(0, 3).forEach(revealNow);
  // find the scroll container (the panel body) as the observer root
  let root: HTMLElement | null = sections[0].parentElement;
  while (root && root !== document.body) {
    const oy = getComputedStyle(root).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && root.scrollHeight > root.clientHeight) break;
    root = root.parentElement;
  }
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { revealNow(e.target as HTMLElement); io.unobserve(e.target); }
  }, { root: root && root !== document.body ? root : null, threshold: 0.12 });
  sections.slice(3).forEach((sec) => io.observe(sec));
  // safety net — guarantee EVERY section reaches its final state even if the observer never fires
  // (off-screen sections settle silently; on-screen ones were revealed above or by the observer).
  setTimeout(() => { sections.forEach(revealNow); io.disconnect(); }, 1400);
}

const ANIM = new WeakMap<HTMLElement, () => void>();

export function renderStats(s: SaveData): HTMLElement[] {
  const sections: HTMLElement[] = [];
  const add = (title: string | null, built: Built): void => {
    const sec = el('div', { class: 'dossier-section' });
    if (title) sec.appendChild(el('div', { class: 'stats-label' }, title));
    sec.appendChild(built.node);
    ANIM.set(sec, built.animate);
    sections.push(sec);
  };

  add(null, buildHero(s));
  add(null, { node: el('div', { class: 'st-narrator' }, narratorLine(s)), animate: NOOP });
  add('PERFORMANCE', buildPerformance(s));
  add('ACTIVITY', buildActivity(s));
  add('BY MODE', buildModes(s));

  // NEMESIS — bosses that end your runs (empty state if none)
  const nem = (Object.entries(s.nemesis) as [string, number][])
    .filter(([k, n]) => n > 0 && BOSS_KINDS.includes(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (nem.length) {
    add('NEMESIS · who ends your runs', buildBars(nem.map(([k, n]) => [foeName(k), n, BOSS_COLOR[k] ?? '#fb7185'] as [string, number, string]), 'x'));
  } else {
    add('NEMESIS · who ends your runs', { node: el('div', { class: 'st-empty' }, 'Nothing has ended you yet. Hold the light.'), animate: NOOP });
  }

  // KILLS BY FOE — top 10 by lifetime kills, two columns
  const kills = (Object.entries(s.killsByKind) as [string, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (kills.length) {
    const colored = kills.map(([k, n], i) => [foeName(k), n, KILL_PALETTE[i % KILL_PALETTE.length]] as [string, number, string]);
    const half = Math.ceil(colored.length / 2);
    const left = buildBars(colored.slice(0, half), '');
    const right = buildBars(colored.slice(half), '');
    const node = el('div', { class: 'st-two-col' }, left.node, right.node);
    add('KILLS BY FOE', { node, animate: () => { left.animate(); right.animate(); } });
  }

  add('COMBAT · lifetime', buildCombat(s));
  add('RECORDS', buildRecords(s));
  add('COLLECTION', buildCollection(s));

  // setTimeout (not rAF) so the reveal/animation setup runs reliably even if the tab never paints.
  setTimeout(() => setupReveal(sections), 0);
  return sections;
}

const STATS_ICON =
  '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20V11M10 20V5M16 20v-8M22 20H2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export interface StatsPanelDeps {
  /** dismiss the modal (DONE). */
  onClose: () => void;
}

/** The STATS lifetime-dossier modal: a fixed shell whose body is (re)rendered by renderStats on
 *  each open (the dossier reflects the live save). */
export function buildStatsPanel(deps: StatsPanelDeps): Panel {
  const icon = el('div', { class: 'panel-head-icon' });
  icon.innerHTML = STATS_ICON;
  const head = el('div', { class: 'panel-head' }, icon, el('div', { class: 'panel-head-titles' }, el('div', { class: 'panel-eyebrow' }, 'LIFETIME DOSSIER'), el('h2', { class: 'panel-head-title' }, 'STATS')));
  const body = el('div', { class: 'stats-body' });
  body.id = 'stats-body';
  const close = el('button', { class: 'btn btn-primary' }, 'DONE');
  close.addEventListener('click', () => deps.onClose());
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, el('div', { class: 'panel panel-wide' }, head, body, close));
  const open = (save: SaveData): void => { body.replaceChildren(...renderStats(save)); };
  return { root, open };
}

