import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { saveContentPricingAction, saveSettingsAction } from '@/app/admin/actions';
import { settingsService } from '@/lib/services';
import { sortOptions, pageSizeOptions, linkTypeLabels } from '@/lib/utils/labels';
import { formatDateTime } from '@/lib/utils/format';
import { isPricingConfigured } from '@/lib/services/content-pricing';
import { brand } from '@/lib/config/brand';

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

      <section className="mt-6" aria-labelledby="content-pricing">
        <h2 id="content-pricing" className="mb-3 text-[15px] font-semibold text-ink">
          Content writing prices
        </h2>
        <form action={saveContentPricingAction}>
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {!isPricingConfigured(settings.contentPricing) ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 text-[13px] text-amber-800">
                  No content prices are set yet. Until one is, the public content page and the order
                  form show &ldquo;price on request&rdquo; rather than a figure.
                </p>
              ) : null}

              <div>
                <Label htmlFor="pricingMode">Pricing model</Label>
                <Select
                  id="pricingMode"
                  name="pricingMode"
                  defaultValue={settings.contentPricing.mode}
                  className="mt-1.5"
                >
                  <option value="tiered">Fixed price per length</option>
                  <option value="per-word">Price per word</option>
                </Select>
                <p className="mt-1.5 text-[12px] text-muted">
                  Fixed pricing charges the smallest tier that covers the requested length. Per-word
                  pricing is also used as the fallback for lengths above every tier.
                </p>
              </div>

              <div>
                <p className="text-[13px] font-medium text-ink-soft">
                  Fixed prices ({settings.currency})
                </p>
                <div className="mt-2 grid gap-4 sm:grid-cols-4">
                  {settings.contentPricing.tiers.map((tier) => (
                    <div key={tier.words}>
                      <Label htmlFor={`tier_${tier.words}`}>
                        {tier.words.toLocaleString(brand.locale)} words
                      </Label>
                      <Input
                        id={`tier_${tier.words}`}
                        name={`tier_${tier.words}`}
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={tier.priceMinor ? (tier.priceMinor / 100).toFixed(2) : ''}
                        placeholder="0.00"
                        className="mt-1.5"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="sm:max-w-xs">
                <Label htmlFor="perWord">Price per 1,000 words ({settings.currency})</Label>
                <Input
                  id="perWord"
                  name="perWord"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={
                    settings.contentPricing.perWordMinor
                      ? ((settings.contentPricing.perWordMinor * 1000) / 100).toFixed(2)
                      : ''
                  }
                  placeholder="0.00"
                  className="mt-1.5"
                />
                <p className="mt-1.5 text-[12px] text-muted">
                  Leave blank to price only by the fixed tiers above.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="accent">
                Save content pricing
              </Button>
            </CardFooter>
          </Card>
        </form>
      </section>

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
