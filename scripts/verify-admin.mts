/**
 * The pure parts of the admin's bulk actions.
 *
 * No database and no browser: these decide how a long run is broken up, what
 * the bar says while it goes, and how three hundred identical refusals are
 * put on screen so a person can read them. Each one has been wrong once.
 */
import { chunk } from '../src/lib/utils/chunk';
import { csvCell, csvFilename, toCsv } from '../src/lib/admin/export-csv';
import { pageWindow, paginate } from '../src/lib/admin/paging';
import {
  MIN_TABLE_HEIGHT,
  TABLE_BOTTOM_GAP,
  clampTableHeight,
  fitTableHeight,
} from '../src/lib/admin/table-height';
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
const yes = (label: string, actual: boolean) =>
  actual ? ok(label) : bad(label, 'expected it to hold, and it did not');
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

console.log('\n--- the export is a file a spreadsheet can read ---');
{
  // Publisher notes were written by a person in an email, so every one of
  // these turns up: commas shift the later columns, an unescaped quote ends
  // the cell early, and a newline becomes a new row.
  is('a plain value is left alone', csvCell('casinoguru.co.uk'), 'casinoguru.co.uk');
  is('a comma forces quotes', csvCell('Berlin, Germany'), '"Berlin, Germany"');
  is('a quote is doubled inside them', csvCell('the "best" sites'), '"the ""best"" sites"');
  is('a newline forces them too', csvCell('line one\nline two'), '"line one\nline two"');
  is('nothing is an empty cell, not the word null', csvCell(null), '');
  is('and zero is zero, not empty', csvCell(0), '0');

  /*
    The one that is a security question rather than a formatting one.

    Every text column here came from a stranger - publisher names, titles and
    notes read out of their replies - and a spreadsheet evaluates a cell that
    begins with =, +, - or @. `=HYPERLINK(...)` in a publisher's name is a
    link somebody's Excel offers to follow, and worse is possible.
  */
  is('a formula is defused', csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  is('and so is a plus', csvCell('+1 555 0100'), "'+1 555 0100");
  is('and a minus', csvCell('-50% for bulk'), "'-50% for bulk");
  is('and an at sign', csvCell('@everyone'), "'@everyone");
  // A negative number would be defused too, which is why money is written as
  // a string of major units and losses are not exported as bare negatives.
  is('the apostrophe goes inside the quotes', csvCell('=a,b'), `"'=a,b"`);

  const csv = toCsv(
    [{ domain: 'a.com', note: 'has, a comma' }, { domain: 'b.com', note: '' }],
    [
      { header: 'Domain', value: (row) => row.domain },
      { header: 'Note', value: (row) => row.note },
    ],
  );
  is('the header comes first', csv.split('\r\n')[0], 'Domain,Note');
  is('one line per row, plus a trailing break', csv.split('\r\n').length, 4);
  // RFC 4180, and what stops Excel on Windows reading a multi-line cell as
  // several rows.
  is('lines end CRLF', csv.includes('\r\n'), true);
  has('and a comma inside a cell survives', csv, '"has, a comma"');

  is('an empty selection still has its header', toCsv([], [{ header: 'Domain', value: () => '' }]), 'Domain\r\n');

  has('the filename carries the date', csvFilename('websites', new Date('2026-09-29T11:00:00Z')), 'websites-2026-09-29.csv');
}

console.log('\n--- a long table, a page at a time ---');
{
  const rows = Array.from({ length: 950 }, (_, at) => at + 1);

  const first = paginate(rows, 1, 50);
  is('the first page holds a page', first.rows.length, 50);
  is('starting at the first row', first.rows[0], 1);
  is('numbered from one, not zero', first.from, 1);
  is('and says where it ends', first.to, 50);
  is('950 rows at 50 a page is 19 pages', first.pages, 19);

  const last = paginate(rows, 19, 50);
  is('the last page holds the remainder', last.rows.length, 50);
  is('and ends on the last row', last.to, 950);

  /*
    The clamp is the part that matters.

    A filter that shrinks the list leaves the page number where it was, and
    page 12 of a three-page list is an empty table with no way back - which
    reads as "no results" for a filter that matched plenty.
  */
  const past = paginate(rows.slice(0, 60), 12, 50);
  is('a page past the end comes back to the last one', past.page, 2);
  is('with rows on it', past.rows.length, 10);

  is('a page before the first is the first', paginate(rows, 0, 50).page, 1);
  is('and so is a nonsense one', paginate(rows, Number.NaN, 50).page, 1);

  // "All" is a real answer, and the one somebody picks before selecting
  // everything to act on it.
  const all = paginate(rows, 1, 0);
  is('all of them is one page', all.pages, 1);
  is('holding all of them', all.rows.length, 950);

  const none = paginate([], 1, 50);
  is('an empty list is one page', none.pages, 1);
  is('and starts at nothing rather than at one', none.from, 0);
}

console.log('\n--- the page numbers somebody can actually use ---');
{
  is('one page needs no navigation', pageWindow(1, 1).join(','), '1');
  is('a handful is printed in full', pageWindow(2, 4).join(','), '1,2,3,4');

  // First, last, and a window around where you are. Nineteen numbers in a row
  // is not navigation.
  is('the middle of a long list gets gaps', pageWindow(10, 19).join(','), '1,,9,10,11,,19');
  is('the start of one does not need the left gap', pageWindow(2, 19).join(','), '1,2,3,,19');
  is('nor the end the right', pageWindow(18, 19).join(','), '1,,17,18,19');

  // An ellipsis standing in for one page is wider than the page it hides.
  is('a single skipped page is printed, not hidden', pageWindow(4, 6).join(','), '1,2,3,4,5,6');
}

console.log('\n--- how tall the table is allowed to get ---');
{
  // The default suits a laptop and wastes most of a large screen, so the
  // bottom edge is draggable and where it was put is remembered. What is
  // remembered is a pixel count, and the screen it comes back on is not
  // necessarily the screen it was set on.
  const laptop = 800;

  is('a height that fits is left alone', clampTableHeight(600, laptop), 600);
  is(
    'one saved on a bigger screen comes back fitting this one',
    clampTableHeight(1400, laptop),
    laptop - TABLE_BOTTOM_GAP,
  );
  is('dragged up past the top, it stops at a few rows', clampTableHeight(40, laptop), MIN_TABLE_HEIGHT);
  is('and a negative drag is the same', clampTableHeight(-500, laptop), MIN_TABLE_HEIGHT);

  // A box taller than the screen scrolls the page to show its bottom edge,
  // which puts the sticky header off the top - the table loses the thing the
  // extra height was for.
  yes('never taller than the screen it is on', clampTableHeight(5000, laptop) <= laptop);

  // Nonsense out of localStorage is a height, not a crash.
  is('a stored nonsense height falls back', clampTableHeight(Number.NaN, laptop), MIN_TABLE_HEIGHT);

  // A screen too short for the minimum still gets the minimum. Rendering a
  // box of no height is not the better answer.
  is('a tiny viewport gets the minimum anyway', clampTableHeight(400, 150), MIN_TABLE_HEIGHT);
}

console.log('\n--- double-clicking the grip fills the screen ---');
{
  const laptop = 900;

  is('from 300px down the page', fitTableHeight(300, laptop), 900 - 300 - TABLE_BOTTOM_GAP);
  yes(
    'the bottom edge lands on the bottom of the screen',
    fitTableHeight(300, laptop) + 300 + TABLE_BOTTOM_GAP === laptop,
  );

  // Scrolled past the top of the table, its top is negative. That is a
  // position, and what comes back has to be a height.
  yes(
    'scrolled past the top, it still fits the screen',
    fitTableHeight(-400, laptop) <= laptop - TABLE_BOTTOM_GAP,
  );

  // Scrolled so far that the table is off the bottom, there is no room left.
  is('no room left still gives a usable box', fitTableHeight(laptop, laptop), MIN_TABLE_HEIGHT);
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
