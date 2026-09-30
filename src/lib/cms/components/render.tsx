import {
  CtaSection,
  FaqSection,
  FeatureCardsSection,
  RichTextSection,
  type SectionProps,
} from '@/components/cms/sections';

/**
 * The other half of the registry: a component key to the thing that draws it.
 *
 * **This file must never import `schema.ts`.** That module holds field
 * definitions, labels and validation for the admin; this one holds frontend
 * components for the public site. Keeping them apart is the whole reason a
 * public page does not ship the editor: the page renderer reaches this map and
 * stops, so TipTap, the drag-and-drop and the field inputs are not in the
 * module graph at all.
 *
 * The two halves share nothing but the string keys, which is deliberate. A
 * shared type would be a shared import, and a shared import is how the bundles
 * find each other.
 */

export type SectionRenderer = (props: SectionProps) => React.ReactNode;

const RENDERERS: Record<string, SectionRenderer> = {
  'rich-text': RichTextSection,
  cta: CtaSection,
  'feature-cards': FeatureCardsSection,
  faq: FaqSection,
};

/**
 * How to draw this component, or null.
 *
 * Null rather than a throw. The registry is code and the rows are data, and
 * they are deployed at different moments - a row naming a component that a
 * deploy removed has to render as nothing, not as a five hundred on a page
 * that was working a minute ago.
 */
export function getRenderer(component: string): SectionRenderer | null {
  return RENDERERS[component] ?? null;
}

/** Every key with a renderer, for the check that the two halves agree. */
export function renderableComponents(): string[] {
  return Object.keys(RENDERERS);
}
