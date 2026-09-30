/**
 * Live numbers inside editorial copy.
 *
 * "We list {{marketplace_site_count}} websites" has to be true on the day
 * somebody reads it, and the alternative - an editor typing 950 into a
 * heading - is wrong within a week and wrong silently. So a small set of
 * tokens resolve at render time from the same aggregates the public pages
 * already show.
 *
 * The list is closed. There is no query, no table name and no expression in
 * CMS content: a token is a key in this map or it is nothing. Letting
 * editorial copy reach the database would be a way to read the inventory
 * through a heading, which is exactly what the marketplace gating exists to
 * prevent.
 */

/** Every token an editor may use, and what it means. */
export const TOKENS: { key: string; label: string; help: string }[] = [
  {
    key: 'marketplace_site_count',
    label: 'Total websites',
    help: 'How many live listings the marketplace holds.',
  },
  {
    key: 'niche_count',
    label: 'Number of niches',
    help: 'How many categories have at least one listing.',
  },
  {
    key: 'country_count',
    label: 'Number of countries',
    help: 'How many countries the publishers are in.',
  },
  {
    key: 'gambling_site_count',
    label: 'Gambling websites',
    help: 'Listings in Gambling and iGaming. Used on the gambling page.',
  },
];

export type TokenValues = Partial<Record<string, string>>;

const PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

const KNOWN = new Set(TOKENS.map((token) => token.key));

/**
 * Replace the tokens in a string.
 *
 * A token nobody has a value for is removed rather than left on the page.
 * Showing a visitor `{{gambling_site_cont}}` is worse than showing them a
 * sentence with a gap in it - and the editor warns about unknown tokens on
 * save, which is where a typo should be caught rather than in production.
 */
export function applyTokens(source: string, values: TokenValues): string {
  if (!source.includes('{{')) return source;

  return source
    .replace(PATTERN, (_match, key: string) => values[key.toLowerCase()] ?? '')
    // A removed token usually leaves a double space behind it.
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Tokens in this text that nothing will ever fill in. For the editor's warning. */
export function unknownTokens(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(PATTERN)) {
    const key = match[1].toLowerCase();
    if (!KNOWN.has(key)) found.add(match[1]);
  }
  return [...found];
}
