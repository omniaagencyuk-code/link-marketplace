<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Press Parrot

## Publisher email extraction

The rules the model follows when reading a publisher's reply live in
`src/lib/sourcing/extraction-rules.ts`. **That file is the prompt.** It is the
only copy on purpose: rules kept both in code and in a document drift within a
month, and the stale copy is always the one somebody reads.

Change the rules there and bump `PROMPT_VERSION` in the same edit. Every draft
records the version it was extracted under, so when a rule turns out to be
wrong the drafts made under the old one can be found and re-read.

The two rules most often got wrong, restated here because they are the ones
that cost money:

- **Blank is not "no".** A niche is only `no` when the email explicitly
  excludes it, only `yes` when it explicitly includes it, and `unknown`
  otherwise. A listing that records silence as a refusal is worse than one
  that records nothing.
- **A lone price is not a sensitive-topic price.** A reply giving one number
  and never mentioning topics leaves every niche unknown and is flagged for a
  human. A publisher who has not mentioned gambling has not agreed to carry it.

"Sensitive niches" means the seven marked `sensitive` in
`src/lib/config/accepted-niches.ts` — narrower than `regulated`, because
extending a publisher's sensitive rate to Finance or Pharma would invent a
price they never quoted.

Nothing extracted reaches a listing without a human pressing Approve.
`src/lib/services/draft-approval.ts` is the only path, and it never writes a
sell price: what we charge is a separate decision from what we pay.

## Internal data

`websites` is readable by every signed-in customer and row level security
cannot hide a single column. Anything internal therefore lives in its own
table with an admin-only policy and no customer-facing policy at all:
`service_costs`, `website_contacts`, `website_niche_costs`,
`website_commercials`, `inbound_emails`, `listing_drafts`.

Before adding a column that holds a cost, a contact or a commercial term, ask
which of those tables it belongs in. It does not belong on `websites`.

The Sales Centre's fourteen tables are internal on the same terms and for a
sharper reason: a prospect is a company somebody decided to approach, a
qualification is a judgement about them, and `prospect_contacts` holds named
people's work addresses. None of them has a customer-facing policy and none
should acquire one.

## Outbound sales

Two rules are enforced by the database rather than by whoever is calling it,
because both are about an email that has already left.

- **Nothing sends unapproved.** `outbound_emails` cannot reach `approved`,
  `scheduled` or `sent` without a named approver and a timestamp. The parallel
  is `draft-approval.ts`: the model proposes, a person decides.
- **An unsubscribe is final.** A trigger checks `sales_suppressions` on the way
  to the wire, by address or by whole company. A suppression that depends on
  every future caller remembering it is not a suppression. Cancelling is always
  allowed - stopping is never the thing to refuse.

An unsubscribe is also recognised without a model: `looksLikeStop` in
`src/lib/sales/reply-rules.ts` runs alongside the classifier and may override
it, never the other way round. A missed unsubscribe is another email to
somebody who asked us to stop; a false one costs a prospect. Those are not
comparable errors.

Three more files are prompts, each the only copy, each versioned in the same
edit as a rule change - the same arrangement `extraction-rules.ts` has:
`sales/qualification-rules.ts`, `sales/email-rules.ts`, `sales/reply-rules.ts`.

The rules in them most often got wrong:

- **Silence is `unclear`, never `unlikely`.** A company that does not mention
  SEO has not said it does not buy links; most buyers never mention it. A
  pipeline that reads silence as a refusal works a small self-selecting slice
  of the market and cannot recover the rest, because nobody re-reads the ones
  already marked no.
- **A number in an email must be one the writer was given.** `checkDraft`
  enforces it rather than trusting it: a price we never set is one we have to
  honour or retract.
- **Spend is measured.** Hunter credits are summed from `hunter_lookups`, one
  row per call carrying what Hunter charged; model cost from reported tokens.
  The Hunter budget ships at zero and zero refuses everything.

## Verification

- `npm run verify:rls` — replays every migration into a local Postgres and
  asserts the policies, as each role.
- `npm run verify:import` — the CSV importer.
- `npm run verify:sourcing` — mbox reading and the review rules. Needs no API
  key and no database.
- `npm run verify:sales` — the Sales Centre's decisions: what gets crawled,
  what scores, which listings a prospect is shown, which address an email may
  reach. No API key, no database, no network - and no Hunter credit, which is
  structural rather than careful: the guard refuses in dry run before it checks
  for a key.
