import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { salesUnsubscribeService } from '@/lib/services/sales-unsubscribe-service';
import { brand } from '@/lib/config/brand';

/**
 * The unsubscribe page.
 *
 * Public, deliberately: it is reached from a link in an email by somebody who
 * has no account and does not want one. `noindex` because a page keyed by a
 * random token has no business in an index.
 *
 * ## Why there is a button
 *
 * Unsubscribing happens on the POST, not on opening the page. Corporate mail
 * scanners and link previewers fetch every URL in an incoming email before a
 * human sees it, so a GET that unsubscribes would quietly suppress companies
 * whose security appliance was doing its job - and we would never find out,
 * because the symptom is an email that was never sent.
 *
 * ## Why it never says "we could not find you"
 *
 * A stale or wrong token gets the same page as a real one. Telling somebody
 * which tokens are real is the only thing a distinct error message achieves,
 * and the honest answer to a stale link is the same either way: you will not
 * hear from us.
 */

export const metadata: Metadata = {
  title: `Unsubscribe | ${brand.name}`,
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The POST.
 *
 * Redirects to the same page with `done`, so the result survives a refresh:
 * re-posting an unsubscribe is harmless but a browser asking "resend this
 * form?" to somebody who just asked us to go away is not the last impression
 * to leave them with.
 */
async function unsubscribe(formData: FormData) {
  'use server';

  const token = String(formData.get('token') ?? '').slice(0, 64);
  await salesUnsubscribeService.unsubscribe(token);
  redirect(`/sales/unsubscribe/${encodeURIComponent(token)}?done=1`);
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;

  const company = await salesUnsubscribeService.company(token);

  if (done) {
    return (
      <Shell>
        <h1 className="text-[22px] font-semibold text-ink">You are unsubscribed</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          We have removed {company ? company.companyName : 'you'} from our outreach list and will
          not email you again. Nothing else needs doing.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-[22px] font-semibold text-ink">Stop hearing from us</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {company
          ? `Confirm below and we will not contact anyone at ${company.companyName} again.`
          : `Confirm below and we will not contact you again.`}
      </p>

      <form action={unsubscribe} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-lg bg-navy-900 px-4 py-2.5 text-[14px] font-semibold text-white"
        >
          Unsubscribe me
        </button>
      </form>

      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        Sent in error? You can ignore this page and simply not reply - we will stop after a
        couple of messages either way.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:py-24">
      <div className="rounded-xl border border-line bg-white p-6 sm:p-8">{children}</div>
    </main>
  );
}
