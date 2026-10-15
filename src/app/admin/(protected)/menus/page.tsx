import { PageTitle } from '@/components/dashboard/page-title';
import { MenusEditor } from '@/components/admin/menus-editor';
import { menuService } from '@/lib/services/menu-service';

export const dynamic = 'force-dynamic';

/**
 * The navigation menus.
 *
 * Three lists that were in `src/lib/config/navigation.ts` and needed a deploy
 * to change: what a visitor sees along the top, what replaces it once they
 * sign in, and the columns across the bottom of every page.
 *
 * A menu nobody has edited has no row, and renders from the code. So this
 * page opens showing the live site either way - the stored menu where there
 * is one, the shipped arrays where there is not - and `edited` is what the
 * difference between them is called.
 */
export default async function AdminMenusPage() {
  const menus = await menuService.list();

  return (
    <>
      <PageTitle
        title="Menus"
        description="The header menus and the site footer. Changes are live as soon as they are saved; Reset puts the menu in the code back."
      />

      <MenusEditor menus={menus} />
    </>
  );
}
