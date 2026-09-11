import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { saveSettingsAction } from '@/app/admin/actions';
import { settingsService } from '@/lib/services';
import { sortOptions, pageSizeOptions, linkTypeLabels } from '@/lib/utils/labels';
import { formatDateTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const settings = await settingsService.get();

  return (
    <>
      <PageTitle
        title="Settings"
        description="Brand, marketplace defaults and fulfilment statuses. Values here override the static brand config at runtime."
      />

      <form action={saveSettingsAction} className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Brand</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="brandName">Brand name</Label>
              <Input
                id="brandName"
                name="brandName"
                defaultValue={settings.brandName}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="supportEmail">Support email</Label>
              <Input
                id="supportEmail"
                name="supportEmail"
                type="email"
                defaultValue={settings.supportEmail}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="salesEmail">Sales email</Label>
              <Input
                id="salesEmail"
                name="salesEmail"
                type="email"
                defaultValue={settings.salesEmail}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="primaryColour">Primary colour</Label>
                <Input
                  id="primaryColour"
                  name="primaryColour"
                  defaultValue={settings.primaryColour}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="accentColour">Accent colour</Label>
                <Input
                  id="accentColour"
                  name="accentColour"
                  defaultValue={settings.accentColour}
                  className="mt-1.5"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Marketplace defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select
                id="currency"
                name="currency"
                defaultValue={settings.currency}
                className="mt-1.5"
              >
                <option value="GBP">GBP - Pound sterling</option>
                <option value="USD">USD - US dollar</option>
                <option value="EUR">EUR - Euro</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="defaultPageSize">Results per page</Label>
              <Select
                id="defaultPageSize"
                name="defaultPageSize"
                defaultValue={settings.defaultPageSize}
                className="mt-1.5"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="defaultSort">Default sort</Label>
              <Select
                id="defaultSort"
                name="defaultSort"
                defaultValue={settings.defaultSort}
                className="mt-1.5"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="marginPct">Marketplace margin (%)</Label>
              <Input
                id="marginPct"
                name="marginPct"
                type="number"
                min={0}
                max={80}
                defaultValue={settings.marginPct}
                className="mt-1.5"
              />
            </div>
            <div>
              <p className="text-[13px] font-medium text-ink-soft">Enabled link types</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {settings.enabledLinkTypes.map((type) => (
                  <Badge key={type} tone="accent">
                    {linkTypeLabels[type]}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <Button type="submit" variant="accent">
              Save settings
            </Button>
            <p className="text-[12px] text-muted">
              Last updated {formatDateTime(settings.updatedAt)}
            </p>
          </CardFooter>
        </Card>
      </form>

      <section className="mt-6" aria-labelledby="order-statuses">
        <h2 id="order-statuses" className="mb-3 text-[15px] font-semibold text-ink">
          Order statuses
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {settings.orderStatuses.map((status) => (
            <li
              key={status.value}
              className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]"
            >
              <p className="text-[13px] font-semibold text-ink">{status.label}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">{status.value}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{status.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
