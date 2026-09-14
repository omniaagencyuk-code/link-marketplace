/** The four steps from search to live link, shared by every page that shows them. */
export interface JourneyStep {
  number: string;
  title: string;
  description: string;
  /** Longer copy, used where there is room for it. */
  detail: string;
}

export const journeySteps: JourneyStep[] = [
  {
    number: '01',
    title: 'Search',
    description:
      'Browse thousands of vetted websites using niche, traffic, DR, country and pricing filters.',
    detail:
      'Filter by domain rating, organic traffic, country, language, price and turnaround until the shortlist is exactly right.',
  },
  {
    number: '02',
    title: 'Choose',
    description: 'Review transparent SEO metrics, placement requirements and pricing.',
    detail:
      'Every listing shows audience geography, publishing rules, link policy and example placements before you commit.',
  },
  {
    number: '03',
    title: 'Order',
    description: 'Provide your target URL, anchor text and campaign requirements.',
    detail:
      'Add your details once on the order page, attach an article if you have one, and submit the brief.',
  },
  {
    number: '04',
    title: 'Go Live',
    description: 'Track your order and receive your live placement.',
    detail:
      'You get the live URL as soon as the article is published, with the link checked for indexation.',
  },
];
