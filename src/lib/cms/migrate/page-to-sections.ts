import { getComponent, cleanSectionValues } from '../components/schema';
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
 * Eighteen bands, in the order the page argues in: what this is, that it is
 * real, what is in it, how it works, what it looks like inside - then the
 * reading for anybody not ready to act, and the ask.
 *
 * Three of them carry content that was never in the CMS at all. The niche
 * grid's ten categories, its heading and its link were a TypeScript literal,
 * and the customer quotes were an empty array in a config file. Converting is
 * the moment they become editable, so they arrive as starting values here
 * rather than staying in code where nobody can reach them.
 *
 * The quotes arrive hidden. There are none that anybody really said, and a
 * placeholder testimonial on the homepage of a live business says the product
 * has no customers *and* looks unfinished. The band is built and waiting.
 */
export function homePageBlueprint(values: PageValues): SectionBlueprint[] {
  const blueprints: SectionBlueprint[] = [];

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
      intro: text(values, 'hero', 'intro'),
      primaryCta: group(values, 'hero').primaryCta,
      secondaryCta: group(values, 'hero').secondaryCta,
      reassurance: list(values, 'hero', 'reassurance'),
      annotation: text(values, 'hero', 'annotation'),
      cardWebsites: text(values, 'hero', 'cardWebsites'),
      cardNiches: text(values, 'hero', 'cardNiches'),
      cardCountries: text(values, 'hero', 'cardCountries'),
      // Blank means the shipped mascot, which is what the hero drew before.
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

  /*
    The niche grid, which was ten slugs and three strings in a component file.
    Named explicitly rather than left to "whatever is busiest", because that
    is what the page showed and because a row that reorders itself as
    inventory moves is not a navigation an editor can reason about.
  */
  blueprints.push({
    component: 'niche-categories',
    variant: 'cards',
    locked: false,
    animation: { entrance: 'stagger', speed: 'normal', delay: 'none' },
    values: {
      eyebrow: 'Hand picked opportunities',
      heading: 'Explore by niche',
      body: '',
      items: [
        { slug: 'igaming' },
        { slug: 'sports' },
        { slug: 'finance' },
        { slug: 'technology' },
        { slug: 'business' },
        { slug: 'health' },
        { slug: 'travel' },
        { slug: 'lifestyle' },
        { slug: 'crypto' },
        { slug: 'entertainment' },
      ],
      cta: { label: 'See the whole marketplace', href: '/marketplace' },
    },
  });

  blueprints.push({
    component: 'steps',
    variant: 'flight-path',
    locked: false,
    animation: { entrance: 'stagger', speed: 'normal', delay: 'none' },
    values: {
      eyebrow: text(values, 'steps', 'eyebrow'),
      heading: text(values, 'steps', 'heading'),
      body: '',
      items: list(values, 'steps', 'items').map((item) => {
        const step = (item ?? {}) as Record<string, unknown>;
        return {
          number: typeof step.number === 'string' ? step.number : '',
          title: typeof step.title === 'string' ? step.title : '',
          // The homepage called it `description`; the library calls it `body`.
          body: typeof step.description === 'string' ? step.description : '',
        };
      }),
      cta: { label: '', href: '' },
    },
  });

  blueprints.push({
    component: 'marketplace-demo',
    variant: 'metrics',
    locked: false,
    animation: { entrance: 'fade-up', speed: 'normal', delay: 'none' },
    values: {
      eyebrow: text(values, 'marketplace', 'eyebrow'),
      heading: text(values, 'marketplace', 'heading'),
      body: text(values, 'marketplace', 'body'),
      unlockHeading: 'Create a free account to unlock the marketplace',
      benefits: [],
      cta: group(values, 'marketplace').cta,
      secondaryCta: { label: '', href: '' },
      ctaCaption: text(values, 'marketplace', 'ctaCaption'),
    },
  });

  blueprints.push({
    component: 'old-vs-new',
    variant: 'default',
    locked: false,
    animation: { entrance: 'fade-up', speed: 'normal', delay: 'none' },
    values: {
      heading: text(values, 'why', 'heading'),
      body: group(values, 'why').body,
      annotation: text(values, 'why', 'annotation'),
      cta: group(values, 'why').cta,
      oldHeading: text(values, 'why', 'oldHeading'),
      oldWay: list(values, 'why', 'oldWay'),
      newHeading: text(values, 'why', 'newHeading'),
      newWay: list(values, 'why', 'newWay'),
    },
  });

  blueprints.push({
    component: 'service-cards',
    variant: 'default',
    locked: false,
    animation: { entrance: 'stagger', speed: 'normal', delay: 'none' },
    values: {
      heading: text(values, 'services', 'heading'),
      intro: text(values, 'services', 'intro'),
      items: list(values, 'services', 'items'),
    },
  });

  blueprints.push({
    component: 'feature-list',
    variant: 'default',
    locked: false,
    animation: { entrance: 'stagger', speed: 'normal', delay: 'none' },
    values: {
      heading: text(values, 'features', 'heading'),
      intro: text(values, 'features', 'intro'),
      items: list(values, 'features', 'items'),
    },
  });

  blueprints.push({
    component: 'agency-panel',
    variant: 'default',
    locked: false,
    animation: { entrance: 'fade-up', speed: 'normal', delay: 'none' },
    values: {
      eyebrow: text(values, 'agencies', 'eyebrow'),
      heading: text(values, 'agencies', 'heading'),
      body: text(values, 'agencies', 'body'),
      primaryCta: group(values, 'agencies').primaryCta,
      secondaryCta: group(values, 'agencies').secondaryCta,
      items: list(values, 'agencies', 'items'),
    },
  });

  blueprints.push({
    component: 'editorial',
    variant: 'default',
    locked: false,
    values: {
      eyebrow: text(values, 'editorial', 'eyebrow'),
      heading: text(values, 'editorial', 'heading'),
      articles: list(values, 'editorial', 'articles'),
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
    values: {
      heading: text(values, 'search', 'heading'),
      body: text(values, 'search', 'body'),
      placeholder: text(values, 'search', 'placeholder'),
      cta: group(values, 'search').cta,
      note: text(values, 'search', 'note'),
    },
  });

  blueprints.push({
    component: 'comparison',
    variant: 'default',
    locked: false,
    animation: { entrance: 'fade-up', speed: 'normal', delay: 'none' },
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
    component: 'checklist',
    variant: 'default',
    locked: false,
    animation: { entrance: 'stagger', speed: 'normal', delay: 'none' },
    values: {
      heading: text(values, 'checklist', 'heading'),
      body: text(values, 'checklist', 'body'),
      items: list(values, 'checklist', 'items'),
    },
  });

  blueprints.push({
    component: 'metric-cards',
    variant: 'default',
    locked: false,
    animation: { entrance: 'stagger', speed: 'normal', delay: 'none' },
    values: {
      heading: text(values, 'metricCards', 'heading'),
      body: text(values, 'metricCards', 'body'),
      items: list(values, 'metricCards', 'items'),
      cta: group(values, 'metricCards').cta,
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
    animation: { entrance: 'stagger', speed: 'normal', delay: 'none' },
    values: {
      eyebrow: 'Trusted by SEOs and agencies',
      heading: 'What our customers say',
      body: '',
      items: [],
    },
  });

  const faqs = list(values, 'faqs', 'items');
  if (faqs.length > 0) {
    blueprints.push({
      component: 'faq',
      variant: 'wide-muted',
      locked: false,
      values: { heading: 'Frequently asked questions', items: faqs },
    });
  }

  blueprints.push({
    component: 'cta',
    variant: 'panel',
    locked: false,
    animation: { entrance: 'fade-up', speed: 'normal', delay: 'none' },
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
