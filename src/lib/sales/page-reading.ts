import * as cheerio from 'cheerio';
import { salesSegments } from '@/lib/config/sales-segments';
import type { ProspectPage, ProspectSignals, SalesSegment } from '@/lib/types/sales';

/**
 * Reading a prospect's own website.
 *
 * Pure: HTML in, text and facts out. Nothing here opens a socket, which is
 * what lets every rule below be checked against the page shapes real sites
 * come in rather than against whichever site happens to be up today. The same
 * split `monitoring/verdict.ts` uses, for the same reason.
 *
 * Two things matter about what this returns.
 *
 * The excerpt is **plain text**. The markup is gone before the value is
 * returned, let alone stored, so there is no path by which a `<script>` from
 * a stranger's homepage reaches a page we render or a prompt we send. Scripts,
 * styles, navigation and footers are dropped outright: they are the same on
 * every page of a site and they are most of the bytes.
 *
 * The signals are **counts and presences, never conclusions**. "The phrase
 * 'link building' appears on /services" is a fact. "This is a link building
 * agency" is a judgement, and judgements are the model's job - recorded
 * separately, with the quote they came from, so that when one turns out to be
 * wrong the evidence it was made from is still here.
 */

/** A homepage is HTML. More than this is a payload, not a page. */
export const MAX_BYTES = 400_000;

/** Enough for a model to read, bounded so one verbose site cannot dominate a prompt. */
const MAX_EXCERPT = 6_000;

export interface ReadPage {
  title?: string;
  text: string;
  /** Internal links worth following, absolute, deduplicated, in page order. */
  links: string[];
  /** Outbound hosts, which is how an affiliate gives itself away. */
  externalHosts: string[];
}

/**
 * Which page is which, from its path.
 *
 * Path-based rather than content-based on purpose: the crawl has to decide
 * what to fetch next before it has read anything, and a heading that says
 * "Our Services" is no more reliable than a URL that says `/services`.
 */
const KIND_PATTERNS: { kind: ProspectPage['kind']; pattern: RegExp }[] = [
  { kind: 'services', pattern: /\/(services?|what-we-do|solutions?|offerings?)(\/|$)/i },
  { kind: 'pricing', pattern: /\/(pricing|prices?|plans?|packages?|rates?)(\/|$)/i },
  { kind: 'about', pattern: /\/(about|about-us|who-we-are|our-story|team)(\/|$)/i },
  { kind: 'clients', pattern: /\/(clients?|case-stud(y|ies)|portfolio|work|results)(\/|$)/i },
  { kind: 'contact', pattern: /\/(contact|contact-us|get-in-touch|enquir)(\/|$)/i },
  { kind: 'blog', pattern: /\/(blog|news|insights?|resources?|articles?)(\/|$)/i },
];

export function pageKind(url: string): ProspectPage['kind'] {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Not a URL we can parse. The patterns below work on the raw string, and
    // a path that cannot be parsed is almost always a relative one.
  }

  if (path === '' || path === '/') return 'home';

  for (const entry of KIND_PATTERNS) {
    if (entry.pattern.test(path)) return entry.kind;
  }
  return 'other';
}

/**
 * Pages worth spending a request on, in the order worth spending it.
 *
 * A services page says what they sell, a pricing page says at what, a clients
 * page says to whom. A blog index says the least of the four and costs the
 * same, so it goes last. The homepage is always first because it is the one
 * page every site has.
 */
const KIND_PRIORITY: ProspectPage['kind'][] = [
  'home',
  'services',
  'pricing',
  'about',
  'clients',
  'blog',
  'contact',
];

export function prioritiseUrls(urls: string[], limit: number): string[] {
  const seen = new Set<string>();
  const byKind = new Map<ProspectPage['kind'], string[]>();

  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const kind = pageKind(url);
    const list = byKind.get(kind) ?? [];
    // One page of each kind. A site with forty service pages contributes its
    // first, not forty requests' worth of the same sentences.
    if (list.length === 0) byKind.set(kind, [url]);
  }

  const picked: string[] = [];
  for (const kind of KIND_PRIORITY) {
    const list = byKind.get(kind);
    if (list && list[0]) picked.push(list[0]);
    if (picked.length >= limit) break;
  }

  return picked.slice(0, limit);
}

/**
 * One page, read.
 *
 * `base` is where the request ended up after redirects, not where it was
 * aimed: a site that redirects to www or to a country path would otherwise
 * have every relative link resolved against the wrong origin.
 */
export function readPage(html: string, base: string): ReadPage {
  const $ = cheerio.load(html.slice(0, MAX_BYTES));

  // Gone before anything is read. These are the same on every page of a site,
  // they are most of its bytes, and one of them is executable.
  $('script, style, noscript, svg, iframe, template, nav, header, footer, form').remove();

  const title = $('title').first().text().trim() || undefined;

  const text = $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EXCERPT);

  let origin = '';
  try {
    origin = new URL(base).origin;
  } catch {
    origin = '';
  }

  const links: string[] = [];
  const externalHosts = new Set<string>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;

    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      return;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;

    if (origin && resolved.origin === origin) {
      resolved.hash = '';
      resolved.search = '';
      links.push(resolved.toString());
    } else {
      externalHosts.add(resolved.hostname.replace(/^www\./, ''));
    }
  });

  return { title, text, links, externalHosts: [...externalHosts] };
}

/**
 * What the pages establish, without asking a model.
 *
 * Every matched term carries the page it was found on. That is the part worth
 * insisting on: a term with no page behind it is a claim nobody can check,
 * and the whole reason these are kept apart from the qualification is so that
 * a changed prompt cannot rewrite the evidence the old judgement was made
 * from.
 *
 * Terms are matched on word boundaries. Without that, "best" matches
 * "bestseller" and every ecommerce site in the list reads as an affiliate.
 */
export function signalsFrom(pages: { url: string; kind: ProspectPage['kind']; text: string }[]): ProspectSignals {
  const matched: { term: string; url: string }[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    const haystack = page.text.toLowerCase();

    for (const segment of salesSegments) {
      for (const term of segment.terms) {
        if (seen.has(term)) continue;
        const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (pattern.test(haystack)) {
          seen.add(term);
          matched.push({ term, url: page.url });
        }
      }
    }
  }

  return {
    pagesFetched: pages.length,
    matchedTerms: matched,
    hasServicesPage: pages.some((page) => page.kind === 'services'),
    hasPricingPage: pages.some((page) => page.kind === 'pricing'),
    hasBlog: pages.some((page) => page.kind === 'blog'),
  };
}

/**
 * The segment the terms point at, or nothing.
 *
 * A first guess, used only to narrow what the model is asked and to sort the
 * list before anybody has read it. It returns undefined on a tie rather than
 * picking the first: a company whose copy matches two segments equally is a
 * company nobody should label from its copy alone.
 */
export function guessSegment(signals: ProspectSignals): SalesSegment | undefined {
  const counts = new Map<SalesSegment, number>();

  for (const entry of signals.matchedTerms ?? []) {
    for (const segment of salesSegments) {
      if (segment.terms.includes(entry.term)) {
        counts.set(segment.slug, (counts.get(segment.slug) ?? 0) + 1);
      }
    }
  }

  if (counts.size === 0) return undefined;

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [best, bestCount] = ranked[0]!;
  if (ranked.length > 1 && ranked[1]![1] === bestCount) return undefined;

  return best;
}
