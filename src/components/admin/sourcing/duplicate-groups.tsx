"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Home, Mail, Trash2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  discardDraftsAction,
  leaveDomainAsIsAction,
  resolveDuplicateAction,
} from "@/app/admin/(protected)/sourcing/actions";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { signalLabel } from "@/lib/sourcing/offers";
import type { DuplicateGroup } from "@/lib/services/sourcing-service";
import type { RankedOffer } from "@/lib/sourcing/offers";

/**
 * One card per contested domain, with every offer side by side.
 *
 * The same arrangement as the warning on a draft's own page, because it is
 * the same decision - but reached from a list rather than stumbled into half
 * way through an approval. Converted before compared: a publisher quoting
 * 300 GBP is dearer than one quoting 400 EUR, and the raw numbers say the
 * opposite.
 *
 * Every way out of a card is here, because the decision was always cheap and
 * reaching it was not. Approving used to mean opening the draft's own page
 * and scrolling to the bottom, then coming back to delete the copies one at
 * a time - seven interactions for a domain one reseller had offered seven
 * times at one price. Now each row can be approved where it sits, which also
 * clears the rest, and a domain already in the marketplace can be left
 * exactly as it is.
 *
 * Nothing here decides anything on its own. Approve still goes through the
 * one approval path, and "leave as is" goes nowhere near it.
 */
export function DuplicateGroups({ groups }: { groups: DuplicateGroup[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  /* Which row is working, so the whole page does not grey out for one click. */
  const [working, setWorking] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function run(key: string, job: () => Promise<string>) {
    setWorking(key);
    startTransition(async () => {
      try {
        setResult(await job());
      } finally {
        setWorking(null);
        router.refresh();
      }
    });
  }

  /**
   * The first offer still waiting, in the order they are shown - which is
   * cheapest first. Only used where the offers agree, so "first" is a way of
   * picking one rather than a judgement about which is best.
   */
  function firstWaiting(group: DuplicateGroup): RankedOffer | undefined {
    return group.offers.find((offer) => offer.status === "pending");
  }

  /** The money on an offer, for a sentence rather than a column. */
  function priceOf(offer: RankedOffer): string {
    return offer.cost == null
      ? "no price given"
      : `${offer.cost} ${offer.currency ?? ""}`.trim();
  }

  function approve(group: DuplicateGroup, offer: RankedOffer) {
    const others = group.pending - 1;
    const alsoCleared =
      others > 0
        ? ` The other ${others} ${others === 1 ? "draft" : "drafts"} waiting on ${group.domain} will be deleted.`
        : "";
    const effect = group.listed
      ? " The listing already in the marketplace is updated from this reply."
      : " A new listing is created hidden, and needs a sell price before it can appear.";

    if (
      !window.confirm(
        `Approve the ${group.domain} offer from ${offer.fromAddress || "this sender"} at ${priceOf(offer)}?${alsoCleared}${effect}`,
      )
    ) {
      return;
    }

    run(offer.draftId, async () => {
      const outcome = await resolveDuplicateAction(offer.draftId);
      if (!outcome.ok) return outcome.error ?? "Could not approve that draft.";
      const swept = outcome.cleared
        ? ` ${outcome.cleared} other ${outcome.cleared === 1 ? "draft" : "drafts"} cleared.`
        : "";
      return outcome.warning ?? `Approved ${outcome.domain}.${swept}`;
    });
  }

  function leaveAsIs(group: DuplicateGroup) {
    const effect = group.listed
      ? "The listing already in the marketplace is not changed."
      : "Nothing is added to the marketplace.";

    if (
      !window.confirm(
        `Delete the ${group.pending} ${group.pending === 1 ? "draft" : "drafts"} waiting on ${group.domain}? ${effect} The emails stay, so these replies can be read again.`,
      )
    ) {
      return;
    }

    run(`group:${group.domain}`, async () => {
      const outcome = await leaveDomainAsIsAction(group.domain);
      return outcome.ok
        ? `Left ${group.domain} as it is. ${outcome.cleared} ${outcome.cleared === 1 ? "draft" : "drafts"} cleared.`
        : (outcome.error ?? "Could not clear those drafts.");
    });
  }

  function discard(group: DuplicateGroup, offer: RankedOffer) {
    if (
      !window.confirm(
        `Delete the ${group.domain} draft from ${offer.fromAddress || "this sender"}? The draft is gone for good. Any listing you have already approved is not affected, and the email stays, so it can be read again.`,
      )
    ) {
      return;
    }

    run(offer.draftId, async () => {
      const outcome = await discardDraftsAction([offer.draftId]);
      return outcome.ok
        ? `Deleted the ${group.domain} draft.`
        : (outcome.error ?? "Could not delete that draft.");
    });
  }

  return (
    <div className="space-y-4">
      {result ? (
        <p role="status" className="text-[13px] text-ink-soft">
          {result}
        </p>
      ) : null}

      {groups.map((group) => (
        <Card key={group.domain}>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <CardTitle>{group.domain}</CardTitle>
              {group.listed ? (
                <Badge tone="neutral">in the marketplace</Badge>
              ) : null}
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <span className="text-[12px] text-muted">
                {group.offers.length} offers · {group.pending} still waiting
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => leaveAsIs(group)}
                title={
                  group.listed
                    ? "Clear these drafts and keep the listing exactly as it is"
                    : "Clear these drafts without adding anything to the marketplace"
                }
              >
                {working === `group:${group.domain}`
                  ? "Clearing…"
                  : "Leave as is"}
              </Button>
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {/*
              Said once, above the rows, when reading them would only tell you
              they are identical. The seven-offers-one-reseller case is most
              of this queue, and it is the case where the rows are noise.
            */}
            {group.agree && firstWaiting(group) ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3 py-2">
                <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-soft">
                  All {group.pending} still waiting are the same sender at the
                  same price, so there is nothing to choose between them.
                </p>
                {/*
                  One button rather than six identical ones. Six equally
                  weighted buttons ask which, and the sentence beside them has
                  just finished saying it does not matter.
                */}
                <Button
                  variant="accent"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    approve(group, firstWaiting(group) as RankedOffer)
                  }
                >
                  {working === (firstWaiting(group) as RankedOffer).draftId ? (
                    "Working…"
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Approve at {priceOf(firstWaiting(group) as RankedOffer)}
                    </>
                  )}
                </Button>
              </div>
            ) : null}

            <ul className="divide-y divide-line rounded-lg border border-line">
              {group.offers.map((offer) => (
                /*
                  Stacked until there is room for a row. Side by side, the
                  sender is the only column allowed to shrink, so on a narrow
                  screen it was squeezed to nothing and `break-all` spelled
                  each address down the page one letter at a time. Adding the
                  approve button made a bad row unreadable.
                */
                <li
                  key={offer.draftId}
                  className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center"
                >
                  <span className="min-w-0 sm:flex-1">
                    <span className="block break-words text-[13px] text-ink">
                      {offer.fromAddress || "No sender recorded"}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
                      {offer.signal === "owner-match" ? (
                        <Home className="h-3 w-3" aria-hidden="true" />
                      ) : offer.signal === "free-email" ? (
                        <Mail className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <User className="h-3 w-3" aria-hidden="true" />
                      )}
                      {signalLabel(offer.signal)}
                      {offer.sentAt ? ` · ${formatDate(offer.sentAt)}` : ""}
                    </span>
                  </span>

                  <span className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                    <span className="tabular text-[13px] sm:text-right">
                      {offer.cost == null ? (
                        <span className="text-muted">no price</span>
                      ) : (
                        <>
                          <span className="text-ink">
                            {offer.cost} {offer.currency ?? ""}
                          </span>
                          <span className="block text-[11px] text-muted">
                            {offer.costInBase == null
                              ? "cannot convert"
                              : `${formatPrice(Math.round(offer.costInBase * 100))} to us`}
                          </span>
                        </>
                      )}
                    </span>

                    {offer.cheapest ? (
                      <Badge tone="positive">cheapest</Badge>
                    ) : null}
                    {offer.status !== "pending" ? (
                      <Badge tone="neutral">{offer.status}</Badge>
                    ) : null}

                    <span className="flex items-center gap-2">
                      {offer.status === "pending" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => approve(group, offer)}
                          aria-label={`Approve the ${group.domain} offer from ${offer.fromAddress}`}
                        >
                          {working === offer.draftId ? (
                            "Working…"
                          ) : (
                            <>
                              <Check
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Approve
                            </>
                          )}
                        </Button>
                      ) : null}

                      {/* Still here: the row is a summary, and some decisions
                        need the reply, the rate card and the niche answers
                        that only the draft's own page shows. */}
                      <Link
                        href={`/admin/sourcing/drafts/${offer.draftId}`}
                        className="text-[12px] font-medium text-accent-700 hover:underline"
                      >
                        {offer.status === "pending" ? "Review" : "Open"}
                      </Link>

                      {offer.status === "pending" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={`Delete the ${group.domain} draft from ${offer.fromAddress}`}
                          onClick={() => discard(group, offer)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {group.note ? (
              <p className="text-[12px] leading-relaxed text-ink-soft">
                {group.note}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
