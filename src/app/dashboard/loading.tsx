import { SkeletonCards, SkeletonTable, SkeletonTitle } from '@/components/ui/skeleton';

/**
 * The customer's equivalent, for the same reason.
 *
 * The dashboard reads the customer's figures, five orders and three posts;
 * orders and billing read their own. None of that is slow, but a slow
 * connection makes all of it slow, and the alternative is the previous page
 * sitting there looking like nothing happened.
 */
export default function DashboardLoading() {
  return (
    <div>
      <SkeletonTitle />
      <div className="space-y-4">
        <SkeletonCards />
        <SkeletonTable rows={5} />
      </div>
    </div>
  );
}
