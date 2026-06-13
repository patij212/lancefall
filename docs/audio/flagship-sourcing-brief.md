# Flagship Audio Sourcing Brief

**Goal:** acquire free, commercially-licensed source material for the AURORA arena suite, the WARDEN
boss suite, and the core combat SFX — vetted by the provenance gate (`src/audioProvenance.ts`).

## License policy (enforced by the validator)
- **Allowed:** `CC0`, `CC-BY` (with a credits line), `pixabay`, `royalty-free` game/media licenses.
- **Rejected:** `CC-BY-NC` (non-commercial — the game monetises), `CC-BY-SA` / `GPL` (share-alike is viral),
  `ai-generated` (contested commercial rights), `unknown`/unlicensed.
- Every committed asset under `public/audio/flagship/` needs an entry in `provenance.json`
  (`asset, source, url, license, author` + `attribution` for CC-BY).

## Music — candidate pools (prefer Pixabay/CC0 to minimise attribution)
- **Pixabay Music** — Pixabay License, commercial OK, *no attribution required*. Has synthwave/electronic.
- **Kevin MacLeod / incompetech.com** — CC-BY 4.0; large synth/electronic catalogue (needs a credit line).
- **Eric Matyas / soundimage.org** — CC-BY; big sci-fi/synth/ambient library.
- **OpenGameArt.org**, **Free Music Archive** — filter strictly to CC0/CC-BY (skip NC/SA).

### Curation rules (Deep Dive C)
- **Share BPM + key within a suite.** AURORA's `verse/build/chorus/drop` should be loop regions of ONE
  song (or a same-BPM/key family); the WARDEN suite may sit at a different BPM (a deliberate boss
  gear-change) but keep all arena↔boss BPMs within ~100–128.
- Pick tracks with an obvious **sustained groove/chorus section** that loops cleanly.
- Record each pick's `bpm`, `key`, and a bar-aligned loop region in `audio-src/flagship/loops.json`.

## SFX — the cheapest, highest-ROI win (covers the whole §10 vocabulary, legally, for free)
- **Sonniss GDC Game Audio Bundle** — annual free download, royalty-free for games, pro quality.
- **freesound.org** — filter to **CC0** (and CC-BY with credit). Excellent for one-shots/impacts.

Map the manifest's SFX ids (`dash_fire`, `perfect_dash`, `lance_hit`, `overdrive`, `last_breath`,
`warden_arrival`, `warden_phase`, `warden_fan`, `warden_defeat`) to vetted samples; record each in
`provenance.json`.
