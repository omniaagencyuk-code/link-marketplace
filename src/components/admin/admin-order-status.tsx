'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { setOrderStatusAction } from '@/app/admin/actions';
import { orderStatusLabels } from '@/lib/utils/labels';
import type { OrderStatus } from '@/lib/types';

const statusOptions = Object.entries(orderStatusLabels) as [OrderStatus, string][];

/** The status control, lifted out of the table so the detail page shares it. */
export function AdminOrderStatus({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <label htmlFor={`status-${orderId}`} className="text-[12px] font-medium text-ink-soft">
        Status
      </label>
      <div className="mt-1.5">
        <Select
          id={`status-${orderId}`}
          value={status}
          disabled={pending}
          onChange={(event) =>
            startTransition(async () => {
              await setOrderStatusAction(orderId, event.target.value as OrderStatus);
              router.refresh();
            })
          }
        >
          {statusOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
