import { LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { signOutAdminAction } from '@/app/admin/login/actions';
import { initialsFromName } from '@/lib/utils/format';

/**
 * The signed-in admin, at the foot of the dark rail.
 *
 * The same thing `AdminAccountFooter` renders, in the treatment a navy
 * background needs. That one is left alone: it is what the old shell passes,
 * and this redesign does not get to break a component by moving house.
 *
 * Server-rendered, because the address comes from `requireAdminSession` rather
 * than from anything the browser holds.
 */
export function AdminAccount({ email }: { email: string }) {
  const name = email.split('@')[0] ?? email;

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
      <Avatar initials={initialsFromName(name.replace(/[._-]/g, ' '))} tone="accent" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white capitalize">{name}</p>
        <p className="truncate text-[11px] text-white/50">{email}</p>
      </div>
      <form action={signOutAdminAction}>
        <button
          type="submit"
          aria-label="Sign out"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
