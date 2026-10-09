import { categories } from '@/lib/data/categories';

/**
 * Headline numbers used across the marketing site.
 *
 * `nicheCount` is the curated category list, which is a fixed editorial set
 * rather than a measurement, so counting it here is honest. Rating and
 * turnaround are editorial claims: update them when the real numbers change.
 *
 * There was an `inventory` here too, and the sentence above it said it came
 * from the data layer "so it stays true as the marketplace grows". It did
 * not: it was `ADVERTISED_INVENTORY`, a literal 5,247 in the mock data file,
 * and the marketplace had grown to 12,190 without it. A comment claiming a
 * figure is derived is worse than no comment, because it is the reason
 * nobody checks.
 *
 * How many websites there are is now asked of the database at the point it
 * is printed. There is deliberately no constant to reach for.
 */
export const marketingStats = {
  nicheCount: categories.length,
  customerRating: '4.9/5',
  averageTurnaround: '24-72 hours',
} as const;

/** Niche pills shown under the homepage search. */
export const popularNiches = [
  'igaming',
  'sports',
  'finance',
  'technology',
  'travel',
  'lifestyle',
  'crypto',
  'business',
] as const;
