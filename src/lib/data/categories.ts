import type { Category, NicheSlug } from '@/lib/types';

const now = '2026-01-12T09:00:00.000Z';

export const categories: Category[] = [
  {
    id: 'cat-igaming',
    slug: 'igaming',
    name: 'iGaming',
    description: 'Casino, sportsbook, poker and slots publications.',
    position: 1,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-sports',
    slug: 'sports',
    name: 'Sports',
    description: 'Football, racing, endurance and general sports media.',
    position: 2,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-finance',
    slug: 'finance',
    name: 'Finance',
    description: 'Personal finance, investing, lending and insurance titles.',
    position: 3,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-technology',
    slug: 'technology',
    name: 'Technology',
    description: 'SaaS, developer, hardware and consumer tech publications.',
    position: 4,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-business',
    slug: 'business',
    name: 'Business',
    description: 'B2B, startups, operations and professional services.',
    position: 5,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-health',
    slug: 'health',
    name: 'Health',
    description: 'Wellness, nutrition, fitness and clinical content.',
    position: 6,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-travel',
    slug: 'travel',
    name: 'Travel',
    description: 'Destination guides, hospitality and travel planning.',
    position: 7,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-lifestyle',
    slug: 'lifestyle',
    name: 'Lifestyle',
    description: 'Fashion, culture, parenting and everyday living.',
    position: 8,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-crypto',
    slug: 'crypto',
    name: 'Crypto',
    description: 'Web3, blockchain, trading and digital asset media.',
    position: 9,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-entertainment',
    slug: 'entertainment',
    name: 'Entertainment',
    description: 'Film, television, music and streaming coverage.',
    position: 10,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-home-garden',
    slug: 'home-garden',
    name: 'Home and Garden',
    description: 'Interiors, renovation, gardening and home improvement.',
    position: 11,
    featured: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-automotive',
    slug: 'automotive',
    name: 'Automotive',
    description: 'Cars, EVs, motoring news and aftermarket.',
    position: 12,
    featured: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-food',
    slug: 'food',
    name: 'Food',
    description: 'Recipes, restaurants, drinks and food culture.',
    position: 13,
    featured: false,
    createdAt: now,
    updatedAt: now,
  },
];

export const categoryBySlug = new Map<NicheSlug, Category>(
  categories.map((category) => [category.slug, category]),
);

export function nicheName(slug: NicheSlug) {
  return categoryBySlug.get(slug)?.name ?? slug;
}

/** Categories rendered as pills on the marketplace, in display order. */
export const featuredCategories = categories
  .filter((category) => category.featured)
  .sort((a, b) => a.position - b.position);

export const overflowCategories = categories
  .filter((category) => !category.featured)
  .sort((a, b) => a.position - b.position);
