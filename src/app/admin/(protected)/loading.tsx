import { SkeletonCards, SkeletonTable, SkeletonTitle } from '@/components/ui/skeleton';

/**
 * What every admin page shows while it is being built.
 *
 * One file for the whole protected group, because every page under it is
 * `force-dynamic` and several of them take seconds: the pricing report walks
 * the inventory, the publisher inbox counts three queues. Without this, Next
 * holds the *previous* page on screen for that whole time, which reads as a
 * click that did nothing - and people press it again.
 *
 * Generic on purpose. A per-page skeleton that matches each layout exactly is
 * sixteen more files to keep in step with sixteen layouts, and the thing that
 * matters is that the shell stays, the navigation stays usable, and the
 * content area says work is happening.
 */
export default function AdminLoading() {
  return (
    <div>
      <SkeletonTitle />
      <div className="space-y-4">
        <SkeletonCards />
        <SkeletonTable />
      </div>
    </div>
  );
}
