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
  leaveDomainsAsIsAction,
  resolveDuplicateAction,
  resolveDuplicatesAction,
} from "@/app/admin/(protected)/sourcing/actions";
import { chunk } from "@/lib/utils/chunk";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { signalLabel } from "@/lib/sourcing/offers";
import { defaultChoices } from "@/lib/sourcing/queue";
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
 *
 * ## Deciding a hundred of them at a sitting
 *
 * One domain at a time was still one domain at a time, and this list runs to
 * two hundred and fifty. So a card can be ticked instead of acted on, and
 * the two decisions are taken for everything ticked at once.
 *
 * Ticking a card chooses an offer as well as a domain - the cheapest, which
 * is already marked - because approving needs to know which one wins and
 * nobody wants to answer that question separately two hundred times. The
 * radio beside each row changes that choice where it matters.
 *
 * Sent in chunks, each one waited for, the same as the review queue and for
 * the same reason: an approval is around ten sequential round trips, and a
 * hundred of them in one request runs past the function ceiling with nobody
 * left to tell.
 */

/** Domains per request when clearing. One query each, so they go in bulk. */
const LEAVE_CHUNK = 50;

/** Domains per request when approving. Ten round trips each - keep it small. */
const APPROVE_CHUNK = 10;
export function DuplicateGroups({ groups }: { groups: DuplicateGroup[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  /* Which row is working, so the whole page does not grey out for one click. */
  const [working, setWorking] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  /*
    Domain -> the draft chosen to win it. Keyed by domain rather than held as
    a set of drafts, because a domain can only be settled once and the map
    makes that impossible to express twice.
  */
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [progress, setProgress] = useState<string | null>(null);

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

  function setPick(domain: string, draftId: string | null) {
    setPicked((current) => {
      const next = new Map(current);
      if (draftId === null) next.delete(domain);
      else next.set(domain, draftId);
      return next;
    });
  }

  /** Every group that still has something to decide. */
  const decidable = groups.filter((group) => firstWaiting(group));
  const allPicked = decidable.length > 0 && decidable.every((group) => picked.has(group.domain));

  function toggleAll() {
    if (allPicked) {
      setPicked(new Map());
      return;
    }
    setPicked(defaultChoices(groups));
  }

  /**
   * Run a chunked job over the selection, reporting as it goes.
   *
   * The count comes back from the server rather than from the length of what
   * was sent: a draft reviewed in another tab since this page was drawn is
   * refused there, and claiming it was approved because it was in the list
   * is how a queue starts lying about itself.
   */
  function runBulk(
    label: string,
    total: number,
    parts: (() => Promise<{ done: number; failures: string[] }>)[],
  ) {
    setWorking("bulk");
    startTransition(async () => {
      let done = 0;
      let settled = 0;
      const failures: string[] = [];
      for (const part of parts) {
        setProgress(`${label} - ${done} of ${total} done. Leave this page open.`);
        try {
          const outcome = await part();
          settled += outcome.done;
          failures.push(...outcome.failures);
        } catch {
          failures.push("one batch did not answer");
        }
        done = Math.min(total, done + 1);
      }
      setPicked(new Map());
      setProgress(null);
      setWorking(null);
      setResult(
        `${label}: ${settled} of ${total} done.` +
          (failures.length
            ? ` ${failures.length} could not be: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? " and more" : ""}.`
            : ""),
      );
      router.refresh();
    });
  }

  function approveSelected() {
    const ids = [...picked.values()];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Approve the chosen offer on ${ids.length} ${ids.length === 1 ? "domain" : "domains"}? Every other draft waiting on those domains is deleted. Listings already in the marketplace are updated from the reply you chose.`,
      )
    ) {
      return;
    }
    const batches = chunk(ids, APPROVE_CHUNK);
    runBulk(
      "Approved",
      ids.length,
      batches.map((batch) => async () => {
        const outcome = await resolveDuplicatesAction(batch);
        return { done: outcome.approved, failures: outcome.failures };
      }),
    );
  }

  function leaveSelected() {
    const domains = [...picked.keys()];
    if (domains.length === 0) return;
    if (
      !window.confirm(
        `Leave ${domains.length} ${domains.length === 1 ? "domain" : "domains"} as they are? Every draft waiting on them is deleted and nothing in the marketplace changes. The emails stay, so these replies can be read again.`,
      )
    ) {
      return;
    }
    const batches = chunk(domains, LEAVE_CHUNK);
    runBulk(
      "Left as they were",
      domains.length,
      batches.map((batch) => async () => {
        const outcome = await leaveDomainsAsIsAction(batch);
        return {
          done: outcome.ok ? batch.length : 0,
          failures: outcome.ok ? [] : [outcome.error ?? "could not clear those drafts"],
        };
      }),
    );
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

      {/* The bar is always here rather than appearing with the first tick, so
          the page does not jump under the cursor that just ticked something. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
        <label className="flex items-center gap-2 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-accent-700)]"
            checked={allPicked}
            onChange={toggleAll}
            disabled={busy || decidable.length === 0}
            aria-label="Select every domain on this page"
          />
          Select all on this page
        </label>

        <span className="tabular text-[13px] text-muted">
          {picked.size} selected
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="accent"
            size="sm"
            disabled={busy || picked.size === 0}
            onClick={approveSelected}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Approve selected
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || picked.size === 0}
            onClick={leaveSelected}
          >
            Leave selected as is
          </Button>
          {picked.size > 0 ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPicked(new Map())}>
              Clear
            </Button>
          ) : null}
        </span>
      </div>

      {progress ? (
        <p role="status" className="text-[13px] text-ink-soft">
          {progress}
        </p>
      ) : null}

      {groups.map((group) => (
        <Card key={group.domain}>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              {firstWaiting(group) ? (
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-accent-700)]"
                  checked={picked.has(group.domain)}
                  disabled={busy}
                  aria-label={`Select ${group.domain}`}
                  onChange={(event) =>
                    setPick(
                      group.domain,
                      event.target.checked ? ((firstWaiting(group) as RankedOffer).draftId) : null,
                    )
                  }
                />
              ) : null}
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
                  {/* Which offer wins, when the domain is approved. Ticking
                      the card picks the cheapest; this is how to say otherwise. */}
                  {offer.status === "pending" ? (
                    <input
                      type="radio"
                      name={`winner-${group.domain}`}
                      className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent-700)]"
                      checked={picked.get(group.domain) === offer.draftId}
                      disabled={busy}
                      aria-label={`Approve the ${group.domain} offer from ${offer.fromAddress} when this domain is settled`}
                      onChange={() => setPick(group.domain, offer.draftId)}
                    />
                  ) : null}

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
