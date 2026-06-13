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
  validateSfxAssets,
  provenanceForAsset,
  durationTable,
} from './lib.mjs';

const MAX_RUNTIME_BYTES = 8 * 1024 * 1024;

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
    const prov = provenanceForAsset(provenance, `music/${s.id}/main`);
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

  // Build an SFX record per id (probe variant 1's .ogg for sample-rate, sum all variant bytes) and
  // gate license/sample-rate/provenance — previously SFX were existence-checked only.
  const sfxRecords = [];
  for (const s of sfx) {
    let bytes = 0;
    let sampleRate = 0;
    for (let n = 1; n <= s.variants; n++) {
      const ogg = resolve(ROOT, `${SFX_DIR}/${s.id}_${n}.ogg`);
      const mp3 = resolve(ROOT, `${SFX_DIR}/${s.id}_${n}.mp3`);
      if (existsSync(ogg)) {
        bytes += statSync(ogg).size;
        if (!sampleRate) sampleRate = probe(ogg)?.sampleRate ?? 0;
      }
      if (existsSync(mp3)) bytes += statSync(mp3).size;
    }
    if (!sampleRate) continue; // nothing on disk yet → covered by the missing-path check
    const prov = provenanceForAsset(provenance, `sfx/${s.id}`);
    sfxRecords.push({ id: s.id, sampleRate, license: prov?.license ?? 'unknown', hasProvenance: Boolean(prov), bytes });
  }

  // Budget covers music + SFX combined (validateManifestAssets' own budget is disabled here).
  const totalBytes = [...records, ...sfxRecords].reduce((sum, r) => sum + (r.bytes ?? 0), 0);
  const budgetErr = totalBytes > MAX_RUNTIME_BYTES ? [`runtime budget exceeded: ${(totalBytes / 1024 / 1024).toFixed(2)} MB > 8 MB (music + SFX)`] : [];

  const gateErrors = [
    ...validateManifestAssets(records, { maxBytes: Infinity }),
    ...validateSfxAssets(sfxRecords),
    ...budgetErr,
  ];

  if (records.length) {
    console.log(durationTable(records));
    console.log(`SFX: ${sfxRecords.length} ids OK · total runtime ${(totalBytes / 1024 / 1024).toFixed(2)} MB / 8 MB`);
    console.log('');
  }

  const problems = [...missing.map((p) => `missing runtime asset: ${p}`), ...gateErrors];
  if (problems.length) fail(problems);

  console.log(`PASS — ${records.length} music + ${sfxRecords.length} SFX, provenance + sample-rate + budget OK.`);
}

main();
