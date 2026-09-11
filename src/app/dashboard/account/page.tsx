import type { Metadata } from 'next';
import { PageTitle } from '@/components/dashboard/page-title';
import { AccountForm } from '@/components/dashboard/account-form';
import { userService } from '@/lib/services';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const user = await userService.getCurrent();
  return (
    <>
      <PageTitle
        title="Account"
        description="Your profile and notification preferences. Changes are local until the database is connected."
      />
      <AccountForm user={user} />
    </>
  );
}
