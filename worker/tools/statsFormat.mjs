// Pure formatting/aggregation for `npm run stats` (no I/O). Unit-tested with node:test.

/** Thousands-separated integer (rounded; non-numbers => 0). */
export function num(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

/** "just now" | "<N>m ago" | "<N>h ago" | "<N>d ago" from two epoch-ms values (clamps future to 0). */
export function fmtAgo(ts, now) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** UTC 'YYYY-MM-DD HH:MM' for an epoch-ms value. */
export function fmtWhen(ts) {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

/** Text bar (█ filled / ░ empty) of `width`, scaled so value/max fills it. max<=0 => all empty. */
export function bar(value, max, width = 16) {
  if (!(max > 0)) return '░'.repeat(width);
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const RULE = '─'.repeat(60);
const padR = (s, w) => { s = String(s); return s.length >= w ? s : s + ' '.repeat(w - s.length); };
const padL = (s, w) => { s = String(s); return s.length >= w ? s : ' '.repeat(w - s.length) + s; };

/** Build the full report string from the 5 parsed result sets + a `now` epoch-ms. */
export function formatReport(data, now) {
  const { overview = [], perMode = [], perDay = [], recent = [], active = [] } = data || {};
  const o = overview[0] || {};
  const L = [];
  L.push(`LANCEFALL — leaderboard stats           (generated ${fmtWhen(now)} UTC)`);
  L.push(RULE);

  L.push('OVERVIEW');
  if (o.total_runs != null) {
    L.push(`  ${num(o.total_runs)} runs · ${num(o.players)} players · ${num(o.linked)} linked account${Number(o.linked) === 1 ? '' : 's'}`);
    const span = (o.first_ts && o.last_ts) ? `${fmtWhen(o.first_ts).slice(0, 10)} → ${fmtWhen(o.last_ts).slice(0, 10)}` : '—';
    L.push(`  span ${span} · last 24h: ${num(o.runs_24h)} · last 7d: ${num(o.runs_7d)}`);
  } else {
    L.push('  (no runs recorded yet)');
  }
  L.push('');

  L.push('BY MODE');
  for (const r of perMode) L.push(`  ${padR(r.mode, 11)}${padL(num(r.runs), 5)} runs  ${padL(num(r.players), 4)} players   top ${num(r.top)}`);
  if (!perMode.length) L.push('  —');
  L.push('');

  L.push('LAST 14 DAYS');
  const maxDay = perDay.reduce((m, r) => Math.max(m, Number(r.runs) || 0), 0);
  for (const r of perDay) L.push(`  ${padR(r.day, 12)}${padL(num(r.runs), 4)}  ${bar(Number(r.runs) || 0, maxDay, 10)}  ${num(r.players)}p`);
  if (!perDay.length) L.push('  —');
  L.push('');

  L.push('RECENT RUNS');
  for (const r of recent) {
    const vt = r.account_id ? ' ✓' : '';
    L.push(`  ${padR((r.name || '') + vt, 14)}${padR(r.mode, 11)}${padL(num(r.score), 9)}  w${r.wave}  ${fmtAgo(r.ts, now)}`);
  }
  if (!recent.length) L.push('  —');
  L.push('');

  L.push('MOST ACTIVE');
  for (const r of active) L.push(`  ${padR(r.name, 14)}${padL(num(r.runs), 4)} runs   best ${padL(num(r.best), 9)}   last ${fmtAgo(r.last_ts, now)}`);
  if (!active.length) L.push('  —');

  return L.join('\n');
}
