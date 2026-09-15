import { AlertTriangle } from 'lucide-react';
import { dataSource } from '@/lib/services/data-source';

/**
 * The warning that matters most right now.
 *
 * While the app runs on the in-memory store, anything saved here is lost on
 * the next deploy. Saying so plainly at the top of every editing screen is the
 * difference between an editor writing ten blog posts and losing them, and an
 * editor knowing to wait.
 *
 * It disappears on its own once `NEXT_PUBLIC_DATA_SOURCE` is `supabase`.
 */
export function MockStorageNotice({ what }: { what: string }) {
  if (dataSource !== 'mock') return null;

  return (
    <div
      role="status"
      className="mb-5 flex gap-3 rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 p-4"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="text-[13px] leading-relaxed text-amber-900">
        <p className="font-semibold">{what} are not saved permanently yet.</p>
        <p className="mt-1">
          The site is still running on temporary storage, so anything you save here is lost the
          next time the site is deployed. Connect Supabase to make it permanent - see{' '}
          <span className="font-mono text-[12px]">supabase/README.md</span>.
        </p>
      </div>
    </div>
  );
}
