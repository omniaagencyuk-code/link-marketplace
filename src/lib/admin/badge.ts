/**
 * What a count looks like in the sidebar.
 *
 * Its own function, and tested, because the rule has an edge the eye slides
 * past: "anything over ten" means eleven, so ten shows as ten. A cap written
 * inline as `count >= CAP` reads the same and is wrong by one, and the
 * difference only shows on the one day somebody has exactly ten things
 * waiting.
 *
 * Zero returns null rather than "0": a badge saying nothing is waiting is a
 * badge drawing the eye to say there is nothing to see.
 */

/** Above this, the badge stops counting and says so. */
export const BADGE_CAP = 10;

export function badgeLabel(count: number): string | null {
  // Not `!count`: a negative is a bug upstream, and rendering "-3" in a red
  // circle is a louder way to find out than quietly showing nothing.
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > BADGE_CAP ? `${BADGE_CAP}+` : String(Math.floor(count));
}
