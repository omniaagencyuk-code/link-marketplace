import { AlertTriangle } from 'lucide-react';
import {
  DEMO_DATA_MESSAGE,
  announceDemoDataOnce,
  isServingDemoDataLive,
} from '@/lib/config/deployment';

/**
 * The band that says this is not the real inventory.
 *
 * Drawn on the live domain whenever the app has fallen back to the mock
 * store, and nowhere else - a clone, a preview deploy and `next start` on a
 * laptop are all meant to run on demo data and do not need telling.
 *
 * ## Why it is a band and not a toast
 *
 * It cannot be dismissed, it is above the header rather than floating over
 * it, and it pushes the page down. Every one of those is deliberate: the
 * thing being reported is that the prices on this page are not real prices,
 * and anything a visitor can click away is something somebody will.
 *
 * It reads no cookies and no request, so the root layout stays prerenderable
 * - see the note above `RootLayout`. What it reads is the environment, which
 * is fixed for the life of the deployment.
 */
export function DemoDataBanner() {
  announceDemoDataOnce();
  if (!isServingDemoDataLive()) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 bg-[#7f1d1d] px-4 py-2.5 text-[13px] leading-relaxed text-white sm:px-6"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-semibold">Demo data.</strong> {DEMO_DATA_MESSAGE} Nothing shown
        here is a real publisher, a real price or a real order.
      </p>
    </div>
  );
}
