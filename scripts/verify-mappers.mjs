/**
 * Round-trip the mapping layer through the real schema.
 *
 * TypeScript cannot catch a wrong column name - `websiteToRow` producing
 * `niche` instead of `primary_category_id` typechecks perfectly and fails at
 * runtime, which is exactly the bug that reached the SQL editor earlier.
 *
 * So: take the seed websites, run them through `websiteToRow`, INSERT the
 * result into a real Postgres carrying the real migrations, SELECT it back,
 * run it through `mapWebsite`, and assert the values survived intact.
 *
 * This does not test PostgREST's wire format - that needs a live Supabase,
 * which the network policy blocks from here. It does test every column name,
 * type and default.
 */
import { execFileSync } from 'node:child_process';
const PGH = '/var/tmp/pgvalidate';
const DB = 'pp_map';

let pass = 0;
let fail = 0;
const ok = (m) => { console.log(`PASS  ${m}`); pass += 1; };
const bad = (m) => { console.log(`FAIL  ${m}`); fail += 1; };
const check = (m, c) => (c ? ok(m) : bad(m));

function psql(sql, db = DB) {
  return execFileSync(
    'psql',
    ['-h', PGH, '-p', '55432', '-U', 'postgres', '-d', db, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', cwd: '/home/user/link-marketplace' },
  )
    .trim()
    .split('\n')
    .filter((line) => line !== 'SET')
    .join('\n')
    .trim();
}

function psqlFile(file, db = DB) {
  execFileSync(
    'psql',
    ['-h', PGH, '-p', '55432', '-U', 'postgres', '-d', db, '-q', '-v', 'ON_ERROR_STOP=1', '-f', file],
    { encoding: 'utf8', cwd: '/home/user/link-marketplace' },
  );
}

// Fresh database carrying every migration.
execFileSync('psql', ['-h', PGH, '-p', '55432', '-U', 'postgres', '-c', `drop database if exists ${DB}`], { encoding: 'utf8' });
execFileSync('psql', ['-h', PGH, '-p', '55432', '-U', 'postgres', '-c', `create database ${DB}`], { encoding: 'utf8' });
psqlFile(`${PGH}/prelude.sql`);
for (const file of ['0001_init', '0002_rls', '0003_seed_reference_data', '0004_content_orders', '0005_cms', '0006_gate_marketplace']) {
  psqlFile(`supabase/migrations/${file}.sql`);
}
ok('schema applied');

const { websites: seedWebsites } = await import('/home/user/link-marketplace/src/lib/data/websites.ts');
const { seedPosts } = await import('/home/user/link-marketplace/src/lib/data/blog-posts.ts');
const { websiteToRow, mapWebsite, postToRow, mapPost } = await import(
  '/home/user/link-marketplace/src/lib/supabase/mappers.ts'
);

console.log(`\n== websiteToRow -> INSERT (${seedWebsites.length} websites) ==`);

const categoryIds = Object.fromEntries(
  psql('select slug || \'|\' || id from public.categories;')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|')),
);
check(`categories seeded (${Object.keys(categoryIds).length})`, Object.keys(categoryIds).length > 5);

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

let inserted = 0;
let insertError = null;

for (const website of seedWebsites) {
  const row = {
    ...websiteToRow(website),
    slug: website.slug,
    domain: website.domain,
    title: website.title,
    primary_category_id: categoryIds[website.niche] ?? null,
  };
  const columns = Object.keys(row);
  const values = columns.map((key) => sqlValue(row[key]));

  try {
    psql(`insert into public.websites (${columns.join(', ')}) values (${values.join(', ')});`);
    inserted += 1;
  } catch (error) {
    insertError ??= `${website.domain}: ${String(error.stderr ?? error.message).split('\n').find((l) => l.includes('ERROR'))}`;
  }
}

check(
  `all ${seedWebsites.length} websites inserted${insertError ? ` (first error: ${insertError})` : ''}`,
  inserted === seedWebsites.length,
);

console.log('\n== SELECT -> mapWebsite, values intact ==');

const sample = seedWebsites[0];
const json = psql(`
  select row_to_json(t) from (
    select w.*,
      (select row_to_json(c) from (select slug from public.categories where id = w.primary_category_id) c) as primary_category,
      '[]'::json as website_categories,
      '[]'::json as services
    from public.websites w where w.slug = '${sample.slug}'
  ) t;
`);
const mapped = mapWebsite(JSON.parse(json));

const comparisons = [
  ['domain', mapped.domain, sample.domain],
  ['title', mapped.title, sample.title],
  ['niche', mapped.niche, sample.niche],
  ['country', mapped.country, sample.country],
  ['language', mapped.language, sample.language],
  ['status', mapped.status, sample.status],
  ['verified', mapped.verified, sample.verified],
  ['domainRating', mapped.metrics.domainRating, sample.metrics.domainRating],
  ['organicTraffic', mapped.metrics.organicTraffic, sample.metrics.organicTraffic],
  ['referringDomains', mapped.metrics.referringDomains, sample.metrics.referringDomains],
  ['trafficChangePct', mapped.metrics.trafficChangePct, sample.metrics.trafficChangePct],
  ['topCountryShare', mapped.metrics.topCountryShare, sample.metrics.topCountryShare],
  ['spamScore', mapped.metrics.spamScore, sample.metrics.spamScore],
  ['minWordCount', mapped.rules.minWordCount, sample.rules.minWordCount],
  ['maxLinks', mapped.rules.maxLinks, sample.rules.maxLinks],
  ['linkAttribute', mapped.rules.linkAttribute, sample.rules.linkAttribute],
  ['sponsoredTag', mapped.rules.sponsoredTag, sample.rules.sponsoredTag],
  ['acceptsGambling', mapped.rules.acceptsGambling, sample.rules.acceptsGambling],
  ['contentProvidedBy', mapped.rules.contentProvidedBy, sample.rules.contentProvidedBy],
  ['rating', mapped.rating, sample.rating],
  ['completedOrders', mapped.completedOrders, sample.completedOrders],
];

for (const [label, got, want] of comparisons) {
  check(`${label}: ${JSON.stringify(got)}`, JSON.stringify(got) === JSON.stringify(want));
}

check(
  `trafficTrend survives (${mapped.metrics.trafficTrend.length} points)`,
  mapped.metrics.trafficTrend.length === sample.metrics.trafficTrend.length,
);
check(
  `audienceSplit survives (${mapped.metrics.audienceSplit.length} entries)`,
  mapped.metrics.audienceSplit.length === sample.metrics.audienceSplit.length,
);
check(
  `guidelines survive (${mapped.rules.guidelines.length})`,
  mapped.rules.guidelines.length === sample.rules.guidelines.length,
);
check(
  `examplePlacements survive (${mapped.rules.examplePlacements.length})`,
  mapped.rules.examplePlacements.length === sample.rules.examplePlacements.length,
);

console.log('\n== services round-trip ==');
const websiteId = psql(`select id from public.websites where slug = '${sample.slug}';`);
for (const service of sample.services) {
  psql(`insert into public.services (website_id, type, price_minor, turnaround_min_days, turnaround_max_days, available, note)
        values ('${websiteId}', '${service.type}', ${service.priceMinor}, ${service.turnaroundMinDays}, ${service.turnaroundMaxDays}, ${service.available}, ${service.note ? `'${service.note.replace(/'/g, "''")}'` : 'null'});`);
}
const withServices = JSON.parse(
  psql(`
    select row_to_json(t) from (
      select w.*,
        (select row_to_json(c) from (select slug from public.categories where id = w.primary_category_id) c) as primary_category,
        '[]'::json as website_categories,
        (select coalesce(json_agg(s), '[]'::json) from public.services s where s.website_id = w.id) as services
      from public.websites w where w.slug = '${sample.slug}'
    ) t;
  `),
);
const remapped = mapWebsite(withServices);
check(
  `services count (${remapped.services.length} of ${sample.services.length})`,
  remapped.services.length === sample.services.length,
);
const gp = remapped.services.find((s) => s.type === 'guest-post');
const seedGp = sample.services.find((s) => s.type === 'guest-post');
if (seedGp) {
  check(`guest post price ${gp?.priceMinor} == ${seedGp.priceMinor}`, gp?.priceMinor === seedGp.priceMinor);
  check(`turnaround ${gp?.turnaroundMinDays}-${gp?.turnaroundMaxDays}`, gp?.turnaroundMinDays === seedGp.turnaroundMinDays);
}

console.log('\n== posts round-trip ==');
let postsInserted = 0;
let postError = null;
for (const post of seedPosts) {
  const row = postToRow(post);
  const columns = Object.keys(row);
  const values = columns.map((key) => sqlValue(row[key]));
  try {
    psql(`insert into public.posts (${columns.join(', ')}) values (${values.join(', ')});`);
    postsInserted += 1;
  } catch (error) {
    postError ??= String(error.stderr ?? error.message).split('\n').find((l) => l.includes('ERROR'));
  }
}
check(`all ${seedPosts.length} posts inserted${postError ? ` (${postError})` : ''}`, postsInserted === seedPosts.length);

const postJson = psql(`select row_to_json(p) from public.posts p where slug = '${seedPosts[0].slug}';`);
const mappedPost = mapPost(JSON.parse(postJson));
check(`post title: ${mappedPost.title}`, mappedPost.title === seedPosts[0].title);
check('post body survives', mappedPost.body === seedPosts[0].body);
check(`post category: ${mappedPost.category}`, mappedPost.category === seedPosts[0].category);
check(`post status: ${mappedPost.status}`, mappedPost.status === seedPosts[0].status);

console.log('\n== the gate still holds with real data ==');
psql("grant usage on schema public to anon, authenticated; grant select on all tables in schema public to anon, authenticated;");
// The policy exposes active listings only, so the expected number is the
// active count rather than everything inserted.
const activeCount = Number(psql("select count(*) from public.websites where status = 'active';"));
const anonDomains = psql("set role anon; select count(*) from public.websites;");
const authDomains = psql("set role authenticated; select count(*) from public.websites;");
check(`anon sees 0 websites (saw ${anonDomains})`, anonDomains === '0');
check(
  `authenticated sees the ${activeCount} active listings (saw ${authDomains})`,
  Number(authDomains) === activeCount,
);
check(`drafts and paused are hidden too (${inserted - activeCount} of ${inserted})`, activeCount < inserted);

const anonPosts = psql("set role anon; select count(*) from public.posts;");
const livePosts = seedPosts.filter((p) => p.status === 'published').length;
check(`anon sees only live posts (${anonPosts} of ${seedPosts.length})`, Number(anonPosts) === livePosts);

const stats = psql('set role anon; select total_websites from public.marketplace_stats();');
check(`marketplace_stats works for anon (${stats})`, Number(stats) > 0);

console.log(`\n-- ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
