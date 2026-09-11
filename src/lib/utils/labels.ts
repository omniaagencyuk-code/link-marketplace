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

export const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-asc', label: 'Lowest Price' },
  { value: 'price-desc', label: 'Highest Price' },
  { value: 'dr-desc', label: 'Highest DR' },
  { value: 'traffic-desc', label: 'Highest Traffic' },
  { value: 'turnaround-asc', label: 'Fastest Turnaround' },
  { value: 'newest', label: 'Newest' },
];

export const pageSizeOptions = [15, 25, 50, 100];
