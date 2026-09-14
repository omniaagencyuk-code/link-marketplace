import type {
  ContentLanguageCode,
  ContentOrderStatus,
  ContentToneSlug,
  ContentTypeSlug,
} from '@/lib/types/content';

/**
 * The content writing catalogue.
 *
 * Shared by the public service page, the order form, the customer dashboard
 * and the admin queue, so the options can never drift between them.
 */

export interface ContentTypeOption {
  slug: ContentTypeSlug;
  label: string;
  /** One line for the order form. */
  summary: string;
  /** Longer copy for the public page. */
  description: string;
  /** Typical length, shown as guidance rather than a constraint. */
  typicalWords: string;
}

export const contentTypes: ContentTypeOption[] = [
  {
    slug: 'seo-article',
    label: 'SEO Article',
    summary: 'Keyword-led article built to rank.',
    description:
      'A long-form article built around a target keyword and the questions that sit alongside it. Structured headings, internal link suggestions and a brief that starts from the search results rather than a blank page.',
    typicalWords: '1,000 - 2,500 words',
  },
  {
    slug: 'blog-post',
    label: 'Blog Post',
    summary: 'Shorter editorial piece for your own blog.',
    description:
      'Regular publishing for your own site. Lighter than a full SEO article, written to keep a blog active and to give internal linking somewhere useful to point.',
    typicalWords: '500 - 1,000 words',
  },
  {
    slug: 'guest-post',
    label: 'Guest Post',
    summary: 'Written to a publisher’s editorial standard.',
    description:
      'An article written to be accepted by an external publisher: their tone, their audience, their editorial rules, with your link placed naturally in the body rather than bolted onto the end.',
    typicalWords: '800 - 1,500 words',
  },
  {
    slug: 'landing-page',
    label: 'Landing Page',
    summary: 'Commercial page copy built to convert.',
    description:
      'Copy for a page that has to sell as well as rank. Clear structure, one job per section, and search intent handled without stripping the persuasion out of it.',
    typicalWords: '600 - 1,200 words',
  },
  {
    slug: 'website-copy',
    label: 'Website Copy',
    summary: 'Core pages: home, about, services.',
    description:
      'The pages that explain who you are and what you sell. Written once, properly, so the rest of your content has something worth linking to.',
    typicalWords: '400 - 900 words per page',
  },
  {
    slug: 'other',
    label: 'Other',
    summary: 'Something else - tell us in the brief.',
    description:
      'Anything that does not fit the list above. Describe what you need in the brief and we will confirm scope and price before anything is written.',
    typicalWords: 'Varies',
  },
];

export const contentTypeLabels = Object.fromEntries(
  contentTypes.map((type) => [type.slug, type.label]),
) as Record<ContentTypeSlug, string>;

/** Offered lengths. "Custom" is handled separately in the order form. */
export const wordCountOptions = [500, 750, 1000, 1500, 2000, 2500, 3000] as const;

export const contentLanguages: { code: ContentLanguageCode; label: string }[] = [
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-US', label: 'English (US)' },
];

export const contentLanguageLabels = Object.fromEntries(
  contentLanguages.map((language) => [language.code, language.label]),
) as Record<ContentLanguageCode, string>;

export const contentTones: { slug: ContentToneSlug; label: string }[] = [
  { slug: 'professional', label: 'Professional' },
  { slug: 'conversational', label: 'Conversational' },
  { slug: 'authoritative', label: 'Authoritative' },
  { slug: 'friendly', label: 'Friendly' },
  { slug: 'technical', label: 'Technical' },
  { slug: 'persuasive', label: 'Persuasive' },
];

export const contentToneLabels = Object.fromEntries(
  contentTones.map((tone) => [tone.slug, tone.label]),
) as Record<ContentToneSlug, string>;

export interface ContentStatusDefinition {
  value: ContentOrderStatus;
  label: string;
  description: string;
  tone: 'neutral' | 'info' | 'warning' | 'success';
}

export const contentStatuses: ContentStatusDefinition[] = [
  {
    value: 'draft',
    label: 'Draft',
    description: 'Saved but not yet submitted.',
    tone: 'neutral',
  },
  {
    value: 'brief-received',
    label: 'Brief Received',
    description: 'Your brief is in and queued for a writer.',
    tone: 'info',
  },
  {
    value: 'writing',
    label: 'Writing',
    description: 'A writer is working on the first draft.',
    tone: 'info',
  },
  {
    value: 'editing',
    label: 'Editing',
    description: 'The draft is with an editor for review.',
    tone: 'info',
  },
  {
    value: 'ready-for-review',
    label: 'Ready for Review',
    description: 'The draft is ready for you to read and approve.',
    tone: 'warning',
  },
  {
    value: 'revision-requested',
    label: 'Revision Requested',
    description: 'Your feedback is with the writer.',
    tone: 'warning',
  },
  {
    value: 'complete',
    label: 'Complete',
    description: 'Approved and delivered.',
    tone: 'success',
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
    description: 'Withdrawn or refunded.',
    tone: 'neutral',
  },
];

export const contentStatusLabels = Object.fromEntries(
  contentStatuses.map((status) => [status.value, status.label]),
) as Record<ContentOrderStatus, string>;

export function contentStatusTone(status: ContentOrderStatus) {
  return contentStatuses.find((entry) => entry.value === status)?.tone ?? 'neutral';
}

/** How a content order moves forward, used by the admin queue. */
export const contentWorkflow: ContentOrderStatus[] = [
  'brief-received',
  'writing',
  'editing',
  'ready-for-review',
  'revision-requested',
  'complete',
];
