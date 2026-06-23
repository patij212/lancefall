// Mobile field-of-view. A phone's landscape viewport is short, and the arena == the viewport,
// so the play space feels heavily zoomed-in. We render the world at a LARGER logical size and let
// the browser downscale the canvas to the real viewport — showing more of the arena. Pure so the
// zoom curve is unit-tested; the world/logical size is then viewport / zoom.

const TARGET_VIEW_H = 640; // the visible world height we aim for on a phone (world units)
const MIN_ZOOM = 0.58; // never zoom out past this (keeps entities readable on a small screen)

/** Render/world zoom for a mobile viewport height: 1 when the screen is already tall enough
 *  (tablets / big phones), shrinking toward MIN_ZOOM on short landscape phones. The world and the
 *  renderer's logical size become `viewportDimension / zoom`, then the canvas is CSS-downscaled
 *  back to the real viewport. Desktop never calls this (it stays at zoom 1). */
export function mobileViewZoom(viewportH: number): number {
  if (!(viewportH > 0)) return 1; // bad input → no zoom change
  if (viewportH >= TARGET_VIEW_H) return 1; // already roomy enough
  return Math.max(MIN_ZOOM, viewportH / TARGET_VIEW_H);
}
