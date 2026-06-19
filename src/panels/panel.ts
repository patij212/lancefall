import type { SaveData } from '../save';

/** A self-contained cockpit modal panel: its root `.screen-modal` element plus an `open(save)`
 *  that (re)renders its body from the current save. The owning `UI` keeps the modal *lifecycle* —
 *  show/hide, the focus-trap, the Esc/Tab contract — while each panel owns only its own *content*.
 *
 *  This is the seam for splitting the `ui.ts` monolith one panel at a time: a panel module exports
 *  a `build<Name>Panel(deps)` factory that returns a `Panel`, the `UI` builds it once and stores
 *  `panel.root`, and the matching `open<Name>()` method delegates to `panel.open(save)`. Extracted
 *  panels become unit-testable in isolation (render DOM in, assert DOM out) — see `*.test.ts`. */
export interface Panel {
  /** the `.screen-modal` root the UI registers with its modal stack + focus-trap. */
  readonly root: HTMLElement;
  /** (re)render the panel body for the given save; safe to call repeatedly (rebuilds in place). */
  open(save: SaveData): void;
}
