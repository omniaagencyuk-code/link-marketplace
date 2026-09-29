export type NicheSlug =
  | 'igaming'
  | 'sports'
  | 'finance'
  | 'technology'
  | 'business'
  | 'health'
  | 'travel'
  | 'lifestyle'
  | 'crypto'
  | 'entertainment'
  | 'automotive'
  | 'food'
  | 'home-garden'
  /*
    Added from the inventory rather than invented.

    Nine hundred domains' Majestic topics cluster in three places the first
    thirteen had no home for: news and media, environment and science, and
    education and reference. Without them a tenth of the marketplace would
    sit under whichever existing category was least wrong.
  */
  | 'news-media'
  | 'science-environment'
  | 'education';

export interface Category {
  id: string;
  slug: NicheSlug;
  name: string;
  /** Short description used on category pages and admin. */
  description: string;
  /** Ordering weight for the category pill row (lower shows first). */
  position: number;
  /** Shown in the "More" overflow menu on the marketplace. */
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Join table between websites and categories (secondary niches). */
export interface WebsiteCategory {
  websiteId: string;
  categoryId: string;
  primary: boolean;
}
