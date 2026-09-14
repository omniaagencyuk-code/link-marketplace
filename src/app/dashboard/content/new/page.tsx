import type { Metadata } from 'next';
import Link from 'next/link';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { ContentOrderForm } from '@/components/content/content-order-form';
import { ContentBasket } from '@/components/content/content-basket';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { countryService, settingsService } from '@/lib/services';

export const metadata: Metadata = { title: 'Order content' };
export const dynamic = 'force-dynamic';

export default async function NewContentOrderPage() {
  await requireCustomerSession('/dashboard/content/new');
  const [settings, countries] = await Promise.all([settingsService.get(), countryService.getAll()]);

  return (
    <>
      <PageTitle
        title="Order content"
        description="Brief one article, add it to your order, then brief the next. Place the whole order when you are ready."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard/content">Your content</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          <ContentOrderForm pricing={settings.contentPricing} countries={countries} />
        </div>
        <aside aria-label="Your content order" className="lg:order-last">
          <div className="lg:sticky lg:top-6">
            <ContentBasket pricing={settings.contentPricing} />
          </div>
        </aside>
      </div>
    </>
  );
}
