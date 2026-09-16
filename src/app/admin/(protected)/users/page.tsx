import { PageTitle } from '@/components/dashboard/page-title';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { orderService, userService } from '@/lib/services';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { UserRoleButton } from '@/components/admin/user-role-button';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const [users, orders] = await Promise.all([userService.getAll(), orderService.getAll()]);

  return (
    <>
      <PageTitle
        title="Users"
        description="Customer accounts and internal staff. Admin access is granted per account."
      />

      <TableWrap>
        <Table>
          <caption className="sr-only">User accounts</caption>
          <thead>
            <tr>
              <Th>User</Th>
              <Th className="hidden sm:table-cell">Company</Th>
              <Th>Role</Th>
              <Th className="hidden md:table-cell">Plan</Th>
              <Th className="text-right">Orders</Th>
              <Th className="text-right">Spend</Th>
              <Th className="hidden lg:table-cell">Joined</Th>
              <Th className="text-right">Access</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const userOrders = orders.filter((order) => order.userId === user.id);
              const spend = userOrders
                .filter((order) => order.status !== 'cancelled' && order.status !== 'draft')
                .reduce((sum, order) => sum + order.totalMinor, 0);

              return (
                <Tr key={user.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        initials={user.avatarInitials}
                        tone={user.role === 'admin' ? 'accent' : 'navy'}
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink">{user.fullName}</p>
                        <p className="truncate text-[11px] text-muted">{user.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="hidden text-[13px] text-ink-soft sm:table-cell">
                    {user.company ?? '—'}
                  </Td>
                  <Td>
                    <Badge tone={user.role === 'admin' ? 'navy' : 'neutral'}>{user.role}</Badge>
                  </Td>
                  <Td className="hidden text-[13px] text-ink-soft capitalize md:table-cell">
                    {user.plan}
                  </Td>
                  <Td className="tabular text-right text-[13px] text-ink-soft">
                    {userOrders.length}
                  </Td>
                  <Td className="tabular text-right text-[13px] font-semibold text-ink">
                    {formatPrice(spend)}
                  </Td>
                  <Td className="tabular hidden text-[13px] whitespace-nowrap text-muted lg:table-cell">
                    {formatDate(user.createdAt)}
                  </Td>
                  <Td className="text-right">
                    <UserRoleButton email={user.email} isAdmin={user.role === 'admin'} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
