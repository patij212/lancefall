// Shared DOM helpers for the cockpit UI + its panel modules. Dependency-free so both
// ui.ts and every src/panels/*.ts can import it with no circular-import risk. These were
// module-level in ui.ts; extracting them is the foundation for splitting the monolith into
// per-panel builders without each module re-declaring its own element factory.

/** Terse element factory: `el('div', { class: 'x' }, child, 'text')`. The one `class`
 *  attr maps to className; everything else is setAttribute; string children become text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

/** Build an element from a raw inline-SVG (or any) markup string. Used for the cockpit's
 *  decorative mode/nav icons (lifted verbatim from the mock) so we don't re-author every
 *  path by hand. The markup is author-controlled (never user input), so innerHTML is safe. */
export function iconEl(cls: string, markup: string): HTMLElement {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = markup;
  return span;
}

/** A labelled stat cell (value over label) — the debrief/game-over `.go-stat`, reused by
 *  the STATS dossier hero so the two share one look. */
export function stat(label: string, value: string): HTMLElement {
  return el('div', { class: 'go-stat' }, el('span', { class: 'go-stat-v' }, value), el('span', { class: 'go-stat-l' }, label));
}

/** Per-container key→node map. WeakMap so it's GC'd with the container and never pollutes
 *  the element. */
const RKEYS = new WeakMap<HTMLElement, Map<string, HTMLElement>>();

/** Keyed list reconciler — the foundation for morph-in-place UI. Instead of wiping a
 *  container and rebuilding (replaceChildren), this reuses each child by key: existing nodes
 *  are updated in place (so CSS transitions fire, focus/scroll/canvas survive), new keys are
 *  created, gone keys are removed, and order is fixed with minimal moves.
 *
 *  CONTRACT: `container` holds only reconcile-managed children (no mixed-in text/other
 *  nodes). `keyFn` returns a unique, stable key per item. `createFn` attaches event listeners
 *  ONCE. `updateFn` is idempotent — it applies the desired class/text/attr state on every
 *  call (read live state there, not in a create-time closure). */
export function reconcile<T>(
  container: HTMLElement,
  items: readonly T[],
  keyFn: (item: T, index: number) => string,
  createFn: (item: T, index: number) => HTMLElement,
  updateFn: (node: HTMLElement, item: T, index: number) => void,
): void {
  let prev = RKEYS.get(container);
  if (!prev) { prev = new Map(); RKEYS.set(container, prev); }
  const next = new Map<string, HTMLElement>();
  let i = 0;
  for (const item of items) {
    const key = keyFn(item, i);
    if (next.has(key)) throw new Error(`reconcile: duplicate key "${key}"`);
    let node = prev.get(key);
    if (!node) node = createFn(item, i);
    updateFn(node, item, i);
    // place node at slot i (insertBefore moves it if it's elsewhere; appends if new)
    const atPos = container.childNodes[i] ?? null;
    if (atPos !== node) container.insertBefore(node, atPos);
    next.set(key, node);
    i++;
  }
  for (const [key, node] of prev) if (!next.has(key)) node.remove();
  RKEYS.set(container, next);
}
