import type { ReactNode } from 'react';
import { pageSectionService } from '@/lib/services/page-section-service';
import { getRenderer, isAnimatable } from '@/lib/cms/components/render';
import { Reveal } from './reveal';
import { resolveSection, type PageSection } from '@/lib/cms/sections';
import { applyTokens, type TokenValues } from '@/lib/cms/tokens';
import { neededBy } from '@/lib/cms/components/needs';
import { websiteService } from '@/lib/services';
import { acceptedNiches } from '@/lib/config/accepted-niches';
import { siteUrl } from '@/lib/config/brand';
import type { PageConfig, SectionData } from './sections/shared';
import type { SectionValues } from '@/lib/cms/sections';
import type { NicheSlug } from '@/lib/types';

export type { PageConfig };

/**
 * A page built from sections.
 *
 * A server component, and deliberately a dull one. It reads the page's rows
 * once, looks each component up in the frontend half of the registry, and
 * renders it. There is no client JavaScript here and nothing from the admin
 * in the module graph - the renderer imports `render.tsx`, which imports
 * frontend components, and the chain stops there.
 *
 * ## The fallback is the migration plan
 *
 * A page with no rows renders `fallback`, which is whatever that page renders
 * today. So this can be dropped into every page at once without changing a
 * single one of them, and a page moves onto the builder when its rows exist
 * and somebody has compared the two renders - not when a migration runs.
 * Nothing has to be deleted for the new path to work, which means nothing has
 * to be deleted before it has been checked.
 *
 * ## What an unknown component does
 *
 * Nothing, visibly. A row can name a component that a later deploy removed,
 * because rows are data and the registry is code and they arrive at different
 * moments. That renders as a gap rather than as an error page, which is the
 * right trade for a live marketing page.
 */
export async function PageSections({
  slug,
  fallback = null,
  tokens = {},
  config = {},
  provided,
}: {
  slug: string;
  /** What the page renders while it has no sections of its own. */
  fallback?: ReactNode;
  /** Live figures for `{{marketplace_site_count}}` and friends. */
  tokens?: TokenValues;
  /**
   * What the page *is*: its category, its breadcrumb, its path.
   *
   * Set once here rather than on every component that draws the marketplace,
   * which is the difference between configuring "gambling" once and
   * configuring it nine times.
   */
  config?: PageConfig;
  /**
   * Data the route has already fetched, so it is not fetched twice.
   *
   * A route that still renders a fallback has to read the marketplace before
   * it knows whether the fallback is needed. Handing the result in keeps that
   * to one query rather than two; it goes away with the fallback.
   */
  provided?: { preview?: SectionData['preview']; listingCount?: number };
}) {
  const sections = await pageSectionService.forPage(slug);
  if (sections.length === 0) return <>{fallback}</>;

  const resolved = sections.map((section) => ({ section, ...resolveSection(section) }));
  const data = await gather(
    resolved.map((entry) => entry.component),
    config,
    provided,
  );

  return (
    <>
      <PageStructuredData config={config} sections={resolved} tokens={tokens} />
      {sections.map((section) => (
        <Section key={section.id} section={section} tokens={tokens} data={data} />
      ))}
    </>
  );
}

/**
 * The structured data a built page publishes.
 *
 * It lives here rather than in a section because both kinds are statements
 * about the *page*: a breadcrumb trail describes where the page sits, and a
 * FAQPage describes the questions the page answers, wherever on it they
 * happen to sit. A section emitting its own would mean two FAQ blocks
 * publishing two FAQPage objects and Google trusting neither.
 *
 * The breadcrumb needs a path and a label to be true, so a page without them
 * publishes nothing rather than publishing a trail to itself.
 */
function PageStructuredData({
  config,
  sections,
  tokens,
}: {
  config: PageConfig;
  sections: { component: string; values: SectionValues }[];
  tokens: TokenValues;
}) {
  const faqs = sections
    .filter((entry) => entry.component === 'faq')
    .flatMap((entry) => {
      const items = fillTokens(entry.values, tokens).items;
      return Array.isArray(items) ? (items as { question?: unknown; answer?: unknown }[]) : [];
    })
    .filter(
      (item): item is { question: string; answer: string } =>
        typeof item.question === 'string' &&
        typeof item.answer === 'string' &&
        item.question !== '' &&
        item.answer !== '',
    );

  const crumbs =
    config.path && config.label
      ? [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          ...(config.breadcrumbParent
            ? [
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: config.breadcrumbParent.label,
                  item: `${siteUrl}${config.breadcrumbParent.href}`,
                },
              ]
            : []),
          {
            '@type': 'ListItem',
            position: config.breadcrumbParent ? 3 : 2,
            name: config.label,
            item: `${siteUrl}${config.path}`,
          },
        ]
      : [];

  return (
    <>
      {crumbs.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: crumbs,
            }),
          }}
        />
      ) : null}

      {faqs.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faqs.map((faq) => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: { '@type': 'Answer', text: faq.answer },
              })),
            }),
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The application data this page's sections need, fetched once.
 *
 * Once per page rather than once per section: two marketplace blocks on one
 * page are one query between them, and a page with none makes none at all.
 * That is the same rule the section read follows, applied to what the sections
 * then ask for.
 *
 * Components declare their needs in `needs.ts`, which is a closed vocabulary
 * on purpose. A section can ask for the marketplace preview; it cannot ask for
 * the result of a query, which is what keeps editorial content away from the
 * inventory.
 */
async function gather(
  components: string[],
  config: PageConfig,
  provided?: { preview?: SectionData['preview']; listingCount?: number },
): Promise<SectionData> {
  const needed = neededBy(components);
  if (needed.size === 0) return { page: config };

  /*
    Scoped to the page's category, so a page about gambling shows gambling
    listings and quotes the gambling count. An unknown slug scopes to nothing
    rather than to something wrong: the whole marketplace is obviously the
    whole marketplace, where a finance page quietly showing gambling
    publishers is not obviously anything.
  */
  const niche = acceptedNiches.some((entry) => entry.slug === config.niche)
    ? (config.niche as NicheSlug)
    : undefined;

  const [fetched, counts] = await Promise.all([
    needed.has('preview') && provided?.preview === undefined
      ? websiteService.getPublicPreview(6, niche)
      : undefined,
    needed.has('niches') || needed.has('totals') ? websiteService.countByNiche() : undefined,
  ]);

  const preview = provided?.preview ?? fetched?.rows;
  const listingCount = provided?.listingCount ?? fetched?.totalWebsites;

  const niches = counts
    ? acceptedNiches
        .map((niche) => ({
          slug: niche.slug,
          label: niche.label,
          count: counts[niche.slug as keyof typeof counts] ?? 0,
          href: `/marketplace?niche=${niche.slug}`,
        }))
        .filter((niche) => niche.count > 0)
        .sort((a, b) => b.count - a.count)
    : undefined;

  return {
    page: config,
    preview,
    listingCount,
    niches: needed.has('niches') ? niches : undefined,
    totals: needed.has('totals') && niches
      ? {
          websites: niches.reduce((total, niche) => total + niche.count, 0),
          niches: niches.length,
          // Countries are not aggregated publicly yet, so the figure is left
          // out rather than guessed - the component drops any figure of zero.
          countries: 0,
        }
      : undefined,
  };
}

function Section({
  section,
  tokens,
  data,
}: {
  section: PageSection;
  tokens: TokenValues;
  data: SectionData;
}) {
  const { component, variant, values, animation } = resolveSection(section);
  const render = getRenderer(component);
  if (!render) return null;

  /*
    Called rather than mounted as <Renderer />.

    A component looked up from a map during render is the shape the lint rule
    warns about, and the warning is about state: a component identity that
    changes between renders remounts and resets. These have no state to reset.
    Every renderer is a server component - no hooks, no 'use client' - so it
    is a pure function of its props and calling it is exactly what mounting it
    would do, minus a component boundary nothing here needs.

    That is an assumption, so verify:sections checks it: no file behind this
    map carries 'use client'. The day one needs to, this has to become JSX
    again, and the check will say so rather than the page misbehaving.
  */
  const drawn = render({ values: fillTokens(values, tokens), variant, sectionId: section.id, data });

  /*
    Wrapped only where there is something to do. `Reveal` is the one client
    component on a built page, so a page whose sections are all still costs
    nothing for the feature - and a component the registry says is not worth
    animating cannot be animated by a row that asks for it.
  */
  if (animation.entrance === 'none' || !isAnimatable(component)) return drawn;

  return <Reveal animation={animation}>{drawn}</Reveal>;
}

/**
 * Resolve `{{token}}` in every string the section carries.
 *
 * Walked rather than applied at the top level, because the strings that want a
 * live number are as often in a card's title as in a heading. Rich text
 * documents are left alone: their text lives in nested nodes, and a token in
 * the middle of a paragraph is a thing to add when somebody asks for it
 * rather than a thing to guess at now.
 */
function fillTokens(values: SectionValues, tokens: TokenValues): SectionValues {
  // Nothing to fill in, so nothing to walk.
  if (Object.keys(tokens).length === 0) return values;

  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return applyTokens(value, tokens);
    if (Array.isArray(value)) return value.map(walk);
    if (isPlainObject(value)) {
      // A rich text document, which has its own shape and its own renderer.
      if ((value as { type?: unknown }).type === 'doc') return value;
      return Object.fromEntries(Object.entries(value).map(([key, sub]) => [key, walk(sub)]));
    }
    return value;
  };

  return walk(values) as SectionValues;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
