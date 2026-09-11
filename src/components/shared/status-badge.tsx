import { Badge, type BadgeTone } from '@/components/ui/badge';
import { orderStatusLabels, websiteStatusLabels } from '@/lib/utils/labels';
import type { OrderStatus, WebsiteStatus } from '@/lib/types';

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

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={orderTones[status]}>
      <span
        className="h-1.5 w-1.5 rounded-full bg-current opacity-70"
        aria-hidden="true"
      />
      {orderStatusLabels[status]}
    </Badge>
  );
}

export function WebsiteStatusBadge({ status }: { status: WebsiteStatus }) {
  return <Badge tone={websiteTones[status]}>{websiteStatusLabels[status]}</Badge>;
}
