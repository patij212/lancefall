# Flagship Audio Credits

Every shipped asset under `public/audio/flagship/` is free-licensed and recorded in
`public/audio/flagship/provenance.json`. The **CC-BY** music below **requires attribution** — these
lines must appear on the in-game credits screen before the flagship audio ships (Task 12/13).

## Music — CC BY 3.0 (attribution required)

- **AURORA arena** (`aurora_verse` / `aurora_build` / `aurora_chorus` / `aurora_drop`) — four loop
  regions of **"Calm System" by Schematist**, 114 BPM.
  Source: <https://www.free-stock-music.com/schematist-calm-system.html> — licensed under
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

- **WARDEN boss** (`warden_spiral` / `warden_fan` / `warden_enraged`) — three loop regions of
  **"Cyberpunk Renaissance" by Punch Deck**, 110 BPM.
  Source: <https://www.free-stock-music.com/punch-deck-cyberpunk-renaissance.html> — licensed under
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

Both tracks were trimmed to bar-aligned loop regions and loudness-normalised by
`tools/audio/conform-flagship.mjs` (CC BY permits derivatives). The procedural **LANCE THEME** motif
and beat layer remain original to LANCEFALL.

## SFX — CC0 (no attribution required)

All combat/boss SFX are from **Kenney** (<https://kenney.nl>), licensed
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain, crediting optional.
We credit them gratefully anyway:

| SFX ids | Kenney pack |
|---|---|
| `lance_hit` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `perfect_dash` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `dash_fire`, `overdrive`, `last_breath`, `warden_arrival`, `warden_phase`, `warden_fan`, `warden_defeat` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |

> These are auto-selected first-pass picks (scaled to each cue's role). Swapping any one is a single
> file under `audio-src/flagship/sfx/` + a re-run of `npm run audio:conform && audio:encode`.
