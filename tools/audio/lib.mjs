// tools/audio/lib.mjs — pure decision logic for the flagship audio pipeline (conform / encode /
// validate). NO fs, NO child_process here: every function is a referentially-transparent helper so
// the build gate is unit-tested (tools/audio/lib.test.mjs) and the three *.mjs scripts stay thin
// I/O shells around it. Loop-prep math follows Deep Dive C; the license set mirrors
// src/audioProvenance.ts (kept in sync by hand — this is build tooling, not runtime).

const BEATS_PER_BAR = 4;

/** Seconds in one 4/4 bar at `bpm`. */
export function barSeconds(bpm) {
  return (60 / bpm) * BEATS_PER_BAR;
}

/** Seconds in an integer-bar loop. */
export function loopSeconds(bpm, bars) {
  return barSeconds(bpm) * bars;
}

/** The whole-bar count a measured loop length rounds to. */
export function nearestBars(loopSec, bpm) {
  return Math.round(loopSec / barSeconds(bpm));
}

/** True when `loopSec` is a whole number of bars at `bpm`, within `tolMs` milliseconds. */
export function isIntegerBarLoop(loopSec, bpm, tolMs = 10) {
  const bars = nearestBars(loopSec, bpm);
  if (bars < 1) return false;
  const ideal = loopSeconds(bpm, bars);
  return Math.abs(loopSec - ideal) <= tolMs / 1000;
}

/** Equal-power (constant-energy) crossfade gains at position `t` in [0,1]:
 *  `a` fades the outgoing tail out, `b` fades the incoming head in; a²+b²=1. */
export function equalPowerGains(t) {
  const x = Math.min(1, Math.max(0, t));
  return { a: Math.cos((x * Math.PI) / 2), b: Math.sin((x * Math.PI) / 2) };
}

/** Index of the nearest sign-change edge to `target` within ±`window` samples, else `target`.
 *  A "crossing edge" is index i where sign(s[i]) !== sign(s[i+1]) (or s[i] is exactly 0). */
export function snapToZeroCrossing(samples, target, window) {
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const isEdge = (i) => i >= 0 && i + 1 < samples.length && (samples[i] === 0 || sign(samples[i]) !== sign(samples[i + 1]));
  for (let d = 0; d <= window; d++) {
    if (isEdge(target - d)) return target - d;
    if (isEdge(target + d)) return target + d;
  }
  return target;
}

/** FFmpeg args: WAV → 48 kHz Opus(.ogg) at 112 kbps. */
export function opusArgs(input, output, { bitrate = '112k', sampleRate = '48000' } = {}) {
  return ['-i', input, '-c:a', 'libopus', '-b:a', bitrate, '-ar', sampleRate, '-vn', output];
}

/** FFmpeg args: WAV → 48 kHz MP3(.mp3) at 160 kbps. */
export function mp3Args(input, output, { bitrate = '160k', sampleRate = '48000' } = {}) {
  return ['-i', input, '-c:a', 'libmp3lame', '-b:a', bitrate, '-ar', sampleRate, '-vn', output];
}

// Mirror of src/audioProvenance.ts ALLOWED — keep in lock-step by hand.
export const ALLOWED_AUDIO_LICENSES = new Set(['CC0', 'CC-BY', 'pixabay', 'royalty-free']);
export const isAudioLicenseAllowed = (license) => ALLOWED_AUDIO_LICENSES.has(license);

/** Runtime asset paths the validator expects on disk: one file per (source, track, codec). */
export function expectedRuntimePaths(sources, { dir = 'public/audio/flagship', codecs = ['ogg', 'mp3'] } = {}) {
  const paths = [];
  for (const src of sources) {
    for (const track of src.tracks ?? ['main']) {
      for (const codec of codecs) paths.push(`${dir}/${src.id}/${track}.${codec}`);
    }
  }
  return paths;
}

/** Runtime SFX paths: numbered `${id}_${n}` variants (1-based) per codec. */
export function expectedSfxPaths(sfx, { dir = 'public/audio/flagship/sfx', codecs = ['ogg', 'mp3'] } = {}) {
  const paths = [];
  for (const s of sfx) {
    for (let n = 1; n <= s.variants; n++) {
      for (const codec of codecs) paths.push(`${dir}/${s.id}_${n}.${codec}`);
    }
  }
  return paths;
}

/** The subset of `paths` for which `existsFn(path)` is falsy. */
export function findMissing(paths, existsFn) {
  return paths.filter((p) => !existsFn(p));
}

const MAX_RUNTIME_BYTES = 8 * 1024 * 1024;

/** The build gate: returns one human-readable error per failed check (empty ⇒ pass).
 *  Each record is a probed source: { id, suite, bpm, key, layering, trackDurations:{key:sec},
 *  loopSeconds, sampleRate, license, hasProvenance, bytes }. */
export function validateManifestAssets(records, opts = {}) {
  const durationToleranceMs = opts.durationToleranceMs ?? 1;
  const loopToleranceMs = opts.loopToleranceMs ?? 10;
  const maxBytes = opts.maxBytes ?? MAX_RUNTIME_BYTES;
  const errors = [];

  for (const r of records) {
    if (r.sampleRate !== 48000) {
      errors.push(`${r.id}: sample rate ${r.sampleRate} ≠ 48000 Hz`);
    }

    const durations = Object.values(r.trackDurations ?? {});
    if (durations.length > 1) {
      const spreadMs = (Math.max(...durations) - Math.min(...durations)) * 1000;
      if (spreadMs > durationToleranceMs) {
        errors.push(`${r.id}: track durations differ by ${spreadMs.toFixed(2)} ms (> ${durationToleranceMs} ms)`);
      }
    }

    if (!isIntegerBarLoop(r.loopSeconds, r.bpm, loopToleranceMs)) {
      errors.push(
        `${r.id}: loop length ${r.loopSeconds.toFixed(4)} s is not an integer number of bars at ${r.bpm} BPM (±${loopToleranceMs} ms)`,
      );
    }

    if (!isAudioLicenseAllowed(r.license)) {
      errors.push(`${r.id}: rejected license "${r.license}" (allowed: ${[...ALLOWED_AUDIO_LICENSES].join('/')})`);
    }

    if (!r.hasProvenance) {
      errors.push(`${r.id}: missing provenance entry`);
    }
  }

  // Deep Dive C: every source within a suite must share BPM and key.
  const bySuite = new Map();
  for (const r of records) {
    if (!bySuite.has(r.suite)) bySuite.set(r.suite, []);
    bySuite.get(r.suite).push(r);
  }
  for (const [suite, group] of bySuite) {
    const bpms = new Set(group.map((r) => r.bpm));
    const keys = new Set(group.map((r) => r.key));
    if (bpms.size > 1) errors.push(`suite "${suite}": sources disagree on BPM (${[...bpms].join(', ')})`);
    if (keys.size > 1) errors.push(`suite "${suite}": sources disagree on key (${[...keys].join(', ')})`);
  }

  const totalBytes = records.reduce((sum, r) => sum + (r.bytes ?? 0), 0);
  if (totalBytes > maxBytes) {
    errors.push(`runtime budget exceeded: ${(totalBytes / 1024 / 1024).toFixed(2)} MB > 8 MB`);
  }

  return errors;
}

/** The SFX half of the build gate: per-variant sample-rate + license + provenance (SFX are one-shots,
 *  so NO loop/bar check). Each record: { id, sampleRate, license, hasProvenance, bytes }. */
export function validateSfxAssets(records, opts = {}) {
  const errors = [];
  for (const r of records) {
    if (r.sampleRate !== 48000) errors.push(`sfx ${r.id}: sample rate ${r.sampleRate} ≠ 48000 Hz`);
    if (!isAudioLicenseAllowed(r.license)) {
      errors.push(`sfx ${r.id}: rejected license "${r.license}" (allowed: ${[...ALLOWED_AUDIO_LICENSES].join('/')})`);
    }
    if (!r.hasProvenance) errors.push(`sfx ${r.id}: missing provenance entry`);
  }
  return errors;
}

/** Exact-path provenance lookup (NOT substring — `warden_fan` exists as both a music source and an
 *  SFX id, so a substring match is order-dependent). Returns the entry or null. */
export function provenanceForAsset(entries, asset) {
  return entries.find((e) => e.asset === asset) ?? null;
}

/** A printable per-source duration / BPM / license table + byte total. */
export function durationTable(records) {
  const head = ['source', 'suite', 'bpm', 'loopSec', 'license', 'KB'];
  const rows = records.map((r) => [
    r.id,
    r.suite ?? '',
    String(r.bpm ?? ''),
    (r.loopSeconds ?? 0).toFixed(3),
    r.license ?? '',
    Math.round((r.bytes ?? 0) / 1024).toString(),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const fmt = (row) => row.map((cell, i) => cell.padEnd(widths[i])).join('  ');
  const totalKB = Math.round(records.reduce((s, r) => s + (r.bytes ?? 0), 0) / 1024);
  return [fmt(head), fmt(widths.map((w) => '-'.repeat(w))), ...rows.map(fmt), `total: ${totalKB} KB`].join('\n');
}
