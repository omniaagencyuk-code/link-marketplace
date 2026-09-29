/**
 * Break a list into pieces small enough for one request.
 *
 * Bulk actions in the admin walk their ids one at a time, and each one is
 * several database round trips. Three hundred of them in a single request
 * runs past the function ceiling: the work happens, the answer never comes
 * back, and the page sits there until somebody reloads it. Sending them in
 * pieces makes every request short enough to return - and gives the browser
 * something true to put on a progress bar.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('A chunk has to hold at least one item.');
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}
