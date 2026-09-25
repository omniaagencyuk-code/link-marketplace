import { Resend } from 'resend';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { emailFrom, emailEnabled, resendApiKey } from '@/lib/email/config';
import type { EmailBody } from '@/lib/email/templates';

/**
 * Sending, and writing down what was sent.
 *
 * One rule above all others: this never throws into its caller. Delivering a
 * placement, resolving a complaint and approving an order are the real work;
 * the email is how somebody finds out about it. An outage at a mail provider
 * must not roll back a delivery, so every failure here is caught, recorded
 * and returned as a value.
 *
 * The log is not decoration. A placement approves itself after fourteen days,
 * so if an auto-approval is ever disputed the question is "did you tell me?"
 * and the answer has to be a row with a timestamp, including the rows where
 * the answer is no.
 */

export interface SendResult {
  sent: boolean;
  /** Why not, where it did not. Safe to show an admin; never a credential. */
  reason?: string;
}

export interface SendInput extends EmailBody {
  to: string;
  /** Which of our messages this is, e.g. 'placement-delivered'. */
  template: string;
  replyTo?: string;
  orderId?: string;
  orderItemId?: string;
  /**
   * Makes a retry safe at the provider.
   *
   * The reminder job runs daily and could be triggered by hand on the same
   * day; without this, two runs are two emails.
   */
  idempotencyKey?: string;
}

async function record(input: SendInput, providerId?: string, error?: string): Promise<void> {
  if (!isSupabaseEnabled()) return;

  try {
    await getAdminScopedClient()
      .from('email_log')
      .insert({
        template: input.template,
        to_address: input.to,
        subject: input.subject,
        order_id: input.orderId ?? null,
        order_item_id: input.orderItemId ?? null,
        provider_id: providerId ?? null,
        error: error ?? null,
      });
  } catch (logError) {
    // Failing to write the log must not fail the send it is describing.
    console.error('[email] could not write the log:', String(logError).slice(0, 200));
  }
}

export const emailService = {
  async send(input: SendInput): Promise<SendResult> {
    if (!input.to.includes('@')) {
      await record(input, undefined, 'No usable address');
      return { sent: false, reason: 'No usable address for this recipient.' };
    }

    if (!emailEnabled()) {
      // Recorded rather than dropped: "we never had a key" is a real answer
      // to "why did they not hear from us", and a better one than nothing.
      await record(input, undefined, 'RESEND_API_KEY is not set');
      console.log(`[email] not configured, would have sent "${input.template}" to ${input.to}`);
      return { sent: false, reason: 'Email is not configured on this deployment.' };
    }

    try {
      const resend = new Resend(resendApiKey());
      const { data, error } = await resend.emails.send(
        {
          from: emailFrom(),
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );

      if (error) {
        // The message, never the key. An error body from a provider is not a
        // place to be casual about what gets logged.
        const reason = `${error.name}: ${error.message}`.slice(0, 300);
        await record(input, undefined, reason);
        console.error(`[email] ${input.template} to ${input.to} failed - ${reason}`);
        return { sent: false, reason };
      }

      await record(input, data?.id);
      return { sent: true };
    } catch (thrown) {
      const reason = thrown instanceof Error ? thrown.message.slice(0, 300) : 'Unknown error';
      await record(input, undefined, reason);
      console.error(`[email] ${input.template} to ${input.to} threw - ${reason}`);
      return { sent: false, reason };
    }
  },

  /**
   * What we sent about one order, newest first.
   *
   * On the admin order page rather than only in the database, because the
   * question it answers - "did they get told?" - comes up while looking at
   * the order, and a question that needs a SQL console is one nobody asks.
   */
  async forOrder(orderId: string): Promise<
    { id: string; template: string; to: string; sentAt: string; error?: string }[]
  > {
    if (!isSupabaseEnabled()) return [];

    const { data } = await getAdminScopedClient()
      .from('email_log')
      .select('id, template, to_address, sent_at, error')
      .eq('order_id', orderId)
      .order('sent_at', { ascending: false })
      .limit(20);

    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      template: String(row.template),
      to: String(row.to_address),
      sentAt: String(row.sent_at),
      error: row.error ? String(row.error) : undefined,
    }));
  },

  /** Whether we already sent this exact message about this exact placement. */
  async alreadySent(orderItemId: string, template: string): Promise<boolean> {
    if (!isSupabaseEnabled()) return false;

    const { data } = await getAdminScopedClient()
      .from('email_log')
      .select('id')
      .eq('order_item_id', orderItemId)
      .eq('template', template)
      .is('error', null)
      .limit(1);

    return (data ?? []).length > 0;
  },
};
