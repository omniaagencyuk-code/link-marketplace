import { getComponent, cleanSectionValues } from '../components/schema';
import type { PageValues, FieldValue } from '../types';
import type { SectionValues } from '../sections';

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

/** Which templates can be converted, and how. */
const BLUEPRINTS: Record<string, (values: PageValues) => SectionBlueprint[]> = {
  niche: nichePageBlueprint,
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
