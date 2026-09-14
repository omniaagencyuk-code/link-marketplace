import type { Metadata } from 'next';
import { BadgeCheck, Gauge, Receipt, Workflow } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { websiteService } from '@/lib/services';
import { marketingStats } from '@/lib/config/marketing';
import { brand, siteUrl } from '@/lib/config/brand';

export const metadata: Metadata = {
  title: 'Link building services',
  description:
    'Link building services built around a marketplace of vetted publishers. Order guest posts, niche edits and digital PR with real SEO metrics and upfront pricing.',
  alternates: { canonical: '/link-building' },
  openGraph: {
    title: `Link building services | ${brand.name}`,
    description:
      'Build high quality backlinks through thousands of vetted publishers, with transparent metrics and fixed prices.',
    url: `${siteUrl}/link-building`,
  },
};

export default async function LinkBuildingPage() {
  const preview = await websiteService.getPublicPreview(6);

  return (
    <ServicePage
      path="/link-building"
      breadcrumbLabel="Link building"
      eyebrow="Link building services"
      title="Link Building Services Built for Better Rankings"
      intro="Press Parrot turns link building from a sprawling outreach project into something you can actually manage. Search vetted publishers on real SEO metrics, see the price before you commit, and track every placement from brief to live URL."
      preview={preview.rows}
      previewBody={`${marketingStats.inventory.toLocaleString('en-GB')}+ websites across ${marketingStats.nicheCount}+ niches, each one checked by hand before it is listed. Publisher names are visible once you have a free account.`}
      highlights={[
        {
          icon: BadgeCheck,
          title: 'Vetted, not scraped',
          body: 'Every publisher is reviewed by a person before listing. Traffic quality, outbound link patterns and editorial standards all have to pass.',
        },
        {
          icon: Gauge,
          title: 'Metrics you can filter on',
          body: 'Domain rating, organic traffic and referring domains on every listing, so a shortlist takes minutes instead of an afternoon.',
        },
        {
          icon: Receipt,
          title: 'One price, shown upfront',
          body: 'No enquiry forms, no haggling, no invoice surprises. The price you see is the price you pay.',
        },
        {
          icon: Workflow,
          title: 'Everything in one place',
          body: 'Orders, content, placements and billing in a single account, whether you run one site or forty.',
        },
      ]}
      sections={[
        {
          heading: 'What link building actually involves',
          paragraphs: [
            'Link building is the work of earning links from other websites to yours. Search engines still treat a link as a signal that someone found your page worth pointing at, which is why it remains one of the few ranking factors you can deliberately influence from outside your own site.',
            'The part nobody advertises is the volume of admin. Finding relevant sites, checking whether their traffic is real, tracking down an editor, agreeing a price, writing something they will publish, chasing them when they go quiet, and keeping a record of what went live where. Most of a link building budget is spent on coordination rather than on links.',
          ],
          points: [
            'Finding sites that are genuinely relevant to your niche',
            'Checking metrics carefully enough to spot inflated traffic',
            'Getting hold of someone who can actually publish',
            'Negotiating a price without a benchmark to work from',
            'Producing content the publisher will accept',
            'Following up, tracking placements and reconciling invoices',
          ],
        },
        {
          heading: 'How Press Parrot changes the process',
          paragraphs: [
            'We do the publisher wrangling so you can spend your time on strategy. Every site in the marketplace has already been vetted, priced and confirmed as accepting placements, which removes the discovery, qualification and negotiation stages entirely.',
            'You filter down to the sites that fit your campaign, add them to an order, supply your target URL and anchor text, and track the order through to a live URL. If you want us to write the article too, add content to the same order rather than running a separate process.',
          ],
        },
        {
          heading: 'What makes a high quality backlink',
          paragraphs: [
            'Relevance comes first. A link from a mid-sized site that genuinely covers your subject usually does more than a link from a larger site that has no business mentioning you. Topical fit is what makes a link look earned rather than bought.',
            'After that, look at whether the site has real organic traffic rather than a high domain rating propped up by a link network, whether the page carrying your link is itself indexed and likely to be read, and whether the link sits inside the body of the article rather than in a footer or an author box.',
          ],
          points: [
            'Topical relevance between the linking page and yours',
            'Real organic traffic, not just a strong third-party score',
            'A contextual, in-body placement rather than a sidebar or footer',
            'A sensible outbound link profile on the publishing site',
            'An anchor that reads naturally in the sentence around it',
          ],
        },
        {
          heading: 'Choosing between guest posts, niche edits and digital PR',
          paragraphs: [
            'Guest posts give you a new article written around your subject, so you control the framing, the supporting points and where the link sits. They suit new pages and competitive terms where context matters.',
            'Niche edits place your link inside an article that already exists and is already indexed, which usually means a faster turnaround and an established page. Digital PR works differently again: you are offering editorial value or expert commentary to a publication, and the coverage tends to carry more brand weight than a placement bought outright.',
          ],
        },
        {
          heading: 'Building a link profile that holds up',
          paragraphs: [
            'Spread acquisition across pages rather than pointing everything at one commercial URL, vary your anchors so the profile does not read as engineered, and keep a steady pace instead of buying a large batch in one month and then nothing for six.',
            'It also helps to give people something worth linking to. A page that answers a question properly earns links more easily than a thin one, which is why content and link building work better run together than separately.',
          ],
        },
      ]}
      faqs={[
        {
          question: 'What is link building?',
          answer:
            'Link building is the process of getting other websites to link to yours. Search engines use links as one signal of whether a page is worth surfacing, so relevant links from credible sites can improve how well your pages rank.',
        },
        {
          question: 'Can I see the websites before ordering?',
          answer:
            'Yes, once you have an account. The marketplace is free to browse after signing up, and signing up takes about a minute. We keep publisher names behind an account so our inventory is not scraped and republished, which is also how our publishers prefer it.',
        },
        {
          question: 'How much does link building cost?',
          answer:
            'Prices vary by publisher, mostly according to authority, traffic and niche. Every listing shows its own price before you order, and there is no subscription or minimum spend, so you can start with a single placement.',
        },
        {
          question: 'Do I need a subscription?',
          answer:
            'No. Accounts are free and you only pay for the placements and content you order.',
        },
        {
          question: 'How long does a placement take?',
          answer:
            'Most placements go live within a few days to a couple of weeks depending on the publisher. Each listing shows its own typical turnaround before you order.',
        },
      ]}
      related={[
        { label: 'Guest posts', href: '/guest-posts', description: 'New articles with a contextual link.' },
        { label: 'Niche edits', href: '/niche-edits', description: 'Links added to indexed pages.' },
        { label: 'Digital PR', href: '/digital-pr', description: 'Editorial coverage and commentary.' },
        { label: 'Content writing', href: '/content-writing', description: 'SEO content, placement optional.' },
        { label: 'For agencies', href: '/link-building-agencies', description: 'Running links for many clients.' },
        { label: 'Pricing', href: '/pricing', description: 'How our pricing works.' },
      ]}
    />
  );
}
