import type { Metadata } from 'next';
import { History, Link2, Timer, TrendingUp } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { websiteService } from '@/lib/services';
import { brand, siteUrl } from '@/lib/config/brand';

export const metadata: Metadata = {
  title: 'Niche edits',
  description:
    'Buy niche edits on vetted websites. Add a contextual link to an article that is already published and indexed, with transparent metrics and upfront pricing.',
  alternates: { canonical: '/niche-edits' },
  openGraph: {
    title: `Niche edits | ${brand.name}`,
    description:
      'Contextual links added to relevant, already indexed articles on established websites.',
    url: `${siteUrl}/niche-edits`,
  },
};

export default async function NicheEditsPage() {
  const preview = await websiteService.getPublicPreview(6);

  return (
    <ServicePage
      path="/niche-edits"
      breadcrumbLabel="Niche edits"
      eyebrow="Niche edits"
      title="Niche Edits on Pages That Are Already Working"
      intro="Add a contextual link to an article that has already been published, indexed and read. Faster than commissioning a new piece, and the page carrying your link has history behind it."
      preview={preview.rows}
      previewHeading="Established pages, filtered on real metrics"
      previewBody="Search by domain rating, traffic, niche and country. Publisher names are visible once you have a free account."
      highlights={[
        {
          icon: Timer,
          title: 'Quicker than a guest post',
          body: 'No article to commission or approve, so most niche edits move faster than a placement that starts from a blank page.',
        },
        {
          icon: History,
          title: 'Pages with history',
          body: 'Your link lands on an article that is already indexed rather than one waiting to be discovered.',
        },
        {
          icon: Link2,
          title: 'Contextual placement',
          body: 'The link goes into the body of the article, in a sentence where it belongs.',
        },
        {
          icon: TrendingUp,
          title: 'Good for existing pages',
          body: 'Useful when a page is already ranking and needs support rather than an introduction.',
        },
      ]}
      sections={[
        {
          heading: 'What a niche edit is',
          paragraphs: [
            'A niche edit, sometimes called a link insertion, adds your link into an article that a publisher has already published. The article exists, it is indexed, and in many cases it already receives traffic. What changes is that one sentence now carries a link to your page.',
            'Because nothing has to be written and approved from scratch, the process is shorter. Because the page already has some standing, the link is not starting from zero.',
          ],
        },
        {
          heading: 'When to choose a niche edit over a guest post',
          paragraphs: [
            'Niche edits work best when the supporting context already exists somewhere. If a publisher has an article covering your subject and your page genuinely adds to it, an insertion is the natural and faster option.',
            'A guest post is the better choice when the argument you need does not exist yet, when you want control over the whole piece, or when the target page needs a substantial introduction rather than a mention.',
          ],
          points: [
            'The relevant article already exists on the publisher’s site',
            'You want a shorter turnaround',
            'The target page is established and needs reinforcement',
            'A full article would be more context than the link warrants',
          ],
        },
        {
          heading: 'What to check before buying one',
          paragraphs: [
            'Look at the article itself, not only the domain. An insertion into a page with no traffic, on a site whose authority is concentrated elsewhere, is worth much less than the domain rating suggests.',
            'It is also worth checking how many outbound links the article already carries. A page that has been sold repeatedly passes less value and looks less natural than one that has been edited sparingly.',
          ],
          points: [
            'Is the host article relevant to your page, not just the site?',
            'Is the article itself indexed and receiving traffic?',
            'How many commercial outbound links does it already carry?',
            'Does the sentence around the link make sense?',
          ],
        },
        {
          heading: 'How anchors work in a niche edit',
          paragraphs: [
            'Since the sentence already exists, the anchor has to fit the text rather than the other way round. That is usually a good constraint: it pushes anchors toward phrases that read naturally instead of exact-match terms bolted into a sentence that does not want them.',
            'You supply a preferred anchor when you order, and where the existing wording will not carry it, we will confirm an alternative with you before anything is published.',
          ],
        },
      ]}
      faqs={[
        {
          question: 'Do you offer niche edits?',
          answer:
            'Yes. Niche edits sit alongside guest posts and digital PR in the marketplace, with the same vetting, metrics and upfront pricing.',
        },
        {
          question: 'Are niche edits cheaper than guest posts?',
          answer:
            'Often, because no article has to be written, but it depends on the publisher. Each listing shows its own price for each placement type before you order.',
        },
        {
          question: 'Can I choose which article my link goes into?',
          answer:
            'You can tell us the target page, the anchor you would like and any preferences about the host article. We confirm the specific article with you before the edit is made.',
        },
        {
          question: 'How quickly do niche edits go live?',
          answer:
            'Usually faster than guest posts, since there is no article to commission. The typical turnaround is shown on each listing.',
        },
      ]}
      related={[
        { label: 'Guest posts', href: '/guest-posts', description: 'New articles built around your link.' },
        { label: 'Link building', href: '/link-building', description: 'How the whole service fits together.' },
        { label: 'Digital PR', href: '/digital-pr', description: 'Editorial coverage and commentary.' },
        { label: 'Pricing', href: '/pricing', description: 'What placements cost.' },
      ]}
    />
  );
}
