import type { LinkTypeSlug, SponsoredTagPolicy, WebsiteStatus } from '@/lib/types';
import type { OrderStatus } from '@/lib/types';
import type { SortKey } from '@/lib/types';

export const linkTypeLabels: Record<LinkTypeSlug, string> = {
  'guest-post': 'Guest Post',
  'niche-edit': 'Niche Edit',
  'digital-pr': 'Digital PR',
};

export const linkTypeDescriptions: Record<LinkTypeSlug, string> = {
  'guest-post':
    'A new article written and published on the site, containing your contextual link.',
  'niche-edit':
    'Your link inserted into an existing, already indexed article on the site.',
  'digital-pr':
    'An editorial feature or expert commentary placed with the publication’s newsroom.',
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  draft: 'Draft',
  'awaiting-content': 'Awaiting Content',
  'in-progress': 'In Progress',
  submitted: 'Submitted',
  live: 'Live',
  cancelled: 'Cancelled',
};

export const websiteStatusLabels: Record<WebsiteStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};

export const sponsoredTagLabels: Record<SponsoredTagPolicy, string> = {
  never: 'Never applied',
  'on-request': 'Only on request',
  always: 'Always applied',
};

export const languageLabels: Record<string, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  nl: 'Dutch',
  pt: 'Portuguese',
  sv: 'Swedish',
};

/*
  Both ends of every measure.

  A buyer builds a shortlist from one end or the other, and which end depends on
  what they are doing: spending a budget looks for the strongest sites, filling
  one looks for the cheapest. DR, traffic and referring domains offered only
  "highest", so the other half of each question had no answer in the dropdown
  and no answer from a second click on the column either.
*/
export const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-asc', label: 'Lowest Price' },
  { value: 'price-desc', label: 'Highest Price' },
  { value: 'dr-desc', label: 'Highest DR' },
  { value: 'dr-asc', label: 'Lowest DR' },
  { value: 'traffic-desc', label: 'Highest Traffic' },
  { value: 'traffic-asc', label: 'Lowest Traffic' },
  { value: 'rd-desc', label: 'Most Ref. Domains' },
  { value: 'rd-asc', label: 'Fewest Ref. Domains' },
  { value: 'kw-desc', label: 'Most Keywords' },
  { value: 'kw-asc', label: 'Fewest Keywords' },
  { value: 'turnaround-asc', label: 'Fastest Turnaround' },
  { value: 'turnaround-desc', label: 'Slowest Turnaround' },
  { value: 'newest', label: 'Newest' },
];

export const pageSizeOptions = [15, 25, 50, 100];
