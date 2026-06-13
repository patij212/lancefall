#!/usr/bin/env node
// tools/audio/conform-flagship.mjs — LOOP-PREP, not tempo-lock (Deep Dive C).
// For each curated source in audio-src/flagship/loops.json it: trims [loopStartBar, loopEndBar)
// to an integer-bar region at the source's OWN bpm, bakes an equal-power (qsin) crossfade SEAM by
// overlap-adding the X-second tail onto the head so the loop wraps click-free, loudness-normalises
// toward the manifest LUFS, optionally rubberband-stretches a rare outlier, and writes a 48 kHz WAV.
// The bar/seam math is the unit-tested pure core in ./lib.mjs; this file is the ffmpeg I/O shell.
//
// Usage: node tools/audio/conform-flagship.mjs   (reads loops.json; skips sources with no sourceWav)

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { barSeconds, loopSeconds } from './lib.mjs';

const ROOT = resolve(process.cwd());
const LOOPS = resolve(ROOT, 'audio-src/flagship/loops.json');
const OUT_MUSIC = resolve(ROOT, 'audio-src/flagship/conformed/music');
const OUT_SFX = resolve(ROOT, 'audio-src/flagship/conformed/sfx');
const TARGET_LUFS = -20;
const TARGET_TP = -1;

function die(msg) {
  console.error(`conform: ${msg}`);
  process.exit(1);
}

function run(bin, args) {
  const r = spawnSync(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error) die(`${bin} not found (${r.error.message})`);
  if (r.status !== 0) die(`${bin} exited ${r.status}`);
}

function hasFilter(name) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' });
  return r.status === 0 && new RegExp(`\\b${name}\\b`).test(r.stdout);
}

/** The overlap-add seam-bake filtergraph for one source (see Deep Dive C). */
function loopFilter(startSec, loopSec, xfSec, lufs, tp, stretchTempo) {
  const end = startSec + loopSec;
  const pre = stretchTempo ? `${stretchTempo},` : '';
  return [
    `[0:a]${pre}atrim=start=${startSec}:end=${end},asetpts=N/SR/TB,asplit=2[body][bodyhead]`,
    // head = first X seconds of the loop, faded IN (equal-power qsin)
    `[bodyhead]atrim=0:${xfSec},afade=t=in:curve=qsin:st=0:d=${xfSec}[headfade]`,
    // tail = the X seconds that FOLLOW the loop point, faded OUT — overlap-add makes the wrap seamless
    `[0:a]${pre}atrim=start=${end}:end=${end + xfSec},asetpts=N/SR/TB,afade=t=out:curve=qsin:st=0:d=${xfSec}[tailfade]`,
    `[headfade][tailfade]amix=inputs=2:normalize=0:duration=shortest[seam]`,
    `[body]atrim=start=${xfSec}:end=${loopSec},asetpts=N/SR/TB[rest]`,
    `[seam][rest]concat=n=2:v=0:a=1,loudnorm=I=${lufs}:TP=${tp}:LRA=11,aresample=48000[outa]`,
  ].join(';');
}

function conformMusic(src, stretchFilter) {
  if (!src.sourceWav) {
    console.log(`  · ${src.id}: no sourceWav yet (Task 3) — skipped`);
    return false;
  }
  const input = resolve(ROOT, src.sourceWav);
  if (!existsSync(input)) die(`${src.id}: sourceWav not found: ${src.sourceWav}`);

  const bars = src.loopEndBar - src.loopStartBar;
  if (!(bars >= 1)) die(`${src.id}: loopEndBar must exceed loopStartBar`);
  const startSec = src.loopStartBar * barSeconds(src.bpm);
  const loopSec = loopSeconds(src.bpm, bars);
  const xfSec = Math.max(0.005, (src.crossfadeMs ?? 40) / 1000);

  let stretchTempo = '';
  if (src.stretchTo && src.stretchTo !== src.bpm) {
    const ratio = src.stretchTo / src.bpm;
    stretchTempo = stretchFilter === 'rubberband' ? `rubberband=tempo=${ratio}` : `atempo=${ratio}`;
    console.log(`  · ${src.id}: stretch ${src.bpm}→${src.stretchTo} BPM via ${stretchFilter}`);
  }

  const outDir = resolve(OUT_MUSIC, src.id);
  mkdirSync(outDir, { recursive: true });
  const output = resolve(outDir, 'main.wav');
  run('ffmpeg', [
    '-hide_banner', '-y', '-i', input,
    '-filter_complex', loopFilter(startSec, loopSec, xfSec, TARGET_LUFS, TARGET_TP, stretchTempo),
    '-map', '[outa]', '-ar', '48000', '-c:a', 'pcm_s16le', output,
  ]);
  console.log(`  ✓ ${src.id}: ${bars}-bar loop @ ${src.bpm} BPM (${loopSec.toFixed(3)} s) → ${output}`);
  return true;
}

function conformSfx(sfx) {
  let made = 0;
  for (let n = 1; n <= sfx.variants; n++) {
    const input = resolve(ROOT, `audio-src/flagship/sfx/${sfx.id}_${n}.wav`);
    if (!existsSync(input)) continue;
    const output = resolve(OUT_SFX, `${sfx.id}_${n}.wav`);
    mkdirSync(dirname(output), { recursive: true });
    run('ffmpeg', [
      '-hide_banner', '-y', '-i', input,
      '-af', `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11,aresample=48000`,
      '-ar', '48000', '-c:a', 'pcm_s16le', output,
    ]);
    made++;
  }
  if (made) console.log(`  ✓ ${sfx.id}: normalised ${made} variant(s)`);
  return made;
}

function main() {
  if (!existsSync(LOOPS)) die(`missing curator record: ${LOOPS}`);
  const { sources = [], sfx = [] } = JSON.parse(readFileSync(LOOPS, 'utf8'));
  const stretchFilter = hasFilter('rubberband') ? 'rubberband' : 'atempo';

  console.log('Conforming flagship music (loop-prep):');
  let music = 0;
  for (const src of sources) if (conformMusic(src, stretchFilter)) music++;
  console.log('Normalising flagship SFX:');
  let voices = 0;
  for (const s of sfx) voices += conformSfx(s);

  console.log(`\nConform done: ${music}/${sources.length} music sources, ${voices} SFX variants.`);
  if (music === 0 && voices === 0) {
    console.log('Nothing curated yet — fill audio-src/flagship/loops.json sourceWav paths (Task 3).');
  }
}

main();
