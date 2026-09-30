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

/** Application data a section asked for, fetched once per page. */
export interface SectionData {
  /** Redacted in the service layer - no publisher is identifiable from it. */
  preview?: PreviewRow[];
  /** Live listing counts per niche. */
  niches?: { slug: string; label: string; count: number; href: string }[];
  totals?: { websites: number; niches: number; countries: number };
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
