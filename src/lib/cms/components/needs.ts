/**
 * What a section needs from the application, as opposed to from an editor.
 *
 * A marketplace preview draws real listings; a niche grid draws real
 * categories with real counts. None of that belongs in the CMS - copying a
 * website count into a heading is how a page ends up claiming 620 listings
 * eighteen months later - so components declare what they need and the
 * renderer fetches it.
 *
 * Once per page, not once per section. Two marketplace blocks on one page are
 * one query between them, and a page with none makes none at all. That is the
 * same rule the section read itself follows, applied to what the sections
 * then ask for.
 *
 * Deliberately a tiny closed vocabulary. This is the seam between editorial
 * content and application data, and it is narrow on purpose: a component can
 * ask for the marketplace preview, and it cannot ask for "the result of this
 * query".
 */

export type SectionNeed = 'preview' | 'niches' | 'totals';

/** What each component asks for. Absent means it needs nothing. */
const NEEDS: Record<string, SectionNeed[]> = {
  'marketplace-preview': ['preview'],
  'marketplace-stats': ['totals'],
  'niche-categories': ['niches'],
  'parrot-view': ['totals'],
  hero: ['totals'],
};

export function needsOf(component: string): SectionNeed[] {
  return NEEDS[component] ?? [];
}

/** Everything this page's sections need between them, with no duplicates. */
export function neededBy(components: string[]): Set<SectionNeed> {
  const needed = new Set<SectionNeed>();
  for (const component of components) {
    for (const need of needsOf(component)) needed.add(need);
  }
  return needed;
}
