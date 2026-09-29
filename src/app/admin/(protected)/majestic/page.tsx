import { PageTitle } from '@/components/dashboard/page-title';
import { MajesticImport } from '@/components/admin/majestic-import';
import { MajesticSuggestions } from '@/components/admin/majestic-suggestions';
import { majesticService } from '@/lib/services/majestic-service';

export const dynamic = 'force-dynamic';

/*
  Writing nine hundred listings walks the inventory. The default function
  ceiling is nowhere near that, and a run killed half way leaves the figures
  applied to some listings and not others with nothing saying which.
*/
export const maxDuration = 300;

/**
 * Trust Flow, Citation Flow and what links to a site.
 *
 * A file rather than an API: the figures come from Majestic's Bulk Backlink
 * Checker, which a Pro plan already has. The API plan costs four hundred
 * dollars a month for three numbers and three labels per domain.
 */
export default async function MajesticPage() {
  /*
    The failure is shown, not swallowed.

    This was `.catch(() => [])`, and underneath it a read loop treated a query
    error as the end of its pages. So a query that never ran came out the
    other end as "nothing to suggest" - which is a sentence about the data
    when it was really a sentence about the code.
  */
  const suggestions = await majesticService
    .suggestions()
    .catch((error: unknown) => ({
      rows: [],
      error: error instanceof Error ? error.message : 'The suggestions could not be read.',
    }));

  return (
    <div className="space-y-5">
      <PageTitle
        title="Majestic"
        description="Trust flow, citation flow and topical trust flow, from a Bulk Backlink Checker export."
      />
      <MajesticImport />
      <MajesticSuggestions suggestions={suggestions.rows} error={suggestions.error} />
    </div>
  );
}
