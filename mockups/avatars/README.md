# Locked avatar prototypes

The **exact, approved** SVG medallions produced during design — the fidelity gold standard for the
24-avatar set. Open `index.html` in a browser to view them animated (or open any `.svg` directly).

These are the literal source to **port verbatim** when building `src/render/avatars/scenes/*` — they
are the "use the exact ones I made" reference, not throwaway mockups.

| File | Sigils captured | Tier(s) | Signature motion |
|------|-----------------|---------|------------------|
| `lance-full-scene.svg` | THE LANCE (final, field-filled, lance-not-sword) | I | strike + reticle + impact flash |
| `sigil-heroes-crown-coherence.svg` | THE FALLEN CROWN · COHERENCE | III · I | shatter · resonance |
| `sigil-motion-lance-hollow.svg` | THE LANCE · THE HOLLOW | I · II | strike · implode |
| `tier-ladder-warden.svg` | COHERENCE · THE WARDEN'S SEAL · THE FALLEN CROWN | I · II · III | resonance · gate · shatter |

Coverage: every unique sigil designed so far (lance, coherence, crown, hollow, warden) at its best
version. Earlier rougher drafts were superseded and not kept.

## Notes for porting
- Coordinate system, shared `<defs>`, the tiered `frame()`, and motion recipes are documented in
  `../../docs/superpowers/specs/2026-06-20-avatars-reference-prototypes.md`.
- These previews use **fixed** `id`s (e.g. `bzC`, `hx`). When porting into the game registry, every
  `id`/`url(#…)` MUST be **uid-namespaced** so multiple medallions on the picker grid don't collide.
- The medallion is drawn in a local centred coordinate system; the previews wrap it in
  `translate(cx,cy) scale(s)`. The real `renderAvatar()` does the same + emits the root `<svg>`.
