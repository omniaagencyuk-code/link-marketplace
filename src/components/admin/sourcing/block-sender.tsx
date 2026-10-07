"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  blockSenderAction,
  unblockSenderAction,
} from "@/app/admin/(protected)/sourcing/actions";
import type { BlockedSender } from "@/lib/services/repeat-offers";

/**
 * Who we will not buy from.
 *
 * A reseller mails the same list as everybody else and quotes 150 USD for a
 * site four other people sell at 35. Nothing on their drafts is wrong - no
 * flag catches them, and none could, because the number only looks wrong
 * beside the rival offers. By then somebody has read all four.
 *
 * One field rather than two, because asking "address or domain?" asks the
 * person to classify what they have already written down. An `@` in the
 * middle is an address and anything else is a company.
 *
 * The counts come back from the server and are worth saying out loud: a block
 * is not only about the cards on screen. It deletes every waiting draft that
 * sender has anywhere, and it silences the replies of theirs nobody has read
 * yet - which is where the money is, because those are replies we would
 * otherwise pay the model to read.
 */
export function BlockSender({ blocked }: { blocked: BlockedSender[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function block() {
    const value = typed.trim();
    if (!value) return;

    /*
      Confirmed because the field accepts a whole company as readily as one
      person, and the two look almost identical as you type them: one `@`
      apart. Saying which it understood, before it does anything, is the only
      point at which that is correctable.
    */
    const whole = !value.includes("@") || value.startsWith("@");
    if (
      !window.confirm(
        whole
          ? `Block everyone writing from ${value.replace(/^@/, "")}? Every draft they have waiting is deleted, anywhere in the queue, and their unread replies are skipped from now on.`
          : `Block ${value}? Every draft they have waiting is deleted, anywhere in the queue, and their unread replies are skipped from now on.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const outcome = await blockSenderAction(value, note.trim() || null);
        if (!outcome.ok) {
          setResult(outcome.error);
          return;
        }
        setTyped("");
        setNote("");
        const silenced = outcome.emailsIgnored
          ? ` ${outcome.emailsIgnored} unread repl${outcome.emailsIgnored === 1 ? "y" : "ies"} of theirs will not be read.`
          : "";
        setResult(
          `Blocked ${outcome.what}. ${outcome.draftsRemoved} waiting draft${outcome.draftsRemoved === 1 ? "" : "s"} deleted.${silenced}`,
        );
      } finally {
        router.refresh();
      }
    });
  }

  function unblock(entry: BlockedSender) {
    const value = entry.email ?? entry.domain ?? "";
    if (!value) return;
    if (
      !window.confirm(
        `Unblock ${value}? Their unread replies go back in the queue to be read - which costs model tokens. Replies already read before the block stay read, and the drafts deleted then do not come back.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const outcome = await unblockSenderAction(value);
        setResult(
          outcome.ok
            ? `Unblocked ${value}. ${outcome.restored} repl${outcome.restored === 1 ? "y is" : "ies are"} back in the queue.`
            : outcome.error,
        );
      } finally {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="block-sender">
          Email address or company domain to block
        </label>
        <input
          id="block-sender"
          type="text"
          value={typed}
          disabled={busy}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              block();
            }
          }}
          placeholder="name@reseller.com, or reseller.com for everyone there"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink placeholder:text-muted"
        />
        <input
          type="text"
          value={note}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why (optional)"
          aria-label="Why this sender is blocked"
          className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink placeholder:text-muted sm:w-48"
        />
        <Button variant="outline" size="sm" disabled={busy || !typed.trim()} onClick={block}>
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          {busy ? "Working…" : "Block"}
        </Button>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-soft">
        Deletes every draft waiting from them, anywhere in the queue - not just
        on the cards below - and skips their future replies before they are
        read, so they cost nothing.{" "}
        {blocked.length > 0 ? (
          <button
            type="button"
            className="font-medium text-accent-700 hover:underline"
            onClick={() => setOpen((was) => !was)}
          >
            {blocked.length} blocked
          </button>
        ) : null}
      </p>

      {result ? (
        <p role="status" className="text-[12px] text-ink-soft">
          {result}
        </p>
      ) : null}

      {open && blocked.length > 0 ? (
        <ul className="divide-y divide-line rounded-md border border-line">
          {blocked.map((entry) => (
            <li
              key={entry.email ?? entry.domain}
              className="flex flex-wrap items-center gap-2 px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 break-words text-[12px] text-ink">
                {entry.email ?? `everyone at ${entry.domain}`}
                {entry.note ? (
                  <span className="block text-[11px] text-muted">{entry.note}</span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => unblock(entry)}
                aria-label={`Unblock ${entry.email ?? entry.domain}`}
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
