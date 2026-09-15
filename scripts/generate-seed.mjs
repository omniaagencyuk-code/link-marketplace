/**
 * Generate the seed SQL.
 *
 * Inserts the full seed dataset into a local PostgreSQL carrying the real
 * migrations, using the application's own mappers, then dumps the result. That
 * way the SQL handed over is not hand-written - every value has already been
 * accepted by the actual column it is going into.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PGH = '/var/tmp/pgvalidate';
const DB = 'pp_seed';

function psql(sql, db = DB) {
  return execFileSync(
    'psql',
    ['-h', PGH, '-p', '55432', '-U', 'postgres', '-d', db, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', cwd: '/home/user/link-marketplace', maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

execFileSync('psql', ['-h', PGH, '-p', '55432', '-U', 'postgres', '-c', `drop database if exists ${DB}`], { encoding: 'utf8' });
execFileSync('psql', ['-h', PGH, '-p', '55432', '-U', 'postgres', '-c', `create database ${DB}`], { encoding: 'utf8' });
execFileSync('psql', ['-h', PGH, '-p', '55432', '-U', 'postgres', '-d', DB, '-q', '-f', `${PGH}/prelude.sql`], { encoding: 'utf8' });
for (const file of ['0001_init', '0002_rls', '0003_seed_reference_data', '0004_content_orders', '0005_cms', '0006_gate_marketplace']) {
  execFileSync('psql', ['-h', PGH, '-p', '55432', '-U', 'postgres', '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-f', `supabase/migrations/${file}.sql`], { encoding: 'utf8' });
}
console.log('schema applied');

const { websites: seedWebsites } = await import('/home/user/link-marketplace/src/lib/data/websites.ts');
const { seedPosts } = await import('/home/user/link-marketplace/src/lib/data/blog-posts.ts');
const { websiteToRow, postToRow } = await import('/home/user/link-marketplace/src/lib/supabase/mappers.ts');

const categoryIds = Object.fromEntries(
  psql("select slug || '|' || id from public.categories;")
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|')),
);

function sqlValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    if (value.length && typeof value[0] === 'object') {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
    }
    return `'{${value.map((entry) => (typeof entry === 'number' ? entry : `"${entry}"`)).join(',')}}'`;
  }
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

let services = 0;
let secondary = 0;

for (const website of seedWebsites) {
  const row = {
    ...websiteToRow(website),
    slug: website.slug,
    domain: website.domain,
    title: website.title,
    primary_category_id: categoryIds[website.niche] ?? null,
  };
  const columns = Object.keys(row);
  psql(
    `insert into public.websites (${columns.join(', ')}) values (${columns.map((k) => sqlValue(row[k])).join(', ')});`,
  );

  const id = psql(`select id from public.websites where slug = '${website.slug}';`);

  for (const service of website.services) {
    psql(`insert into public.services (website_id, type, price_minor, turnaround_min_days, turnaround_max_days, available, note)
          values ('${id}', '${service.type}', ${service.priceMinor}, ${service.turnaroundMinDays}, ${service.turnaroundMaxDays}, ${service.available}, ${service.note ? `'${service.note.replace(/'/g, "''")}'` : 'null'});`);
    services += 1;
  }

  for (const niche of website.secondaryNiches) {
    const categoryId = categoryIds[niche];
    if (!categoryId || niche === website.niche) continue;
    psql(
      `insert into public.website_categories (website_id, category_id) values ('${id}', '${categoryId}') on conflict do nothing;`,
    );
    secondary += 1;
  }
}
console.log(`websites: ${seedWebsites.length}, services: ${services}, secondary niches: ${secondary}`);

for (const post of seedPosts) {
  const row = postToRow(post);
  const columns = Object.keys(row);
  psql(
    `insert into public.posts (${columns.join(', ')}) values (${columns.map((k) => sqlValue(row[k])).join(', ')});`,
  );
}
console.log(`posts: ${seedPosts.length}`);

// ------------------------------------------------------------------- dump
const dump = execFileSync(
  'pg_dump',
  ['-h', PGH, '-p', '55432', '-U', 'postgres', '-d', DB, '--data-only', '--inserts', '--no-owner',
   '--no-privileges', '-t', 'public.websites', '-t', 'public.services',
   '-t', 'public.website_categories', '-t', 'public.posts'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

let sql = dump;
for (const [slug, id] of Object.entries(categoryIds)) {
  // Category ids differ per project, so every reference becomes a slug lookup.
  sql = sql.replaceAll(`'${id}'`, `(select id from public.categories where slug = '${slug}')`);
}

// pg_dump wraps wide rows across several lines, so statements are accumulated
// until one terminates rather than filtered line by line.
const byTable = {};
let current = null;

for (const line of sql.split('\n')) {
  if (current === null && !line.startsWith('INSERT INTO')) continue;
  current = current === null ? line : `${current}\n${line}`;
  if (!current.trimEnd().endsWith(';')) continue;

  const table = current.split(' ')[2];
  (byTable[table] ??= []).push(current);
  current = null;
}

const parts = [
  '-- Press Parrot - seed data',
  '--',
  `-- ${seedWebsites.length} websites, their services and secondary niches, and`,
  `-- ${seedPosts.length} blog posts.`,
  '--',
  "-- Not hand-written: generated by inserting the seed data through the",
  '-- application\'s own mappers into a PostgreSQL carrying these exact',
  '-- migrations, then dumping the result. Every value here has already been',
  '-- accepted by the column it is going into.',
  '--',
  '-- Category references are looked up by slug rather than by id, so this runs',
  '-- against any project where migration 0003 seeded the categories.',
  '--',
  '-- Safe to re-run: existing rows are skipped rather than duplicated.',
  '',
  'begin;',
  '',
];

for (const table of ['public.websites', 'public.services', 'public.website_categories', 'public.posts']) {
  const rows = byTable[table] ?? [];
  if (!rows.length) continue;
  parts.push(
    `-- ${'-'.repeat(70)}`,
    `-- ${table.split('.')[1]} (${rows.length} rows)`,
    `-- ${'-'.repeat(70)}`,
    '',
  );
  for (const row of rows) parts.push(`${row.replace(/;\s*$/, '')}\non conflict do nothing;`);
  parts.push('');
}

parts.push(
  `-- ${'-'.repeat(70)}`,
  '-- settings: one row, if there is not one already',
  `-- ${'-'.repeat(70)}`,
  '',
  'insert into public.settings (id)',
  'select gen_random_uuid()',
  'where not exists (select 1 from public.settings);',
  '',
  'commit;',
  '',
  '-- Check the result:',
  '--   select',
  '--     (select count(*) from public.websites) as websites,',
  '--     (select count(*) from public.services) as services,',
  '--     (select count(*) from public.posts)    as posts;',
  `-- Expect ${seedWebsites.length} / ${services} / ${seedPosts.length}.`,
  '',
);

const out = '/tmp/claude-0/-home-user-link-marketplace/ecb54caa-379f-58ea-ac14-b637c05778e1/scratchpad/press-parrot-seed-data.sql';
writeFileSync(out, parts.join('\n'));

console.log('\nwrote', out);
for (const [table, rows] of Object.entries(byTable)) console.log(`  ${table}: ${rows.length}`);
