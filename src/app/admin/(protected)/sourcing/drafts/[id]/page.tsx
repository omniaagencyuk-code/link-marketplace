import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { DraftReview } from '@/components/admin/sourcing/draft-review';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { extractedListingSchema } from '@/lib/sourcing/schema';
import { websiteService } from '@/lib/services';
import { sensitiveNicheSlugs } from '@/lib/config/accepted-niches';

export const dynamic = 'force-dynamic';

/**
 * One draft, beside the email it came from.
 *
 * The reviewer's job is to disbelieve the extraction efficiently, so the
 * email is on the page rather than a click away, every low-confidence field
 * says so, and each value carries the quote it was read from. For a domain we
 * already sell, the current values sit next to the proposed ones - a price
 * that has gone up is the thing most worth noticing, and it is invisible
 * unless you show both.
 */

/** What the listing currently says, for the columns the draft can change. */
async function currentValues(websiteId: string) {
  const website = await websiteService.getById(websiteId);
  if (!website) return null;

  const guestPost = website.services.find((service) => service.type === 'guest-post');
  const linkInsertion = website.services.find((service) => service.type === 'niche-edit');

  return {
    domain: website.domain,
    status: website.status,
    guest_post_cost: guestPost?.costPriceMinor != null ? guestPost.costPriceMinor / 100 : null,
    link_insertion_cost:
      linkInsertion?.costPriceMinor != null ? linkInsertion.costPriceMinor / 100 : null,
    contact_email: website.contact?.email ?? null,
    contact_name: website.contact?.name ?? null,
    min_word_count: website.rules.minWordCount,
    max_word_count: website.rules.maxWordCount,
    max_links: website.rules.maxLinks,
    accepted: Object.fromEntries(
      sensitiveNicheSlugs.map((slug) => [slug, website.rules.acceptedNiches.includes(slug)]),
    ),
  };
}

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseEnabled()) notFound();

  const supabase = getAdminScopedClient();
  const { data } = await supabase
    .from('listing_drafts')
    .select(
      'id, domain, status, flags, low_confidence_count, matched_website_id, proposed, confidence, evidence, extraction_model, prompt_version, reject_reason, inbound_emails (id, from_address, from_name, subject, sent_at, body_text, asked_about_domain)',
    )
    .eq('id', id)
    .maybeSingle();

  if (!data) notFound();
  const draft = data as Record<string, unknown>;

  const parsed = extractedListingSchema.safeParse(draft.proposed);
  if (!parsed.success) {
    return (
      <div className="space-y-5">
        <PageTitle title={String(draft.domain)} description="This draft could not be read." />
        <p className="text-[13px] text-negative">
          The stored values do not match the current schema. Re-extract the email to rebuild it.
        </p>
      </div>
    );
  }

  const emailRaw = draft.inbound_emails;
  const email = (Array.isArray(emailRaw) ? emailRaw[0] : emailRaw) as Record<string, unknown> | null;

  const current = draft.matched_website_id
    ? await currentValues(String(draft.matched_website_id))
    : null;

  // Other domains from the same reply still waiting. A network answer
  // produces dozens, and checking one usually settles the lot.
  const { count: siblings } = await supabase
    .from('listing_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('email_id', String(draft.email_id))
    .eq('status', 'pending')
    .neq('id', String(draft.id));

  return (
    <div className="space-y-5">
      <Link
        href="/admin/sourcing"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Publisher inbox
      </Link>

      <PageTitle
        title={String(draft.domain)}
        description={
          current
            ? 'This domain is already a listing. Approving updates it.'
            : 'A new listing. It will be created unpublished until you set a sell price.'
        }
      />

      <DraftReview
        draftId={String(draft.id)}
        domain={String(draft.domain)}
        status={String(draft.status)}
        flags={(draft.flags as string[]) ?? []}
        values={parsed.data}
        confidence={(draft.confidence as Record<string, string>) ?? {}}
        evidence={(draft.evidence as Record<string, string>) ?? {}}
        current={current}
        email={{
          fromAddress: String(email?.from_address ?? ''),
          fromName: (email?.from_name as string | null) ?? null,
          subject: (email?.subject as string | null) ?? null,
          sentAt: (email?.sent_at as string | null) ?? null,
          body: String(email?.body_text ?? ''),
          askedAboutDomain: (email?.asked_about_domain as string | null) ?? null,
        }}
        siblingCount={siblings ?? 0}
        extractedBy={`${draft.extraction_model ?? 'unknown model'} · rules ${draft.prompt_version ?? 'unknown'}`}
      />
    </div>
  );
}
