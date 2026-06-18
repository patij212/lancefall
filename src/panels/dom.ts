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
