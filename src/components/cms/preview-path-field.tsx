'use client';

import { usePathname } from 'next/navigation';

/**
 * The page to come back to after leaving preview.
 *
 * A client component for one reason: a layout is not told its own pathname,
 * and the alternatives are worse. Reading `headers()` would make every
 * marketing page dynamic for everybody, and trusting the `Referer` of the
 * action's own POST is a guess dressed as a value.
 *
 * It costs nothing to render: the banner around it only exists while draft
 * mode is on, so no visitor's page ever references this chunk.
 */
export function PreviewPathField() {
  return <input type="hidden" name="path" value={usePathname()} />;
}
