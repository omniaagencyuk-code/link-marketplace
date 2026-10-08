/**
 * The Press Parrot artwork library.
 *
 * Twenty-two illustrations, thirteen icons and a set of section decorations
 * were drawn for the brand. This file is the catalogue of them: what each one
 * is called, what it is for, where it belongs on a page and what shape it is.
 *
 * ## Why a catalogue rather than a folder of files
 *
 * Because a section points at `mascot-classic`, not at
 * `/images/parrots/mascot-classic-v2-final.png`. When a better drawing
 * arrives, somebody replaces the file behind the name and every page using it
 * updates - which is the difference between artwork that can be improved and
 * artwork that is baked into fourteen pages.
 *
 * ## Where the files live
 *
 * Either. An entry resolves to a file in `public/images/parrots` if one is
 * there, and otherwise to an uploaded media asset carrying the same slug. So
 * artwork can ship with the code or be uploaded through the admin, and a
 * section neither knows nor cares which.
 *
 * An entry with no file anywhere is listed, greyed, and says so. That is
 * deliberate: the catalogue is the brief for what still needs drawing.
 */

export const ARTWORK_CATEGORIES = [
  'general',
  'seo',
  'niche',
  'content',
  'support',
] as const;

export type ArtworkCategory = (typeof ARTWORK_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ArtworkCategory, string> = {
  general: 'General',
  seo: 'SEO',
  niche: 'Niche',
  content: 'Content',
  support: 'Support',
};

/** Where a piece is drawn to sit. Guidance in the picker, never enforced. */
export type ArtworkPlacement = 'hero' | 'feature' | 'aside' | 'spot';

/** Roughly what shape it is, so the picker can warn before it is chosen. */
export type ArtworkAspect = 'portrait' | 'landscape' | 'square';

export interface ArtworkEntry {
  /** Stable. A section stores this, so it is never renamed once it is live. */
  slug: string;
  name: string;
  category: ArtworkCategory;
  placement: ArtworkPlacement;
  aspect: ArtworkAspect;
  /** What it shows, for the picker and as the default alt text. */
  description: string;
  /**
   * Where the file already lives, for artwork that shipped before the
   * catalogue did. Without it the gambling parrot and the homepage mascot
   * would be listed as "not drawn yet" while sitting in `public` under the
   * names they were committed with.
   */
  file?: string;
}

/**
 * The catalogue, in the order the brand sheet numbers them.
 *
 * Every one of these is a transparent PNG of the same macaw in a different
 * situation - which is the mascot strategy: one recognisable character, many
 * contexts, never a different bird.
 */
export const ARTWORK: ArtworkEntry[] = [
  // ------------------------------------------------------------- general --
  {
    slug: 'mascot-classic',
    name: 'Classic Press Parrot',
    category: 'general',
    placement: 'hero',
    aspect: 'portrait',
    description: 'The Press Parrot macaw, thumbs up',
    file: 'press-parrot-hero',
  },
  {
    slug: 'mascot-laptop',
    name: 'Press Parrot with laptop',
    category: 'general',
    placement: 'hero',
    aspect: 'portrait',
    description: 'The Press Parrot macaw working at a laptop',
  },
  {
    slug: 'mascot-flying',
    name: 'Press Parrot flying',
    category: 'general',
    placement: 'spot',
    aspect: 'landscape',
    description: 'The Press Parrot macaw in flight',
  },
  {
    slug: 'mascot-support',
    name: 'Press Parrot support',
    category: 'support',
    placement: 'feature',
    aspect: 'portrait',
    description: 'The Press Parrot macaw wearing a headset',
  },
  {
    slug: 'mascot-team',
    name: 'Press Parrot team',
    category: 'general',
    placement: 'feature',
    aspect: 'landscape',
    description: 'Three Press Parrot macaws together',
  },
  {
    slug: 'mascot-success',
    name: 'Press Parrot success',
    category: 'general',
    placement: 'feature',
    aspect: 'portrait',
    description: 'The Press Parrot macaw bursting out of a gift box',
  },
  {
    slug: 'mascot-idea',
    name: 'Press Parrot idea',
    category: 'general',
    placement: 'aside',
    aspect: 'portrait',
    description: 'The Press Parrot macaw at a laptop with an idea',
  },

  // ----------------------------------------------------------------- SEO --
  {
    slug: 'seo-link-building',
    name: 'Link building',
    category: 'seo',
    placement: 'feature',
    aspect: 'portrait',
    description: 'The Press Parrot macaw holding a chain link',
  },
  {
    slug: 'seo-analyst',
    name: 'SEO analyst',
    category: 'seo',
    placement: 'feature',
    aspect: 'portrait',
    description: 'The Press Parrot macaw in glasses reading a tablet',
  },
  {
    slug: 'seo-growth',
    name: 'Growth',
    category: 'seo',
    placement: 'feature',
    aspect: 'portrait',
    description: 'The Press Parrot macaw beside a rising bar chart',
  },
  {
    slug: 'seo-marketplace',
    name: 'Marketplace',
    category: 'seo',
    placement: 'feature',
    aspect: 'landscape',
    description: 'The Press Parrot macaw beside a list of vetted websites',
  },
  {
    slug: 'seo-quality',
    name: 'Quality checks',
    category: 'seo',
    placement: 'feature',
    aspect: 'portrait',
    description: 'The Press Parrot macaw holding a checked clipboard',
  },
  {
    slug: 'seo-trust',
    name: 'Trust',
    category: 'seo',
    placement: 'feature',
    aspect: 'portrait',
    description: 'The Press Parrot macaw beside a shield with a tick',
  },
  {
    slug: 'seo-promote',
    name: 'Promote',
    category: 'seo',
    placement: 'feature',
    aspect: 'portrait',
    description: 'The Press Parrot macaw with a megaphone',
  },

  // --------------------------------------------------------------- niche --
  //
  // One per marketplace category that has artwork. The slug matches the
  // marketplace slug wherever there is one, so a niche page and its picture
  // are found by the same name.
  {
    slug: 'niche-igaming',
    name: 'Gambling',
    category: 'niche',
    placement: 'hero',
    aspect: 'portrait',
    description: 'The Press Parrot macaw holding four aces beside casino chips',
    file: 'parrots/gambling-parrot',
  },
  {
    slug: 'niche-sports',
    name: 'Sports',
    category: 'niche',
    placement: 'hero',
    aspect: 'portrait',
    description: 'The Press Parrot macaw in a football shirt with a ball',
  },
  {
    slug: 'niche-news-media',
    name: 'News',
    category: 'niche',
    placement: 'hero',
    aspect: 'portrait',
    description: 'The Press Parrot macaw reading a newspaper',
  },
  {
    slug: 'niche-finance',
    name: 'Finance',
    category: 'niche',
    placement: 'hero',
    aspect: 'portrait',
    description: 'The Press Parrot macaw beside stacked gold coins',
  },
  {
    slug: 'niche-crypto',
    name: 'Crypto',
    category: 'niche',
    placement: 'hero',
    aspect: 'portrait',
    description: 'The Press Parrot macaw beside crypto tokens',
  },
  {
    slug: 'niche-travel',
    name: 'Travel',
    category: 'niche',
    placement: 'hero',
    aspect: 'portrait',
    description: 'The Press Parrot macaw in a sun hat with a suitcase and passport',
  },

  // ------------------------------------------------------------- banners --
  //
  // Wide artwork for the slot behind a landing page's first screen, rather
  // than a portrait for the column beside a headline. Landscape, and the
  // picker warns on the shape, which is what stops one being chosen for a
  // column it would be squashed into.
  //
  // Not filed under `niche`, deliberately. Those are one per *marketplace
  // category* and are named for it, so a page about gambling and the picture
  // on it are found by one name. CBD is an accepted niche - what a publisher
  // will carry - and not a category, which is a different list for a
  // different job. Filing it as `niche-cbd` would have claimed a category
  // that does not exist; the catalogue's own check said so.
  {
    slug: 'banner-cbd',
    name: 'CBD banner',
    category: 'general',
    placement: 'hero',
    aspect: 'landscape',
    description:
      'The Press Parrot macaw in sunglasses among hemp leaves, on the right of a wide scene',
    file: 'parrots/cbd-hero',
  },

  // ------------------------------------------------------------- content --
  {
    slug: 'content-writer',
    name: 'Content writer',
    category: 'content',
    placement: 'feature',
    aspect: 'portrait',
    description: 'The Press Parrot macaw writing on a notepad',
  },
];

const BY_SLUG = new Map(ARTWORK.map((entry) => [entry.slug, entry]));

export function artworkBySlug(slug: string): ArtworkEntry | null {
  return BY_SLUG.get(slug) ?? null;
}

export function artworkIn(category: ArtworkCategory): ArtworkEntry[] {
  return ARTWORK.filter((entry) => entry.category === category);
}

/**
 * Where a catalogue entry's file would live if it ships with the code.
 *
 * Checked before any uploaded asset, so artwork committed to the repository
 * wins over an upload of the same name - the version in git is the version
 * that was reviewed.
 */
export function artworkPath(slug: string): string {
  const entry = BY_SLUG.get(slug);
  // `findArtwork` tries .webp, .avif, .png and .svg in turn, so the extension
  // here is a starting point rather than a claim about the file.
  return entry?.file ? `/images/${entry.file}.png` : `/images/parrots/${slug}.png`;
}
