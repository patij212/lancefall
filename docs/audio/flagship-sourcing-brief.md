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

---

# Concrete Shortlist (Task 3 turnkey) — researched 2026-06-13

> All picks below were checked for a **policy-allowed** license. **Plain CC-BY = looping/trimming
> OK** (our conform step makes a derivative) — but **CC-BY-ND and CC-BY-SA are REJECTED** (ND forbids
> the loop edit; SA is viral). The `license` column maps to the `AudioLicense` enum the gate enforces.
> Audition first — BPM is listed but **musical-key data is rarely published**, so confirm the key by
> ear (or just set `loops.json` `key` to what you measure; the engine is key-agnostic at runtime).

## License → enum → obligation
| Source family | `AudioLicense` enum | Attribution? | Credits screen? |
|---|---|---|---|
| Pixabay Music / SFX | `pixabay` | No | No |
| Kenney (kenney.nl) | `CC0` | No | No |
| freesound.org (CC0 filter) | `CC0` | No | No |
| Sonniss #GameAudioGDC bundle | `royalty-free` | No | No (can't redistribute as a standalone sound library; embedding in the game is fine) |
| free-stock-music.com / incompetech (plain **CC BY**) | `CC-BY` | **Yes** | **Yes** (in-game credits) |

## AURORA arena suite — pick ONE of these two strategies
Deep Dive C wants `verse/build/chorus/drop` to **share BPM + key**. Two clean ways:

**A. Same-artist family @ ~105 BPM (recommended — 4 distinct, already-coherent tracks).**
FSM Team & `< e s c p >`, all **CC BY 4.0**, on <https://www.free-stock-music.com/synthwave.html>:

| Manifest source | Track | BPM | License |
|---|---|---|---|
| `aurora_verse`  | Neonscapes         | 105 | CC-BY |
| `aurora_build`  | Parallel Synthesis | 105 | CC-BY |
| `aurora_chorus` | Magenta Metropolis | 107 | CC-BY |
| `aurora_drop`   | Synthetic          | 105 | CC-BY |

→ then set **all four** `loops.json` + manifest `bpm` to a shared value (105) and a shared loop key.
(The manifest currently says 112 — update it; the beat grid adapts, Deep Dive A.)

**B. One song, four loop regions (most cohesive if the song has 4 clear sections).**
- **Calm System** — Schematist — **114 BPM** — CC BY 3.0 (mellow → great verse/build base), or
- **Cyberpunk Renaissance** — Punch Deck — **110 BPM** — CC BY 3.0 (driving → great chorus/drop).
Carve `verse/build/chorus/drop` as four bar-aligned regions of the single track in `loops.json`.

**No-attribution alternative:** browse <https://pixabay.com/music/search/synthwave/> (Pixabay License,
commercial OK, **no credits screen needed**) and pick one synthwave track; measure its BPM for `loops.json`.

## WARDEN boss suite — a deliberate gear-change (keep BPM in 100–128)
- **Cyberpunk Renaissance** — Punch Deck — **110 BPM** — CC BY 3.0 — driving/darker; ideal WARDEN if AURORA
  uses strategy A. Use 3 loop regions for `warden_spiral` / `warden_fan` / `warden_enraged` (rising menace).
- Alt darker/tenser: **Quasarise** — FSM Team — 104 — CC BY 4.0.
- Set WARDEN `bpm` in `loops.json` + manifest to the chosen track (e.g. 110; currently 100).
- ⚠️ Karl Casey / White Bat Audio is tempting for boss darksynth but his terms are "free to use with
  credit" — **not a clean CC license**; treat as `unknown` and REJECT unless he states explicit CC-BY.

**Rejected (do NOT use — policy):** *Miami Life* (CC BY-SA), *80s Love* (CC BY-ND),
*Neon Drive* / Ghostrifter (CC BY-ND) — the share-alike / no-derivatives terms fail the gate.

## SFX — CC0-first (covers all 9 ids with no attribution)
Prefer **Kenney** (CC0, batch-download) + **Sonniss** (royalty-free) + **freesound CC0 filter**:

| SFX id | Character needed | Best free source |
|---|---|---|
| `dash_fire`     | short whoosh        | freesound CC0 "whoosh"; Sonniss whooshes |
| `perfect_dash`  | tight on-grid tick  | **Kenney Interface Sounds** (CC0) — a sharp confirm/click |
| `lance_hit`     | impact / stab       | **Kenney Impact Sounds** (CC0, 130 files) |
| `overdrive`     | riser → big hit     | Sonniss risers + impact; freesound CC0 riser |
| `last_breath`   | deep heartbeat/swell| freesound CC0 sub-boom / reverse-swell |
| `warden_arrival`| boss impact/horn    | **Kenney Sci-fi Sounds** (CC0); Sonniss cinematic hit |
| `warden_phase`  | tonal stinger       | Kenney Sci-fi / Interface (CC0) |
| `warden_fan`    | mechanical swirl    | Kenney Sci-fi (CC0); Sonniss |
| `warden_defeat` | triumphant collapse | Sonniss; freesound CC0 |

Kenney packs (all CC0, no attribution): Impact <https://kenney.nl/assets/impact-sounds> ·
Sci-fi <https://kenney.nl/assets/sci-fi-sounds> · Interface <https://kenney.nl/assets/interface-sounds>.
Sonniss bundle: <https://gdc.sonniss.com/>. freesound (set the licence filter to **CC0**): <https://freesound.org/>.

## After you download
1. Drop masters in `audio-src/flagship/` (music) and `audio-src/flagship/sfx/<id>_<n>.wav` (SFX).
2. Fill `audio-src/flagship/loops.json` (`sourceWav`, real `bpm`/`key`, `loopStartBar`/`loopEndBar`,
   `crossfadeMs`) and update the per-source `bpm`/`key` in `src/audioManifest.ts` to match your picks.
3. Add a `provenance.json` entry per asset (`asset, source, url, license, author` + `attribution` for CC-BY).
4. `npm run audio:conform && npm run audio:encode && npm run audio:validate` — the gate must pass.
5. Ping me to wire the engine into the live game (Tasks 10–13) and run the listening A/B + soak.

**Sources:** [free-stock-music synthwave](https://www.free-stock-music.com/synthwave.html) ·
[Pixabay synthwave](https://pixabay.com/music/search/synthwave/) ·
[Kenney audio](https://kenney.nl/assets/category:Audio) ·
[Sonniss #GameAudioGDC](https://gdc.sonniss.com/) · [freesound](https://freesound.org/).
