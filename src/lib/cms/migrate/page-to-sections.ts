import { getComponent, cleanSectionValues } from '../components/schema';
import {
  BENEFITS,
  BROWSE_NICHES,
  CONTENT_CTA,
  EDITORIAL_HEADINGS,
  JOURNEY,
  NICHE_LINKS,
  UNLOCK_BENEFITS,
} from './home-content';
import type { PageValues, FieldValue } from '../types';
import type { Animation, SectionValues } from '../sections';

/**
 * Turning a page that was a template into a page that is a list of sections.
 *
 * The page builder shipped as a slot: sections rendered at one fixed point
 * inside a hand-written template, which meant a page had two shapes at once -
 * the one in the code and the one in the database - and the code's won. This
 * is how a page stops having two.
 *
 * It reads the page's *resolved* content, which is the shipped copy with the
 * editor's overrides on top - what the live page actually renders today - and
 * writes one section per band, in the order the template drew them. Nothing
 * is rephrased, reshaped or improved on the way through: a migration that
 * also edits is a migration nobody can check.
 *
 * ## What is deliberately not copied
 *
 * Live figures. The count of gambling listings is not read here and written
 * into a heading; the `{{gambling_site_count}}` token is copied *as the
 * token*, and the sections that draw the marketplace draw it from the
 * marketplace. Copying a number at migration time is how a page ends up
 * claiming 247 publishers eighteen months later.
 *
 * Page-level settings. The marketplace category, the meta title, the
 * description and the social image are not sections and do not become
 * sections - they stay where they are, and the page's settings panel edits
 * them.
 *
 * ## Why nothing is deleted
 *
 * The page's existing content stays exactly where it is. This only adds rows,
 * so the conversion can be checked against the live page and undone by
 * deleting them. The template stops being used when the rows are right, not
 * when they are written.
 */

export interface SectionBlueprint {
  component: string;
  variant: string;
  /** Locked sections cannot be moved or deleted. Their content stays editable. */
  locked: boolean;
  values: SectionValues;
  /**
   * Switched off on arrival.
   *
   * For a band that belongs on the page and has nothing genuine to say yet -
   * customer quotes being the one that matters. It is built, editable and
   * waiting, and it renders nothing until somebody fills it in.
   */
  hidden?: boolean;
  /** How it arrives, where the page it came from animated it. */
  animation?: Animation;
}

function group(values: PageValues, key: string): Record<string, FieldValue> {
  const found = values[key];
  return found && typeof found === 'object' ? (found as Record<string, FieldValue>) : {};
}

function list(values: PageValues, key: string, field: string): unknown[] {
  const found = group(values, key)[field];
  return Array.isArray(found) ? found : [];
}

function text(values: PageValues, key: string, field: string): string {
  const found = group(values, key)[field];
  return typeof found === 'string' ? found : '';
}

/**
 * The blueprint for a niche landing page, in the order the template draws it.
 *
 * Ten bands in the template, nine sections here, and the difference is worth
 * stating: the related links are a sticky sidebar *inside* the body's grid,
 * not a band of their own. Split out they would become a full-width strip and
 * the page would have changed, which is the one thing this is not for. They
 * travel with the body, and the body's variant says whether it has them.
 */
export function nichePageBlueprint(values: PageValues): SectionBlueprint[] {
  const blueprints: SectionBlueprint[] = [];

  const mascot = group(values, 'hero').mascot;

  // The hero is locked: it holds the page's only H1 and its breadcrumb, and a
  // hero dragged into the middle of a page is a mistake waiting to be made.
  // Nothing else here is locked - a migrated page an editor cannot rearrange
  // would have missed the point of migrating it.
  blueprints.push({
    component: 'niche-hero',
    variant: 'default',
    locked: true,
    values: {
      eyebrow: text(values, 'hero', 'eyebrow'),
      heading: text(values, 'hero', 'title'),
      intro: text(values, 'hero', 'intro'),
      trust: list(values, 'hero', 'trust'),
      primaryCta: group(values, 'hero').primaryCta,
      secondaryCta: group(values, 'hero').secondaryCta,
      microcopy: text(values, 'hero', 'microcopy'),
      mascot,
      banner: group(values, 'hero').banner,
    },
  });

  blueprints.push({
    component: 'niche-preview',
    variant: 'default',
    locked: false,
    values: {
      heading: text(values, 'preview', 'heading'),
      countSuffix: text(values, 'preview', 'countSuffix'),
      body: text(values, 'preview', 'body'),
      lockNote: text(values, 'preview', 'lockNote'),
      cta: group(values, 'preview').cta,
    },
  });

  // Bands the template hides when they are empty are not created empty here.
  // A section that renders nothing is a row in the editor that looks like
  // content and is not, and an editor adds it back from the library in one
  // click if they want it.
  if (list(values, 'categories', 'items').length > 0) {
    blueprints.push({
      component: 'topic-pills',
      variant: 'default',
      locked: false,
      values: {
        heading: text(values, 'categories', 'heading'),
        body: text(values, 'categories', 'body'),
        items: list(values, 'categories', 'items'),
      },
    });
  }

  if (list(values, 'highlights', 'items').length > 0) {
    blueprints.push({
      component: 'benefit-cards',
      variant: 'default',
      locked: false,
      values: {
        heading: text(values, 'highlights', 'heading'),
        items: list(values, 'highlights', 'items'),
      },
    });
  }

  // Always drawn by the template, with a heading it holds in code.
  blueprints.push({
    component: 'journey-steps',
    variant: 'default',
    locked: false,
    values: { heading: 'How it works' },
  });

  const bodySections = list(values, 'body', 'sections');
  const related = list(values, 'related', 'items');
  if (bodySections.length > 0 || related.length > 0) {
    blueprints.push({
      component: 'article-body',
      variant: related.length > 0 ? 'default' : 'full-width',
      locked: false,
      values: {
        sections: bodySections,
        // The template's own sidebar heading, which was never editable.
        relatedHeading: 'Related',
        related,
      },
    });
  }

  if (text(values, 'content', 'heading')) {
    blueprints.push({
      component: 'content-upsell',
      variant: 'default',
      locked: false,
      values: {
        heading: text(values, 'content', 'heading'),
        body: text(values, 'content', 'body'),
        cta: group(values, 'content').cta,
        // The template reused the hero's bird here rather than carrying a
        // second field. A section owns its own content, so it gets a copy -
        // and can be given a different one later.
        mascot,
      },
    });
  }

  const faqs = list(values, 'faqs', 'items');
  if (faqs.length > 0) {
    blueprints.push({
      component: 'faq',
      // The white band with the wider measure, which is what the template
      // drew. The standard variant is a narrower one on the page background.
      variant: 'wide',
      locked: false,
      values: { heading: 'Frequently asked questions', items: faqs },
    });
  }

  // A dark band with no heading renders as nothing, so it is not created as
  // nothing either - same rule as the bands above.
  if (text(values, 'cta', 'heading')) {
    blueprints.push({
      component: 'cta',
      variant: 'dark',
      locked: false,
      values: {
        heading: text(values, 'cta', 'heading'),
        body: text(values, 'cta', 'body'),
        primaryCta: group(values, 'cta').primaryCta,
        secondaryCta: group(values, 'cta').secondaryCta,
      },
    });
  }

  return blueprints;
}

/**
 * The blueprint for the homepage.
 *
 * Twenty-one bands, and the page has two halves with a deliberate seam
 * between them. The top half sells: what this is, that the websites are
 * real, what is in the marketplace, how ordering works, and what it looks
 * like inside. The bottom half answers the questions somebody not ready to
 * register is still asking, which is the half a search engine reads.
 *
 * The seam is a call to action, not a change of design. A visitor should not
 * feel they have arrived at a blog.
 *
 * ## Where the copy comes from
 *
 * Mostly from the page's own CMS content, which is why this reads as a
 * mapping rather than as an essay: the headline, the steps, the marketplace
 * copy, the comparison, the checklist, the metric cards, the questions and
 * the closing ask are all already written and already editable.
 *
 * The editorial bands are the interesting case. The homepage held eight
 * articles in one long column with a contents list beside it; the design
 * breaks that column up, so those articles are distributed across the bands
 * they belong to rather than being copied into a second place. The column
 * itself is not recreated - the same words are on the page, in better
 * company.
 *
 * ## Three bands that carry no content from anywhere
 *
 * The browse grid's niches, the benefit cards and the unlock panel's list
 * were a TypeScript literal, a design mockup and nothing at all. They arrive
 * from `home-content.ts` and are editable from the first render.
 *
 * ## What is not here
 *
 * No figure. Websites listed, niches, countries and the preview rows are
 * counted on the render that draws them. No customer quote: the band exists,
 * is editable, and arrives switched off.
 */
export function homePageBlueprint(values: PageValues): SectionBlueprint[] {
  const blueprints: SectionBlueprint[] = [];
  const stagger = { entrance: 'stagger', speed: 'normal', delay: 'none' } as const;
  const fadeUp = { entrance: 'fade-up', speed: 'normal', delay: 'none' } as const;

  // ---------------------------------------------------------- the sell ----

  // Locked: it holds the page's only H1. Everything about it stays editable.
  blueprints.push({
    component: 'home-hero',
    variant: 'default',
    locked: true,
    values: {
      eyebrow: text(values, 'hero', 'eyebrow'),
      titleLine1: text(values, 'hero', 'titleLine1'),
      titleLine2: text(values, 'hero', 'titleLine2'),
      titleAccent: text(values, 'hero', 'titleAccent'),
      intro:
        'Discover relevant websites, compare real SEO metrics and order high-quality backlinks and content placements through Press Parrot.',
      /*
        Registering is the primary action, and the brief is explicit about
        why: paid traffic lands here. The page used to lead with "Browse
        Websites", which sends a stranger to a gate.
      */
      primaryCta: { label: 'Create Free Account', href: '/signup' },
      secondaryCta: { label: 'See How It Works', href: '/how-it-works' },
      reassurance: list(values, 'hero', 'reassurance'),
      annotation: text(values, 'hero', 'annotation'),
      cardWebsites: text(values, 'hero', 'cardWebsites'),
      cardNiches: text(values, 'hero', 'cardNiches'),
      cardCountries: text(values, 'hero', 'cardCountries'),
      image: { src: '', alt: '' },
    },
  });

  blueprints.push({
    component: 'trust-stats',
    variant: 'default',
    locked: false,
    animation: { entrance: 'stagger', speed: 'subtle', delay: 'none' },
    values: {
      websitesLabel: text(values, 'metrics', 'websitesLabel'),
      nichesLabel: text(values, 'metrics', 'nichesLabel'),
      countriesLabel: text(values, 'metrics', 'countriesLabel'),
      items: list(values, 'metrics', 'items'),
    },
  });

  blueprints.push({
    component: 'niche-categories',
    variant: 'cards',
    locked: false,
    animation: stagger,
    values: {
      eyebrow: 'Every industry',
      heading: 'Link building opportunities in every industry',
      body: 'Explore websites across popular niches, from gambling and sports to finance, crypto, technology and more.',
      items: BROWSE_NICHES,
      cta: { label: 'See the whole marketplace', href: '/marketplace' },
    },
  });

  blueprints.push({
    component: 'steps',
    variant: 'flight-path',
    locked: false,
    animation: stagger,
    values: {
      eyebrow: 'A simple process',
      heading: 'How Press Parrot works',
      body: 'Find, compare and order high-quality backlinks and content placements in a few steps.',
      items: JOURNEY,
      cta: { label: '', href: '' },
    },
  });

  /*
    The conversion section. A visitor sees the shape of the marketplace - real
    rows, redacted in the service layer so no domain, price or id ever reaches
    the page - beside the reason to register. Seeing what is behind the gate
    is what makes the gate worth passing.
  */
  blueprints.push({
    component: 'marketplace-demo',
    variant: 'unlock',
    locked: false,
    animation: fadeUp,
    values: {
      eyebrow: text(values, 'marketplace', 'eyebrow'),
      heading: 'Thousands of real websites at your fingertips',
      body: 'Search, filter and compare websites using real SEO metrics, traffic data and niche relevance.',
      unlockHeading: 'Create a free account to unlock the marketplace',
      benefits: UNLOCK_BENEFITS,
      cta: { label: 'Create Free Account', href: '/signup' },
      secondaryCta: { label: 'Or browse niches first', href: '/marketplace' },
      ctaCaption: text(values, 'marketplace', 'ctaCaption'),
    },
  });

  /*
    Built, editable, and switched off. There are no quotes anybody really
    gave, and an invented one is a lie on the page a stranger judges the
    business by. Typing a real one in and pressing show is the whole job.
  */
  blueprints.push({
    component: 'testimonials',
    variant: 'default',
    locked: false,
    hidden: true,
    animation: stagger,
    values: {
      eyebrow: 'Trusted by SEOs and agencies',
      heading: 'What our customers say',
      body: '',
      items: [],
    },
  });

  blueprints.push({
    component: 'benefit-cards',
    variant: 'with-art',
    locked: false,
    animation: stagger,
    values: {
      eyebrow: 'Why Press Parrot',
      heading: 'A better way to build backlinks',
      body: 'Everything you need to find, evaluate and order high-quality link building opportunities.',
      items: BENEFITS,
      image: { src: '/images/press-parrot-hero.webp', alt: '' },
    },
  });

  blueprints.push({
    component: 'service-cards',
    variant: 'default',
    locked: false,
    animation: stagger,
    values: {
      heading: text(values, 'services', 'heading'),
      intro: text(values, 'services', 'intro'),
      items: list(values, 'services', 'items'),
    },
  });

  // ------------------------------------------------------- the reading ----
  //
  // The seam. From here the page answers rather than sells, in the same
  // design system - cards, asides, checklists and the marketplace itself
  // breaking the prose up, so nobody feels they have wandered into a blog.

  blueprints.push({
    component: 'rich-text',
    variant: 'default',
    locked: false,
    values: {
      heading: EDITORIAL_HEADINGS.simple,
      body: article(values, 'what-is-link-building'),
    },
  });

  blueprints.push({
    component: 'parrot-says',
    variant: 'accent',
    locked: false,
    animation: { entrance: 'slide-right', speed: 'subtle', delay: 'none' },
    values: {
      label: text(values, 'parrotSays', 'label'),
      body: text(values, 'parrotSays', 'body'),
    },
  });

  blueprints.push({
    component: 'marketplace-search',
    variant: 'default',
    locked: false,
    animation: fadeUp,
    values: {
      heading: text(values, 'search', 'heading'),
      body: text(values, 'search', 'body'),
      placeholder: text(values, 'search', 'placeholder'),
      cta: { label: 'Create Free Account to Search Websites', href: '/signup' },
      note: text(values, 'search', 'note'),
    },
  });

  /*
    Expandable, not lazy-loaded. Every word behind the link is in the page
    source - the disclosure changes how it looks, not whether it is there -
    which is the only version of this pattern a search engine reads.
  */
  blueprints.push({
    component: 'expandable',
    variant: 'default',
    locked: false,
    values: {
      heading: EDITORIAL_HEADINGS.buying,
      intro: article(values, 'high-quality-backlink'),
      label: EDITORIAL_HEADINGS.buyingLabel,
      more: joinArticles(values, [
        ['How Press Parrot vets websites', 'how-we-vet'],
        ['Why link building still matters', 'why-link-building-matters'],
      ]),
    },
  });

  blueprints.push({
    component: 'comparison',
    variant: 'default',
    locked: false,
    animation: fadeUp,
    values: {
      heading: text(values, 'comparison', 'heading'),
      body: text(values, 'comparison', 'body'),
      goodTitle: text(values, 'comparison', 'goodTitle'),
      good: list(values, 'comparison', 'good'),
      badTitle: text(values, 'comparison', 'badTitle'),
      bad: list(values, 'comparison', 'bad'),
    },
  });

  blueprints.push({
    component: 'expandable',
    variant: 'default',
    locked: false,
    values: {
      heading: EDITORIAL_HEADINGS.guestPosts,
      intro: article(values, 'guest-posts-vs-niche-edits'),
      label: EDITORIAL_HEADINGS.guestPostsLabel,
      more: joinArticles(values, [['Content and link building', 'content-and-links']]),
    },
  });

  blueprints.push({
    component: 'cta',
    variant: 'light',
    locked: false,
    animation: fadeUp,
    values: CONTENT_CTA,
  });

  blueprints.push({
    component: 'rich-text',
    variant: 'default',
    locked: false,
    values: {
      heading: EDITORIAL_HEADINGS.choosing,
      body: article(values, 'choosing-opportunities'),
    },
  });

  /*
    The checklist is the second half of the band above it, so it carries no
    heading of its own: the page said "How to choose websites for link
    building" twice otherwise, once over the copy and once over the list of
    what to check.
  */
  blueprints.push({
    component: 'checklist',
    variant: 'default',
    locked: false,
    animation: { entrance: 'stagger', speed: 'subtle', delay: 'none' },
    values: {
      heading: '',
      body: text(values, 'checklist', 'body'),
      items: list(values, 'checklist', 'items'),
    },
  });

  blueprints.push({
    component: 'metric-cards',
    variant: 'default',
    locked: false,
    animation: stagger,
    values: {
      heading: text(values, 'metricCards', 'heading'),
      body: text(values, 'metricCards', 'body'),
      items: list(values, 'metricCards', 'items'),
      cta: group(values, 'metricCards').cta,
    },
  });

  blueprints.push({
    component: 'related-pages',
    variant: 'default',
    locked: false,
    animation: stagger,
    values: {
      heading: 'Link building across different niches',
      body: 'Relevance is the metric that matters most, so start with the publishers who already write about what you do.',
      items: NICHE_LINKS,
    },
  });

  const faqs = list(values, 'faqs', 'items');
  if (faqs.length > 0) {
    blueprints.push({
      component: 'faq',
      variant: 'wide-muted',
      locked: false,
      values: { heading: 'Link building FAQs', items: faqs },
    });
  }

  blueprints.push({
    component: 'cta',
    variant: 'panel',
    locked: false,
    animation: fadeUp,
    values: {
      heading: text(values, 'finalCta', 'heading'),
      body: text(values, 'finalCta', 'body'),
      primaryCta: group(values, 'finalCta').primaryCta,
      secondaryCta: group(values, 'finalCta').secondaryCta,
      annotation: text(values, 'finalCta', 'annotation'),
    },
  });

  return blueprints;
}

/** One of the homepage's editorial articles, by its anchor id. */
function article(values: PageValues, id: string): unknown {
  const found = list(values, 'editorial', 'articles').find(
    (row) => isRecord(row) && row.id === id,
  );
  return isRecord(found) ? (found.content ?? '') : '';
}

/**
 * Several articles as one document, each under its own subheading.
 *
 * Markdown is what ships, so joining is concatenation. An article somebody
 * has edited in the rich text editor is a document rather than a string and
 * cannot be concatenated with one; in that case the first article is used
 * alone and the rest stay where they already are, which loses nothing - they
 * are still in `page_content` and still render on the template.
 */
function joinArticles(values: PageValues, wanted: [string, string][]): unknown {
  const parts = wanted.map(([heading, id]) => ({ heading, content: article(values, id) }));
  const strings = parts.filter((part) => typeof part.content === 'string' && part.content.trim());

  if (strings.length !== parts.length) return parts[0]?.content ?? '';

  return strings
    .map((part) => `## ${part.heading}\n\n${(part.content as string).trim()}`)
    .join('\n\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Which templates can be converted, and how. */
const BLUEPRINTS: Record<string, (values: PageValues) => SectionBlueprint[]> = {
  niche: nichePageBlueprint,
  home: homePageBlueprint,
};

export function canConvert(template: string): boolean {
  return template in BLUEPRINTS;
}

/**
 * The sections a page would become, cleaned through the component schemas.
 *
 * Cleaned rather than trusted, for the same reason a save is: the values come
 * out of `page_content`, which an editor writes, and a component's schema is
 * the only thing that decides what its fields are. A key the component does
 * not declare does not survive the trip, whatever wrote it.
 *
 * An unknown template, or a component missing from the registry, yields
 * nothing rather than a half-built page.
 */
export function blueprintFor(template: string, values: PageValues): SectionBlueprint[] {
  const build = BLUEPRINTS[template];
  if (!build) return [];

  return build(values).flatMap((blueprint) => {
    const component = getComponent(blueprint.component);
    if (!component) return [];
    return [{ ...blueprint, values: cleanSectionValues(component, blueprint.values) }];
  });
}
