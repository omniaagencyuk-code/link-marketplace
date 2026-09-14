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
    title: 'Create Your Free Account',
    description: 'Unlock the Press Parrot marketplace.',
    detail:
      'Signing up takes about a minute, costs nothing and carries no subscription. The marketplace opens as soon as you are in.',
  },
  {
    number: '02',
    title: 'Find the Right Websites',
    description:
      'Filter publishers by niche, country, DR, traffic, pricing and other SEO metrics.',
    detail:
      'Stack filters on domain rating, organic traffic, referring domains, country, language, turnaround and price until the shortlist is exactly right.',
  },
  {
    number: '03',
    title: 'Place Your Order',
    description:
      'Choose your placement, provide your URL and anchor text and add content if required.',
    detail:
      'Add the details once on the order page, attach an article if you have one, or order the writing from us in the same order.',
  },
  {
    number: '04',
    title: 'Track Your Links',
    description:
      'Follow your order through publication and receive the live URL when complete.',
    detail:
      'Every order shows its current status, and you get the live URL as soon as the placement is published.',
  },
];
