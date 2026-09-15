import type { PostCategory, PostCategorySlug, PostStatus } from '@/lib/types/blog';

export const postCategories: PostCategory[] = [
  {
    slug: 'link-building',
    name: 'Link Building',
    description: 'Tactics, benchmarks and what actually moves rankings.',
  },
  {
    slug: 'seo',
    name: 'SEO',
    description: 'Search strategy beyond links.',
  },
  {
    slug: 'content',
    name: 'Content',
    description: 'Writing pages worth linking to.',
  },
  {
    slug: 'digital-pr',
    name: 'Digital PR',
    description: 'Earning coverage rather than buying it.',
  },
  {
    slug: 'agency-growth',
    name: 'Agency Growth',
    description: 'Running SEO delivery at scale.',
  },
];

export const postCategoryLabels = Object.fromEntries(
  postCategories.map((category) => [category.slug, category.name]),
) as Record<PostCategorySlug, string>;

export function categoryName(slug: PostCategorySlug): string {
  return postCategoryLabels[slug] ?? slug;
}

export const postStatuses: { value: PostStatus; label: string; description: string }[] = [
  { value: 'draft', label: 'Draft', description: 'Only visible in the admin.' },
  {
    value: 'scheduled',
    label: 'Scheduled',
    description: 'Goes live automatically on its publish date.',
  },
  { value: 'published', label: 'Published', description: 'Live on the site now.' },
];

export const postStatusLabels = Object.fromEntries(
  postStatuses.map((status) => [status.value, status.label]),
) as Record<PostStatus, string>;

/** Turn a title into a URL segment. */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
