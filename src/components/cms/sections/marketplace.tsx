import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { formatNumber } from '@/lib/utils/format';
import { link, rows, str, type SectionProps } from './shared';

/**
 * Sections that draw the marketplace.
 *
 * All of them show aggregates, shapes and redacted rows. None of them shows a
 * domain, a price or a publisher, because none of them can: the rows arrive
 * already redacted from the service layer, so nothing identifiable exists in
 * the HTML, in the RSC payload or in the structured data - not because this
 * file remembers to leave it out.
 *
 * The figures are never editorial. An editor typing "620 websites" into a
 * heading is a page claiming 620 websites two years later; these count what
 * is actually there, on every render.
 */

// ----------------------------------------------------------------- preview

export function MarketplacePreviewSection({ values, data }: SectionProps) {
  const preview = data.preview ?? [];
  if (preview.length === 0) return null;

  const cta = link(values, 'cta');

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
          <div className="min-w-0">
            {str(values, 'heading') ? (
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.875rem] sm:leading-tight">
                {str(values, 'heading')}
              </h2>
            ) : null}
            {str(values, 'body') ? (
              <p className="mt-4 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
            ) : null}

            {cta.label && cta.href ? (
              <Button asChild variant="accent" size="lg" className="mt-7">
                <Link href={cta.href}>
                  {cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}

            {str(values, 'note') ? (
              <p className="mt-3 text-[13px] text-muted">{str(values, 'note')}</p>
            ) : null}
          </div>

          <div className="min-w-0">
            <RedactedPreview rows={preview} />
          </div>
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------------- stats

export function MarketplaceStatsSection({ values, data }: SectionProps) {
  const totals = data.totals;
  if (!totals) return null;

  const figures = [
    { value: totals.websites, label: str(values, 'websitesLabel') || 'Websites' },
    { value: totals.niches, label: str(values, 'nichesLabel') || 'Niches' },
    { value: totals.countries, label: str(values, 'countriesLabel') || 'Countries' },
  ].filter((figure) => figure.value > 0);

  if (figures.length === 0) return null;

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-10">
        {str(values, 'heading') ? (
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
            {str(values, 'heading')}
          </p>
        ) : null}

        <dl data-reveal-items="" className="mt-5 grid gap-6 sm:grid-cols-3">
          {figures.map((figure) => (
            <div key={figure.label}>
              <dt className="sr-only">{figure.label}</dt>
              <dd>
                <span className="tabular block text-[1.75rem] leading-none font-semibold tracking-tight text-ink">
                  {formatNumber(figure.value)}
                </span>
                <span className="mt-1.5 block text-[13px] text-muted">{figure.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

// -------------------------------------------------------- niche categories

/**
 * The niches, with how many publishers are in each.
 *
 * Counts come from the marketplace rather than from the CMS, and a niche with
 * nothing in it is left out - a card promising Crypto that opens an empty
 * search is worse than no card.
 */
export function NicheCategoriesSection({ values, data }: SectionProps) {
  const niches = (data.niches ?? []).filter((niche) => niche.count > 0);
  if (niches.length === 0) return null;

  const cta = link(values, 'cta');

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            {str(values, 'heading') ? (
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.875rem] sm:leading-tight">
                {str(values, 'heading')}
              </h2>
            ) : null}
            {str(values, 'body') ? (
              <p className="mt-4 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
            ) : null}
          </div>

          {cta.label && cta.href ? (
            <Link
              href={cta.href}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700 hover:underline"
            >
              {cta.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        <ul data-reveal-items="" className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {niches.map((niche) => (
            <li key={niche.slug}>
              <Link
                href={niche.href}
                className="flex h-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white px-4 py-3.5 shadow-[var(--shadow-card)] transition-colors hover:border-accent-500"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-ink">{niche.label}</span>
                  <span className="tabular mt-0.5 block text-[12px] text-muted">
                    {formatNumber(niche.count)} websites
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-soft" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------------ search

/**
 * A search box that is a link.
 *
 * Deliberately not a working search. The results are behind an account, so a
 * box that searched here would either show nothing or leak the inventory -
 * this takes what was typed to the marketplace, which asks for an account and
 * then runs the search properly.
 */
export function MarketplaceSearchSection({ values }: SectionProps) {
  const cta = link(values, 'cta');

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-12 lg:py-14">
        <div className="mx-auto max-w-2xl text-center">
          {str(values, 'heading') ? (
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.875rem]">
              {str(values, 'heading')}
            </h2>
          ) : null}
          {str(values, 'body') ? (
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
          ) : null}

          <form action="/marketplace" method="get" className="mt-7 flex flex-wrap gap-2.5">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-soft"
              />
              <input
                type="search"
                name="q"
                aria-label={str(values, 'placeholder') || 'Search publishers by domain, topic or country'}
                placeholder={str(values, 'placeholder') || 'Search publishers by domain, topic or country'}
                className="h-11 w-full rounded-md border border-line-strong bg-white pr-3 pl-9 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
              />
            </div>
            <Button type="submit" variant="accent" size="lg">
              {cta.label || 'Search websites'}
            </Button>
          </form>

          {str(values, 'note') ? (
            <p className="mt-3 text-[13px] text-muted">{str(values, 'note')}</p>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

/** Kept for the list components that share the row reader. */
export { rows };
