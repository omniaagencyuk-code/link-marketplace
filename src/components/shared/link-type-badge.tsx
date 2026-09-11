import { Badge } from '@/components/ui/badge';
import { linkTypeLabels } from '@/lib/utils/labels';
import type { LinkTypeSlug } from '@/lib/types';

export function LinkTypeBadge({ type }: { type: LinkTypeSlug }) {
  return (
    <Badge tone={type === 'digital-pr' ? 'info' : type === 'niche-edit' ? 'neutral' : 'outline'}>
      {linkTypeLabels[type]}
    </Badge>
  );
}

/**
 * Compact list of the link types a website offers.
 *
 * `max` keeps dense table rows on a single line - the remainder is summarised
 * as a "+N" chip whose title lists the hidden types.
 */
export function LinkTypeList({
  types,
  max,
  nowrap = false,
}: {
  types: LinkTypeSlug[];
  max?: number;
  nowrap?: boolean;
}) {
  if (types.length === 0) {
    return <span className="text-[12px] text-muted">Unavailable</span>;
  }

  const visible = max ? types.slice(0, max) : types;
  const hidden = max ? types.slice(max) : [];

  return (
    <div className={`flex items-center gap-1 ${nowrap ? 'flex-nowrap' : 'flex-wrap'}`}>
      {visible.map((type) => (
        <LinkTypeBadge key={type} type={type} />
      ))}
      {hidden.length > 0 ? (
        <Badge
          tone="neutral"
          title={hidden.map((type) => linkTypeLabels[type]).join(', ')}
        >
          +{hidden.length}
        </Badge>
      ) : null}
    </div>
  );
}
