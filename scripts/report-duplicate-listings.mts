/**
 * Look for listings the capped domain index could have damaged.
 *
 * Run against the live database, with .env.local present:
 *
 *   npm run report:duplicates
 *
 * Reads only. It prints what it finds and changes nothing, so it is safe to
 * run whenever and as often as you like.
 *
 * ## What this is looking for, and what it is not
 *
 * The importer decides create-or-update by looking a domain up in an index
 * built from `websites`. That index was read with `.limit(50_000)`, PostgREST
 * answered with the first thousand rows and no error, and every domain past
 * the thousandth was therefore absent from it.
 *
 * The first guess at the damage was duplicate listings, and that guess was
 * wrong. `websites.domain` is `unique`, so the insert those rows fell through
 * to was rejected by the database rather than accepted twice. What actually
 * happened is quieter and worse to find later: in update mode a row that
 * should have updated an existing listing was counted as failed instead, and
 * whatever the CSV carried for that listing - a new price, a new metric - was
 * never applied. The listing kept its old values and the run reported a
 * number next to the word "failed".
 *
 * So this report does two things.
 *
 * It checks the duplicate claim rather than repeating it. The constraint is
 * on the column exactly as stored, and the importer normalises before it
 * writes - but anything that wrote a domain without normalising it first
 * could sit alongside its own normalised twin without troubling the
 * constraint at all. That is worth knowing rather than assuming, in either
 * direction.
 *
 * And it lists the import runs that recorded failures, because those are
 * where the lost updates are. `import_runs` keeps counts rather than rows, so
 * it can say which run to re-run and not which listing to fix - re-importing
 * the same CSV in update mode is now the cure, since the index is no longer
 * capped.
 */
import { createClient } from '@supabase/supabase-js';
import { normaliseDomain } from '../src/lib/import/normalise';
import { findCollisions, findUnnormalised } from '../src/lib/import/duplicates';
import { readAllPages } from '../src/lib/services/supabase/paged';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Both live in .env.local. Then: npm run report:duplicates',
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pad = (n: number, width = 5) => String(n).padStart(width);

interface Row {
  id: string;
  domain: string;
  slug: string;
  status: string;
  created_at: string;
}

/*
  Paged, and by `id`, for the reason the whole report exists. A capped read
  here would report a marketplace smaller than it is and find no collisions
  in the part it never looked at - which is precisely the failure being
  investigated, repeated by the tool investigating it.
*/
const websites = await readAllPages<Row>('the listings', (from, to) =>
  supabase
    .from('websites')
    .select('id, domain, slug, status, created_at')
    .order('id', { ascending: true })
    .range(from, to),
);

console.log(`\n  ${websites.length} listings read.\n`);

// ----------------------------------------------------- same site, two rows
// Both answers come from `@/lib/import/duplicates`, which is pure and
// covered by verify:import. This file's job is to fetch and to print.
const collisions = findCollisions(websites);
const unnormalised = findUnnormalised(websites);

console.log('--- two listings for one site ---');
if (collisions.length === 0) {
  console.log('  None. The unique constraint on websites.domain held.\n');
} else {
  console.log(`  ${collisions.length} site${collisions.length === 1 ? '' : 's'} listed twice:\n`);
  for (const { domain, rows } of collisions) {
    console.log(`  ${domain}`);
    for (const row of rows) {
      console.log(
        `    ${row.domain.padEnd(40)} ${row.status.padEnd(9)} ${row.created_at.slice(0, 10)}  ${row.id}`,
      );
    }
    console.log('');
  }
  console.log('  Keep the one with the orders and the checked price.\n');
}

console.log('--- stored without normalising ---');
if (unnormalised.length === 0) {
  console.log('  None. Every domain is stored as the importer would write it.\n');
} else {
  // Not damage yet. It is how damage happens: the next import of the
  // normalised spelling will not match this row, and will be free to insert
  // beside it.
  console.log(
    `  ${unnormalised.length} row${unnormalised.length === 1 ? '' : 's'} a future import would not match:\n`,
  );
  for (const row of unnormalised) {
    console.log(`    ${row.domain.padEnd(40)} would be matched as ${normaliseDomain(row.domain)}`);
  }
  console.log('');
}

// ------------------------------------------------- where the updates went
const { data: runs, error } = await supabase
  .from('import_runs')
  .select('file_name, total_rows, created, updated, skipped, failed, duplicate_mode, created_at')
  .gt('failed', 0)
  .order('created_at', { ascending: false })
  .limit(50);

if (error) {
  console.log(`--- import runs ---\n  Could not read them: ${error.message}\n`);
} else {
  const rows = runs ?? [];
  console.log('--- imports that recorded failures ---');
  if (rows.length === 0) {
    console.log('  None. No import run recorded a failed row.\n');
  } else {
    console.log('   fail  created  updated  mode    date        file');
    for (const run of rows as Record<string, unknown>[]) {
      console.log(
        `  ${pad(Number(run.failed))}  ${pad(Number(run.created), 7)}  ${pad(Number(run.updated), 7)}  ${String(run.duplicate_mode).padEnd(6)}  ${String(run.created_at).slice(0, 10)}  ${run.file_name}`,
      );
    }

    const updates = (rows as Record<string, unknown>[]).filter(
      (run) => run.duplicate_mode === 'update',
    );
    const lost = updates.reduce((total, run) => total + Number(run.failed), 0);

    console.log('');
    if (lost > 0) {
      console.log(
        `  ${lost} failed row${lost === 1 ? '' : 's'} across ${updates.length} run${updates.length === 1 ? '' : 's'} in update mode.`,
      );
      console.log(
        '  These are the candidates. A failed row in update mode is one that should\n' +
          '  have updated a listing and did not - though not every one will be this\n' +
          '  bug, since a malformed domain fails the same way and counts the same.\n' +
          '\n' +
          '  Telling them apart from here is not possible: import_runs keeps counts,\n' +
          '  not rows. Re-importing the same files in update mode settles it either\n' +
          '  way. The index is no longer capped, so a row that failed for that reason\n' +
          '  will now match and update, and one that failed for a bad domain will\n' +
          '  fail again and be worth looking at.\n',
      );
    } else {
      console.log(
        '  All of these ran in skip mode, where a failed row would have changed\n' +
          '  nothing anyway. Nothing to re-run.\n',
      );
    }
  }
}

console.log('  Read-only. Nothing was changed.\n');
