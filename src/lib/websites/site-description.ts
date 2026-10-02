/**
 * What a publisher says their own site is about.
 *
 * The listing overview leads with `description`, and `description` is empty on
 * almost every listing: the importer writes `''` and the only thing that has
 * ever filled it is somebody typing into the admin editor. Seventeen hundred
 * listings is not a typing job.
 *
 * A site's own meta description is the answer, and it is the right answer
 * rather than a convenient one. It is written by the publisher, about the
 * publisher, to be read by strangers - which is exactly the sentence the panel
 * wants. Nothing is inferred from the domain name, and no model is asked to
 * imagine what a site it has never seen might cover.
 *
 * This half is pure: HTML in, a sentence out. The fetching is somewhere else,
 * so the parsing can be checked against the shapes real pages come in without
 * a network.
 */

/** Length a description is worth keeping. Shorter is a slogan, longer is a page. */
const MIN_USEFUL = 40;
const MAX_KEPT = 320;

/**
 * Lines that describe the platform rather than the publication.
 *
 * A WordPress install with no SEO plugin serves its theme's boilerplate, and a
 * parked or expired domain serves the registrar's. Both are grammatical,
 * specific-looking and say nothing about the site - which makes them worse than
 * an empty description, because an empty one is visibly empty.
 */
const BOILERPLATE = [
  /^just another wordpress site/i,
  /^just another .{0,40} weblog/i,
  /^my wordpress blog/i,
  /^this (domain|website) (is|may be) for sale/i,
  /^buy this domain/i,
  /^the domain name .{0,60} is for sale/i,
  /^welcome to wordpress/i,
  /^site description$/i,
  /^your (site|website) description/i,
  /^enter a description/i,
  /^wix website|^squarespace|^godaddy/i,
  /^coming soon/i,
  /^under construction/i,
  /^index of \//i,
  /^error|^404|^403|^not found/i,
  /^attention required|^access denied|^are you a robot/i,
  /^one moment, please/i,
];

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    hellip: '…',
    mdash: '—',
    ndash: '–',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => named[name.toLowerCase()] ?? whole);
}

function tidy(value: string): string {
  return decodeEntities(value)
    // Markup inside a meta attribute is somebody else's bug, not our content.
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The content of one meta tag, whichever order its attributes are written in.
 *
 * Real pages put `content` before `name` as often as after it, and quote it
 * with either kind of quote or none. A parser that only handles the tidy form
 * reports half the web as having no description.
 */
function metaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const attribute = key.startsWith('og:') || key.startsWith('twitter:') ? 'property|name' : 'name|property';
    const pattern = new RegExp(
      `<meta[^>]*?(?:${attribute})\\s*=\\s*["']?${key.replace(':', '\\:')}["']?[^>]*?>`,
      'i',
    );
    const tag = pattern.exec(html)?.[0];
    if (!tag) continue;

    const content = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = tidy(content?.[1] ?? content?.[2] ?? content?.[3] ?? '');
    if (value) return value;
  }
  return undefined;
}

function title(html: string): string | undefined {
  const found = /<title[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(html)?.[1];
  const value = found ? tidy(found) : '';
  return value || undefined;
}

/** Is this a real description of a publication, or the platform talking? */
export function isUsefulDescription(value: string): boolean {
  const text = value.trim();
  if (text.length < MIN_USEFUL) return false;
  if (BOILERPLATE.some((pattern) => pattern.test(text))) return false;
  // A description that is only the domain, or only a brand name, says nothing.
  if (!/\s/.test(text)) return false;
  return true;
}

/**
 * A publisher's own description of their site, from their homepage.
 *
 * `description` first, then Open Graph and Twitter, then the title - in
 * descending order of how likely each is to be a sentence about the site
 * rather than a headline. The title is accepted only when it reads like a
 * description rather than a page name, which is what the length floor is for.
 *
 * Undefined when nothing on the page qualifies. An empty description is a
 * paragraph the overview leaves out; a wrong one is a claim on a page somebody
 * spends money from.
 */
export function describeFromHtml(html: string): string | undefined {
  const candidates = [
    metaContent(html, ['description']),
    metaContent(html, ['og:description']),
    metaContent(html, ['twitter:description']),
    title(html),
  ];

  for (const candidate of candidates) {
    if (candidate && isUsefulDescription(candidate)) {
      return candidate.length > MAX_KEPT ? `${candidate.slice(0, MAX_KEPT).trimEnd()}…` : candidate;
    }
  }
  return undefined;
}
