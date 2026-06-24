import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtAgo, bar, num, formatReport } from './statsFormat.mjs';

test('fmtAgo buckets', () => {
  const now = 1_000_000_000_000;
  assert.equal(fmtAgo(now - 30_000, now), 'just now');       // 30s
  assert.equal(fmtAgo(now - 5 * 60_000, now), '5m ago');
  assert.equal(fmtAgo(now - 3 * 3_600_000, now), '3h ago');
  assert.equal(fmtAgo(now - 2 * 86_400_000, now), '2d ago');
  assert.equal(fmtAgo(now + 5000, now), 'just now');         // future clamps to 0
});

test('bar scales and is safe at the edges', () => {
  assert.equal(bar(10, 10, 8), '████████');
  assert.equal(bar(0, 10, 8), '░░░░░░░░');
  assert.equal(bar(5, 10, 8), '████░░░░');
  assert.equal(bar(3, 0, 8), '░░░░░░░░');                     // max 0 => empty, no crash
});

test('num is thousands-separated', () => {
  assert.equal(num(3003170), '3,003,170');
  assert.equal(num(0), '0');
});

test('formatReport renders all sections, a ✓ and a thousands number', () => {
  const now = 1_700_000_000_000;
  const data = {
    overview: [{ total_runs: 259, players: 9, linked: 1, first_ts: now - 10 * 86400000, last_ts: now - 86400000, runs_24h: 2, runs_7d: 25 }],
    perMode: [{ mode: 'endless', runs: 78, players: 7, top: 3003170 }],
    perDay: [{ day: '2026-06-23', runs: 2, players: 2 }, { day: '2026-06-22', runs: 5, players: 2 }],
    recent: [{ name: 'patij212', mode: 'longestday', score: 3063, wave: 1, ts: now - 3600000, account_id: 'acc_x' }],
    active: [{ name: 'patij212', runs: 140, best: 701911, last_ts: now - 3600000 }],
  };
  const out = formatReport(data, now);
  for (const h of ['OVERVIEW', 'BY MODE', 'LAST 14 DAYS', 'RECENT RUNS', 'MOST ACTIVE']) assert.match(out, new RegExp(h));
  assert.match(out, /3,003,170/);          // thousands separator
  assert.match(out, /patij212 ✓/);         // verified marker on a linked recent row
  assert.match(out, /1 linked account\b/); // singular form
});

test('formatReport handles an empty DB without crashing', () => {
  const out = formatReport({ overview: [], perMode: [], perDay: [], recent: [], active: [] }, 1_700_000_000_000);
  assert.match(out, /no runs recorded yet/);
});
