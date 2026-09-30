import type { ReactNode } from 'react';
import { pageSectionService } from '@/lib/services/page-section-service';
import { getRenderer, isAnimatable } from '@/lib/cms/components/render';
import { Reveal } from './reveal';
import { resolveSection, type PageSection } from '@/lib/cms/sections';
import { applyTokens, type TokenValues } from '@/lib/cms/tokens';
import { neededBy } from '@/lib/cms/components/needs';
import { websiteService } from '@/lib/services';
import { acceptedNiches } from '@/lib/config/accepted-niches';
import type { SectionData } from './sections/shared';
import type { SectionValues } from '@/lib/cms/sections';

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
}: {
  slug: string;
  /** What the page renders while it has no sections of its own. */
  fallback?: ReactNode;
  /** Live figures for `{{marketplace_site_count}}` and friends. */
  tokens?: TokenValues;
}) {
  const sections = await pageSectionService.forPage(slug);
  if (sections.length === 0) return <>{fallback}</>;

  const data = await gather(sections.map((section) => resolveSection(section).component));

  return (
    <>
      {sections.map((section) => (
        <Section key={section.id} section={section} tokens={tokens} data={data} />
      ))}
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
async function gather(components: string[]): Promise<SectionData> {
  const needed = neededBy(components);
  if (needed.size === 0) return {};

  const [preview, counts] = await Promise.all([
    needed.has('preview') ? websiteService.getPublicPreview(6).then((result) => result.rows) : undefined,
    needed.has('niches') || needed.has('totals') ? websiteService.countByNiche() : undefined,
  ]);

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
    preview,
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
