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
import { readdirSync } from 'node:fs';
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

/*
  Every migration, in order - not a list.

  This was a hard-coded list ending at 0006, which meant the verifier was
  testing `websiteToRow` against a schema nine years of migrations out of date.
  It broke the first time a mapped column was added, and the failure read as
  "column does not exist" rather than as "this list is stale". A glob cannot go
  stale.
*/
const migrations = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql') && !name.endsWith('.paste.sql'))
  .sort();
for (const file of migrations) {
  psqlFile(`supabase/migrations/${file}`);
}
check(`every migration applied (${migrations.length})`, migrations.length > 6);

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

/*
  The publishing terms, written and read back.

  These five columns have existed since the sourcing migration and were
  populated whenever a publisher draft was approved, but nothing in the
  application read them - so a wrong column name here would have been
  invisible until somebody noticed a listing never showing a term the
  publisher clearly stated. The seed carries none of them, so they are set
  explicitly rather than hoped for.
*/
console.log('\n== publishing terms round-trip ==');
{
  const terms = {
    rules: {
      permanence: 'fixed-term',
      minLiveMonths: 12,
      dofollowExpiresAfterMonths: 6,
      homepagePlacement: true,
      topicRestriction: 'Chelsea FC only',
    },
  };

  const row = websiteToRow(terms);
  const assignments = Object.keys(row)
    .map((key) => `${key} = ${sqlValue(row[key])}`)
    .join(', ');

  let wrote = true;
  try {
    psql(`update public.websites set ${assignments} where slug = '${sample.slug}';`);
  } catch (error) {
    wrote = false;
    check(
      `terms written (${String(error.stderr ?? error.message).split('\n').find((l) => l.includes('ERROR'))})`,
      false,
    );
  }

  if (wrote) {
    check('terms written with the real column names', true);

    const back = mapWebsite(
      JSON.parse(
        psql(`
          select row_to_json(t) from (
            select w.*, null as primary_category,
              '[]'::json as website_categories, '[]'::json as services
            from public.websites w where w.slug = '${sample.slug}'
          ) t;
        `),
      ),
    );

    for (const [label, got, want] of [
      ['permanence', back.rules.permanence, 'fixed-term'],
      ['minLiveMonths', back.rules.minLiveMonths, 12],
      ['dofollowExpiresAfterMonths', back.rules.dofollowExpiresAfterMonths, 6],
      ['homepagePlacement', back.rules.homepagePlacement, true],
      ['topicRestriction', back.rules.topicRestriction, 'Chelsea FC only'],
    ]) {
      check(`${label} survives the round trip: ${JSON.stringify(got)}`, got === want);
    }

    // Clearing one has to store a null, not quietly keep the old term. The
    // mapper writes these by key presence for exactly this reason.
    psql(
      `update public.websites set ${Object.keys(
        websiteToRow({ rules: { permanence: undefined, homepagePlacement: undefined } }),
      )
        .map((key) => `${key} = ${sqlValue(websiteToRow({ rules: { permanence: undefined, homepagePlacement: undefined } })[key])}`)
        .join(', ')} where slug = '${sample.slug}';`,
    );

    const cleared = mapWebsite(
      JSON.parse(
        psql(`
          select row_to_json(t) from (
            select w.*, null as primary_category,
              '[]'::json as website_categories, '[]'::json as services
            from public.websites w where w.slug = '${sample.slug}'
          ) t;
        `),
      ),
    );

    check('a cleared term really clears', cleared.rules.permanence === undefined);
    check('and so does a cleared tri-state', cleared.rules.homepagePlacement === undefined);
    // The one left alone must survive the write that cleared the other two.
    check('a term not mentioned is left alone', cleared.rules.minLiveMonths === 12);
  }
}

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

console.log('\n== a country, and where it came from ==');

/*
  The round trip that matters for the country: the database is the only place
  that enforces a country and its source travelling together, and the mapper is
  the only place that decides a `default` country is not a country.

  `default` marks the United Kingdom every listing claimed before the column
  could be null. The value stays in the row - nothing is destroyed - but
  `mapWebsite` must not surface it, because that is what keeps twelve readers
  and one filter right without any of them knowing the rule.
*/
function readBack(slug) {
  return mapWebsite(
    JSON.parse(
      psql(`
        select row_to_json(t) from (
          select w.*, null as primary_category,
            '[]'::json as website_categories, '[]'::json as services
          from public.websites w where w.slug = '${slug}'
        ) t;
      `),
    ),
  );
}

function insertCountry(slug, code, source) {
  psql(
    `insert into public.websites (slug, domain, title, country_code, country_source)
     values ('${slug}', '${slug}.example', '${slug}', ${code ? `'${code}'` : 'null'}, ${source ? `'${source}'` : 'null'});`,
  );
}

insertCountry('vm-stated', 'ES', 'stated');
insertCountry('vm-measured', 'US', 'measured');
insertCountry('vm-domain', 'DK', 'domain');
insertCountry('vm-default', 'GB', 'default');
insertCountry('vm-none', null, null);

check('a stated country reads back', readBack('vm-stated').country === 'ES');
check('so does a measured one', readBack('vm-measured').country === 'US');
check('and one from the domain', readBack('vm-domain').country === 'DK');
check('the invented GB does not', readBack('vm-default').country === undefined);
check('but its source still does', readBack('vm-default').countrySource === 'default');
check('no country reads back as none', readBack('vm-none').country === undefined);

// The database refuses what the application cannot express.
let rejected = 0;
for (const bad of [
  "insert into public.websites (slug, domain, title, country_code) values ('vm-x1','x1.example','x1','US')",
  "insert into public.websites (slug, domain, title, country_source) values ('vm-x2','x2.example','x2','stated')",
  "insert into public.websites (slug, domain, title, country_code, country_source) values ('vm-x3','x3.example','x3','US','vibes')",
]) {
  try {
    psql(bad);
  } catch {
    rejected += 1;
  }
}
check('a country without a source, a source without a country and an unknown source are all refused', rejected === 3);

// And writing through the mapper satisfies the constraint, which is the whole
// point of the source travelling with the country in `websiteToRow`.
const row = websiteToRow({ country: 'FR' });
check('writing a country writes its source', row.country_source === 'stated');
const cleared = websiteToRow({ country: undefined });
check('clearing a country clears its source', cleared.country_code === null && cleared.country_source === null);

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
