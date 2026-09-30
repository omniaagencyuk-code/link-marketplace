import {
  AgencyPanelSection,
  ArticleBodySection,
  BenefitCardsSection,
  ChecklistSection,
  ComparisonSection,
  ContentUpsellSection,
  EditorialSection,
  CtaSection,
  ExpandableSection,
  FaqSection,
  FeatureCardsSection,
  FeatureListSection,
  HeroSection,
  HomeHeroSection,
  IconGridSection,
  ImageSection,
  JourneyStepsSection,
  MarketplaceDemoSection,
  MarketplacePreviewSection,
  MarketplaceSearchSection,
  MarketplaceStatsSection,
  MetricCardsSection,
  NicheCategoriesSection,
  NicheHeroSection,
  NichePreviewSection,
  OldVsNewSection,
  ParrotChecklistSection,
  ParrotCtaSection,
  ParrotFlightPathSection,
  ParrotSaysSection,
  ParrotViewSection,
  RelatedPagesSection,
  RichTextSection,
  ServiceCardsSection,
  StatsSection,
  StepsSection,
  TableSection,
  TestimonialsSection,
  TextImageSection,
  TopicPillsSection,
  TrustBarSection,
  TrustStatsSection,
  TwoColumnSection,
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
  // content
  'rich-text': RichTextSection,
  'text-image': TextImageSection,
  'two-column': TwoColumnSection,
  image: ImageSection,
  table: TableSection,
  hero: HeroSection,

  // the bands the homepage is made of, registered so the next landing page
  // is assembled rather than written
  'home-hero': HomeHeroSection,
  'trust-stats': TrustStatsSection,
  testimonials: TestimonialsSection,
  'marketplace-demo': MarketplaceDemoSection,
  'old-vs-new': OldVsNewSection,
  'service-cards': ServiceCardsSection,
  'feature-list': FeatureListSection,
  'agency-panel': AgencyPanelSection,
  editorial: EditorialSection,
  'metric-cards': MetricCardsSection,

  // niche landing pages - the blocks the gambling page is made of
  'niche-hero': NicheHeroSection,
  'niche-preview': NichePreviewSection,
  'topic-pills': TopicPillsSection,
  'benefit-cards': BenefitCardsSection,
  'journey-steps': JourneyStepsSection,
  'article-body': ArticleBodySection,
  'content-upsell': ContentUpsellSection,

  // marketplace
  'marketplace-preview': MarketplacePreviewSection,
  'marketplace-stats': MarketplaceStatsSection,
  'niche-categories': NicheCategoriesSection,
  'marketplace-search': MarketplaceSearchSection,

  // visual
  'feature-cards': FeatureCardsSection,
  stats: StatsSection,
  checklist: ChecklistSection,
  comparison: ComparisonSection,
  'icon-grid': IconGridSection,
  'trust-bar': TrustBarSection,
  steps: StepsSection,

  // press parrot
  'parrot-says': ParrotSaysSection,
  'parrot-checklist': ParrotChecklistSection,
  'parrot-view': ParrotViewSection,
  'parrot-cta': ParrotCtaSection,
  'parrot-flight-path': ParrotFlightPathSection,

  // conversion - three library entries, one layout, different defaults
  cta: CtaSection,
  'signup-cta': CtaSection,
  'marketplace-cta': CtaSection,
  'order-content-cta': CtaSection,

  // seo
  faq: FaqSection,
  expandable: ExpandableSection,
  'related-pages': RelatedPagesSection,
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

/**
 * Which components may carry an entrance animation.
 *
 * Kept here rather than read from the schema, because the public renderer
 * must not import the schema - that separation is what keeps the admin's
 * bundle off a public page. The two lists agreeing is checked in
 * verify:sections, which can import both.
 *
 * Rich text is absent deliberately. Animating a wall of paragraphs as
 * somebody scrolls into it is the thing that makes a site feel like a
 * template, and long-form copy is what the reader came for.
 */
const ANIMATABLE = new Set([
  'text-image', 'two-column', 'image',
  // The niche hero is absent for the same reason the generic one is: it holds
  // the Largest Contentful Paint, and an element at opacity 0 is unpainted.
  // The article body is absent because it is long-form reading.
  'niche-preview', 'topic-pills', 'benefit-cards', 'journey-steps', 'content-upsell',
  // The homepage hero is absent for the reason the others are: it is the
  // Largest Contentful Paint. The editorial column is absent because
  // animating long-form reading is what makes a site feel like a template.
  'trust-stats', 'testimonials', 'marketplace-demo', 'old-vs-new',
  'service-cards', 'feature-list', 'agency-panel', 'metric-cards',
  'marketplace-preview', 'marketplace-stats', 'niche-categories', 'marketplace-search',
  'feature-cards', 'stats', 'checklist', 'comparison', 'icon-grid', 'trust-bar', 'steps',
  'parrot-says', 'parrot-checklist', 'parrot-view', 'parrot-cta', 'parrot-flight-path',
  'cta', 'signup-cta', 'marketplace-cta', 'order-content-cta',
  'faq', 'related-pages',
]);

export function isAnimatable(component: string): boolean {
  return ANIMATABLE.has(component);
}
