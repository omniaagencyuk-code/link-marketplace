import { getAdminScopedClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/services/supabase/paged';
import { describeFromHtml } from '@/lib/websites/site-description';
import { brand } from '@/lib/config/brand';

/**
 * Filling in what each publisher says their own site is about.
 *
 * `description` is empty on almost every listing - the importer writes `''` and
 * the only thing that has ever filled it is somebody typing into the admin
 * editor. It is also the field the listing overview leads with, and the one the
 * marketplace card, the table row and the expanded snippet all print, so one
 * empty column shows up in five places.
 *
 * A publisher's own meta description fills it, costs nothing but an HTTP
 * request, and is better copy than anything that could be generated: it is
 * written by them, about them, for strangers.
 *
 * ## What this will not do
 *
 * Overwrite. A description somebody typed, or one a previous run found, is left
 * alone - the run only fills blanks, so it is safe to run repeatedly and
 * cannot undo an edit.
 *
 * Guess. A homepage that answers with boilerplate, a parking page or a block
 * page contributes nothing rather than a sentence about WordPress. An empty
 * description is a paragraph the overview leaves out; a wrong one is a claim on
 * a page somebody spends money from.
 */

export interface DescriptionRun {
  looked: number;
  filled: number;
  nothingUseful: number;
  failed: number;
  /** The first failure, so a run that fills nothing can say why. */
  firstError?: string;
}

/** Long enough for a slow publisher, short enough that a dead host is cheap. */
const TIMEOUT_MS = 12_000;

/** A homepage is HTML. Reading more than this is reading a payload, not a page. */
const MAX_BYTES = 400_000;

/**
 * How many at once.
 *
 * These are other people's servers. A burst of hundreds of simultaneous
 * requests from one address is how a crawler gets blocked, and being blocked
 * loses the publisher relationship as well as the description.
 */
const AT_ONCE = 8;

/**
 * Identifies itself, and says why.
 *
 * A bot that will not say who it is gets blocked by anybody paying attention,
 * and these are sites we have a commercial relationship with - being
 * recognisable is worth more than the handful of extra responses a browser
 * string would win.
 */
const USER_AGENT = `Mozilla/5.0 (compatible; ${brand.name.replace(/\s+/g, '')}Bot/1.0; +https://pressparrot.com/)`;

async function homepageDescription(domain: string): Promise<string | undefined> {
  /*
    https first, http second.

    A publisher still on plain http is rare and is not a reason to skip them,
    but trying http first would mean a redirect on almost every site.
  */
  for (const url of [`https://${domain}/`, `http://${domain}/`]) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) continue;

      const type = response.headers.get('content-type') ?? '';
      if (!type.includes('html')) continue;

      // Read a bounded prefix: the meta tags are in the head, and a homepage
      // that streams a megabyte of markup should not cost a megabyte to read.
      const html = (await response.text()).slice(0, MAX_BYTES);
      const found = describeFromHtml(html);
      if (found) return found;
    } catch {
      // A timeout, a refused connection, a bad certificate. The next scheme
      // gets a go; if both fail the domain is simply counted as failed.
    }
  }
  return undefined;
}

/**
 * Fill in the blank descriptions, a batch at a time.
 *
 * `limit` bounds a run so it fits inside a serverless invocation. Running it
 * again picks up where it left off, because the query is "still blank" rather
 * than an offset - which also means a domain that answered with boilerplate is
 * retried next time, and that is the right trade: sites get redesigned.
 */
export async function fillSiteDescriptions(limit = 200): Promise<DescriptionRun> {
  const supabase = getAdminScopedClient();
  const run: DescriptionRun = { looked: 0, filled: 0, nothingUseful: 0, failed: 0 };

  const rows = await readAllPages<{ id: string; domain: string }>(
    'listings with no description',
    (from, to) =>
      supabase
        .from('websites')
        .select('id, domain')
        .neq('status', 'archived')
        .or('description.is.null,description.eq.')
        .order('id', { ascending: true })
        .range(from, to),
  );

  const wanted = rows.slice(0, limit);

  for (let start = 0; start < wanted.length; start += AT_ONCE) {
    const slice = wanted.slice(start, start + AT_ONCE);

    const found = await Promise.all(
      slice.map(async (row) => {
        try {
          return { row, description: await homepageDescription(row.domain) };
        } catch (error) {
          return { row, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    );

    for (const result of found) {
      run.looked += 1;

      if ('error' in result && result.error) {
        run.failed += 1;
        run.firstError ??= `${result.row.domain}: ${result.error}`;
        continue;
      }
      if (!result.description) {
        run.nothingUseful += 1;
        continue;
      }

      const { error } = await supabase
        .from('websites')
        // Only the description. A run that touched anything else would be a
        // crawler with write access to the inventory.
        .update({ description: result.description })
        .eq('id', result.row.id);

      if (error) {
        run.failed += 1;
        run.firstError ??= `${result.row.domain}: ${error.message}`;
      } else {
        run.filled += 1;
      }
    }
  }

  return run;
}

/**
 * How many listings still have no description.
 *
 * A head count rather than a read: the admin page needs the number to decide
 * whether the button has anything to do, and reading seventeen hundred rows to
 * find out would be a page load's worth of work for one integer.
 */
export async function blankDescriptionCount(): Promise<number> {
  const supabase = getAdminScopedClient();
  const { count, error } = await supabase
    .from('websites')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'archived')
    .or('description.is.null,description.eq.');

  if (error) throw new Error(`Failed to count blank descriptions: ${error.message}`);
  return count ?? 0;
}
