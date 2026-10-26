/**
 * What the quick filters offer, in what order, and what typing finds.
 *
 * One copy, and a pure one. The niche and country controls appear twice -
 * as the comboboxes in the quick row and as the checkbox lists in the
 * advanced panel - and the thing that must not drift between them is which
 * options exist and what each one is called. The order and the matching
 * live here so a suite can run them without a browser.
 *
 * ## Alphabetical, not "most listings first"
 *
 * The country list used to arrive biggest-first, straight off the facet
 * counts, which is the right order for a list somebody is browsing and the
 * wrong one for a list somebody is *looking in*. A buyer who wants Ireland
 * does not know whether it is third or thirtieth, so they read every row.
 * Alphabetical means they can stop reading as soon as they are past it, and
 * the counts still say which are worth picking.
 *
 * `localeCompare` with an explicit locale rather than `<`: sorting by code
 * point puts every accented name after Z, which is how "Österreich" ends up
 * below "Zimbabwe".
 */
import { categories, nicheName } from '@/lib/data/categories';
import { countryName } from '@/lib/data/countries';
import type { CountryCode, NicheSlug } from '@/lib/types';

export interface FilterOption<T extends string = string> {
  value: T;
  /** What a reader sees, and what a typed query is matched against. */
  label: string;
  /** How many listings this option would return, where that is known. */
  count?: number;
  /**
   * Extra things a typed query may match, never drawn.
   *
   * Country codes, so that typing "GB" finds the United Kingdom - the thing
   * somebody who works with these lists all day will reach for first, and
   * the one string the name does not contain.
   */
  keywords?: string[];
}

const collator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true });

const byLabel = <T extends string>(a: FilterOption<T>, b: FilterOption<T>) =>
  collator.compare(a.label, b.label);

/**
 * Every niche, alphabetically, with how many listings carry it.
 *
 * All of them, including the ones at zero, which is what the control has
 * always offered: a niche missing from the list reads as a niche the
 * marketplace does not cover, and the count beside it already says the
 * truer thing. `count` is left undefined rather than set to 0 so the
 * drawing can tell "none right now" from "not counted".
 */
export function nicheOptions(
  counts: Partial<Record<NicheSlug, number>> = {},
): FilterOption<NicheSlug>[] {
  return categories
    .map((category) => {
      const slug = category.slug as NicheSlug;
      const count = counts[slug];
      return { value: slug, label: nicheName(slug), ...(count ? { count } : {}) };
    })
    .sort(byLabel);
}

/**
 * The countries that have listings, alphabetically, with their counts.
 *
 * Still only the ones something is in - that rule is older than this file
 * and is the reason the facet is counted at all: offering a country nothing
 * is in empties the screen with no hint why. What changes here is only the
 * order they are read in.
 */
export function countryOptions(
  countries: readonly (readonly [CountryCode, number])[],
): FilterOption<CountryCode>[] {
  return countries
    .map(([code, count]) => ({
      value: code,
      label: countryName(code),
      count,
      keywords: [code],
    }))
    .sort(byLabel);
}

/**
 * A string reduced to what a search should compare.
 *
 * Case and accents both dropped, because somebody typing "cote" is looking
 * for Côte d'Ivoire and a filter that disagrees is a filter that says the
 * country is not there.
 */
export function normaliseQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether one option answers what somebody typed. */
export function optionMatches(option: FilterOption, query: string): boolean {
  const needle = normaliseQuery(query);
  if (!needle) return true;
  if (normaliseQuery(option.label).includes(needle)) return true;
  return (option.keywords ?? []).some((keyword) => normaliseQuery(keyword).includes(needle));
}

/**
 * The options left after typing, in the order they were already in.
 *
 * Deliberately not re-ranked by how well each one matches. A list that
 * reorders itself under the cursor moves the row somebody was reaching for,
 * and the whole point of the alphabetical order is that it does not move.
 */
export function filterOptions<T extends string>(
  options: FilterOption<T>[],
  query: string,
): FilterOption<T>[] {
  return options.filter((option) => optionMatches(option, query));
}

/**
 * What the closed control says.
 *
 * Nothing selected is the "all" wording the single dropdown always had. One
 * is named, because naming it is the whole reason somebody looks at a
 * closed control. More than one is counted rather than listed: three
 * country names do not fit the box, and a truncated list is a worse answer
 * than a number when the chips underneath carry every name anyway.
 */
export function summariseSelection(
  labels: string[],
  { all, noun }: { all: string; noun: string },
): string {
  if (labels.length === 0) return all;
  if (labels.length === 1) return labels[0]!;
  return `${labels.length} ${noun}`;
}

/**
 * Adding one to the set, or taking one out of it.
 *
 * The whole of what "choose more than one" means, kept here rather than
 * inline in the control so a suite can run it: a source file can be read to
 * check which function a component calls, but only this can be asked
 * whether picking a second country keeps the first. That is the exact
 * regression the single dropdown was - it replaced the set on every choice,
 * and it looked completely correct until you picked twice.
 *
 * Appends rather than re-sorts. The order of the selection is the order the
 * buyer built it in; what is alphabetical is the list they picked from.
 */
export function toggleOption<T extends string>(selected: readonly T[], value: T): T[] {
  return selected.includes(value)
    ? selected.filter((current) => current !== value)
    : [...selected, value];
}

/** The labels of the selected values, in the order the list draws them. */
export function selectedLabels<T extends string>(
  options: FilterOption<T>[],
  selected: readonly T[],
): string[] {
  const chosen = new Set<string>(selected);
  return options.filter((option) => chosen.has(option.value)).map((option) => option.label);
}
