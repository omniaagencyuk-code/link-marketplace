import { serviceSections } from './pages/service-page-schema';
import type { PageDef, PageValues } from './types';

/**
 * Pages an editor creates, rather than pages that ship in code.
 *
 * A custom page reuses the service page schema and the service page layout, so
 * a page made in the admin is the same kind of object as /link-building: same
 * sections, same editor, same design. What differs is only where the
 * definition comes from - the database rather than a module.
 *
 * The defaults for a new page are generic but complete, so the page renders as
 * a real page the moment it is created. An editor then replaces the copy
 * section by section, and anything they clear falls back to these rather than
 * to a blank.
 */

/**
 * Slugs a custom page may not take.
 *
 * Next resolves a static route ahead of a dynamic one, so a collision would
 * not break the existing page - it would silently make the custom page
 * unreachable, which is worse than refusing to create it. Everything with a
 * route of its own is listed, plus the reserved words that would be confusing
 * or dangerous to hand out.
 */
export const RESERVED_SLUGS = new Set([
  // Real routes.
  'admin',
  'api',
  'auth',
  'content-writing',
  'cookies',
  'dashboard',
  'digital-pr',
  'forgot-password',
  'guest-posts',
  'how-it-works',
  'link-building',
  'link-building-agencies',
  'login',
  'marketplace',
  'niche-edits',
  'pricing',
  'resources',
  'signup',
  'websites',
  // Framework and convention.
  'favicon.ico',
  'icon',
  'manifest.json',
  'opengraph-image',
  'robots.txt',
  'sitemap.xml',
  '_next',
  // Reserved for obvious future use, and for things a visitor would misread.
  'about',
  'account',
  'blog',
  'cart',
  'checkout',
  'contact',
  'home',
  'logout',
  'privacy',
  'reset-password',
  'search',
  'settings',
  'terms',
]);

/** Lower case letters, numbers and single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface SlugCheck {
  ok: boolean;
  error?: string;
}

/** Turn a label into a candidate slug. Never guesses at more than the label. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function checkSlug(slug: string): SlugCheck {
  if (!slug) return { ok: false, error: 'Enter a URL for the page.' };
  if (slug.length < 2) return { ok: false, error: 'The URL is too short.' };
  if (slug.length > 60) return { ok: false, error: 'Keep the URL under 60 characters.' };
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: 'Use lower case letters, numbers and hyphens only, e.g. "broken-link-building".',
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: `"${slug}" is already used by another part of the site.` };
  }
  return { ok: true };
}

/** A stored custom page, before its defaults are applied. */
export interface CustomPageRecord {
  slug: string;
  label: string;
  description: string;
  /** Draft pages 404 for the public and are visible only in the admin. */
  published: boolean;
  values: PageValues;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface CustomPageInput {
  label: string;
  description: string;
  published: boolean;
}

/** The schema for a custom page - the same one every service page uses. */
export function customPageDefinition(record: {
  slug: string;
  label: string;
  description: string;
}): PageDef {
  return {
    slug: record.slug,
    label: record.label,
    path: `/${record.slug}`,
    description: record.description,
    sections: serviceSections(),
  };
}

/**
 * Starting copy for a new page.
 *
 * Written to be obviously placeholder where it has to be, and genuinely
 * useful where it can be. Nothing here invents a claim about the business:
 * the value points and the body section describe what the editor should write,
 * rather than asserting something that might not be true.
 */
export function customPageDefaults(label: string): PageValues {
  const name = label.trim() || 'New page';

  return {
    hero: {
      eyebrow: name,
      title: name,
      intro:
        'Replace this with one paragraph explaining what this page is about and who it is for. Two or three sentences is usually right.',
      primaryCta: { label: 'Get Started Free', href: '/signup' },
      secondaryCta: { label: 'How It Works', href: '/how-it-works' },
      microcopy: 'Free account · No subscription · Pay only for what you order',
    },

    highlights: {
      items: [
        { title: 'First point', body: 'What makes this worth a reader’s time. One or two sentences.' },
        { title: 'Second point', body: 'The next reason, in the same shape.' },
        { title: 'Third point', body: 'A third reason. Four points fill the row exactly.' },
        { title: 'Fourth point', body: 'The last one. Remove any you do not need.' },
      ],
    },

    preview: {
      heading: 'Thousands of link building opportunities in one place',
      body: 'Websites across every major niche, each one checked by hand before it is listed. Publisher names are visible once you have a free account.',
    },

    body: {
      sections: [
        {
          heading: 'Write the main section here',
          content: `This is the editorial body of the page, and the part search engines read most closely. Markdown works here:

- **Bold** and *italic*
- Bullet lists like this one
- [Internal links](/link-building) to other pages on the site

Add as many sections as the subject needs. One long, genuinely useful page will almost always outperform three thin ones.`,
        },
      ],
    },

    faqs: { items: [] },

    related: {
      items: [
        { label: 'Link building', href: '/link-building', description: 'The main service page.' },
        { label: 'Guest posts', href: '/guest-posts', description: 'New articles with a contextual link.' },
        { label: 'Pricing', href: '/pricing', description: 'How our pricing works.' },
      ],
    },

    cta: {
      heading: 'Ready to get started?',
      body: 'Create a free account, open the marketplace and order your first placement today.',
      primaryCta: { label: 'Create Free Account', href: '/signup' },
      secondaryCta: { label: 'See pricing', href: '/pricing' },
    },

    seo: {
      metaTitle: name,
      metaDescription:
        'Replace this with around 155 characters describing the page. It is what Google shows under the link, so it is worth writing properly.',
      ogImage: { src: '', alt: '' },
    },
  };
}
