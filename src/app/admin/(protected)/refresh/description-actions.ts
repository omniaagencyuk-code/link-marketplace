'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { fillSiteDescriptions } from '@/lib/services/site-description-service';

/**
 * Fill in the blank site descriptions.
 *
 * Lives beside the Ahrefs controls because it is the same kind of job - a
 * bounded pass over the inventory that fetches something and writes it back -
 * and because that is the page somebody already goes to when they want the
 * listings brought up to date.
 *
 * It spends no money. The only cost is an HTTP request per domain, which is
 * why there is no budget guard here and a long one on the refresh next to it.
 */

export interface DescriptionActionResult {
  ok: boolean;
  message: string;
}

/** How many a single run attempts. Bounded by the serverless time limit. */
const PER_RUN = 200;

export async function fillDescriptionsAction(): Promise<DescriptionActionResult> {
  await requireAdminSession();

  try {
    const run = await fillSiteDescriptions(PER_RUN);

    if (run.looked === 0) {
      return { ok: true, message: 'Every listing already has a description.' };
    }

    const parts = [`Looked at ${run.looked}`, `filled ${run.filled}`];
    if (run.nothingUseful > 0) {
      parts.push(`${run.nothingUseful} had nothing worth using on their homepage`);
    }
    if (run.failed > 0) {
      parts.push(`${run.failed} could not be reached${run.firstError ? ` (${run.firstError})` : ''}`);
    }

    revalidatePath('/admin/refresh');
    revalidatePath('/admin/websites');

    // Said plainly, because a run that fills 40 of 200 is a normal outcome
    // rather than a failure and should not read as one.
    return {
      ok: true,
      message: `${parts.join(', ')}. Run it again to continue through the rest.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not fill descriptions: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
