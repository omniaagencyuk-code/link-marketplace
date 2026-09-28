import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { isGmailConfigured, serviceAccountClientId, serviceAccountEmail } from '@/lib/gmail/config';
import { GmailError, getThread, inParallel, listThreads } from '@/lib/gmail/client';
import { readThread } from '@/lib/gmail/thread';
import { planQueue, type SeenThread } from '@/lib/gmail/queueing';
import { sourcingService } from './sourcing-service';

/**
 * Importing publisher replies straight from Gmail.
 *
 * The second way into the same pipeline. A thread read here becomes a row in
 * `inbound_emails` with status 'new' - exactly what an uploaded mbox message
 * becomes - and everything after that point is the existing machinery:
 * extraction claims it, the model reads it, a draft appears, a human
 * approves it. Nothing here writes a listing and nothing here skips review.
 *
 * Two rules hold this together, and both are enforced server side because
 * the failure modes are not recoverable:
 *
 *   The allowlist decides which mailboxes exist. A service account with
 *   domain-wide delegation can open anybody's mail in the workspace, so an
 *   address that arrives in a request is checked against the database before
 *   a token is ever minted for it. There is no path here that impersonates an
 *   address a caller supplied.
 *
 *   A thread already imported is not imported again. It is checked three
 *   ways - the thread's own row, the thread's Message-IDs against emails
 *   already stored, and the historyId - because the same mail can arrive from
 *   a Takeout upload and from here, and paying twice to read it is the
 *   expensive mistake rather than the embarrassing one.
 *
 * Runs as the service role, like the rest of the admin. Every caller is
 * behind requireAdminSession().
 */

/** How many threads one invocation fetches. Small enough to finish. */
export const FETCH_CHUNK = 20;

/** Parallel Gmail requests per chunk. */
const CONCURRENCY = 5;

/** A thread that has failed this many times is left alone. */
const MAX_ATTEMPTS = 3;

/** How long a chunk may hold a job before the cron may take it over. */
const LEASE_SECONDS = 120;

export interface Mailbox {
  address: string;
  label: string | null;
  enabled: boolean;
}

export interface ImportJob {
  id: string;
  mailboxes: string[];
  query: string;
  labelFilter: string | null;
  maxThreads: number;
  status: 'listing' | 'fetching' | 'done' | 'failed' | 'cancelled';
  statusReason: string | null;
  threadsFound: number;
  threadsFetched: number;
  threadsSkipped: number;
  threadsFailed: number;
  emailsCreated: number;
  startedBy: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface PreviewRow {
  mailbox: string;
  matching: number;
  alreadyImported: number;
  newThreads: number;
  error?: string;
}

/**
 * The presets the query box offers.
 *
 * Editable in the admin, so these are only what an empty box starts from.
 * The first is the one the brief asked for and the one to use for a backlog.
 */
export const QUERY_PRESETS = [
  {
    label: 'Publisher replies, last year',
    query: '-from:me newer_than:1y (price OR rates OR "guest post" OR "sponsored")',
  },
  { label: 'Anything with a reply, last 6 months', query: '-from:me newer_than:6m' },
  { label: 'Rate cards', query: '-from:me has:attachment (rate OR price OR list)' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toJob(row: any): ImportJob {
  return {
    id: String(row.id),
    mailboxes: (row.mailboxes ?? []) as string[],
    query: String(row.query ?? ''),
    labelFilter: row.label_filter ?? null,
    maxThreads: Number(row.max_threads ?? 0),
    status: row.status,
    statusReason: row.status_reason ?? null,
    threadsFound: Number(row.threads_found ?? 0),
    threadsFetched: Number(row.threads_fetched ?? 0),
    threadsSkipped: Number(row.threads_skipped ?? 0),
    threadsFailed: Number(row.threads_failed ?? 0),
    emailsCreated: Number(row.emails_created ?? 0),
    startedBy: row.started_by ?? null,
    createdAt: String(row.created_at),
    finishedAt: row.finished_at ?? null,
  };
}

export const gmailImportService = {
  configured(): { configured: boolean; serviceAccount: string | null; clientId: string | null } {
    return {
      configured: isGmailConfigured(),
      serviceAccount: serviceAccountEmail(),
      clientId: serviceAccountClientId(),
    };
  },

  // ------------------------------------------------------------- allowlist

  async mailboxes(): Promise<Mailbox[]> {
    if (!isSupabaseEnabled()) return [];
    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('gmail_mailboxes')
      .select('address, label, enabled')
      .order('address');
    return ((data ?? []) as Mailbox[]).map((row) => ({
      address: row.address,
      label: row.label ?? null,
      enabled: Boolean(row.enabled),
    }));
  },

  async addMailbox(address: string, label: string | undefined, by?: string): Promise<{ ok: boolean; error?: string }> {
    const normalised = address.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) {
      return { ok: false, error: 'That does not look like an email address.' };
    }

    const supabase = getAdminScopedClient();
    const { error } = await supabase
      .from('gmail_mailboxes')
      .upsert(
        { address: normalised, label: label?.trim() || null, enabled: true, added_by: by ?? null },
        { onConflict: 'address' },
      );
    if (error) return { ok: false, error: 'That mailbox could not be saved.' };
    return { ok: true };
  },

  async removeMailbox(address: string): Promise<void> {
    const supabase = getAdminScopedClient();
    await supabase.from('gmail_mailboxes').delete().eq('address', address.trim().toLowerCase());
  },

  async setMailboxEnabled(address: string, enabled: boolean): Promise<void> {
    const supabase = getAdminScopedClient();
    await supabase
      .from('gmail_mailboxes')
      .update({ enabled })
      .eq('address', address.trim().toLowerCase());
  },

  /**
   * The gate.
   *
   * Every address that reaches the Gmail client passes through here first.
   * It returns only addresses that are in the table AND enabled, so a
   * mailbox switched off stops being readable without anybody having to
   * remember to remove it from a saved query.
   */
  async allowed(requested: string[]): Promise<string[]> {
    if (requested.length === 0) return [];
    const wanted = new Set(requested.map((address) => address.trim().toLowerCase()));

    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('gmail_mailboxes')
      .select('address')
      .eq('enabled', true)
      .in('address', [...wanted]);

    return ((data ?? []) as { address: string }[]).map((row) => row.address);
  },

  // --------------------------------------------------------------- preview

  /**
   * What a query would pull, without pulling it.
   *
   * Only the list endpoint is called, which returns IDs. No bodies are
   * fetched, nothing is stored, and nothing is sent to the model - so this
   * is the safe way to find out whether a query is any good.
   */
  async preview(options: {
    mailboxes: string[];
    query: string;
    labelIds?: string[];
    cap: number;
  }): Promise<PreviewRow[]> {
    const allowed = await gmailImportService.allowed(options.mailboxes);
    const supabase = getAdminScopedClient();

    return Promise.all(
      allowed.map(async (mailbox): Promise<PreviewRow> => {
        try {
          const refs = await listThreads(mailbox, options.query, options.cap, options.labelIds);
          if (refs.length === 0) {
            return { mailbox, matching: 0, alreadyImported: 0, newThreads: 0 };
          }

          const { data: seen } = await supabase
            .from('gmail_import_items')
            .select('gmail_thread_id, history_id, status')
            .eq('mailbox', mailbox)
            .in('gmail_thread_id', refs.map((ref) => ref.id));

          const known = new Map(
            ((seen ?? []) as { gmail_thread_id: string; history_id: string | null; status: string }[])
              .filter((row) => row.status === 'fetched' || row.status === 'skipped')
              .map((row) => [row.gmail_thread_id, row.history_id]),
          );

          // A thread whose historyId has moved has new replies, so it counts
          // as work to do rather than as already done.
          const fresh = refs.filter((ref) => {
            if (!known.has(ref.id)) return true;
            const previous = known.get(ref.id);
            return Boolean(ref.historyId && previous && ref.historyId !== previous);
          });

          return {
            mailbox,
            matching: refs.length,
            alreadyImported: refs.length - fresh.length,
            newThreads: fresh.length,
          };
        } catch (error) {
          return {
            mailbox,
            matching: 0,
            alreadyImported: 0,
            newThreads: 0,
            error: error instanceof GmailError ? error.message : 'That mailbox could not be read.',
          };
        }
      }),
    );
  },

  // ------------------------------------------------------------- the job

  /**
   * Phase one: find the threads and write them down as work to do.
   *
   * Listing is fast and fetching is not, so they are separate phases against
   * separate rows. A job that dies during phase two resumes from its pending
   * items rather than asking Gmail the same question again.
   */
  async createJob(options: {
    mailboxes: string[];
    query: string;
    labelFilter?: string;
    maxThreads: number;
    startedBy?: string;
  }): Promise<{ ok: boolean; jobId?: string; message: string }> {
    if (!isGmailConfigured()) {
      return { ok: false, message: 'GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not set on this deployment.' };
    }

    const allowed = await gmailImportService.allowed(options.mailboxes);
    if (allowed.length === 0) {
      return { ok: false, message: 'Pick at least one allowlisted mailbox.' };
    }

    const cap = Math.max(1, Math.min(2000, Math.round(options.maxThreads)));
    const supabase = getAdminScopedClient();

    const { data: created, error } = await supabase
      .from('gmail_import_jobs')
      .insert({
        mailboxes: allowed,
        query: options.query.trim(),
        label_filter: options.labelFilter?.trim() || null,
        max_threads: cap,
        status: 'listing',
        started_by: options.startedBy ?? null,
      })
      .select('id')
      .single();

    if (error || !created) return { ok: false, message: 'The import job could not be created.' };
    const jobId = String((created as { id: string }).id);

    const labelIds = options.labelFilter?.trim() ? [options.labelFilter.trim()] : undefined;
    let found = 0;
    const problems: string[] = [];

    // The cap is the whole job, not each mailbox: "no more than 200 threads"
    // has to mean that however many mailboxes are ticked.
    for (const mailbox of allowed) {
      const remaining = cap - found;
      if (remaining <= 0) break;

      try {
        const refs = await listThreads(mailbox, options.query, remaining, labelIds);
        if (refs.length === 0) continue;

        // Threads this mailbox has seen before, and what state they were in.
        const { data: seenRows } = await supabase
          .from('gmail_import_items')
          .select('id, gmail_thread_id, history_id, status')
          .eq('mailbox', mailbox)
          .in('gmail_thread_id', refs.map((ref) => ref.id));

        const plan = planQueue(refs, (seenRows ?? []) as SeenThread[]);

        // New to us: inserted. The unique key on (mailbox, thread) is what
        // stops a second run importing the same thread again, so a duplicate
        // is ignored rather than being an error.
        if (plan.insert.length > 0) {
          const { data: claimed } = await supabase
            .from('gmail_import_items')
            .upsert(
              plan.insert.map((ref) => ({
                job_id: jobId,
                mailbox,
                gmail_thread_id: ref.id,
                history_id: ref.historyId ?? null,
                status: 'pending',
              })),
              { onConflict: 'mailbox,gmail_thread_id', ignoreDuplicates: true },
            )
            .select('id');
          found += (claimed ?? []).length;
        }

        // Seen before, but it has moved since: a publisher answered our
        // follow-up. Put it back to pending against this job.
        if (plan.requeue.length > 0) {
          const { data: requeued } = await supabase
            .from('gmail_import_items')
            .update({
              job_id: jobId,
              status: 'pending',
              status_reason: 'New replies since this thread was imported.',
              attempts: 0,
              // history_id is deliberately left as it was. It moves forward
              // only when the fetch succeeds, so a thread that fails to
              // download is still recognised as changed on the next run
              // rather than quietly settling as up to date.
            })
            .in('id', plan.requeue)
            .select('id');
          found += (requeued ?? []).length;
        }
      } catch (error) {
        problems.push(error instanceof GmailError ? error.message : 'A mailbox could not be listed.');
      }
    }

    if (found === 0) {
      await supabase
        .from('gmail_import_jobs')
        .update({
          status: problems.length > 0 ? 'failed' : 'done',
          status_reason:
            problems[0] ?? 'Nothing new matched that search. Every matching thread is already imported.',
          finished_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      return {
        ok: problems.length === 0,
        jobId,
        message: problems[0] ?? 'Nothing new matched that search.',
      };
    }

    await supabase
      .from('gmail_import_jobs')
      .update({
        status: 'fetching',
        threads_found: found,
        status_reason: problems[0] ?? null,
      })
      .eq('id', jobId);

    return {
      ok: true,
      jobId,
      message: `${found} ${found === 1 ? 'thread' : 'threads'} to fetch.`,
    };
  },

  /**
   * Phase two, one chunk at a time.
   *
   * Called repeatedly - by the page while it is open, by the cron when it is
   * not. Each call takes a lease on the job so two callers cannot work the
   * same threads, fetches a chunk, and returns what is left. Safe to call on
   * a finished job: it says so and does nothing.
   */
  async processChunk(jobId: string): Promise<{
    ok: boolean;
    done: boolean;
    message: string;
    job?: ImportJob;
  }> {
    const supabase = getAdminScopedClient();

    const { data: jobRow } = await supabase
      .from('gmail_import_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (!jobRow) return { ok: false, done: true, message: 'That import job no longer exists.' };
    const job = toJob(jobRow);

    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
      return { ok: true, done: true, message: `This job is already ${job.status}.`, job };
    }

    // The lease. `is null or <= now` means an abandoned chunk frees the job
    // without anybody having to notice it was abandoned.
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();
    const { data: leased } = await supabase
      .from('gmail_import_jobs')
      .update({ leased_until: leaseUntil })
      .eq('id', jobId)
      .or(`leased_until.is.null,leased_until.lte.${now.toISOString()}`)
      .select('id');

    if ((leased ?? []).length === 0) {
      return { ok: true, done: false, message: 'Another chunk is already running.', job };
    }

    const { data: pending } = await supabase
      .from('gmail_import_items')
      .select('id, mailbox, gmail_thread_id, history_id, attempts')
      .eq('job_id', jobId)
      .eq('status', 'pending')
      .lt('attempts', MAX_ATTEMPTS)
      .limit(FETCH_CHUNK);

    const items = (pending ?? []) as {
      id: string;
      mailbox: string;
      gmail_thread_id: string;
      history_id: string | null;
      attempts: number;
    }[];

    if (items.length === 0) {
      return gmailImportService.finish(jobId);
    }

    // Every allowlisted address counts as ours, not just the one being read.
    // A thread pulled from contact@ that also carries a message from info@ is
    // two of our own addresses talking to a publisher, and reading the second
    // as the publisher would turn our own words into their terms.
    const ourAddresses = (await gmailImportService.mailboxes()).map((box) => box.address);

    let fetched = 0;
    let skipped = 0;
    let failed = 0;
    let created = 0;

    // Grouped by mailbox so the concurrency limit is per mailbox, which is
    // where Gmail's own limit is.
    const byMailbox = new Map<string, typeof items>();
    for (const item of items) {
      const group = byMailbox.get(item.mailbox) ?? [];
      group.push(item);
      byMailbox.set(item.mailbox, group);
    }

    for (const [mailbox, group] of byMailbox) {
      const outcomes = await inParallel(group, CONCURRENCY, async (item) => {
        try {
          const raw = await getThread(mailbox, item.gmail_thread_id);
          return { item, raw, error: null as GmailError | null };
        } catch (error) {
          return {
            item,
            raw: null,
            error: error instanceof GmailError ? error : new GmailError('That thread could not be read.', 0, false),
          };
        }
      });

      for (const outcome of outcomes) {
        const { item, raw, error } = outcome;

        if (error || !raw) {
          const attempts = item.attempts + 1;
          const exhausted = attempts >= MAX_ATTEMPTS || !error?.retryable;
          await supabase
            .from('gmail_import_items')
            .update({
              attempts,
              status: exhausted ? 'failed' : 'pending',
              status_reason: error?.message ?? 'Unknown error',
            })
            .eq('id', item.id);
          if (exhausted) failed += 1;
          continue;
        }

        const read = readThread(raw, mailbox, ourAddresses);

        if ('skip' in read) {
          await supabase
            .from('gmail_import_items')
            .update({
              status: 'skipped',
              status_reason:
                read.skip === 'no-reply'
                  ? 'Our outreach only - the publisher never replied.'
                  : 'Nothing readable in the thread.',
              history_id: raw.historyId ? String(raw.historyId) : item.history_id,
            })
            .eq('id', item.id);
          skipped += 1;
          continue;
        }

        const stored = await sourcingService.storeThread(read.thread, mailbox);

        await supabase
          .from('gmail_import_items')
          .update({
            status: stored.stored === 'duplicate' ? 'skipped' : 'fetched',
            status_reason:
              stored.stored === 'duplicate' ? 'Already imported, from this mailbox or an upload.' : null,
            history_id: read.thread.historyId ?? item.history_id,
            email_id: stored.emailId ?? null,
          })
          .eq('id', item.id);

        if (stored.stored === 'duplicate') skipped += 1;
        else {
          fetched += 1;
          if (stored.stored === 'created') created += 1;
        }
      }
    }

    await supabase
      .from('gmail_import_jobs')
      .update({
        threads_fetched: job.threadsFetched + fetched,
        threads_skipped: job.threadsSkipped + skipped,
        threads_failed: job.threadsFailed + failed,
        emails_created: job.emailsCreated + created,
        leased_until: null,
      })
      .eq('id', jobId);

    const { count: left } = await supabase
      .from('gmail_import_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .eq('status', 'pending')
      .lt('attempts', MAX_ATTEMPTS);

    if ((left ?? 0) === 0) return gmailImportService.finish(jobId);

    const { data: updated } = await supabase
      .from('gmail_import_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    return {
      ok: true,
      done: false,
      message: `${left} left to fetch.`,
      job: updated ? toJob(updated) : job,
    };
  },

  /** Close a job whose items are all accounted for. */
  async finish(jobId: string): Promise<{ ok: boolean; done: true; message: string; job?: ImportJob }> {
    const supabase = getAdminScopedClient();

    const { count: stuck } = await supabase
      .from('gmail_import_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .eq('status', 'pending');

    // Pending but out of attempts: recorded as failed rather than left to
    // look like work that never happened.
    if ((stuck ?? 0) > 0) {
      await supabase
        .from('gmail_import_items')
        .update({ status: 'failed' })
        .eq('job_id', jobId)
        .eq('status', 'pending');
    }

    const { data: updated } = await supabase
      .from('gmail_import_jobs')
      .update({ status: 'done', leased_until: null, finished_at: new Date().toISOString() })
      .eq('id', jobId)
      .select('*')
      .maybeSingle();

    const job = updated ? toJob(updated) : undefined;
    return {
      ok: true,
      done: true,
      message: job
        ? `Done. ${job.emailsCreated} ${job.emailsCreated === 1 ? 'email' : 'emails'} ready to read.`
        : 'Done.',
      job,
    };
  },

  async cancelJob(jobId: string): Promise<void> {
    const supabase = getAdminScopedClient();
    await supabase
      .from('gmail_import_jobs')
      .update({
        status: 'cancelled',
        leased_until: null,
        finished_at: new Date().toISOString(),
        status_reason: 'Cancelled by an admin.',
      })
      .eq('id', jobId)
      .in('status', ['listing', 'fetching']);
  },

  async getJob(jobId: string): Promise<ImportJob | null> {
    const supabase = getAdminScopedClient();
    const { data } = await supabase.from('gmail_import_jobs').select('*').eq('id', jobId).maybeSingle();
    return data ? toJob(data) : null;
  },

  async recentJobs(limit = 10): Promise<ImportJob[]> {
    if (!isSupabaseEnabled()) return [];
    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('gmail_import_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map(toJob);
  },

  /**
   * Jobs the cron should push along.
   *
   * A job is stalled when it is still fetching and nothing holds its lease -
   * which is what an admin closing the tab looks like from here.
   */
  async stalledJobs(limit = 3): Promise<string[]> {
    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('gmail_import_jobs')
      .select('id')
      .eq('status', 'fetching')
      .or(`leased_until.is.null,leased_until.lte.${new Date().toISOString()}`)
      .order('created_at', { ascending: true })
      .limit(limit);
    return ((data ?? []) as { id: string }[]).map((row) => row.id);
  },

  /** A run of chunks, for the cron. Bounded so the invocation ends. */
  async drain(jobId: string, chunks: number): Promise<{ chunks: number; done: boolean }> {
    for (let index = 0; index < chunks; index += 1) {
      const result = await gmailImportService.processChunk(jobId);
      if (result.done) return { chunks: index + 1, done: true };
    }
    return { chunks, done: false };
  },
};
