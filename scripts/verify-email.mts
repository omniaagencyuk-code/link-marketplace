/**
 * Prove what the emails say, and what they refuse to say.
 *
 * No network and no key: the templates are pure, so the wording, the links
 * and the escaping can all be checked by calling a function. This is the one
 * part of the product nobody can edit after it has gone out.
 */
import {
  approvalReminder,
  escapeHtml,
  issueRaised,
  issueResolved,
  placementDelivered,
  safeUrl,
  type BrandBits,
} from '../src/lib/email/templates';
import { dueForReminder } from '../src/lib/orders/delivery';
import { emailService } from '../src/lib/services/email-service';

let failed = 0;
const ok = (l: string) => console.log(`  PASS  ${l}`);
const bad = (l: string, d?: string) => {
  failed += 1;
  console.log(`  FAIL  ${l}${d ? ` - ${d}` : ''}`);
};
const is = (l: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(l) : bad(l, `expected ${String(expected)}, got ${String(actual)}`);
const has = (l: string, haystack: string, needle: string) =>
  haystack.includes(needle) ? ok(l) : bad(l, `missing ${needle}`);
const hasNot = (l: string, haystack: string, needle: string) =>
  !haystack.includes(needle) ? ok(l) : bad(l, `should not contain ${needle}`);

const brand: BrandBits = {
  brandName: 'Press Parrot',
  supportEmail: 'hello@pressparrot.com',
  siteUrl: 'https://pressparrot.com',
};

console.log('\n--- nothing from outside reaches the body unescaped ---');
{
  is('angle brackets go', escapeHtml('<script>'), '&lt;script&gt;');
  is('quotes go', escapeHtml(`"a" 'b'`), '&quot;a&quot; &#39;b&#39;');
  is('ampersands go first, not twice', escapeHtml('&lt;'), '&amp;lt;');

  is('an https link survives', safeUrl('https://a.example/x'), 'https://a.example/x');
  is('so does http', safeUrl('http://a.example/x'), 'http://a.example/x');
  // The oldest trick there is, and a live URL arrives here from a form.
  is('javascript: does not', safeUrl('javascript:alert(1)'), '');
  is('nor a data url', safeUrl('data:text/html,<script>'), '');
  is('nor a relative path', safeUrl('/dashboard'), '');
  is('and whitespace does not smuggle one in', safeUrl('  javascript:alert(1)  '), '');
}

console.log('\n--- the delivery email ---');
{
  const mail = placementDelivered(
    {
      domain: 'casinoguru.co.uk',
      liveUrl: 'https://casinoguru.co.uk/features/bonus',
      orderReference: 'LM-10482',
      orderId: 'ord_001',
      autoApproveAt: '2026-10-09T09:00:00.000Z',
    },
    brand,
  );

  has('the subject names the site', mail.subject, 'casinoguru.co.uk');
  has('the link is in the body', mail.html, 'https://casinoguru.co.uk/features/bonus');
  has('and in the plain text version too', mail.text, 'https://casinoguru.co.uk/features/bonus');
  has('the deadline is stated, not implied', mail.html, '9 Oct 2026');
  has('and the order is identified', mail.html, 'LM-10482');
  has('the button goes to their own order', mail.html, 'https://pressparrot.com/dashboard/orders/ord_001');

  // A placement delivered before the review window existed has no deadline,
  // and must not claim one.
  const noDeadline = placementDelivered(
    { domain: 'a.example', liveUrl: 'https://a.example/x', orderReference: 'R', orderId: 'o' },
    brand,
  );
  hasNot('with no deadline recorded it promises none', noDeadline.html, 'approves automatically');
  hasNot('nor in the text version', noDeadline.text, 'approves automatically');

  // A live URL is typed into an admin form. It reaches a customer's inbox.
  const hostile = placementDelivered(
    {
      domain: 'a.example',
      liveUrl: 'javascript:alert(1)',
      orderReference: 'R',
      orderId: 'o',
    },
    brand,
  );
  hasNot('a javascript: live URL is never made clickable', hostile.html, 'href="javascript:');
}

console.log('\n--- the complaint that comes to us ---');
{
  const mail = issueRaised(
    {
      domain: 'bettingedge.co.uk',
      customerName: 'Hannah Reeve',
      customerEmail: 'hannah@northbound.example',
      orderReference: 'LM-10482',
      orderId: 'ord_001',
      message: 'The link is nofollow <b>and</b> the anchor is wrong.',
    },
    brand,
  );

  has('the subject says which site and which order', mail.subject, 'bettingedge.co.uk');
  has('and which order', mail.subject, 'LM-10482');
  // Their words, whole. A complaint paraphrased into a summary loses the part
  // that says what to ask the publisher for.
  has('their words are kept', mail.html, 'The link is nofollow');
  hasNot('but their markup is not', mail.html, '<b>and</b>');
  has('escaped instead', mail.html, '&lt;b&gt;and&lt;/b&gt;');
  has('it links to the admin, not the dashboard', mail.html, '/admin/orders/ord_001');
  has('and gives us their address', mail.html, 'hannah@northbound.example');
}

console.log('\n--- the reminder ---');
{
  const three = approvalReminder(
    { domain: 'a.example', orderReference: 'R', orderId: 'o', daysLeft: 3, autoApproveAt: '2026-10-09T09:00:00.000Z' },
    brand,
  );
  has('three days out it names the date', three.html, '9 Oct 2026');

  const one = approvalReminder(
    { domain: 'a.example', orderReference: 'R', orderId: 'o', daysLeft: 1, autoApproveAt: '2026-10-09T09:00:00.000Z' },
    brand,
  );
  has('a day out it says tomorrow', one.html, 'tomorrow');

  const zero = approvalReminder(
    { domain: 'a.example', orderReference: 'R', orderId: 'o', daysLeft: 0, autoApproveAt: '2026-10-09T09:00:00.000Z' },
    brand,
  );
  has('on the day it says today', zero.html, 'today');

  // It must not read as an accusation. Nothing has gone wrong.
  has('and it reassures rather than alarms', three.html, 'Nothing is wrong');
}

console.log('\n--- the resolution ---');
{
  const mail = issueResolved(
    { domain: 'a.example', orderReference: 'R', orderId: 'o', note: 'Publisher made it dofollow.' },
    brand,
  );
  has('it repeats what we did', mail.html, 'Publisher made it dofollow.');
  has('and asks them to look again', mail.html, 'Have another look');

  const noNote = issueResolved(
    { domain: 'a.example', orderReference: 'R', orderId: 'o', note: '' },
    brand,
  );
  hasNot('an empty note leaves no empty quote box', noNote.html, '<blockquote');
}

console.log('\n--- who gets reminded ---');
{
  const now = new Date('2026-09-25T12:00:00Z');
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  const base = { deliveredAt: '2026-09-20T00:00:00Z', approval: 'pending' as const };

  const batch = [
    { ...base, autoApproveAt: at(2) },
    { ...base, autoApproveAt: at(10) },
    { ...base, autoApproveAt: at(2), reminderSentAt: at(-1) },
    { ...base, autoApproveAt: at(-1) },
    { ...base, autoApproveAt: at(2), approval: 'issue-raised' as const },
    { ...base, autoApproveAt: at(2), approval: 'approved' as const },
    { approval: 'pending' as const, autoApproveAt: at(2) },
  ];

  const due = dueForReminder(batch, 3, now);
  is('only the one inside the window, unwarned, gets a reminder', due.length, 1);
  is('and it is the right one', due[0]?.autoApproveAt, at(2));

  is('a wider window catches more', dueForReminder(batch, 14, now).length, 2);
  // Already past the deadline: the auto-approval job is about to settle it,
  // and "closes in -1 days" is not a warning.
  is(
    'nothing overdue is warned about',
    dueForReminder([{ ...base, autoApproveAt: at(-1) }], 3, now).length,
    0,
  );
  is('a zero window warns about nothing', dueForReminder(batch, 0, now).length, 0);
}

console.log('\n--- sending never breaks the work it describes ---');
{
  // No key configured, which is how this first deploys. Delivering a
  // placement must still succeed; the customer can log in and see it.
  delete process.env.RESEND_API_KEY;

  const result = await emailService.send({
    to: 'someone@example.com',
    template: 'placement-delivered',
    subject: 'x',
    html: '<p>x</p>',
    text: 'x',
  });

  is('an unconfigured send returns rather than throwing', result.sent, false);
  is(
    'and says why, in words an admin can act on',
    result.reason,
    'Email is not configured on this deployment.',
  );

  // An address that cannot receive anything is refused before a provider is
  // ever called: a malformed recipient is our bug, not theirs.
  const noAddress = await emailService.send({
    to: '',
    template: 'placement-delivered',
    subject: 'x',
    html: '<p>x</p>',
    text: 'x',
  });
  is('an empty address is refused', noAddress.sent, false);
  is('with its own reason', noAddress.reason, 'No usable address for this recipient.');
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
