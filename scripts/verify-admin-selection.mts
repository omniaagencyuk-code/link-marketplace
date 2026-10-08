/**
 * Selecting a whole filter, against a server that truncates without saying so.
 *
 * The header checkbox reported "1000 selected" against 12,246 listings. The
 * SQL was right and the tests for it passed; what was wrong was the caller,
 * which asked once. PostgREST caps a single response - a thousand rows on a
 * Supabase project - and nothing in the answer says the cap was applied.
 *
 * `paged.ts` has its own tests, but not against this shape of caller: the one
 * that translates a (from, to) window into a function's own `p_limit` and
 * `p_offset`. Getting that translation wrong is silent in exactly the same
 * way - a plausible number, no error - so it is checked here against a stub
 * that behaves like the real server, cap included.
 *
 * No database, no network, no key.
 */

import { readAllPages } from '../src/lib/services/supabase/paged';

const INVENTORY = 12_246;
/** What PostgREST gives back at most, whatever was asked for. */
const SERVER_CAP = 1_000;

const ALL = Array.from({ length: INVENTORY }, (_, i) => ({ id: `id-${i}` }));

let failures = 0;
function is(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ` - expected ${want}, got ${got}`}`);
}

/** A server that honours the function's own window, then applies its own cap. */
function rpc(args: { p_limit: number; p_offset: number }) {
  const window = ALL.slice(args.p_offset, args.p_offset + args.p_limit);
  return Promise.resolve({ data: window.slice(0, SERVER_CAP), error: null });
}

console.log('\n--- the id list, walked ---');
{
  let calls = 0;
  const rows = await readAllPages<{ id: string }>('the matching listings', (from, to) => {
    calls += 1;
    return rpc({ p_limit: to - from + 1, p_offset: from });
  });

  is('every listing arrives', rows.length, INVENTORY);
  is('and none of them twice', new Set(rows.map((row) => row.id)).size, INVENTORY);
  is('in order, from the first', rows[0]?.id, 'id-0');
  is('to the last', rows.at(-1)?.id, `id-${INVENTORY - 1}`);
  is('and it took more than one request', calls > 1, true);
}

/*
  The bug this exists for, written down.

  Asking once is not a smaller version of asking properly - it is a wrong
  answer that looks like a right one. If this ever stops failing, the stub has
  stopped behaving like the server and nothing above is being tested.
*/
console.log('\n--- asking once, which is what went wrong ---');
{
  const answer = await rpc({ p_limit: INVENTORY, p_offset: 0 });
  is('one request is capped by the server', answer.data.length, SERVER_CAP);
  // The whole reason this is dangerous: a truncated answer is a successful one.
  is('and the answer carries no error saying so', answer.error, null);
  is('which is not the inventory', answer.data.length === INVENTORY, false);
}

/*
  A window larger than the cap.

  The loop advances by what arrived rather than by what it asked for, so a
  caller that asks for more than the server will give still walks the list
  correctly. Asking for 2,000 and moving on by 2,000 would skip half of it.
*/
console.log('\n--- a window wider than the cap ---');
{
  const rows = await readAllPages<{ id: string }>('the matching listings', (from) =>
    rpc({ p_limit: 2_000, p_offset: from }),
  );
  is('the walk still reaches the end', rows.length, INVENTORY);
  is('with nothing skipped', new Set(rows.map((row) => row.id)).size, INVENTORY);
}

console.log(failures === 0 ? '\n  all passed\n' : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
