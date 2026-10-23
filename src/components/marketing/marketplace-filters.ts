/**
 * What the marketplace can be filtered by, as the service pages list it.
 *
 * One copy, because it is a statement about what the product does rather
 * than page copy: a list that drifts promises a filter the marketplace does
 * not have, and the page promising it is the one nobody re-reads. It is
 * fixed in code for the same reason the icons are - an editor changes words,
 * not what the software can do.
 *
 * The homepage's two bands list seven of these under shorter names and are
 * deliberately not this array: they are a different drawing of a different
 * size, and collapsing them here would change what those pages say.
 */
export const MARKETPLACE_FILTERS = [
  'Domain Rating',
  'Organic Traffic',
  'Referring Domains',
  'Country',
  'Niche',
  'Price',
  'Turnaround',
  'Link Type',
] as const;
