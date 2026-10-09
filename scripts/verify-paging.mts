/**
 * Prove a full read returns the whole table, or throws.
 *
 * The bug this file guards against was on the screen for months and looked
 * like a working feature: the admin websites table read with `.limit(2000)`,
 * PostgREST answered with a thousand rows and no error of any kind, and the
 * corner of the page read "1000 websites" against a larger inventory. The
 * same truncation was hiding listings from buyers on the public marketplace,
 * miscounting the homepage niche cards, and - worst of the five - making the
 * CSV importer's duplicate check miss every domain past the thousandth, so a
 * re-import created a second listing instead of updating the first.
 *
 * A fake builder is the only way to test this honestly. Against a real
 * database the loop would pass whatever it did, because a thousand rows and
 * a truncated thousand rows look identical from the client. Here the server
 * cap is a variable and can be set smaller than the page asked for, which is
 * precisely the case a loop that advances by page size gets wrong.
 */
import { readAllPages } from '../src/lib/services/supabase/paged';
import {
  LISTINGS_PER_REQUEST,
  MOST_LISTINGS_PER_PAGE,
  listingIdsToFetch,
} from '../src/lib/dashboard/listing-batch';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);

/**
 * A table of `total` rows behind a server that never returns more than `cap`
 * of them at once, and says nothing when it truncates - which is the part
 * that makes this bug survive code review.
 */
function table(total: number, cap: number) {
  const rows = Array.from({ length: total }, (_, index) => ({ id: index }));
  const asked: [number, number][] = [];
  return {
    asked,
    read: (from: number, to: number) => {
      asked.push([from, to]);
      const wanted = rows.slice(from, to + 1);
      return Promise.resolve({ data: wanted.slice(0, cap), error: null });
    },
  };
}

console.log('\n--- every row, not the first page of them ---');
{
  const t = table(2_437, 1_000);
  const got = await readAllPages<{ id: number }>('the test table', t.read);
  is('a read past the server cap returns the whole table', got.length, 2_437);
  is('the first row is the first row', got[0]?.id, 0);
  is('and the last row is the last', got.at(-1)?.id, 2_436);
  is('no row arrives twice', new Set(got.map((r) => r.id)).size, 2_437);
}

console.log('\n--- it advances by what arrived, not by what it asked for ---');
{
  // The cap is below the page size, so a loop written as `from += PAGE`
  // would step over rows the server never sent. 37 is deliberately not a
  // divisor of anything here: an off-by-one in the stride shows up as a
  // missing row rather than as a lucky pass.
  const t = table(300, 37);
  const got = await readAllPages<{ id: number }>('a stingy server', t.read);
  is('a server returning fewer rows than asked for loses none', got.length, 300);
  is('and they are still in order with no gaps', got.every((row, index) => row.id === index), true);

  // Proving the mechanism, not just the result: the second request must
  // start where the first page ended, not one page after it began.
  is('the first request starts at nought', t.asked[0]?.[0], 0);
  is('the second starts at the end of what arrived', t.asked[1]?.[0], 37);
}

console.log('\n--- a short answer is never returned quietly ---');
{
  let threw = '';
  try {
    await readAllPages('the broken table', () =>
      Promise.resolve({ data: null, error: { message: 'connection reset' } }),
    );
  } catch (error) {
    threw = (error as Error).message;
  }
  is('an error throws rather than returning what it has', threw.includes('connection reset'), true);
  is('and names the read, so the log says which one', threw.includes('the broken table'), true);
}

{
  // An empty result is the loop's only exit, so it has to be an exit and not
  // a hang. A table that is genuinely empty returns an empty array.
  const got = await readAllPages('an empty table', () => Promise.resolve({ data: [], error: null }));
  is('an empty table is empty, not an error', got.length, 0);
}

{
  // The ceiling exists to stop a pathological loop, and throws rather than
  // returning what it has: a silent cap at a number we chose would be the
  // same bug as the one PostgREST was causing, with more patience.
  let threw = '';
  try {
    await readAllPages('an endless table', (from, to) =>
      Promise.resolve({
        data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })),
        error: null,
      }),
    );
  } catch (error) {
    threw = (error as Error).message;
  }
  is('a read that never ends throws', threw.includes('Refusing to keep reading'), true);
  is('rather than silently capping', threw.includes('an endless table'), true);
}

console.log('\n--- no full read in the repositories uses a bare limit ---');
{
  const { readFileSync } = await import('node:fs');

  /*
    Two rules here, and keeping them apart is the point.

    "Pages rather than capping" was written when every one of these reads
    walked the table, and it has now been the wrong assertion twice: once
    when `getPublicPreview` stopped paging because 0073 moved its sample and
    its counts into SQL, and again when `countByNiche` stopped because 0075
    moved its counting there. Both times the check failed while the code had
    got better, which is the kind of failure that teaches people to edit the
    check.

    What was ever at stake is narrower than paging. It is that no figure
    anybody reads is derived from however many rows the server felt like
    returning. A read that still walks the table has to page; a read that
    asks the database for the number does not need to, and must not count
    what it received.
  */

  // Reads that genuinely still carry the whole table back.
  const repo = readFileSync('src/lib/services/supabase/website-repository.ts', 'utf8');
  for (const read of ['getAll', 'getAllForAdmin', 'getDomainIndex']) {
    const start = repo.indexOf(`async ${read}(`);
    const body = repo.slice(start, start + 1_400);
    is(`${read} pages rather than capping`, start > 0 && body.includes('readAllPages'), true);
  }

  /*
    And the ones that stopped, each counting in the database instead.

    `countByNiche` fills the homepage's niche cards. It read every active
    listing and counted the rows here - paged correctly, which was the
    problem: seven sequential requests before the homepage could render, and
    the three reads beside it all waiting on the slowest. 0075 made it one
    `group by`.
  */
  const counts = repo.slice(
    repo.indexOf('async countByNiche('),
    repo.indexOf('async getStats('),
  );
  is('the niche counts exist to be checked', counts.length > 0, true);
  is('the niches are counted in the database', /marketplace_niche_counts/.test(counts), true);
  is('and not by walking the marketplace', /readAllPages/.test(counts), false);
  is('and the read is never silent', /throw new Error/.test(counts), true);

  /*
    `getPublicPreview` is the one that stopped paging, and it is not an
    exception to the rule - the rule is narrower than "page everything".

    It used to page the whole marketplace, join services and categories onto
    every row, and filter by niche in JavaScript, to draw six. 0073 moved that
    into `marketplace_niche_preview`, so there is nothing left to page: the
    sample arrives as six ids. What was actually at stake in the old
    assertion is the count under the heading - the one number on a public
    page nobody can check by eye, and which was being taken from a thousand
    rows however many there really were.

    So this asserts that invariant directly instead of asserting the paging
    loop that used to carry it. A niche takes its totals from the function,
    which counts over the whole niche; without one they come from `getStats`,
    which counts in the database. Neither counts the array it just read, and
    `length` appearing in either total is the bug coming back.
  */
  const preview = repo.slice(
    repo.indexOf('async getPublicPreview('),
    repo.indexOf('async create('),
  );
  is('the preview exists to be checked', preview.length > 0, true);
  is(
    'a niche page counts in the database, not over what it read',
    /marketplace_niche_preview/.test(preview),
    true,
  );
  is('and the whole marketplace counts through getStats', /getStats\(\)/.test(preview), true);
  is(
    'no total on the preview is a length',
    /total(?:Websites|Niches|Countries):[^,\n]*\.length/.test(preview),
    false,
  );
  is(
    'and its single-page read stays single-page on purpose',
    /readAllPages/.test(preview),
    false,
  );

  /*
    The orders repository, which this check had never looked at.

    `readAllPages` was written for the website reads and applied only there,
    so every list read in `orders-repository.ts` stayed as it was: one
    request, no range, and the error thrown away.

    Measured afterwards, the cap was not biting - there are 2 orders, and
    the figure that said thirteen hundred was invented in a comment and then
    believed. What was real at that size is the discarded error, which turns
    a failed query into an empty table. The paging is kept because the
    website reads show what happens when nobody notices in time, and because
    these are the reads whose row count is whatever the business does next.

    Named individually, as above. The whole point is that a file nobody
    listed is a file nobody checked.
  */
  const ordersRepo = readFileSync('src/lib/services/supabase/orders-repository.ts', 'utf8');

  /*
    Every list read in the file, found rather than named.

    The first version of this check named `getAll` and `getByUser` on the
    orders and left the content orders and the profiles exactly as they
    were - unpaged, error discarded - which is the same mistake one level up
    that let the whole file go unchecked in the first place. A list is only
    as good as whoever remembers to add to it.

    So the rule is a property instead: a read that sorts is a read that
    returns a list, and a read that returns a list has to say where in it to
    start. `.order(...)` without `.range(...)` is the bug, whatever the
    method is called. Single-row reads end in `.maybeSingle()` and never
    sort, so they do not come up.
  */
  const orderedReads = [...ordersRepo.matchAll(/\.from\('([a-z_]+)'\)[\s\S]{0,420}?;/g)]
    .map((match) => ({ table: match[1], chain: match[0] }))
    .filter(({ chain }) => /\.order\(/.test(chain));

  is('there are list reads in the orders repository to check', orderedReads.length > 0, true);

  const unpaged = orderedReads.filter(({ chain }) => !/\.range\(/.test(chain));
  is(
    'every sorted read in the orders repository asks for a range',
    unpaged.map(({ table }) => table).join(', '),
    '',
  );

  /*
    And the admin table asks for one page rather than every order.

    `adminPage` is the read the screen uses. It must go through the function,
    because a `.select()` here with no range is the bug coming straight back
    - and through the service role, because an administrator signed in with
    the shared password carries no `auth.uid()` and the policy on `orders`
    would hand them an empty table.
  */
  const adminPage = ordersRepo.slice(
    ordersRepo.indexOf('async adminPage('),
    ordersRepo.indexOf('async getByUser('),
  );
  is('the admin order table exists to be checked', adminPage.length > 0, true);
  is('it asks the database for one page', /admin_order_page/.test(adminPage), true);
  is('as the service role', /getAdminScopedClient\(\)/.test(adminPage), true);
  is('and never silently', (adminPage.match(/throw new Error/g) ?? []).length >= 2, true);

  // The two properties live in one file on purpose. A second copy of this
  // loop is a second place to get the stride wrong, which is what the
  // pricing service had before this.
  const pricing = readFileSync('src/lib/services/pricing-service.ts', 'utf8');
  is('pricing reads through the same helper', pricing.includes('readAllPages'), true);
  is('and has no paging loop of its own', /for \(let from = 0/.test(pricing), false);

  const sourcing = readFileSync('src/lib/services/sourcing-service.ts', 'utf8');
  is('the duplicate-offer read pages too', sourcing.includes('readAllPages'), true);

  // Comments stripped first. The file explains at length what `.limit(2000)`
  // used to do, so a check against the raw text matches the explanation and
  // reports the bug as still present - an invariant that fails for the wrong
  // reason is no better than one that passes for the wrong reason.
  const code = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

  const repoCode = code(repo);
  // The importer's duplicate check is the one where truncation wrote bad
  // data rather than merely displaying it, so it is worth its own assertion.
  is('the domain index is not capped at 50,000', repoCode.includes('.limit(50_000)'), false);
  is('nor the marketplace at 2,000', repoCode.includes('.limit(2000)'), false);
  is('nor the contested drafts at 5,000', code(sourcing).includes('.limit(5000)'), false);

  /*
    Proving the strip does not simply blank the file: a cap that is meant to
    be there, on a read that genuinely wants a first page, survives it.

    This used to point at `.limit(60)` in `getRelated` - which was not a
    deliberate cap at all, but the sixty-row fetch that existed to show four
    related listings, filtered down in JavaScript afterwards. Removing it
    broke this check, which is how a canary is supposed to behave. It now
    points at a limit that is doing its job.
  */
  is('a deliberate small limit is still visible to this check', repoCode.includes('.limit(120)'), true);

  /*
    The Ahrefs refresh, which had the same bug in a different shape.

    It asked `ahrefs_due_domains` for `batchBudget * batchSize` - four thousand
    - and treated what came back as the whole plan. PostgREST caps a
    set-returning function at a thousand rows and says nothing, so every run
    refreshed at most a thousand domains and reported itself completed. On
    three and a half thousand listings that is a quarter of the job, silently,
    and the run history looked perfect.

    It is fixed by asking for a batch at a time inside the loop rather than
    everything up front, so these pin both halves: nothing asks for more than
    the ceiling, and the fetch happens per batch.
  */
  const refresh = code(readFileSync('src/lib/services/refresh-service.ts', 'utf8'));

  const dueLimits = [...refresh.matchAll(/p_limit:\s*([^,\n]+)/g)].map((match) => match[1]!.trim());
  is('the due-domains fetch asks for a bounded page', dueLimits.length > 0, true);
  is(
    'and never for more than PostgREST will return',
    dueLimits.every((limit) => /Math\.min\(1000/.test(limit)),
    true,
  );
  is(
    'the plan comes from a count, not from the length of one page',
    /ahrefs_overdue_counts/.test(refresh),
    true,
  );
  // The fetch has to be inside the loop, or one capped page is still the plan.
  const loopStart = refresh.indexOf('while (batches < batchBudget)');
  is('the loop refetches rather than slicing one list', loopStart !== -1, true);
  is(
    'and the fetch is inside it',
    loopStart !== -1 && refresh.indexOf("rpc('ahrefs_due_domains'") > loopStart,
    true,
  );
  // A domain Ahrefs has no data for stays due, so without this the loop would
  // hand itself the same failures until the budget ran out.
  is('and cannot re-send the same failures forever', /attempted\.has\(/.test(refresh), true);
}


/* ------------------------------------------- fetching a basket, not a table

  The other half of the same problem. `readAllPages` is for the reads that
  genuinely want every row; these are the pages that never did.

  The basket and the shortlist live in local storage, so the server could not
  know which listings they wanted and both pages were handed every active
  listing to pick from - a few hundred rows when that was written, 3,405 now,
  with 7,174 more approved and waiting. The ids go up instead.

  Local storage is user-writable and outlives schema changes, so what comes
  out of it is input rather than data.
*/
const uuidA = '11111111-2222-4333-8444-555555555555';
const uuidB = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

is('a real id is kept', listingIdsToFetch([uuidA]).length, 1);
is('the same id twice is one lookup', listingIdsToFetch([uuidA, uuidA]).length, 1);
is('and case does not make it two', listingIdsToFetch([uuidB, uuidB.toUpperCase()]).length, 1);
is('ids are lowercased', listingIdsToFetch([uuidB.toUpperCase()])[0], uuidB);
is('whitespace is trimmed', listingIdsToFetch([` ${uuidA} `])[0], uuidA);

/*
  Anything that is not a uuid is dropped rather than sent. A stale key, a
  hand-edited array, a value from two schema versions ago - none of it should
  reach a database query, and none of it should make the page fail either.
*/
is('a non-uuid string is dropped', listingIdsToFetch(['not-an-id']).length, 0);
is('so is a number', listingIdsToFetch([42]).length, 0);
is('so is null', listingIdsToFetch([null]).length, 0);
is('so is an object', listingIdsToFetch([{ id: uuidA }]).length, 0);
is('an empty list asks for nothing', listingIdsToFetch([]).length, 0);
is('and the good ids survive beside the bad', listingIdsToFetch(['x', uuidA, null, uuidB]).length, 2);

/*
  The cap is the point of the exercise.

  Without it a shortlist of fifty thousand ids is fifty thousand ids, and the
  page that was supposed to stop loading the whole inventory loads it again
  one id at a time.
*/
const many = Array.from({ length: MOST_LISTINGS_PER_PAGE + 500 }, (_, i) =>
  `${String(i).padStart(8, '0')}-2222-4333-8444-555555555555`,
);
is('a huge list is capped', listingIdsToFetch(many).length, MOST_LISTINGS_PER_PAGE);

/*
  The chunk size and the server's per-request cap are the same number, from
  the same module.

  They used to be the kind of pair that lives in two files and drifts: a
  client batching at one size against a server capping at another is a
  silent truncation waiting for a big enough shortlist. The server refuses an
  oversized batch rather than trimming it, so a drift would be an error
  somebody sees rather than rows quietly missing.
*/
is('a page may ask about more ids than one request carries',
  MOST_LISTINGS_PER_PAGE > LISTINGS_PER_REQUEST, true);
is('so the cap is a whole number of requests',
  MOST_LISTINGS_PER_PAGE % LISTINGS_PER_REQUEST, 0);


console.log(failed === 0 ? '\nAll paging checks passed.\n' : `\n${failed} failed.\n`);
process.exit(failed === 0 ? 0 : 1);
