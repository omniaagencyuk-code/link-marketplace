/**
 * Prove the delivery review rules.
 *
 * No database and no clock: every rule takes `now` as an argument, so the
 * whole of "when may a customer complain, and when does silence become
 * consent" can be checked by calling a function. These are the rules of the
 * deal, and getting one wrong does not throw - it closes somebody's complaint
 * or keeps their order open for ever.
 */
import {
  autoApproveDate,
  canApprove,
  canReportIssue,
  daysUntilAutoApproval,
  deliveryState,
  dueForAutoApproval,
  orderIsComplete,
  type DeliverableItem,
} from '../src/lib/orders/delivery';

let failed = 0;
const ok = (l: string) => console.log(`  PASS  ${l}`);
const bad = (l: string, d?: string) => {
  failed += 1;
  console.log(`  FAIL  ${l}${d ? ` - ${d}` : ''}`);
};
const is = (l: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(l) : bad(l, `expected ${String(expected)}, got ${String(actual)}`);

const DAY = 86_400_000;
const now = new Date('2026-09-25T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
const ahead = (days: number) => new Date(now.getTime() + days * DAY).toISOString();

const item = (patch: Partial<DeliverableItem> = {}): DeliverableItem => ({
  approval: 'pending',
  ...patch,
});

console.log('\n--- what state a placement is in ---');
{
  is('undelivered work is not awaiting anything', deliveryState(item()), 'not-delivered');
  is(
    'delivered and unanswered is awaiting approval',
    deliveryState(item({ deliveredAt: ago(1) })),
    'awaiting-approval',
  );
  is(
    'approved is approved',
    deliveryState(item({ deliveredAt: ago(5), approval: 'approved' })),
    'approved',
  );
  is(
    'a complaint shows as one',
    deliveryState(item({ deliveredAt: ago(5), approval: 'issue-raised' })),
    'issue-raised',
  );

  // The trap: an item marked approved that was never delivered. Reading the
  // approval column alone would call that finished.
  is(
    'approval without delivery is still not delivered',
    deliveryState(item({ approval: 'approved' })),
    'not-delivered',
  );
}

console.log('\n--- who may approve what ---');
{
  is('nothing undelivered can be approved', canApprove(item()), false);
  is('a delivered placement can be', canApprove(item({ deliveredAt: ago(1) })), true);
  is(
    'and so can one with a complaint on it',
    canApprove(item({ deliveredAt: ago(1), approval: 'issue-raised' })),
    true,
  );
  is(
    'but approving twice does nothing',
    canApprove(item({ deliveredAt: ago(1), approval: 'approved' })),
    false,
  );
}

console.log('\n--- how long they may complain for ---');
{
  const waiting = item({ deliveredAt: ago(2) });
  is('an unanswered delivery is always open', canReportIssue(waiting, 30, now), true);

  const freshlyApproved = item({ deliveredAt: ago(10), approval: 'approved', approvedAt: ago(1) });
  is('a day after approving, still open', canReportIssue(freshlyApproved, 30, now), true);

  const approvedAgesAgo = item({ deliveredAt: ago(90), approval: 'approved', approvedAt: ago(31) });
  is('a month and a day later, closed', canReportIssue(approvedAgesAgo, 30, now), false);

  const onTheDay = item({ deliveredAt: ago(60), approval: 'approved', approvedAt: ago(30) });
  is('on the last day it is still open', canReportIssue(onTheDay, 30, now), true);

  is('nothing undelivered can be complained about', canReportIssue(item(), 30, now), false);

  // A zero window is a real setting: it means approval is final.
  is('a zero window closes it at approval', canReportIssue(freshlyApproved, 0, now), false);
}

console.log('\n--- silence becoming consent ---');
{
  const delivered = new Date('2026-09-01T09:00:00Z');
  is(
    'the deadline is the window after delivery',
    autoApproveDate(delivered, 14).toISOString(),
    '2026-09-15T09:00:00.000Z',
  );

  const waiting = item({ deliveredAt: ago(4), autoApproveAt: ahead(10) });
  is('ten days left reads as ten', daysUntilAutoApproval(waiting, now), 10);

  const overdue = item({ deliveredAt: ago(20), autoApproveAt: ago(6) });
  is('an overdue one reads as zero, never negative', daysUntilAutoApproval(overdue, now), 0);

  is(
    'an approved placement has no countdown',
    daysUntilAutoApproval(item({ deliveredAt: ago(20), approval: 'approved', autoApproveAt: ago(6) }), now),
    null,
  );
  // The one that matters commercially: a complaint stops the clock. Silence
  // is consent, but a customer who has told us something is wrong is not
  // silent, and must never be auto-approved out of their own dispute.
  is(
    'a complaint stops the clock',
    daysUntilAutoApproval(item({ deliveredAt: ago(20), approval: 'issue-raised', autoApproveAt: ago(6) }), now),
    null,
  );

  const batch = [
    item({ deliveredAt: ago(20), autoApproveAt: ago(1) }),
    item({ deliveredAt: ago(2), autoApproveAt: ahead(12) }),
    item({ deliveredAt: ago(20), approval: 'issue-raised', autoApproveAt: ago(1) }),
    item({ deliveredAt: ago(20), approval: 'approved', autoApproveAt: ago(1) }),
    item({ autoApproveAt: ago(1) }),
  ];
  is('only the overdue, unanswered one is swept up', dueForAutoApproval(batch, now).length, 1);
  is(
    'and it is the one with nothing said about it',
    dueForAutoApproval(batch, now)[0]?.autoApproveAt,
    ago(1),
  );

  // Exactly on the deadline counts. A job that runs at the wrong second
  // otherwise skips an item until tomorrow.
  is(
    'the deadline itself counts',
    dueForAutoApproval([item({ deliveredAt: ago(14), autoApproveAt: now.toISOString() })], now).length,
    1,
  );
}

console.log('\n--- when an order is finished ---');
{
  is('an empty order is not complete', orderIsComplete([]), false);
  is(
    'every line approved is',
    orderIsComplete([item({ approval: 'approved' }), item({ approval: 'approved' })]),
    true,
  );
  is(
    'one line still waiting is not',
    orderIsComplete([item({ approval: 'approved' }), item({ approval: 'pending' })]),
    false,
  );
  is(
    'and one complaint keeps the whole order open',
    orderIsComplete([item({ approval: 'approved' }), item({ approval: 'issue-raised' })]),
    false,
  );
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
