/**
 * How tall an admin table is allowed to get.
 *
 * Its own file because the arithmetic is the part that can be wrong. A height
 * saved on a 27-inch monitor and restored on a laptop is taller than the
 * screen, and a box taller than the screen scrolls the page to show its
 * bottom edge - which puts the sticky header off the top, so the table loses
 * the very thing the height was increased to make use of.
 */

/** Below this the box holds too few rows to be worth scrolling inside. */
export const MIN_TABLE_HEIGHT = 220;

/** Left below the box, so its bottom edge and the grip stay on screen. */
export const TABLE_BOTTOM_GAP = 24;

/** One keyboard press on the grip, about two rows. */
export const TABLE_HEIGHT_STEP = 96;

/**
 * A height that fits on this screen: never shorter than a few rows, never
 * taller than the viewport it has to sit in.
 *
 * A viewport shorter than the minimum wins on the minimum rather than
 * returning something negative - a phone in landscape is not a reason to
 * render a box of no height.
 */
export function clampTableHeight(height: number, viewport: number): number {
  if (!Number.isFinite(height)) return MIN_TABLE_HEIGHT;
  const ceiling = Math.max(viewport - TABLE_BOTTOM_GAP, MIN_TABLE_HEIGHT);
  return Math.round(Math.min(Math.max(height, MIN_TABLE_HEIGHT), ceiling));
}

/**
 * The height that reaches the bottom of the screen from where the table
 * starts - what double-clicking the grip is aiming at.
 *
 * `top` is the box's distance from the top of the viewport, which is negative
 * when the page has been scrolled past it. The clamp handles that: the answer
 * is a height, not a position.
 */
export function fitTableHeight(top: number, viewport: number): number {
  return clampTableHeight(viewport - top - TABLE_BOTTOM_GAP, viewport);
}
