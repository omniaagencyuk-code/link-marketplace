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
 * An order's status as the customer should read it.
 *
 * 'Draft' means "saved but not submitted", which is true of an order nobody
 * has paid for and alarming on one somebody just paid 1,200 pounds for. The
 * webhook that moves a paid order on arrives a second or two after the
 * customer gets back from Stripe, and for that moment the order is paid and
 * still sitting in draft. Reading the payment as well closes the gap.
 */
export function OrderStatusBadge({
  status,
  paymentStatus,
}: {
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
}) {
  const settling =
    status === 'draft' && (paymentStatus === 'paid' || paymentStatus === 'processing');

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

export function WebsiteStatusBadge({ status }: { status: WebsiteStatus }) {
  return <Badge tone={websiteTones[status]}>{websiteStatusLabels[status]}</Badge>;
}
