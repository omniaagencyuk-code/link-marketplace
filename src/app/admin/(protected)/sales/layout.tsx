import { SalesTabs } from '@/components/admin/sales-tabs';

/**
 * Long enough to write a batch of emails.
 *
 * Every other admin screen that spends time on a model or a crawl sets this
 * - /refresh, /sourcing, /pricing, /majestic, /categorise - and the Sales
 * Centre was simply missed, so its actions ran on the platform default.
 * Drafting is a model call per email, so a batch is minutes: without this
 * the request is killed part-way, the browser reports "Failed to fetch",
 * and the drafts that were written are invisible until somebody reloads.
 *
 * `salesCampaignService.run` stops itself inside this, so the ceiling is
 * the backstop rather than the mechanism.
 */
export const maxDuration = 300;

/**
 * The Sales Centre's own navigation.
 *
 * Six screens behind one sidebar entry. They are tabs rather than six sidebar
 * rows because the admin sidebar already carries fifteen and this is one area
 * of the product, not six - and because the order here is the order of the
 * work: find them, read what came back, approve what goes out.
 */
export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SalesTabs />
      {children}
    </>
  );
}
