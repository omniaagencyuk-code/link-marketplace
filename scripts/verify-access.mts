/**
 * Prove the inventory is not readable without an account, and that the public
 * pages which replaced it cannot leak one.
 *
 * Two different failures, both silent. A gate that lets a path through shows a
 * stranger the thing we sell. A public page that carries a domain into its HTML
 * shows them the same thing more politely. Neither announces itself, and both
 * are found by a competitor rather than by us.
 */
import { readFileSync } from 'node:fs';
import { safeReturnPath, returnPathFor } from '../src/lib/auth/return-to';
import { spread, toSampleRows, toStats, MIN_LISTINGS_FOR_A_PAGE } from '../src/lib/services/niche-landing';
import { NICHE_COPY } from '../src/lib/content/niche-guest-posts';
import { websiteOverview } from '../src/lib/websites/overview';
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
    'src/app/(marketing)/marketplace/layout.tsx',
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

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
