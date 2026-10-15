import { Badge, type BadgeTone } from '@/components/ui/badge';
import { orderStatusLabels, websiteStatusLabels } from '@/lib/utils/labels';
import type { OrderStatus, PaymentStatus, WebsiteStatus } from '@/lib/types';

const orderTones: Record<OrderStatus, BadgeTone> = {
  draft: 'neutral',
  'awaiting-content': 'warning',
  'in-progress': 'info',
  submitted: 'info',
  live: 'positive',
  cancelled: 'negative',
};

const websiteTones: Record<WebsiteStatus, BadgeTone> = {
  draft: 'neutral',
  active: 'positive',
  paused: 'warning',
  archived: 'neutral',
};

/**
 * Where an order's money got to, in the customer's words.
 *
 * One copy of the rule, because three screens ask the same question and a
 * second copy is how they come to disagree - which is exactly what went
 * wrong here. `processing` was read as "Payment received" on the orders
 * table, and the enum that defines it says the opposite:
 *
 *     'processing'  -- Checkout opened; the customer may still abandon it.
 *
 * `attachCheckoutSession` writes it the instant the Stripe page opens, so
 * every abandoned checkout sat in the customer's order list claiming their
 * money had arrived. Nothing about the payment was wrong; the sentence was.
 *
 * Null for `unpaid`, which is the state of an order that has not reached
 * checkout at all - a basket, in other words, and a basket does not need
 * telling that it is unpaid.
 */
export function paymentWording(
  paymentStatus: PaymentStatus | undefined,
): { label: string; tone: BadgeTone; paid: boolean } | null {
  switch (paymentStatus) {
    case 'paid':
      return { label: 'Paid', tone: 'positive', paid: true };
    /*
      Started, not finished. Said plainly rather than softly: the customer
      who abandoned a checkout needs to know the order is not placed, and
      the one whose bank is still thinking needs the same words a minute
      before it clears.
    */
    case 'processing':
      return { label: 'Not paid yet', tone: 'warning', paid: false };
    case 'failed':
      return { label: 'Payment failed', tone: 'negative', paid: false };
    case 'refunded':
      return { label: 'Refunded', tone: 'neutral', paid: false };
    default:
      return null;
  }
}

/**
 * An order's status as the customer should read it.
 *
 * 'Draft' means "saved but not submitted", which is true of an order nobody
 * has paid for and alarming on one somebody just paid 1,200 dollars for. The
 * webhook that moves a paid order on arrives a second or two after the
 * customer gets back from Stripe, and for that moment the order is paid and
 * still sitting in draft. Reading the payment as well closes that gap -
 * **but only where the payment really did land.**
 */
export function OrderStatusBadge({
  status,
  paymentStatus,
}: {
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
}) {
  const settling = status === 'draft' && paymentStatus === 'paid';

  return (
    <Badge tone={settling ? 'info' : orderTones[status]}>
      <span
        className="h-1.5 w-1.5 rounded-full bg-current opacity-70"
        aria-hidden="true"
      />
      {settling ? 'Payment received' : orderStatusLabels[status]}
    </Badge>
  );
}

/**
 * Whether the money arrived, beside the status rather than inside it.
 *
 * Two questions, two answers: an order can be paid and waiting for an
 * article, or unpaid and going nowhere, and a single badge cannot say both.
 * Shown only where there is something to say - see `paymentWording`.
 */
export function PaymentBadge({
  paymentStatus,
  amount,
}: {
  paymentStatus?: PaymentStatus;
  /** What was actually charged, formatted. Only shown when it was paid. */
  amount?: string;
}) {
  const wording = paymentWording(paymentStatus);
  if (!wording) return null;

  return (
    <Badge tone={wording.tone}>
      {wording.paid && amount ? `${wording.label} ${amount}` : wording.label}
    </Badge>
  );
}

export function WebsiteStatusBadge({ status }: { status: WebsiteStatus }) {
  return <Badge tone={websiteTones[status]}>{websiteStatusLabels[status]}</Badge>;
}
