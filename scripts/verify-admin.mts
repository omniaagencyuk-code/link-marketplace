/**
 * The pure parts of the admin's bulk actions.
 *
 * No database and no browser: these decide how a long run is broken up, what
 * the bar says while it goes, and how three hundred identical refusals are
 * put on screen so a person can read them. Each one has been wrong once.
 */
import { chunk } from '../src/lib/utils/chunk';
import {
  BULK_CHUNK_SIZE,
  bulkProgressPercent,
  bulkProgressText,
  groupSkipped,
  type SkippedRow,
} from '../src/lib/admin/bulk';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const has = (label: string, haystack: string, needle: string) =>
  haystack.includes(needle) ? ok(label) : bad(label, `missing ${JSON.stringify(needle)} in ${JSON.stringify(haystack)}`);

console.log('\n--- a long selection is broken up ---');
// Three hundred and twenty-five listings in one request is close to a
// thousand database round trips, made one after another. It ran past the
// function ceiling and answered nothing: the work happened, the page showed
// no count and no changed rows, and reloading by hand was the only way to
// find out.
{
  const ids = Array.from({ length: 325 }, (_, at) => `site-${at}`);
  const parts = chunk(ids, BULK_CHUNK_SIZE);

  is('325 listings go in 13 requests', parts.length, 13);
  is('none of them is oversized', parts.every((part) => part.length <= BULK_CHUNK_SIZE), true);
  is('every listing is sent exactly once', parts.flat().length, ids.length);
  is('and in order', parts.flat().join() === ids.join(), true);
  is('a remainder gets its own request', parts[12]?.length, 25);

  const ragged = chunk(ids.slice(0, 26), BULK_CHUNK_SIZE);
  is('even when it is a single item', ragged[1]?.length, 1);
  is('nothing selected is no requests', chunk([], BULK_CHUNK_SIZE).length, 0);

  let threw = false;
  try {
    chunk(ids, 0);
  } catch {
    threw = true;
  }
  // A size of zero loops forever rather than failing, which is the worst way
  // for this to be wrong: the page hangs and nothing says why.
  is('a chunk of nothing is refused', threw, true);
}

console.log('\n--- the bar and its label ---');
{
  is('an empty run is not NaN', bulkProgressPercent(0, 0), 0);
  is('half way is half full', bulkProgressPercent(50, 100), 50);
  is('and it never overflows', bulkProgressPercent(120, 100), 100);

  const running = bulkProgressText({
    done: 75, total: 325, changed: 75, skipped: [], verb: 'published', finished: false,
  });
  has('while it runs it says how far through', running, '75 of 325');

  const done = bulkProgressText({
    done: 325, total: 325, changed: 5, skipped: Array(320).fill({ domain: 'x.com', reason: 'no sell price' }),
    verb: 'published', finished: true,
  });
  // 5 published with 320 silent refusals behind it is worse than no count.
  has('what changed is stated', done, '5 websites published');
  has('and so is what did not', done, '320 skipped');
}

console.log('\n--- refusals are grouped, not listed ---');
// Every listing sourced from a publisher's email arrives unpriced on purpose,
// so the first bulk publish after a batch of approvals refuses all of them
// for the same reason. Three hundred identical lines is a wall nobody reads,
// and the one row that failed differently is lost in the middle of it.
{
  const skipped: SkippedRow[] = [
    ...Array.from({ length: 320 }, (_, at) => ({
      domain: `site-${at}.com`,
      reason: 'This listing has no sell price yet.',
    })),
    { domain: 'gone.com', reason: 'No longer exists.' },
    { domain: 'off.com', reason: 'Every placement is switched off.' },
  ];

  const groups = groupSkipped(skipped);
  is('one line per reason', groups.length, 3);
  is('the commonest comes first', groups[0]?.count, 320);
  has('and it says what it is', groups[0]?.reason ?? '', 'no sell price');
  is('a few examples are kept', groups[0]?.domains.length, 3);
  // The rare one is the actionable one, and it must not be lost.
  is('the one-off is still there', groups.some((group) => group.reason === 'No longer exists.'), true);
  is('every refusal is accounted for', groups.reduce((total, group) => total + group.count, 0), skipped.length);
  is('nothing to report is no groups', groupSkipped([]).length, 0);
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
