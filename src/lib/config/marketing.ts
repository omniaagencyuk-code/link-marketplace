import { ADVERTISED_INVENTORY } from '@/lib/data/websites';
import { categories } from '@/lib/data/categories';

/**
 * Headline numbers used across the marketing site.
 *
 * Inventory and niche counts come from the data layer so they stay true as the
 * marketplace grows. Rating and turnaround are editorial claims: update them
 * here when the underlying numbers change.
 */
export const marketingStats = {
  inventory: ADVERTISED_INVENTORY,
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
