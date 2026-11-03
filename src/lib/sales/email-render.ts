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

/**
 * Sign-offs the renderer takes back off the end of a draft.
 *
 * Matched whole-line and case-insensitively, with any trailing comma. Short
 * and closed on purpose: anything longer than these is a sentence, and a
 * renderer that trims sentences off approved emails is worse than one that
 * occasionally leaves a "Warmest regards" in.
 */
const SIGN_OFFS = [
  'best',
  'best wishes',
  'best regards',
  'kind regards',
  'regards',
  'cheers',
  'thanks',
  'thank you',
  'many thanks',
  'all the best',
  'speak soon',
];

/**
 * Take the model's own sign-off back off, before adding ours.
 *
 * The prompt says not to write one. It said something subtler before - "sign
 * off with just the sender's first name, it will be appended" - which reads
 * as an instruction to write the name AND a note that the name is added, and
 * the model reasonably did both. Every email in the first batch ended:
 *
 *     Andy
 *
 *     Andy
 *     Press Parrot
 *
 * The prompt is fixed and versioned, which stops it happening again. This
 * stops it in the drafts already written, and in the next one the model
 * decides to be polite in - the rule is probabilistic and the email is not
 * recoverable once it has gone.
 *
 * Only whole trailing lines, only the sender's first name, our own name, or
 * one of a closed list of sign-offs. A line of anything else ends the
 * stripping, so the body a person approved is never cut into.
 */
export function stripSignOff(body: string, senderFirstName: string): string {
  const name = senderFirstName.trim().toLowerCase();
  const company = brand.name.trim().toLowerCase();
  const lines = body.trimEnd().split('\n');

  while (lines.length > 0) {
    const last = lines[lines.length - 1]!.trim();

    if (last === '') {
      lines.pop();
      continue;
    }

    const bare = last.replace(/[,.!]+$/, '').toLowerCase();
    // A first name alone is only a sign-off at the end of the email, which is
    // the only place this looks.
    const isName = name.length > 0 && bare === name;
    const isCompany = company.length > 0 && bare === company;

    if (isName || isCompany || SIGN_OFFS.includes(bare)) {
      lines.pop();
      continue;
    }

    break;
  }

  return lines.join('\n').trimEnd();
}

export function renderOutbound(input: RenderInput): RenderedEmail {
  const url = unsubscribeUrl(input.siteUrl, input.unsubscribeToken);

  /*
    The model is told not to write a signature, because it would write a
    different one each time. One line, their first name, and nothing else: a
    cold email with a six-line HTML signature is a cold email from a company,
    and this one is from a person.

    Whatever sign-off the model wrote anyway comes off first, or the name
    arrives twice.
  */
  const signed = `${stripSignOff(input.bodyText, input.senderFirstName)}\n\n${input.senderFirstName}\n${brand.name}`;

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
