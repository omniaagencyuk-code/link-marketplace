/**
 * Start watching the placements that pre-date the monitor.
 *
 * Run against the live database, with .env.local present:
 *
 *   npm run import:placed-links            # say what it would do
 *   npm run import:placed-links -- --write # do it
 *
 * Reads by default. Nothing is written until `--write` is passed, because the
 * published date it records is the date the guarantee and the durability
 * window are both measured from, and getting that wrong on a few thousand
 * rows is not something a second run fixes - registration is idempotent, so
 * the first value sticks.
 *
 * ## What it registers, and what it leaves alone
 *
 * Every order item with a live URL, whether or not the customer approved it:
 * an unapproved placement is still a link we were paid for, and a durability
 * score drawn only from the approved ones would quietly exclude the orders
 * that went wrong.
 *
 * It does not invent a publication date. `delivered_at` is what it uses, and
 * `approved_at` where there is no delivery date - a row with neither is
 * registered as of today, which is honest about not knowing: it simply has no
 * twelve month evidence to contribute until twelve months from now.
 *
 * Everything goes through `registerPlacedLink`, the same function the delivery
 * service calls. A script with its own insert is a second set of rules about
 * what a watched link looks like, and the two would drift.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Both live in .env.local. Then: npm run import:placed-links',
  );
  process.exit(1);
}

const write = process.argv.includes('--write');

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from('order_items')
  .select('id, website_domain, live_url, delivered_at, approved_at')
  .not('live_url', 'is', null)
  .order('delivered_at', { ascending: true });

if (error) {
  console.error(`Could not read the placements: ${error.message}`);
  process.exit(1);
}

const items = (data ?? []).filter((row) => (row.live_url ?? '').trim() !== '');

const { data: watched } = await supabase.from('monitored_links').select('order_item_id');
const already = new Set((watched ?? []).map((row) => row.order_item_id as string));
const todo = items.filter((row) => !already.has(row.id as string));

console.log(`\n${items.length} placements with a live URL, ${already.size} already watched.`);
console.log(`${todo.length} to register.\n`);

if (todo.length === 0) process.exit(0);

if (!write) {
  for (const row of todo.slice(0, 20)) {
    const when = row.delivered_at ?? row.approved_at ?? '(no date - would use today)';
    console.log(`  ${String(row.website_domain ?? '?').padEnd(32)} ${when}`);
  }
  if (todo.length > 20) console.log(`  ... and ${todo.length - 20} more`);
  console.log('\nNothing written. Re-run with --write to register these.\n');
  process.exit(0);
}

// Imported here rather than at the top: it reaches for the application's own
// Supabase client, which wants the environment loaded, and a dry run should
// not need it at all.
const { registerPlacedLink } = await import('../src/lib/services/link-monitor-service');

let registered = 0;
let skipped = 0;

for (const row of todo) {
  const result = await registerPlacedLink(row.id as string);
  if (result.registered) registered += 1;
  else {
    skipped += 1;
    console.log(`  skipped ${row.website_domain ?? row.id}: ${result.reason ?? 'unknown'}`);
  }
}

console.log(`\nRegistered ${registered}, skipped ${skipped}.`);
console.log('They come due over the next day and will be checked on the next nightly run.\n');
