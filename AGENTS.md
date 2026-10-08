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

There is one exception and it has to stay the only one. `repeat-offers.ts`
approves a draft where a seller we have **already** approved for that site now
wants strictly less: same company by the domain after the `@`, same site, both
figures converted, and not under a tenth of the old price. It still goes
through `approveDraft` - what is skipped is the press, not the checking. The
case is safe because the answer is never no, and the floor is there because a
seller who quoted 400 and now says 20 has been misread rather than discounted,
and that number becomes what we think the placement costs.

Everything else that file touches it deletes, never approves: a repeat from a
seller whose price we already hold says nothing new, and the email stays. Two
*different* sellers are never collapsed, however alike their prices - choosing
between them is what the duplicates queue is for. The rule that protects that
is in `sellerKey`: a free provider is not a company, so `joe@gmail.com` and
`sara@gmail.com` are two sellers and only the identical address is a repeat.

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

## Link gap finder

A customer names their site and up to three competitors; we buy each one's
referring domains from Ahrefs and show them the sites linking to a competitor
and not to them, with ours marked. The customer picks the targets, so the
customer sets the bill - and that is what the whole design is arranged around.

- **Its budget is its own.** `gap_settings` has a separate allowance from
  `refresh_settings`, counted from a separate ledger (`gap_lookups`, not
  `refresh_runs`). Neither can borrow from the other, which is why a busy week
  of gap reports cannot stop the marketplace's metrics updating, and a heavy
  refresh cannot stop a customer running a report. Do not make one read the
  other's figure.
- **A row cap, always.** An uncapped pull costs the target's whole backlink
  profile - three ordinary competitors is 300,000 units from one form
  submission. The cap is what the guard budgets against, because nobody knows
  a competitor's real size before paying to find out.
- **`units-cost-row` counts the columns a request *touches*, not the ones it
  selects.** A column named only in `order_by` is charged for too. The
  referring-domain pull selects `domain` and sorts by `domain_rating`, so it
  costs two units a row, not one - a 2,500-row target is 5,000 units and a
  four-target report is 20,000. `COLUMNS_CHARGED` in `src/lib/gap/cost.ts` read
  1 for the whole of 0054; the ledger was right throughout because Ahrefs
  reports the real cost back, but every estimate the guard made was half.
  Before adding a column to any Ahrefs call, or a sort, measure the call
  against the free `ahrefs.com` target and read `apiUsageCosts` back.
- **A competitor is measured, never invented.** Suggestions come from Ahrefs'
  organic competitors at fifty units a list, not from a model. A model cannot
  know who ranks for what and will name plausible companies instead, and each
  invented name becomes a real 5,000-unit pull against a site nobody competes
  with. `src/lib/gap/competitors.ts` also drops the platforms that rank for
  everything - a gap against YouTube is a list of sites we cannot sell.
- **Suggesting proposes, a person decides.** The lookup fills the boxes and
  stops; nothing expensive runs until somebody presses the button. The same
  arrangement as `draft-approval.ts`.
- **What a customer is told when the budget is the reason is not our budget.**
  `mayRunGap` and `maySuggestCompetitors` refuse with "try again later" and
  never quote our allowance, our spend, or Ahrefs. `describeForAdmin` is where
  the numbers go.

`refdomain_snapshots`, `competitor_suggestions`, `gap_lookups` and
`gap_settings` are internal on the terms above: they hold what we paid.
`gap_projects`, `gap_runs` and `gap_results` are the customer's own and are the
only tables here with a customer-facing policy - scoped to `user_id` on
`using` *and* `with check`, because without the second half a customer can hand
their project to somebody else.

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
- `npm run verify:gap` — what a gap report costs, whether it may run, what
  counts as a gap, and which competitors are worth suggesting. Pure arithmetic
  against the measured Ahrefs pricing model; no API key, no database, no
  network.
- `npm run verify:search` — that the marketplace's database-side search returns
  exactly what the browser-side filter it replaces returned. The same fixtures
  are inserted into a real Postgres and built as `WebsiteListItem`s, and every
  filter, every sort key and the topic repricing are run through both, with the
  id sequences compared in order. Needs the same local Postgres `verify:rls`
  wants. A port like this fails quietly - a customer sees a slightly different
  set of publishers and nothing says so - so neither side is trusted.
