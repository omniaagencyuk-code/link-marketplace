import { escapeHtml } from '@/lib/email/templates';
import { brand } from '@/lib/config/brand';

/**
 * Turning a written draft into a sendable email.
 *
 * Pure: text in, HTML and text out. No network, no clock, no database - the
 * same rule `email/templates.ts` follows, and for the same reason: an email is
 * the one part of this product nobody can edit after it has gone.
 *
 * ## Deliberately plain
 *
 * A cold email that arrives looking like a newsletter is read as one. No
 * logo, no header image, no button, no tracking pixel, no table layout - just
 * paragraphs, a sign-off and the footer the law requires. It also means the
 * HTML and the plain text say the same thing, which spam filters notice.
 *
 * ## The footer is not optional
 *
 * An unsubscribe link and a postal identity are what make an unsolicited
 * commercial email lawful in the UK and the EU, and they are appended here
 * rather than left to the model - which would sometimes write them, sometimes
 * not, and occasionally write a link that goes nowhere.
 *
 * The link carries the prospect's random public token, never its row id. A
 * sequential id in a URL somebody receives is an invitation to try the next
 * one, and the next one is a different company's record.
 */

export interface RenderInput {
  bodyText: string;
  senderFirstName: string;
  senderEmail?: string;
  /** The prospect's random token. Never an internal id. */
  unsubscribeToken: string;
  siteUrl: string;
}

export interface RenderedEmail {
  text: string;
  html: string;
  unsubscribeUrl: string;
}

export function unsubscribeUrl(siteUrl: string, token: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  return `${base}/sales/unsubscribe/${encodeURIComponent(token)}`;
}

export function renderOutbound(input: RenderInput): RenderedEmail {
  const url = unsubscribeUrl(input.siteUrl, input.unsubscribeToken);

  /*
    The model is told not to write a signature, because it would write a
    different one each time. One line, their first name, and nothing else: a
    cold email with a six-line HTML signature is a cold email from a company,
    and this one is from a person.
  */
  const signed = `${input.bodyText.trim()}\n\n${input.senderFirstName}\n${brand.name}`;

  const text = [
    signed,
    '',
    '---',
    `If you would rather not hear from us, unsubscribe here: ${url}`,
    `${brand.name}${input.senderEmail ? `, ${input.senderEmail}` : ''}`,
  ].join('\n');

  const paragraphs = signed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`,
    )
    .join('\n');

  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1a1a1a;max-width:560px">',
    paragraphs,
    '<p style="margin:24px 0 0;font-size:12px;color:#777;line-height:1.5">',
    `If you would rather not hear from us, <a href="${escapeHtml(url)}" style="color:#777">unsubscribe</a>.<br>`,
    escapeHtml(brand.name),
    input.senderEmail ? `, ${escapeHtml(input.senderEmail)}` : '',
    '</p>',
    '</div>',
  ].join('\n');

  return { text, html, unsubscribeUrl: url };
}

/**
 * Pull a subject and a body out of what the model returned.
 *
 * It is asked for structured output, so this is the fallback rather than the
 * path - but a model that returns a body beginning "Subject: ..." has happened
 * to every prompt that ever asked for both, and leaving it would send an email
 * whose first line is the subject again.
 */
export function splitSubjectFromBody(body: string): { subject?: string; body: string } {
  const match = body.match(/^\s*subject:\s*(.+?)\n+/i);
  if (!match) return { body: body.trim() };

  return {
    subject: match[1]!.trim(),
    body: body.slice(match[0].length).trim(),
  };
}
