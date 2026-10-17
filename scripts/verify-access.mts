/**
 * Prove the inventory is not readable without an account, and that the public
 * pages which replaced it cannot leak one.
 *
 * Two different failures, both silent. A gate that lets a path through shows a
 * stranger the thing we sell. A public page that carries a domain into its HTML
 * shows them the same thing more politely. Neither announces itself, and both
 * are found by a competitor rather than by us.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { safeReturnPath, returnPathFor } from '../src/lib/auth/return-to';
import { leadsToInventory, signupFor } from '../src/lib/marketplace/entry';
import { spread, toSampleRows, toStats, MIN_LISTINGS_FOR_A_PAGE } from '../src/lib/services/niche-landing';
import { NICHE_COPY } from '../src/lib/content/niche-guest-posts';
import { websiteOverview } from '../src/lib/websites/overview';
import { describeFromHtml, isUsefulDescription } from '../src/lib/websites/site-description';
import type { Website, WebsiteListItem } from '../src/lib/types';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const yes = (label: string, actual: boolean) => is(label, actual, true);

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

console.log('\n--- where a return URL may point ---');
{
  /*
    A return URL arrives from whoever wrote the link, so unchecked it turns our
    own signup page into an open redirect: the victim sees a real Press Parrot
    URL, signs in, and lands somewhere else entirely.
  */
  is('an ordinary path is kept', safeReturnPath('/websites/example-com'), '/websites/example-com');
  is('with its query', safeReturnPath('/marketplace?niche=technology'), '/marketplace?niche=technology');

  is('another origin is refused', safeReturnPath('https://evil.example/'), undefined);
  // The one everybody forgets: a browser reads this as a host, not a path.
  is('a protocol-relative URL is refused', safeReturnPath('//evil.example/'), undefined);
  is('and its backslash form', safeReturnPath('/\\evil.example'), undefined);
  is('a javascript: URL is refused', safeReturnPath('javascript:alert(1)'), undefined);
  is('a control character is refused', safeReturnPath('/\u0000//evil.example'), undefined);
  is('nothing at all is nothing', safeReturnPath(undefined), undefined);
  is('and an array takes its first entry', safeReturnPath(['/a', '/b']), '/a');

  // The query is the difference between coming back to the filtered view you
  // asked for and coming back to an unfiltered one.
  is('a return path carries the query', returnPathFor('/websites', '?niche=technology'), '/websites?niche=technology');
  is('and is just the path without one', returnPathFor('/websites', ''), '/websites');
}

console.log('\n--- the gate ---');
{
  const proxy = read('src/proxy.ts');

  yes('every marketplace path is inventory', /pathname === '\/marketplace'/.test(proxy));
  yes('and everything under it', /pathname\.startsWith\('\/marketplace\/'\)/.test(proxy));
  yes('and /websites', /pathname === '\/websites'/.test(proxy));
  yes('and everything under that', /pathname\.startsWith\('\/websites\/'\)/.test(proxy));

  /*
    /marketplace used to be let through as a public gateway. It is not any more
    - the gateway's job moved to /guest-posts, which is built from masked data -
    so an allow-list of public marketplace paths must not come back.
  */
  yes('no marketplace path is let through signed out', !proxy.includes('PUBLIC_MARKETPLACE_PATHS'));

  // 307 and not 301: a permanent redirect is cached by browsers and by Google
  // more or less forever, so the day this opens up again everybody who was
  // ever bounced would still be bounced, from their own cache.
  yes('the redirect is temporary', /NextResponse\.redirect\(target, 307\)/.test(proxy));
  yes('and never permanent', !/redirect\([^)]*,\s*30[18]\)/.test(proxy));

  yes('inventory sends people to signup', /isInventory \? '\/signup' : '\/login'/.test(proxy));
  yes('with the path and query to come back to', /returnPathFor\(pathname, request\.nextUrl\.search\)/.test(proxy));

  yes('gated responses carry a noindex header', /X-Robots-Tag/.test(proxy));
  yes('on the redirect itself', /return gated\(NextResponse\.redirect/.test(proxy));
  // And on what a signed-in request renders: an inventory page is not for an
  // index whoever is looking at it.
  yes('and on the signed-in render', /inventory \? gated\(response\) : response/.test(proxy));

  const matcher = /matcher: \[([^\]]+)\]/.exec(proxy)?.[1] ?? '';
  for (const path of ['/marketplace/:path*', '/websites/:path*', '/dashboard/:path*', '/admin/:path*']) {
    yes(`the matcher covers ${path}`, matcher.includes(path));
  }
}

console.log('\n--- the inventory is read on the service role ---');
{
  /*
    0090 dropped the policy that let a customer's token read `websites`,
    because a policy that lets a browser read the table lets it read all of
    the table - a thousand rows a request, thirteen requests for the lot.

    What that moves into this file is a requirement the database used to
    hold: every customer-facing read now has to say `status = 'active'`
    itself. The policy was doing it, and two reads had been relying on it
    without saying so - the listing page and the basket. A paused listing
    appearing at its own URL would be a quiet consequence of a security fix,
    which is the worst kind.
  */
  const repo = read('src/lib/services/supabase/website-repository.ts');

  yes('the inventory has a client of its own', /function inventoryClient\(\)/.test(repo));
  yes('and it is the service role', /const admin = getAdminClient\(\)/.test(repo));
  // Falling back to the customer's client would render an empty marketplace,
  // which looks like an inventory nobody has rather than a key nobody set.
  yes('with no fallback to the customer', !/admin \?\? \(await getServerClient\(\)\)/.test(repo));

  /*
    One read still goes through the customer's client, and should: counts,
    from a definer function anon has been able to call since 0006.
  */
  const serverReads = repo.match(/await getServerClient\(\)/g) ?? [];
  is('only the counts are still read as the customer', serverReads.length, 1);
  yes('and that read is marketplace_stats', /getServerClient\(\)[\s\S]{0,120}marketplace_stats/.test(repo));

  /*
    Every `from('websites')` in the file, checked for the filter the policy
    used to apply. The admin reads are exempt and named: the admin area is
    the one caller that has business seeing a paused listing.
  */
  const marker = "from('websites')";
  const reads: { before: string; after: string }[] = [];
  for (let at = repo.indexOf(marker); at !== -1; at = repo.indexOf(marker, at + 1)) {
    /*
      Each read ends at its own semicolon.

      It was a fixed four hundred characters, which reached past the end of
      one read and into the next - so deleting `status = 'active'` from the
      listing page's read was covered by the filter on the read below it, and
      this assertion went on passing. Found by mutating the thing it exists
      to protect rather than by reading it, which is the only way that class
      of hole is ever found.
    */
    const ends = repo.indexOf(';', at);
    reads.push({
      before: repo.slice(Math.max(0, at - 1400), at),
      after: repo.slice(at, ends === -1 ? at + 420 : ends + 1),
    });
  }

  /*
    Which client the read uses decides whether it has to say `active`.

    The admin area is the one caller with business seeing a paused listing -
    it is where somebody pauses one - and it runs on the scoped client. Every
    other read is a customer's, however it got here.

    This first asked whether the function's *name* appeared after the call,
    which classified `getDomainIndex` as customer-facing because its name is
    written above the read rather than below it. The client is on the line
    before, where a reader of this file would look for it.
  */
  const admin = (read: { before: string; after: string }) =>
    /getAdminScopedClient\(\)|getAdminClient\(\)/.test(read.before.split('async ').at(-1) ?? '') ||
    read.after.includes('WEBSITE_SELECT_ADMIN');
  const writes = (read: { after: string }) => /\.update\(|\.insert\(|\.delete\(/.test(read.after);
  const filtersActive = (read: { after: string }) => /status', 'active'/.test(read.after);

  const unguarded = reads.filter((read) => !admin(read) && !writes(read) && !filtersActive(read));
  is(
    'every customer-facing read of websites filters to active',
    unguarded.length === 0 ? 'none unguarded' : unguarded.map((r) => r.after.slice(0, 60)).join(' | '),
    'none unguarded',
  );

  const budget = read('src/lib/marketplace/budget.ts');
  yes('rows are spent against a budget', /spend_inventory_budget/.test(budget));
  // Rows, not requests: a request is whatever page size somebody asks for.
  yes('and the unit is rows', /p_rows: rows/.test(budget));
  // The refusal must not teach somebody where the line is.
  yes('the refusal quotes no figure', !/\d{3,}/.test(budget.split('message:')[1] ?? ''));
  yes('and it fails open', /catch \{\n    return ALLOWED;/.test(budget));

  const marketplace = read('src/app/(app)/marketplace/page.tsx');
  yes('the marketplace spends before it reads', /spendInventoryRows\(user\.id, pageSize\)/.test(marketplace));
  yes('and shows the refusal instead of an empty table', /budget\.message/.test(marketplace));

  const listing = read('src/app/(marketing)/websites/[slug]/page.tsx');
  yes('a listing page spends too', /spendInventoryRows\(viewer\.id/.test(listing));

  /*
    And somebody can see who it stopped.

    A budget that refuses silently is one support cannot answer for and
    nobody can tune: the counter resets hourly, so without a record a
    customer stopped at two has no trace by three. 0091 records refusals;
    this is the half that reads them.
  */
  const report = read('src/lib/services/inventory-reads.ts');
  yes('refusals are read on the service role', /getAdminClient\(\)/.test(report));
  // Internal data: it says which customer asked for too much and when.
  yes('and never on the customer', !/getServerClient/.test(report));
  /*
    A failed read and a quiet week are different answers, on both paths.

    There are two ways this read fails - an error on the response and a
    thrown exception - and the first version of this assertion only asked
    whether `failed: true` appeared anywhere in the file. It does, in the
    catch block, so deleting it from the other path changed nothing here.
    Caught by mutating it; counted now.
  */
  is(
    'both ways of failing say so, rather than reading as nobody',
    (report.match(/failed: true/g) ?? []).length,
    2,
  );
  // One query for the names, not one per row.
  yes('names are fetched in one read', /\.in\('id', ids\)/.test(report));

  const diagnostics = read('src/app/admin/(protected)/diagnostics/page.tsx');
  yes('the admin panel shows the budget', /inventoryReadReport\(\)/.test(diagnostics));
  yes('with the cap beside it', /capRows/.test(diagnostics));
  // The figures live here precisely because the refusal carries none.
  yes('and the refusals under it', /inventory\.refusals\.map/.test(diagnostics));
}

console.log('\n--- where a public link into the inventory points ---');
{
  /*
    The gate is not in question here; what a public page spends getting to it
    is. Every link in public markup that leads at the inventory went straight
    at `/marketplace` and was answered with a 307, so the main button on the
    homepage cost a round trip before it did anything.
  */
  yes('the marketplace leads at the inventory', leadsToInventory('/marketplace'));
  yes('and so does a filtered one', leadsToInventory('/marketplace?niche=gambling'));
  yes('and a listing', leadsToInventory('/websites/some-publisher'));
  yes('and the index', leadsToInventory('/websites'));
  is('a marketing page does not', leadsToInventory('/pricing'), false);
  // `/marketplace-guide` is not `/marketplace`, and a prefix test would say
  // it was.
  is('nor a path that merely starts the same way', leadsToInventory('/marketplace-guide'), false);
  // A browser reads this as a host. It starts with a slash and goes nowhere
  // near our inventory.
  is('nor a protocol-relative URL', leadsToInventory('//evil.example/marketplace'), false);
  is('nor nothing at all', leadsToInventory(undefined), false);

  is(
    'a signup link carries where they were going',
    signupFor('/marketplace'),
    '/signup?next=%2Fmarketplace',
  );
  /*
    Encoded, and this is the assertion that matters: unencoded, the `?` of
    the target ends the `next` value, and the filter somebody chose is lost
    on the way to the form.
  */
  is(
    'and encodes a query so the filter survives it',
    signupFor('/marketplace?niche=gambling'),
    '/signup?next=%2Fmarketplace%3Fniche%3Dgambling',
  );

  // The round trip: what the form reads back is what the link set out with.
  const next = new URL(signupFor('/marketplace?niche=gambling'), 'https://x.test').searchParams.get(
    'next',
  );
  is('and the form reads it back whole', safeReturnPath(next), '/marketplace?niche=gambling');

  /*
    The sentence on the signup form that explains why the form is there at
    all. It asked `next === '/marketplace'`, so every filtered link - which
    is most of them - lost it.
  */
  const form = read('src/components/auth/auth-form.tsx');
  yes('the signup form asks whether next leads at the inventory', /leadsToInventory\(next\)/.test(form));
  yes('rather than comparing it to one path', !/next === '\/marketplace'/.test(form));

  /*
    The regression guard. These are the public files that link into the
    inventory; a new `href="/marketplace"` in any of them is a round trip
    nobody notices, because the page still works.
  */
  const linkers = [
    'src/components/home/niche-grid.tsx',
    'src/components/home/how-it-works-section.tsx',
    'src/components/marketing/guest-posts-page.tsx',
    'src/components/marketing/service-page.tsx',
    'src/components/cms/page-sections.tsx',
    'src/components/cms/sections/home.tsx',
    'src/components/cms/sections/niche.tsx',
    'src/app/(marketing)/pricing/page.tsx',
  ];
  for (const path of linkers) {
    const source = read(path);
    const name = path.split('/').at(-1);
    yes(`${name} links through signupFor`, /signupFor\(/.test(source));
    yes(`and holds no bare inventory href`, !/href=\{?["'`]\/marketplace/.test(source));
  }

  /*
    The one exception, asserted rather than left to look like an oversight.
    A GET form replaces the whole query string with its own fields, so an
    action of `/signup?next=...` would submit the search and drop the
    destination. Pointing at the gate instead, `signedOutRedirect` carries
    the path and the query into `next` together.
  */
  const search = read('src/components/cms/sections/marketplace.tsx');
  yes('the search form still posts at the gate', /action="\/marketplace" method="get"/.test(search));
  yes('and says why', /GET form cannot/.test(search));

  /*
    Left alone for a different reason: these are drawn only where there is
    already a session, so the gate they would be saving a trip to is one
    their reader never meets.
  */
  const header = read('src/components/layout/site-header.tsx');
  yes('the header search is drawn only for an account', /\{user && searchOpen \? \(/.test(header));
}

console.log('\n--- the inventory pages have no signed-out render ---');
{
  /*
    The gate decides what arrives. This decides what a page does if anything
    ever gets past it.

    The marketplace page read the session and rendered a public gateway for a
    visitor without one - two hundred lines that had been unreachable since
    the gate closed, and that disagreed with every assertion above it. What
    replaces it is what /websites/[slug] has always done.
  */
  const marketplace = read('src/app/(app)/marketplace/page.tsx');
  yes(
    'the marketplace page requires a session',
    /requireCustomerSession\('\/marketplace'\)/.test(marketplace),
  );
  yes('rather than reading one and branching', !/getCurrentUser\(/.test(marketplace));
  // The masked preview is for the pages that are public. A copy here would be
  // a second answer to "what does a stranger see", on the page that has none.
  yes('and renders no redacted preview', !/RedactedPreview/.test(marketplace));

  const listing = read('src/app/(marketing)/websites/[slug]/page.tsx');
  yes('the listing page requires one too', /requireCustomerSession\(/.test(listing));

  const layout = read('src/app/(app)/marketplace/layout.tsx');
  yes('and the segment wears one chrome rather than choosing', !/SiteHeader/.test(layout));
}

console.log('\n--- crawl rules ---');
{
  const robots = read('src/app/robots.ts');

  /*
    The change that actually deindexes the listings.

    Disallow does not mean "drop this from the index", it means "do not fetch
    this" - and a URL Google may not fetch is one whose 307 and whose noindex
    header Google never sees. The listing URLs kept their place in the index on
    the strength of a crawl from months ago, which is what Search Console was
    reporting as live impressions.
  */
  yes('/websites is not disallowed', !/disallow[\s\S]*'\/websites/.test(robots));
  yes('nor /marketplace', !/disallow[\s\S]*'\/marketplace/.test(robots));
  yes('the private areas still are', /'\/dashboard\/'/.test(robots) && /'\/admin\/'/.test(robots));

  const layouts = [
    'src/app/(app)/marketplace/layout.tsx',
    'src/app/(marketing)/websites/layout.tsx',
  ];
  for (const path of layouts) {
    const layout = read(path);
    const segment = path.split('/').at(-2);
    yes(`${segment} is noindex at the segment`, /robots: \{ index: false, follow: false \}/.test(layout));
    // A cached render is a render made for whoever asked first. These depend on
    // the session, so one served from the edge would hand out the inventory
    // without the gate ever running.
    yes(`${segment} is never statically cached`, /export const dynamic = 'force-dynamic'/.test(layout));
  }
}

console.log('\n--- the sitemap ---');
{
  const sitemap = read('src/app/sitemap.ts');

  yes('no inventory path is submitted', !/'\/websites/.test(sitemap));
  // Submitting a URL that answers with noindex is an error reported back
  // against the whole file.
  yes('and /marketplace is not either', !/path: '\/marketplace'/.test(sitemap));

  yes('the niche pages are submitted', /guest-posts\/\$\{niche\}/.test(sitemap));
  // Generated from the same list the pages are, so the sitemap cannot offer a
  // page that 404s for want of inventory.
  yes('from the same list that decides they exist', sitemap.includes('publishedNiches()'));

  for (const kept of ["path: '/'", "'/how-it-works'", "'/resources'"]) {
    yes(`${kept} is still listed`, sitemap.includes(kept));
  }
  yes('and so are the blog posts', /resources\/\$\{post\.slug\}/.test(sitemap));
}

console.log('\n--- what a public niche page may know ---');
{
  const site = (over: Partial<Record<string, unknown>> = {}): WebsiteListItem =>
    ({
      id: String(over.id ?? 'w'),
      domain: String(over.domain ?? 'secret-publisher.com'),
      slug: String(over.slug ?? 'secret-publisher-com'),
      title: 'Secret Publisher',
      niche: 'finance',
      secondaryNiches: [],
      country: 'US',
      language: 'en',
      metrics: {
        domainRating: Number(over.dr ?? 70),
        organicTraffic: Number(over.traffic ?? 50_000),
        referringDomains: 900,
        trafficTrend: [],
        audienceSplit: [],
      },
      lowestPriceMinor: Number(over.price ?? 68_500),
      headlinePriceMinor: Number(over.price ?? 68_500),
      availableLinkTypes: ['guest-post'],
      services: [],
    }) as unknown as WebsiteListItem;

  const rows = toSampleRows([site(), site({ id: 'w2', domain: 'another-one.co.uk' })], 'Finance publisher');

  /*
    The guarantee, stated as a shape rather than as a habit: a `SampleRow` has
    no field that could hold a domain, a slug, a URL or a title. A component
    cannot render what it was never given, and neither can an RSC payload - so
    this holds however the page is edited later.
  */
  const serialised = JSON.stringify(rows);
  yes('no domain reaches the row', !serialised.includes('secret-publisher'));
  yes('nor a second one', !serialised.includes('another-one'));
  yes('nor a slug', !serialised.includes('secret-publisher-com'));
  yes('nor a title', !serialised.includes('Secret Publisher'));
  is('the publisher is described by its niche', rows[0]?.label, 'Finance publisher');
  // Positional, so it cannot become an identifier by accident.
  is('and keyed by position', rows[0]?.key, 'sample-0');

  const fields = new Set(Object.keys(rows[0] ?? {}));
  is('the row has exactly the fields it should', [...fields].sort().join(','), 'country,domainRating,key,label,price,traffic');

  /*
    A sample table is a claim about what is in the marketplace. A site with a
    strong rating and no readers is the thing buyers in this industry are most
    often sold, so putting one in the window would be making that pitch.
  */
  const quiet = toSampleRows([site({ traffic: 100 }), site({ id: 'w2', traffic: 40_000 })], 'Finance publisher');
  is('a listing nobody reads is not shown as an example', quiet.length, 1);
  const unpriced = toSampleRows([site({ price: 0 })], 'Finance publisher');
  is('nor is one with no price', unpriced.length, 0);

  // Ten rows all at the top end describe a marketplace nobody can afford.
  const many = Array.from({ length: 40 }, (_, index) =>
    site({ id: `w${index}`, dr: 90 - index, price: 90_000 - index * 2_000 }),
  );
  const sampled = toSampleRows(many, 'Finance publisher');
  is('ten rows are shown', sampled.length, 10);
  yes('the strongest is among them', sampled[0]?.domainRating === 90);
  yes('and so is the weakest', sampled.at(-1)?.domainRating === 51);
  yes('with a real spread between', new Set(sampled.map((row) => row.domainRating)).size === 10);

  is('a spread of five from twenty keeps both ends', spread([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5).join(','), '1,3,6,8,10');
  is('and a short list is returned whole', spread([1, 2], 5).length, 2);

  const stats = toStats([site({ dr: 40 }), site({ id: 'w2', dr: 85, price: 12_000 })]);
  is('the rating range is the real one', `${stats.drMin}-${stats.drMax}`, '40-85');
  is('and the starting price is the cheapest', stats.startingPrice.replace(/[^0-9]/g, ''), '120');
}

console.log('\n--- the copy ---');
{
  const entries = Object.entries(NICHE_COPY);
  yes('every niche with a page has copy', entries.length >= 10);

  /*
    Fifteen pages that are one paragraph with a word swapped are fifteen pages
    Google has already seen, and they compete with each other rather than with
    anybody else.
  */
  const intros = new Set(entries.map(([, copy]) => copy!.intro));
  is('no two intros are the same', intros.size, entries.length);
  const questions = entries.flatMap(([, copy]) => copy!.faqs.map((faq) => faq.question));
  is('no two niches ask the same question', new Set(questions).size, questions.length);

  for (const [slug, copy] of entries) {
    yes(`${slug} has three questions`, copy!.faqs.length === 3);
    yes(`${slug} has a title short enough to survive`, copy!.metaTitle.length <= 60);
    yes(`${slug} has a usable description`, copy!.metaDescription.length >= 110 && copy!.metaDescription.length <= 170);
  }

  /*
    "Link building" is the homepage's term. Two of our own pages competing for
    it is a self-inflicted problem, so no niche page targets it in the one
    place that decides what it ranks for.
  */
  const competing = entries.filter(([, copy]) => /link building/i.test(`${copy!.heading} ${copy!.metaTitle}`));
  is('no niche page targets the homepage\'s term', competing.length, 0);

  // iGaming is offered and does not lead.
  const directory = read('src/components/marketing/niche-directory.tsx');
  yes('igaming has a page like any other', 'igaming' in NICHE_COPY);
  yes('and is deliberately not listed first', /slug !== 'igaming'[\s\S]*slug === 'igaming'/.test(directory));

  const page = read('src/app/(marketing)/guest-posts/[niche]/page.tsx');
  yes('the FAQ schema is built from the answers on the page', /copy\.faqs\.map/.test(page));
  yes('the call to action returns to the filtered marketplace', /next=\$\{encodeURIComponent\(`\/marketplace\?niche=/.test(page));
  yes('a niche too thin to describe is a 404', page.includes('if (!landing) notFound()'));
  yes(`and thin means fewer than ${MIN_LISTINGS_FOR_A_PAGE}`, MIN_LISTINGS_FOR_A_PAGE >= 10);
}

console.log('\n--- what a listing overview says ---');
{
  /*
    Listings arrive from a CSV or a publisher's reply and neither carries an
    editorial write-up, so "Website Overview" was a heading with nothing under
    it across the marketplace.

    The word count, link count, link attribute and sponsored policy printed here
    are `emptyRules()` defaults on an imported listing, and that is deliberate:
    they are the standard terms we sell on and hold a publisher to unless their
    own email said otherwise, at which point extraction overwrites them. A
    decision about the business rather than about the data.
  */
  const imported = {
    domain: 'imported.example',
    overview: '',
    description: '',
    niche: 'technology',
    secondaryNiches: [],
    country: undefined,
    language: 'en',
    services: [{ type: 'guest-post', available: true, turnaroundMinDays: 0, turnaroundMaxDays: 0 }],
    rules: {
      minWordCount: 800,
      maxWordCount: 1600,
      maxLinks: 1,
      linkAttribute: 'dofollow',
      sponsoredTag: 'never',
      acceptedNiches: [],
      restrictedNiches: [],
      contentProvidedBy: 'either',
    },
  } as unknown as Website;

  const bare = websiteOverview(imported);
  yes('a listing with nothing written still gets an overview', bare.length > 0);
  yes('it leads with what the publication is', bare.startsWith('imported.example is a technology publication'));
  yes('it says what can be bought', bare.includes('guest posts'));
  yes('and the standard terms it sells on', /800 to 1600 words with up to one link/.test(bare));
  yes('including the link attribute', bare.includes('dofollow'));

  /*
    Two things stay out, for different reasons.

    The country, where it came from the marketplace-wide 'GB' default: `country`
    is undefined for those, so a listing nobody has placed says nothing about
    where it is read rather than claiming Britain.
  */
  yes('no market is claimed for a listing nobody placed', !/readership is mainly/.test(bare));

  // And the metrics, which change on every refresh - prose quoting them is
  // wrong within a week while reading as authoritative.
  yes('no rating or traffic figure is written into the prose', !/\bDR\b|domain rating|monthly visits|organic traffic/i.test(bare));

  // Nothing is guessed from the domain name.
  yes('and nothing is invented about the subject', !/leading|trusted|popular|authoritative/i.test(bare));

  /*
    What a listing somebody has actually worked on says. The publisher's own
    line leads when the import carried one, because it is the only field that
    says anything specific about the site.
  */
  const described = {
    ...imported,
    description: 'Danish personal finance desk covering mortgages and pensions.',
    country: 'DK',
    secondaryNiches: ['business'],
    services: [{ type: 'guest-post', available: true, turnaroundMinDays: 2, turnaroundMaxDays: 5 }],
    rules: { ...imported.rules, acceptedNiches: ['gambling', 'crypto'], restrictedNiches: ['adult'] },
  } as unknown as Website;

  const full = websiteOverview(described);
  yes("the publisher's own line leads", full.startsWith('Danish personal finance desk'));
  yes('a stated market is named', full.includes('mainly in Denmark'));
  yes('a stated turnaround is given', /2 to 5 working days/.test(full));
  yes('a topic the publisher agreed to carry', full.includes('Gambling and iGaming'));
  yes('and one they refused', /will not take: adult/.test(full));

  // Several labels contain "and", so an ordinary list reads as four topics.
  yes('two topics whose labels contain "and" stay two', full.includes('Gambling and iGaming, Crypto and web3'));
  // Silence is neither acceptance nor refusal: nothing is said about a topic
  // the publisher never raised.
  yes('a topic nobody mentioned is not mentioned', !/adult content is accepted/i.test(full));

  // A turnaround nobody stated is not invented as zero days.
  yes('an unstated turnaround is simply absent', !/working days/.test(bare));

  // Anything written by hand wins outright.
  is('a hand-written overview is used as it is', websiteOverview({ ...described, overview: 'Written by an editor.' } as unknown as Website), 'Written by an editor.');

  // The row shapes the mapper coalesces, in case one ever does not.
  const sparse = { domain: 'x.example', niche: 'business', rules: {} } as unknown as Website;
  yes('a row missing its optional fields does not throw', typeof websiteOverview(sparse) === 'string');

  const panel = read('src/components/website/website-sections.tsx');
  yes('the panel renders the derived overview', panel.includes('websiteOverview(website)'));
  yes('and shows no heading when there is nothing to say', /\{overview \? \(/.test(panel));
}

console.log('\n--- reading what a publisher says about themselves ---');
{
  /*
    `description` is empty on almost every listing - the importer writes '' and
    the only thing that has ever filled it is somebody typing into the admin
    editor. It is also what the overview leads with and what the card, the table
    row and the snippet print, so one empty column shows in five places.

    A publisher's own meta description fills it, costs nothing but an HTTP
    request, and is better copy than anything that could be generated: written
    by them, about them, for strangers.
  */
  const found = (html: string) => describeFromHtml(html);

  is(
    'a plain meta description is read',
    found('<meta name="description" content="UK casino review desk covering licensing, bonuses and responsible play.">'),
    'UK casino review desk covering licensing, bonuses and responsible play.',
  );

  // Real pages put content before name as often as after, and quote it with
  // either kind of quote or none. A parser that only handles the tidy form
  // reports half the web as having no description.
  is(
    'however the attributes are ordered',
    found('<meta content="Danish personal finance desk covering mortgages and pensions daily." name="description"/>'),
    'Danish personal finance desk covering mortgages and pensions daily.',
  );
  is(
    'and whichever quotes are used',
    found("<meta name='description' content='Independent motoring title covering EV running costs and used buying.'>"),
    'Independent motoring title covering EV running costs and used buying.',
  );
  yes(
    'entities are decoded rather than printed',
    found('<meta name="description" content="Film &amp; TV criticism &mdash; reviews and streaming news every single week.">') ===
      'Film & TV criticism — reviews and streaming news every single week.',
  );

  yes(
    'Open Graph is the fallback',
    found('<meta property="og:description" content="Sports betting strategy, odds comparison and bookmaker reviews for punters.">')?.startsWith('Sports betting strategy'),
  );
  yes(
    'and the title the last resort',
    found('<title>Allotment growing, soil health and UK planting calendars - Garden Grain</title>')?.startsWith('Allotment growing'),
  );

  /*
    The cases that matter most, because each one is grammatical, specific-looking
    and says nothing about the publication. A WordPress install with no SEO
    plugin, a parked domain and a block page would all produce a confident
    sentence on a page somebody spends money from.
  */
  for (const [what, html] of [
    ['a WordPress default', '<meta name="description" content="Just another WordPress site">'],
    ['a parked domain', '<meta name="description" content="This domain is for sale. Buy it now from our marketplace today.">'],
    ['a block page', '<title>Attention Required! | Cloudflare</title>'],
    ['a placeholder', '<meta name="description" content="Your site description goes here and should be replaced">'],
    ['a holding page', '<meta name="description" content="Coming soon - our brand new website is under construction">'],
    ['an error page', '<title>404 Not Found - the page you wanted is not here any more</title>'],
    ['something too short to say anything', '<meta name="description" content="Home page">'],
    ['a single word', '<meta name="description" content="Bingo">'],
    ['a page with nothing on it', '<html><body><h1>Hello</h1></body></html>'],
  ] as const) {
    is(`${what} contributes nothing`, found(html), undefined);
  }

  // Long enough to be a sentence about a site, short enough to be a line.
  yes('a very long description is trimmed', (found(`<meta name="description" content="${'a publication about things '.repeat(40)}">`) ?? '').length <= 321);
  yes('and a reasonable one is not', !(found('<meta name="description" content="A weekly magazine covering independent film, music and the people who make them.">') ?? '').endsWith('…'));

  is('the floor is a sentence, not a word', isUsefulDescription('Bingo'), false);
  is('and a real line clears it', isUsefulDescription('A weekly magazine covering independent film and music.'), true);

  /*
    The run only fills blanks, so it is safe to press repeatedly and cannot undo
    an edit - which is also why there is no "overwrite" option anywhere in it.
  */
  const service = read('src/lib/services/site-description-service.ts');

  /*
    Scoped to the runner's own body, not the file.

    The filter appeared twice - the runner used it and the counter on the admin
    page uses it - so a check against the whole file passed with the runner's
    copy deleted. Which is to say it was not checking anything: it would have
    let through a pass that overwrote every description in the marketplace.

    The selection has since moved into SQL, where a conjunction of two
    disjunctions can be written once and read back, so the first half of this
    now checks the migration and the second half checks the writer.
  */
  const runner = service.slice(
    service.indexOf('export async function advanceDescriptionRun'),
    service.length,
  );
  yes('the runner was found to check', runner.length > 400);

  const sweepSql = read('supabase/migrations/0048_description_runs.sql');
  const selection = sweepSql.slice(
    sweepSql.indexOf('create or replace function public.description_sweep_batch'),
    sweepSql.indexOf('revoke all on function public.description_sweep_batch'),
  );
  yes('the selection was found to check', selection.length > 200);
  yes(
    'only listings with no description are looked at',
    /w\.description is null or w\.description = ''/.test(selection),
  );
  yes(
    'and only ones this sweep has not already read',
    /description_checked_at is null or w\.description_checked_at < p_since/.test(selection),
  );
  // Read-only, so a selection bug can never write anything either.
  yes('the selection cannot write', !/\b(update|insert|delete)\b/i.test(selection));

  /*
    Two columns, and only two.

    `description_checked_at` is written beside the description now, because the
    stamp is what moves the sweep forward. Anything else appearing in this
    update would be a crawler with write access to the inventory.
  */
  yes('and only the description is written', /description: outcome\.description/.test(runner));
  yes('with the stamp that moves the sweep on', /description_checked_at: stamped/.test(runner));
  yes(
    'nothing else on the row is touched',
    !/\.from\('websites'\)[\s\S]{0,400}?(price|status:|domain:|niche)/.test(runner),
  );
  yes('requests time out rather than hanging a run', /AbortSignal\.timeout/.test(service));
  yes('the crawler says who it is', /PressParrotBot|USER_AGENT/.test(service));
  yes('and does not open hundreds of connections at once', /AT_ONCE/.test(service));
}

console.log('\n--- nothing reads the database at build time ---');
{
  /*
    Five production deploys failed in a row and the local build passed every
    time, because locally Supabase is switched off: the data layer falls back to
    seed data and never opens a client. With it on - which is every deploy - the
    repository calls `getServerClient()`, which calls `cookies()`, and Next
    refuses that outside an HTTP request:

      Route /guest-posts/[niche] used `cookies()` inside `generateStaticParams`.

    `generateStaticParams` is the one place a page runs at build time, so it is
    the one place a data-layer call turns into a failed deploy rather than a
    slow page. It is also pointless on a `force-dynamic` route, which is what
    that one was.
  */
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
      else if (entry.name === 'page.tsx' || entry.name === 'layout.tsx') pages.push(`${dir}/${entry.name}`);
    }
  };
  walk('src/app');

  yes(`every route was found to check (${pages.length})`, pages.length > 20);

  const offenders: string[] = [];
  for (const page of pages) {
    /*
      Comments stripped first.

      Without that, this flagged the very page it was written for: the comment
      explaining why `generateStaticParams` was removed names both it and the
      function it used to call, so the check matched prose describing the
      absence of the thing it was looking for.
    */
    const source = read(page)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const at = source.indexOf('generateStaticParams');
    if (at === -1) continue;

    // The function body, not the file: a page may legitimately read the
    // database in the component below it, which runs per request.
    const body = source.slice(at, at + 600);
    if (/websiteService|publishedNiches|blogService|customPageService|pageContentService|getServerClient|supabase/i.test(body)) {
      offenders.push(page);
    }
  }
  is('no generateStaticParams reads the data layer', offenders.join(', '), '');
}

// ---------------------------------------------------------------------------
console.log('\n--- the live site cannot serve demo data quietly ---');

/*
  The worst failure in the application, and the only silent one: with
  `NEXT_PUBLIC_DATA_SOURCE` unset or the Supabase keys missing, every service
  answers from the mock store and `signInAction` falls through to the branch
  where any address signs in and creates an account. On a clone and on a
  preview deploy that is the feature. On pressparrot.com it is demo prices
  shown as real prices and a stranger signing in as somebody else.

  Asserted in both directions, because a guard that says yes to everything
  protects the live site and breaks every preview deploy, and one that says no
  to everything protects nothing.
*/
{
  const deployment = await import('../src/lib/config/deployment');
  const was = {
    vercel: process.env.VERCEL_ENV,
    site: process.env.NEXT_PUBLIC_SITE_URL,
    source: process.env.NEXT_PUBLIC_DATA_SOURCE,
  };

  const live = (env: { VERCEL_ENV?: string; NEXT_PUBLIC_SITE_URL?: string }) => {
    if (env.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = env.VERCEL_ENV;
    if (env.NEXT_PUBLIC_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = env.NEXT_PUBLIC_SITE_URL;
    return deployment.isLiveDeployment();
  };

  yes('a Vercel production deployment is the live site', live({ VERCEL_ENV: 'production' }));
  is('a preview deployment is not', live({ VERCEL_ENV: 'preview' }), false);
  /*
    The one that caught a real mistake: `siteUrl` falls back to the production
    domain whenever the variable is unset, so reading the derived value made
    `next start` on a laptop announce itself as pressparrot.com. Somebody has
    to have declared it.
  */
  is('a build that declares no site URL is not', live({}), false);
  yes(
    'a self-hosted deployment that declares the real domain is',
    live({ NEXT_PUBLIC_SITE_URL: 'https://pressparrot.com' }),
  );
  yes('and www. of it is the same site', live({ NEXT_PUBLIC_SITE_URL: 'https://www.pressparrot.com' }));
  is('a staging domain is not', live({ NEXT_PUBLIC_SITE_URL: 'https://staging.pressparrot.dev' }), false);

  // And the question that actually gates sign-in.
  process.env.VERCEL_ENV = 'production';
  delete process.env.NEXT_PUBLIC_DATA_SOURCE;
  yes('the live site on the mock store reports itself', deployment.isServingDemoDataLive());
  yes('and names the two things to set', /NEXT_PUBLIC_DATA_SOURCE=supabase/.test(deployment.DEMO_DATA_MESSAGE)
    && /Supabase keys/.test(deployment.DEMO_DATA_MESSAGE));
  process.env.VERCEL_ENV = 'preview';
  is('a preview on the mock store does not', deployment.isServingDemoDataLive(), false);

  /*
    `signInAction` is the one that matters, and it cannot be imported here -
    it is a server action behind 'use server'. So the assertion is that the
    refusal is wired to the same question, in both branches that can issue a
    mock session.
  */
  const actions = read('src/app/(auth)/actions.ts');
  is(
    'both mock-session branches refuse on the live site',
    (actions.match(/isServingDemoDataLive\(\)\) return \{ error: demoAuthRefused \}/g) ?? []).length,
    2,
  );

  if (was.vercel === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = was.vercel;
  if (was.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = was.site;
  if (was.source === undefined) delete process.env.NEXT_PUBLIC_DATA_SOURCE;
  else process.env.NEXT_PUBLIC_DATA_SOURCE = was.source;
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
