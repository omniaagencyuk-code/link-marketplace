import { formatDate } from '@/lib/utils/format';

/**
 * What we say, and how it reads.
 *
 * Pure functions: data in, subject and body out. No network, no clock, no
 * database - so the wording, the links and the escaping can all be checked by
 * calling a function, which matters because an email is the one part of this
 * product nobody can edit after it has gone.
 *
 * Plain HTML on purpose. Email clients are twenty years behind browsers and a
 * layout that survives Outlook is a table-based layout, so these stay simple
 * enough not to need one: a heading, some text, one button, a footer.
 */

export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

/**
 * Escape anything that came from outside.
 *
 * Domains, anchor text and a customer's own description of a problem all end
 * up in these bodies. A publisher's domain is not hostile, but a customer's
 * complaint is text they typed, and it goes into our admin inbox as HTML.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A URL safe to put in an href.
 *
 * Only http and https survive. `javascript:` in an anchor is the oldest trick
 * there is, and a live URL arrives here from a form.
 */
export function safeUrl(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? escapeHtml(trimmed) : '';
}

function layout({
  heading,
  body,
  action,
  brandName,
  supportEmail,
}: {
  heading: string;
  body: string;
  action?: { label: string; url: string };
  brandName: string;
  supportEmail: string;
}): string {
  const safeAction = action ? safeUrl(action.url) : '';

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f5f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0b1b2b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e6e8eb;">
    <tr><td style="padding:28px;">
      <p style="margin:0 0 20px;font-size:14px;font-weight:600;">${escapeHtml(brandName)}</p>
      <h1 style="margin:0 0 12px;font-size:19px;line-height:1.35;">${heading}</h1>
      ${body}
      ${
        safeAction
          ? `<p style="margin:24px 0 0;"><a href="${safeAction}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(action!.label)}</a></p>`
          : ''
      }
    </td></tr>
  </table>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#6b7280;text-align:center;">
    ${escapeHtml(brandName)} &middot; <a href="mailto:${escapeHtml(supportEmail)}" style="color:#6b7280;">${escapeHtml(supportEmail)}</a>
  </p>
</body>
</html>`;
}

export interface BrandBits {
  brandName: string;
  supportEmail: string;
  siteUrl: string;
}

/** The placement is live and it is their turn to look at it. */
export function placementDelivered(
  {
    domain,
    liveUrl,
    orderReference,
    orderId,
    autoApproveAt,
  }: {
    domain: string;
    liveUrl: string;
    orderReference: string;
    orderId: string;
    autoApproveAt?: string;
  },
  brand: BrandBits,
): EmailBody {
  const url = safeUrl(liveUrl);
  const deadline = autoApproveAt
    ? `<p style="margin:0 0 4px;font-size:14px;line-height:1.55;">Have a look and approve it, or tell us if something is wrong. If we do not hear from you it approves automatically on ${escapeHtml(formatDate(autoApproveAt))}.</p>`
    : '';

  return {
    subject: `Your placement on ${domain} is live`,
    text:
      `Your placement on ${domain} is live.\n\n${liveUrl}\n\n` +
      `Order ${orderReference}. Have a look and approve it, or tell us if something is wrong.` +
      (autoApproveAt ? ` If we do not hear from you it approves automatically on ${formatDate(autoApproveAt)}.` : '') +
      `\n\n${brand.siteUrl}/dashboard/orders/${orderId}\n`,
    html: layout({
      heading: `Your placement on ${escapeHtml(domain)} is live`,
      body:
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">` +
        (url
          ? `<a href="${url}" style="color:#047857;word-break:break-all;">${escapeHtml(liveUrl)}</a>`
          : escapeHtml(liveUrl)) +
        `</p>${deadline}` +
        `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Order ${escapeHtml(orderReference)}</p>`,
      action: { label: 'Check it over', url: `${brand.siteUrl}/dashboard/orders/${orderId}` },
      ...brand,
    }),
  };
}

/** Somebody has told us a placement is wrong. This one goes to us. */
export function issueRaised(
  {
    domain,
    customerName,
    customerEmail,
    orderReference,
    orderId,
    message,
  }: {
    domain: string;
    customerName: string;
    customerEmail: string;
    orderReference: string;
    orderId: string;
    message: string;
  },
  brand: BrandBits,
): EmailBody {
  return {
    subject: `Problem reported on ${domain} (${orderReference})`,
    text:
      `${customerName || customerEmail} reported a problem with the placement on ${domain}.\n\n` +
      `"${message}"\n\nOrder ${orderReference}\n${brand.siteUrl}/admin/orders/${orderId}\n`,
    html: layout({
      heading: `Problem reported on ${escapeHtml(domain)}`,
      body:
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">${escapeHtml(customerName || customerEmail)} says:</p>` +
        // Their words, escaped and kept whole. Paraphrasing a complaint into a
        // summary loses the only part that says what to ask the publisher for.
        `<blockquote style="margin:0;padding:12px 14px;background:#f5f6f7;border-radius:8px;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(message)}</blockquote>` +
        `<p style="margin:14px 0 0;font-size:13px;color:#6b7280;">Order ${escapeHtml(orderReference)} &middot; ${escapeHtml(customerEmail)}</p>`,
      action: { label: 'Open the order', url: `${brand.siteUrl}/admin/orders/${orderId}` },
      ...brand,
    }),
  };
}

/** We fixed it. Go and look again. */
export function issueResolved(
  {
    domain,
    orderReference,
    orderId,
    note,
  }: { domain: string; orderReference: string; orderId: string; note: string },
  brand: BrandBits,
): EmailBody {
  return {
    subject: `Sorted: the placement on ${domain}`,
    text:
      `We have sorted the problem you reported on ${domain}.\n\n${note}\n\n` +
      `Order ${orderReference}\n${brand.siteUrl}/dashboard/orders/${orderId}\n`,
    html: layout({
      heading: `Sorted: the placement on ${escapeHtml(domain)}`,
      body:
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">We have sorted the problem you reported.</p>` +
        (note
          ? `<blockquote style="margin:0;padding:12px 14px;background:#f5f6f7;border-radius:8px;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(note)}</blockquote>`
          : '') +
        `<p style="margin:14px 0 0;font-size:14px;line-height:1.55;">Have another look and approve it if you are happy.</p>` +
        `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Order ${escapeHtml(orderReference)}</p>`,
      action: { label: 'Have another look', url: `${brand.siteUrl}/dashboard/orders/${orderId}` },
      ...brand,
    }),
  };
}

/**
 * The review window is nearly up.
 *
 * Worth sending for their sake and ours: an auto-approval a customer was
 * warned about is one we can stand behind, and one they were not is an
 * argument waiting to happen.
 */
export function approvalReminder(
  {
    domain,
    orderReference,
    orderId,
    daysLeft,
    autoApproveAt,
  }: {
    domain: string;
    orderReference: string;
    orderId: string;
    daysLeft: number;
    autoApproveAt: string;
  },
  brand: BrandBits,
): EmailBody {
  const when =
    daysLeft <= 0
      ? 'today'
      : daysLeft === 1
        ? 'tomorrow'
        : `in ${daysLeft} days, on ${formatDate(autoApproveAt)}`;

  return {
    subject: `Your placement on ${domain} approves ${daysLeft <= 1 ? when : `on ${formatDate(autoApproveAt)}`}`,
    text:
      `The placement on ${domain} approves automatically ${when} unless you tell us something is wrong.\n\n` +
      `Order ${orderReference}\n${brand.siteUrl}/dashboard/orders/${orderId}\n`,
    html: layout({
      heading: `Your placement on ${escapeHtml(domain)} approves ${escapeHtml(when)}`,
      body:
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">Nothing is wrong - this is just the end of your review window. If you are happy with it you need do nothing at all.</p>` +
        `<p style="margin:0;font-size:14px;line-height:1.55;">If something is not right, tell us before then and we will take it up with the publisher.</p>` +
        `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Order ${escapeHtml(orderReference)}</p>`,
      action: { label: 'Check it over', url: `${brand.siteUrl}/dashboard/orders/${orderId}` },
      ...brand,
    }),
  };
}

/**
 * A link we were paid to place is no longer doing its job.
 *
 * To the publisher, and deliberately narrow: what the article was, what we
 * found, and when we will look again. Not a word about money, balances or
 * what a claim costs - these are not accounts we hold, and a notice that
 * leads with a sum turns a fixable mistake into a dispute. Most of these are
 * a CMS migration or a plugin stripping a rel attribute, and the fastest
 * route to the link being back is an email somebody can act on in a minute.
 */
export function publisherLinkProblem(
  {
    domain,
    placedUrl,
    targetUrl,
    reason,
    deadline,
  }: {
    domain: string;
    placedUrl: string;
    targetUrl: string;
    reason: string;
    deadline: string;
  },
  brand: BrandBits,
): EmailBody {
  const article = safeUrl(placedUrl);
  const by = formatDate(deadline);

  return {
    subject: `A link on ${domain} needs a look`,
    text:
      `We check the placements we arrange, and this one is not reading as expected.\n\n` +
      `Article: ${placedUrl}\nLink to: ${targetUrl}\nWhat we found: ${reason}\n\n` +
      `Could you take a look by ${by}? We check again automatically, so there is nothing ` +
      `to reply to if you put it back - we will see it.\n\n` +
      `If the article was moved rather than removed, send us the new URL and we will ` +
      `follow it instead.\n\n${brand.supportEmail}\n`,
    html: layout({
      heading: `A link on ${escapeHtml(domain)} needs a look`,
      body:
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">We check the placements we arrange, and this one is not reading as expected.</p>` +
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;font-size:14px;line-height:1.6;">` +
        `<tr><td style="padding-right:12px;color:#6b7280;">Article</td><td>` +
        (article
          ? `<a href="${article}" style="color:#047857;word-break:break-all;">${escapeHtml(placedUrl)}</a>`
          : escapeHtml(placedUrl)) +
        `</td></tr>` +
        `<tr><td style="padding-right:12px;color:#6b7280;">Link to</td><td style="word-break:break-all;">${escapeHtml(targetUrl)}</td></tr>` +
        `<tr><td style="padding-right:12px;color:#6b7280;">We found</td><td>${escapeHtml(reason)}</td></tr>` +
        `</table>` +
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">Could you take a look by ${escapeHtml(by)}? We check again automatically, so there is nothing to reply to if you put it back - we will see it.</p>` +
        `<p style="margin:0;font-size:14px;line-height:1.55;">If the article was moved rather than removed, send us the new URL and we will follow it instead.</p>`,
      ...brand,
    }),
  };
}

/** Their link has gone, and we are already chasing it. */
export function buyerLinkLost(
  {
    domain,
    placedUrl,
    reason,
    orderReference,
    orderId,
    deadline,
  }: {
    domain: string;
    placedUrl: string;
    reason: string;
    orderReference: string;
    orderId: string;
    deadline: string;
  },
  brand: BrandBits,
): EmailBody {
  const by = formatDate(deadline);

  return {
    subject: `Your link on ${domain} has come down`,
    text:
      `Your link on ${domain} is no longer live.\n\n` +
      `${placedUrl}\nWhat we found: ${reason}\n\n` +
      `It is covered by the twelve month guarantee. We have asked the publisher to put it ` +
      `back and given them until ${by}. If it is not back by then you choose: a ` +
      `replacement placement on another site at no cost, or your money back.\n\n` +
      `Order ${orderReference}\n${brand.siteUrl}/dashboard/orders/${orderId}\n`,
    html: layout({
      heading: `Your link on ${escapeHtml(domain)} has come down`,
      body:
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">We check every placement we arrange, and this one is no longer live.</p>` +
        `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;word-break:break-all;">${escapeHtml(placedUrl)}<br>${escapeHtml(reason)}</p>` +
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">It is covered by the twelve month guarantee, so you are not out of pocket. We have asked the publisher to put it back and given them until ${escapeHtml(by)}.</p>` +
        `<p style="margin:0;font-size:14px;line-height:1.55;">If it is not back by then, you choose: a replacement placement on another site at no cost, or your money back. Nothing to do until then.</p>` +
        `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Order ${escapeHtml(orderReference)}</p>`,
      action: { label: 'See the placement', url: `${brand.siteUrl}/dashboard/orders/${orderId}` },
      ...brand,
    }),
  };
}

/** The publisher put it back. Worth saying, because we told them it was gone. */
export function buyerLinkRestored(
  {
    domain,
    placedUrl,
    orderReference,
    orderId,
  }: { domain: string; placedUrl: string; orderReference: string; orderId: string },
  brand: BrandBits,
): EmailBody {
  return {
    subject: `Your link on ${domain} is back`,
    text:
      `Good news - your link on ${domain} is live again.\n\n${placedUrl}\n\n` +
      `We will keep checking it for the rest of the guarantee.\n\n` +
      `Order ${orderReference}\n${brand.siteUrl}/dashboard/orders/${orderId}\n`,
    html: layout({
      heading: `Your link on ${escapeHtml(domain)} is back`,
      body:
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">The publisher has put it back. We checked and it is live again.</p>` +
        `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;word-break:break-all;">${escapeHtml(placedUrl)}</p>` +
        `<p style="margin:0;font-size:14px;line-height:1.55;">We will keep checking it for the rest of the guarantee. Nothing for you to do.</p>` +
        `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Order ${escapeHtml(orderReference)}</p>`,
      action: { label: 'See the placement', url: `${brand.siteUrl}/dashboard/orders/${orderId}` },
      ...brand,
    }),
  };
}

/**
 * The publisher's time is up and it is the buyer's call.
 *
 * This is the only email in the set that asks for a decision, so it says what
 * the two options are in the first line rather than making somebody open the
 * dashboard to find out what they are choosing between.
 */
export function buyerClaimChoice(
  {
    domain,
    orderReference,
    orderId,
  }: { domain: string; orderReference: string; orderId: string },
  brand: BrandBits,
): EmailBody {
  return {
    subject: `Your call on the link on ${domain}`,
    text:
      `The publisher has not put your link on ${domain} back, so it is your call: a ` +
      `replacement placement on another site at no cost, or your money back.\n\n` +
      `Order ${orderReference}\n${brand.siteUrl}/dashboard/orders/${orderId}\n`,
    html: layout({
      heading: `Your call on the link on ${escapeHtml(domain)}`,
      body:
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;">We gave the publisher time to put your link back and they have not. That is covered, and it is now your choice:</p>` +
        `<ul style="margin:0 0 12px;padding-left:20px;font-size:14px;line-height:1.6;">` +
        `<li>A replacement placement on another site, at no cost to you.</li>` +
        `<li>Your money back for this placement.</li>` +
        `</ul>` +
        `<p style="margin:0;font-size:14px;line-height:1.55;">Either is one click on the order page.</p>` +
        `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Order ${escapeHtml(orderReference)}</p>`,
      action: { label: 'Choose', url: `${brand.siteUrl}/dashboard/orders/${orderId}` },
      ...brand,
    }),
  };
}
