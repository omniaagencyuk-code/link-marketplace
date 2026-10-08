import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * The heading every admin and customer page starts with.
 *
 * Forty-eight pages render this, which is why it is the one worth getting
 * right: a change here lifts all of them, and sixteen pages restyled by hand
 * would be sixteen headings drifting apart again within a month.
 *
 * The props it already had are unchanged, so no page needed editing to get
 * the new treatment. `eyebrow` and `breadcrumb` are additions a page may use
 * and none has to.
 */
export function PageTitle({
  title,
  description,
  action,
  eyebrow,
  breadcrumb,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** A short label above the heading, e.g. the section this page sits in. */
  eyebrow?: string;
  /** Where this page sits, for one a level or two down. */
  breadcrumb?: { label: string; href: string }[];
}) {
  return (
    <div className="mb-6">
      {breadcrumb?.length ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-[12px] text-muted">
            {breadcrumb.map((crumb) => (
              <li key={crumb.href} className="flex items-center gap-1">
                <Link href={crumb.href} className="transition-colors hover:text-ink">
                  {crumb.label}
                </Link>
                <ChevronRight className="h-3 w-3 text-muted-soft" aria-hidden="true" />
              </li>
            ))}
            <li className="text-ink-soft">{title}</li>
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
              {eyebrow}
            </p>
          ) : null}
          {/*
            Larger and tighter than it was, to match the dashboards either
            side of it. `text-balance` keeps a two-word overflow from leaving
            one word alone on the second line.
          */}
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-balance text-ink sm:text-[26px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
