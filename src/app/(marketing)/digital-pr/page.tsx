import type { Metadata } from 'next';
import { Megaphone, Newspaper, Quote, Users } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { websiteService } from '@/lib/services';
import { brand, siteUrl } from '@/lib/config/brand';

export const metadata: Metadata = {
  title: 'Digital PR',
  description:
    'Digital PR placements on editorial publications. Build brand visibility and authority through expert commentary and genuine editorial coverage.',
  alternates: { canonical: '/digital-pr' },
  openGraph: {
    title: `Digital PR | ${brand.name}`,
    description:
      'Editorial coverage and expert commentary on publications with real readerships.',
    url: `${siteUrl}/digital-pr`,
  },
};

export default async function DigitalPrPage() {
  const preview = await websiteService.getPublicPreview(6);

  return (
    <ServicePage
      path="/digital-pr"
      breadcrumbLabel="Digital PR"
      eyebrow="Digital PR"
      title="Digital PR That Builds Authority, Not Just Links"
      intro="Editorial coverage and expert commentary on publications with real readerships. Slower and more selective than a bought placement, and considerably harder for a competitor to replicate."
      preview={preview.rows}
      previewHeading="Publications with actual audiences"
      previewBody="Digital PR opportunities sit in the same marketplace as guest posts and niche edits. Publication names are visible once you have a free account."
      highlights={[
        {
          icon: Newspaper,
          title: 'Editorial placements',
          body: 'Coverage that goes through a newsroom or editor rather than a sponsored content queue.',
        },
        {
          icon: Quote,
          title: 'Expert commentary',
          body: 'Position a named person from your business as a source journalists come back to.',
        },
        {
          icon: Users,
          title: 'Brand as well as SEO',
          body: 'The audience reading the piece matters as much as the link inside it.',
        },
        {
          icon: Megaphone,
          title: 'Harder to copy',
          body: 'A competitor can buy the same guest post. Editorial coverage is not available on demand.',
        },
      ]}
      sections={[
        {
          heading: 'What digital PR means here',
          paragraphs: [
            'Digital PR is the practice of earning coverage in publications by offering something genuinely worth publishing: data, expertise, a perspective on a story a journalist is already writing. The link is a by-product of the coverage rather than the transaction itself.',
            'That distinction matters. A bought placement is a paid slot; editorial coverage has to clear an editor who does not have to publish anything. This is why it takes longer, converts less predictably, and carries more weight when it lands.',
          ],
        },
        {
          heading: 'When digital PR is worth the extra effort',
          paragraphs: [
            'It suits businesses with something to say: proprietary data, a genuinely different approach, a founder or specialist who can speak with authority on a subject the press covers.',
            'It is a poor fit if there is nothing underneath it. Digital PR cannot manufacture a story, and publications are good at spotting an attempt to place one.',
          ],
          points: [
            'You have data or research nobody else has published',
            'You have a credible named expert who can be quoted',
            'Your market is covered by publications with real readerships',
            'You want brand visibility alongside the SEO benefit',
          ],
        },
        {
          heading: 'How digital PR differs from guest posting',
          paragraphs: [
            'A guest post is an article you commission and control, published in a slot the site makes available. Digital PR is an approach to a publication that may or may not result in coverage, on terms the publication sets.',
            'Turnaround is longer and less certain as a result, and the editorial team decides how your business is framed. In exchange, the coverage reaches an audience and carries a credibility a bought article rarely does.',
          ],
        },
        {
          heading: 'Setting realistic expectations',
          paragraphs: [
            'Digital PR is a campaign rather than a single order. Some approaches land, some do not, and the ones that do often arrive in a cluster because a story gets picked up more than once.',
            'We will tell you when a subject is unlikely to interest a newsroom rather than run a campaign that quietly fails. If the story is not there yet, guest posts and niche edits will usually do more for the same budget.',
          ],
        },
      ]}
      faqs={[
        {
          question: 'What is digital PR?',
          answer:
            'Digital PR is earning coverage in publications by offering something worth publishing, such as original data or expert commentary. The links that result are editorial rather than bought, which is what gives them their weight.',
        },
        {
          question: 'How is digital PR priced?',
          answer:
            'Digital PR opportunities are priced per placement in the marketplace, like other listings. Larger campaigns are quoted individually because scope varies considerably.',
        },
        {
          question: 'How long does digital PR take?',
          answer:
            'Longer than a guest post or niche edit, because an editor decides whether and when to publish. Expected turnaround is shown on each listing, and campaign work is scoped separately.',
        },
        {
          question: 'Do I need original data to do digital PR?',
          answer:
            'It helps considerably but is not the only route. Expert commentary from a named person in your business works well in markets where journalists regularly need a source.',
        },
      ]}
      related={[
        { label: 'Guest posts', href: '/guest-posts', description: 'Placements you control and commission.' },
        { label: 'Link building', href: '/link-building', description: 'How the whole service fits together.' },
        { label: 'Content writing', href: '/content-writing', description: 'Content to support a campaign.' },
        { label: 'For agencies', href: '/link-building-agencies', description: 'Running PR across clients.' },
      ]}
    />
  );
}
