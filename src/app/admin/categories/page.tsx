import { PageTitle } from '@/components/dashboard/page-title';
import { Badge } from '@/components/ui/badge';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { categoryService, websiteService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function AdminCategoriesPage() {
  const [categories, counts] = await Promise.all([
    categoryService.getAll(),
    websiteService.countByNiche(),
  ]);

  return (
    <>
      <PageTitle
        title="Categories"
        description="Niches used across the marketplace. Featured categories appear in the pill row; the rest sit under More."
      />

      <TableWrap>
        <Table>
          <caption className="sr-only">Marketplace categories</caption>
          <thead>
            <tr>
              <Th className="w-12">#</Th>
              <Th>Name</Th>
              <Th className="hidden sm:table-cell">Slug</Th>
              <Th className="hidden lg:table-cell">Description</Th>
              <Th>Visibility</Th>
              <Th className="text-right">Websites</Th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <Tr key={category.id}>
                <Td className="tabular text-[13px] text-muted">{category.position}</Td>
                <Td className="text-[13px] font-medium text-ink">{category.name}</Td>
                <Td className="hidden font-mono text-[12px] text-muted sm:table-cell">
                  {category.slug}
                </Td>
                <Td className="hidden text-[13px] text-muted lg:table-cell">
                  {category.description}
                </Td>
                <Td>
                  <Badge tone={category.featured ? 'positive' : 'neutral'}>
                    {category.featured ? 'Featured' : 'In More menu'}
                  </Badge>
                </Td>
                <Td className="tabular text-right text-[13px] font-semibold text-ink">
                  {counts[category.slug] ?? 0}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
