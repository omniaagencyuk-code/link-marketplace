import Link from 'next/link';
import { ChevronRight, FolderPlus, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Flag } from '@/components/shared/flag';
import { countryName } from '@/lib/data/countries';
import type { CountryCode } from '@/lib/types';
import type { GapProject } from '@/lib/services/gap-service';

/**
 * The sites a customer is building links for, beside the marketplace.
 *
 * ## It is the Link Gap Finder's projects, not a second set
 *
 * `gap_projects` already exists, already belongs to its owner by a policy
 * scoped to `user_id` on `using` *and* `with check`, and already holds the
 * domain, the market and the competitors. A second projects table would be
 * two lists of the same sites that drift apart the first time somebody edits
 * one - and the customer would have no way to tell which the marketplace was
 * reading.
 *
 * So this reads them and does not own them. Creating and editing stays where
 * it is, in the Link Gap Finder, and the buttons here go there.
 *
 * ## What it does not show
 *
 * Domain rating and organic traffic. The mockup has both; `gap_projects` has
 * neither, and the only way to get them is an Ahrefs pull against the
 * customer's own domain on every marketplace visit - which is a real bill for
 * a decoration, and exactly what the gap finder's own cost rules exist to
 * prevent. A figure invented to fill the slot would be worse again: this
 * panel sits beside a table of measured metrics, and one made-up number in
 * that company is a reason to doubt all of them.
 *
 * The competitor count is real, because it is the length of a column we
 * already hold.
 */
export function ProjectsPanel({ projects }: { projects: GapProject[] }) {
  const project = projects[0];
  /*
    `gap_projects.country` is stored lowercase - the Ahrefs competitor
    endpoint takes it that way - and every country helper in the app takes
    the uppercase code. Converting here rather than at the column keeps the
    gap finder's own calls untouched.
  */
  const market = project?.country ? (project.country.toUpperCase() as CountryCode) : undefined;

  return (
    <section
      aria-label="Your projects"
      className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">Your Projects</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            The sites you are building links for.
          </p>
        </div>
        <Button asChild variant="accent" size="sm" className="shrink-0">
          <Link href="/dashboard/link-gap">
            <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Add project
          </Link>
        </Button>
      </div>

      {project ? (
        <Link
          href="/dashboard/link-gap"
          className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:border-accent-300 hover:bg-accent-50/50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <Radar className="h-4 w-4" aria-hidden="true" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">
              {project.domain}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
              <span className="truncate">{project.name}</span>
              {market ? (
                <>
                  <span aria-hidden="true">·</span>
                  <Flag country={market} className="h-3 w-4 shrink-0 rounded-[2px]" />
                  <span className="shrink-0">{countryName(market)}</span>
                </>
              ) : null}
            </span>
          </span>

          <span className="hidden shrink-0 items-center gap-5 sm:flex">
            <Figure value={String(project.competitorDomains.length)} label="Competitors" />
            {projects.length > 1 ? (
              <Figure value={String(projects.length)} label="Projects" />
            ) : null}
          </span>

          <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        </Link>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-line-strong bg-surface px-3 py-3 text-[12px] leading-relaxed text-muted">
          No projects yet. Add the site you are building links for and the Link Gap Finder will
          show you who links to your competitors and not to you.
        </p>
      )}
    </section>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <span className="text-center">
      <span className="tabular block text-[15px] leading-tight font-semibold text-ink">
        {value}
      </span>
      <span className="block text-[11px] text-muted">{label}</span>
    </span>
  );
}
