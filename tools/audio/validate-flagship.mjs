#!/usr/bin/env node
// tools/audio/validate-flagship.mjs — the build gate. Derives the expected runtime asset paths
// from audio-src/flagship/loops.json, fails on any missing file with its exact path, probes the
// present ones (48 kHz, integer-bar loop length, per-track duration agreement), and runs the pure
// gate in ./lib.mjs (license/provenance/bytes/shared-suite-bpm-key). Prints a per-source table.
// Exits non-zero on any failure. Runs clean (FAIL with specific paths) before assets exist.
//
// Usage: node tools/audio/validate-flagship.mjs

import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  expectedRuntimePaths,
  expectedSfxPaths,
  findMissing,
  validateManifestAssets,
  durationTable,
} from './lib.mjs';

const ROOT = resolve(process.cwd());
const LOOPS = resolve(ROOT, 'audio-src/flagship/loops.json');
const PROVENANCE = resolve(ROOT, 'public/audio/flagship/provenance.json');
const MUSIC_DIR = 'public/audio/flagship/music';
const SFX_DIR = 'public/audio/flagship/sfx';

function fail(lines) {
  for (const l of lines) console.error(`  ✗ ${l}`);
  console.error(`\nFAIL — ${lines.length} problem(s).`);
  process.exit(1);
}

function probe(absPath) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate:format=duration', '-of', 'json', absPath],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout);
  return { sampleRate: Number(j.streams?.[0]?.sample_rate), duration: Number(j.format?.duration) };
}

function provenanceFor(entries, id) {
  return entries.find((e) => `${e.asset ?? ''}${e.url ?? ''}`.includes(id)) ?? null;
}

function main() {
  if (!existsSync(LOOPS)) fail([`missing curator record: audio-src/flagship/loops.json`]);
  const { sources = [], sfx = [] } = JSON.parse(readFileSync(LOOPS, 'utf8'));
  const provenance = existsSync(PROVENANCE) ? JSON.parse(readFileSync(PROVENANCE, 'utf8')).entries ?? [] : [];

  const musicPaths = expectedRuntimePaths(
    sources.map((s) => ({ id: s.id, tracks: ['main'] })),
    { dir: MUSIC_DIR, codecs: ['ogg', 'mp3'] },
  );
  const sfxPaths = expectedSfxPaths(sfx, { dir: SFX_DIR, codecs: ['ogg', 'mp3'] });
  const missing = findMissing([...musicPaths, ...sfxPaths], (p) => existsSync(resolve(ROOT, p)));

  // Probe each present music source (use the .ogg as the canonical decode); build gate records.
  const records = [];
  for (const s of sources) {
    const ogg = resolve(ROOT, `${MUSIC_DIR}/${s.id}/main.ogg`);
    const mp3 = resolve(ROOT, `${MUSIC_DIR}/${s.id}/main.mp3`);
    if (!existsSync(ogg)) continue;
    const info = probe(ogg);
    if (!info) {
      missing.push(`${MUSIC_DIR}/${s.id}/main.ogg (unreadable)`);
      continue;
    }
    const prov = provenanceFor(provenance, s.id);
    const bytes = statSync(ogg).size + (existsSync(mp3) ? statSync(mp3).size : 0);
    records.push({
      id: s.id,
      suite: s.suite,
      bpm: s.bpm,
      key: s.key,
      layering: 'loop',
      trackDurations: { main: info.duration },
      loopSeconds: info.duration,
      sampleRate: info.sampleRate,
      license: prov?.license ?? 'unknown',
      hasProvenance: Boolean(prov),
      bytes,
    });
  }

  const gateErrors = validateManifestAssets(records);

  if (records.length) {
    console.log(durationTable(records));
    console.log('');
  }

  const problems = [...missing.map((p) => `missing runtime asset: ${p}`), ...gateErrors];
  if (problems.length) fail(problems);

  console.log(`PASS — ${records.length} music source(s), provenance + budget OK.`);
}

main();
