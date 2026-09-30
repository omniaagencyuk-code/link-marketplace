import type { PreviewRow } from '@/lib/services/marketplace-preview';
import type { SectionValues } from '@/lib/cms/sections';

/**
 * What every section renderer is handed, and the small readers for it.
 *
 * Values come out of `jsonb`, which is to say out of a column that holds
 * whatever was last written there. Nothing here trusts a shape: a string that
 * should be a string and is not comes back empty, and a list that is not a
 * list comes back as no rows. A section with missing content renders as less
 * of a section, never as a crash on a live page.
 */

/**
 * Page-level configuration, as opposed to a section's own content.
 *
 * A niche page is an entry point into one part of the marketplace, and that
 * fact belongs to the page rather than to any block on it: the preview table,
 * the live count and every link out are all about the same category. Holding
 * it here means an editor sets "igaming" once in the page's settings instead
 * of re-typing it into every component that draws the marketplace.
 *
 * None of it is editorial copy. The breadcrumb and the path are what the page
 * *is*; a section reads them, it does not own them.
 */
export interface PageConfig {
  /** Which marketplace category this page is about, e.g. `igaming`. */
  niche?: string;
  /** What that category is called here: "Gambling". Used in the breadcrumb. */
  label?: string;
  /** The page's own path, for the breadcrumb's last crumb and its JSON-LD. */
  path?: string;
  /** The crumb above this one, e.g. Link Building. */
  breadcrumbParent?: { label: string; href: string };
}

/** Application data a section asked for, fetched once per page. */
export interface SectionData {
  /** Redacted in the service layer - no publisher is identifiable from it. */
  preview?: PreviewRow[];
  /**
   * How many listings the page's category holds right now.
   *
   * Counted alongside the preview rows, from the same query, so a section can
   * quote the figure without asking for it separately - and so nobody is
   * tempted to type it into a heading.
   */
  listingCount?: number;
  /** Live listing counts per niche. */
  niches?: { slug: string; label: string; count: number; href: string }[];
  totals?: { websites: number; niches: number; countries: number };
  /** What the page is, rather than what this section says. Never empty. */
  page: PageConfig;
}

export interface SectionProps {
  values: SectionValues;
  variant: string;
  /** The row's id, for anything that has to be unique on the page. */
  sectionId: string;
  data: SectionData;
}

export const str = (values: SectionValues, key: string): string =>
  typeof values[key] === 'string' ? (values[key] as string) : '';

export const rows = <T,>(values: SectionValues, key: string): T[] =>
  Array.isArray(values[key]) ? (values[key] as T[]) : [];

export const link = (values: SectionValues, key: string): { label: string; href: string } => {
  const raw = values[key];
  if (typeof raw !== 'object' || raw === null) return { label: '', href: '' };
  const entry = raw as { label?: unknown; href?: unknown };
  return {
    label: typeof entry.label === 'string' ? entry.label : '',
    href: typeof entry.href === 'string' ? entry.href : '',
  };
};

export const image = (values: SectionValues, key: string): { src: string; alt: string } => {
  const raw = values[key];
  if (typeof raw !== 'object' || raw === null) return { src: '', alt: '' };
  const entry = raw as { src?: unknown; alt?: unknown };
  return {
    src: typeof entry.src === 'string' ? entry.src : '',
    alt: typeof entry.alt === 'string' ? entry.alt : '',
  };
};
