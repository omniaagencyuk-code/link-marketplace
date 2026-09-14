import { Badge, type BadgeTone } from '@/components/ui/badge';
import { contentStatusLabels, contentStatusTone } from '@/lib/config/content';
import type { ContentOrderStatus } from '@/lib/types/content';

const tones: Record<'neutral' | 'info' | 'warning' | 'success', BadgeTone> = {
  neutral: 'neutral',
  info: 'info',
  warning: 'warning',
  success: 'positive',
};

export function ContentStatusBadge({ status }: { status: ContentOrderStatus }) {
  return (
    <Badge tone={tones[contentStatusTone(status)]}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {contentStatusLabels[status]}
    </Badge>
  );
}
