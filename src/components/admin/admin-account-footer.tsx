import { LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { signOutAdminAction } from '@/app/admin/login/actions';
import { initialsFromName } from '@/lib/utils/format';

/** Signed-in admin plus a sign-out control, shown at the foot of the sidebar. */
export function AdminAccountFooter({ email }: { email: string }) {
  const name = email.split('@')[0] ?? email;

  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
      <Avatar initials={initialsFromName(name.replace(/[._-]/g, ' '))} tone="accent" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink capitalize">{name}</p>
        <p className="truncate text-[11px] text-muted">{email}</p>
      </div>
      <form action={signOutAdminAction}>
        <button
          type="submit"
          aria-label="Sign out"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
