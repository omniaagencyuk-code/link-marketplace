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

A publisher can also offer us a site directly, through /list-your-site, and
that lands in `publisher_submissions` rather than in `listing_drafts`. Not a
preference: `listing_drafts.email_id` is not null and points at
`inbound_emails`, so a form submission would need an email invented for it
that nobody sent - and every draft records the `prompt_version` that read it,
which is a lie to stamp on something no prompt ever saw. The queue a person
works is the same; where the two came from is the part that cannot be
recovered afterwards.

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

## What a publisher's site is about

A listing's category is set by a person. Majestic proposes one from Topical
Trust Flow and `src/lib/majestic/topics.ts` says why that is only ever a
proposal: a topic there describes *who links to a site*, not what the site
publishes.

1,840 of 12,190 active listings have no category at all. Until 0077 the
marketplace covered that up — `coalesce(pc.slug, 'technology')` in
`marketplace_listings` sold every one of them as a technology site. A null
niche now means no niche filter returns the listing and no count includes it,
which is the rule `country` has always followed two lines above it.

Majestic cannot close that gap: of the 1,840, only 167 carry a topic above
`MIN_TOPIC_VALUE` and only 38 carry one that is not `Regional/*`. So the
second source is the homepage, which is better evidence than backlinks for
this question because it is the site itself.

`src/lib/sourcing/niche-rules.ts` is a fourth prompt, on the same terms as
the three below: **the file is the prompt**, it is the only copy, and
`NICHE_PROMPT_VERSION` is bumped in the same edit as a rule change.

The rules most worth keeping:

- **`unknown` is a real answer.** The thing being fixed is an invented
  category, and replacing it with a differently invented one is not a fix.
- **The domain is not evidence.** Reading iGaming off `casinoguru.co.uk` is
  the reasoning that put a country on a listing because of its suffix, which
  0043 and 0044 exist to undo.
- **A category without a quote is not a category.** `readNiche` checks the
  quote is really in the page text rather than trusting it, the way
  `checkDraft` checks a price rather than trusting it. An approximation is
  thrown away with the category it came with.

Nothing here writes a category. It proposes, and a person decides — the
arrangement `draft-approval.ts` and the gap finder's competitor suggestions
both have.

## Internal data

`websites` is readable by every signed-in customer and row level security
cannot hide a single column. Anything internal therefore lives in its own
table with an admin-only policy and no customer-facing policy at all:
`service_costs`, `website_contacts`, `website_niche_costs`,
`website_commercials`, `inbound_emails`, `listing_drafts`,
`pricing_enquiries`.

Before adding a column that holds a cost, a contact or a commercial term, ask
which of those tables it belongs in. It does not belong on `websites`.

`pricing_enquiries` and `publisher_submissions` are the odd ones: they are
the only two tables a stranger can cause a row in, through the form on
/pricing and the form on /list-your-site. Both therefore have an admin policy
and **no insert policy at all** - each form writes through a server action
running as the service role, which throttles first. An insert policy for
`anon` would be a second door, unthrottled, from any browser holding the anon
key. The first holds a named person's work address, their employer and what
they said they could spend; the second holds a named person's address, the
site they own and what they want paid for a placement. Both are
`prospect_contacts`-grade, and the second is also a cost.

A third form would get the same three things or it does not ship: its own
throttle in `RATE_LIMITS` (never sharing a bucket, or one form's traffic
turns the other away), a pure rules module that decides what is acceptable
without a database, and a table with no insert policy. `publishers/rules.ts`
is the newer of the two to copy; the price rule in it is the one worth
reading, because a number stored without knowing its currency becomes a cost
we never agreed to.

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

## Link building planner

A customer's own spreadsheet, moved into Press Parrot and free: a row per
link they plan to buy, anywhere, with every field editable in place. It is
the one feature here that is deliberately allowed to know nothing.

- **No paid lookup, ever.** No Ahrefs, no Majestic, no Moz, no SEMrush, no
  model, no crawl, no scheduled job. The only enrichment is
  `planner-metrics.ts`, which asks `websites` about a domain the customer
  typed and returns four figures and the date they were measured, behind a
  per-account hourly limit. A planner that quietly spent money per row
  would cost more than it earns, and the limit is there because this is the
  one screen that will answer about a domain nobody is buying.
- **Nothing is verified and nothing says it is.** There is no link checking,
  no lost-link detection and no fetch of a publisher's site. "Live" means a
  person pressed Live. Every screen that shows a live count says so, because
  a free tool implying it has confirmed a backlink is making a claim we
  cannot stand behind.
- **Blank is not zero.** Every metric and every price is `number | null`. A
  row nobody has researched has no domain rating, so it is last in a sort
  whichever way the arrow points, outside a price range in both directions,
  and worth nothing in a total - not zero, which would drag a portfolio
  average down every time somebody adds a row.
- **One copy of what "paid" and "committed" mean.** They are in
  `src/lib/planner/summary.ts`. 0083 groups and sums in Postgres - because
  reading every row to add it up hits PostgREST's unannounced thousand-row
  cap, which 0068 records the admin table falling into - but it deliberately
  does not decide what the sums mean. A second copy in SQL would drift, and
  the copy that drifted would be the one somebody budgets against.
- **One copy of what a filter keeps.** `src/lib/planner/filter.ts`. The
  in-memory store applies it; `planner-service` translates it into
  PostgREST. Every predicate is the simplest shape that translates
  one-to-one, because only the first of those two can be run from a clone.
- **An order is referenced, never owned.** Importing a Press Parrot order
  copies five fields and stores `order_item_id`. A planner status is
  somebody tidying their own board and must not cancel a placement we are
  delivering; a planner price must not change what was charged. 0082 makes
  "import twice, get one" a unique index rather than a check the caller
  remembers.

`gap_projects` carries the planner's project settings; `planner_links`,
`planner_months`, `planner_statuses` and `planner_sources` are the
customer's own, each with one policy scoped to `user_id` on `using` *and*
`with check`, and **no admin policy at all**. That is the deliberate
difference from everything else here: the table holds which suppliers an
agency uses and what they pay them, and an ambient grant over that is a
standing invitation to price against them.

## The header and footer menus

Three lists an administrator edits in /admin/menus: the header signed out,
the header signed in, and the footer. They were arrays in
`src/lib/config/navigation.ts`, and those arrays are still what the site
renders when nothing is stored.

- **No row means the code.** `navigation_menus` holds a row only for a menu
  somebody has saved, so the table is empty on the day it ships and an empty
  table is the navigation that was already there. Reset is a `delete`, never
  a write of today's defaults - a menu frozen at this release's footer is the
  one that never gets the page added in the next one. Same arrangement as
  `PageSections` and its fallback.
- **One shape for all three.** A header dropdown and a footer column are both
  a labelled node with children, so there is one type, one validator and one
  editor. What differs is only the drawing, and that lives in the components.
  One level of nesting: neither a dropdown nor a column has anywhere to put a
  grandchild.
- **It is the one internal-looking table that anybody may read.** A menu is
  the navigation printed into every public page, and a header a signed-out
  visitor could not read would be a header they could not see. Writing is
  admin-only, which is the half that matters: these links go into everybody's
  markup, so `safeHref` in `src/lib/navigation/menus.ts` keeps a path, an
  http(s) URL, a `mailto:` or a `tel:` and drops the rest - on the way out as
  well as in, because a row can predate a rule.
- **The components take the menu as a prop.** A header that imported
  `mainNav` would render perfectly and ignore every edit, and nothing in a
  type system catches that, which is why `verify:menus` asserts the import is
  absent.

## The service pages

/link-building and /niche-edits are drawn by their own compositions;
/buy-backlinks, /digital-pr, /link-building-agencies and the service starter
are still drawn by `ServicePage`. All of them take their words from the same
place - the page's row in the CMS, falling back to the shipped defaults in
`src/lib/cms/pages/` - so a composition decides the drawing and never the
copy, and a section saved in /admin/pages still replaces the whole thing.

- **A redraw keeps every word.** `scripts/service-redraw.mts` renders the old
  template and the new composition from the same content and compares them:
  every paragraph, every bullet, every question and its answer, every
  destination the old page linked to, both structured-data documents.
  `verify:link-building` and `verify:niche-edits` are that comparison plus
  what is particular to each page. The failure it exists for is a silent one
  - a paragraph stops being rendered, nothing says so, and a month later the
  ranking has moved and nobody connects the two.
- **Nothing is hidden until JavaScript arrives.** `Reveal` hides only what it
  has armed in the browser, so the server-rendered HTML carries the whole
  page and the suites assert that no element arrives armed and no inline rule
  hides anything. The headline's entrance moves it and never fades it,
  because an element at `opacity: 0` is one the browser has not painted and
  the largest painted element is what LCP is measured on.
- **The demonstration on /niche-edits runs on CSS alone.** Five stages on one
  timeline with `both` fill, so the illustration is in its finished state
  before anything runs and stays there if nothing does. A reader who never
  sees it animate sees an article with a link in it, which is the argument
  the page is making.
- **What both pages share has one copy.** `OrderSteps` (the four steps of an
  order), `ServiceCta`, `MarketplaceMock` and the motion kit in
  `page-motion.tsx`. Two service pages describing the same order flow in
  their own words are two descriptions to keep true, and nobody reads two
  service pages side by side to notice that one has stopped being so.
- **An illustration must not look like a listing.** The drawings on
  /niche-edits invent an article and three figures, and every one of them is
  captioned as an example and hidden from assistive technology. A publisher's
  real page with real metrics beside it would be showing inventory nobody
  gave us permission to show; made-up figures presented as measured are a
  claim about a site. `verify:niche-edits` checks the captions and checks no
  domain is named anywhere on the page.

## Taking payment

Stripe Checkout, hosted by Stripe: the customer is redirected and pays on
`checkout.stripe.com`, so there is no publishable key and no Stripe.js in
the codebase. `docs/stripe-setup.md` is the setup, including the parts that
only bite once.

- **The order is written before the customer leaves.** An order created
  after payment would mean somebody who paid and then lost their connection
  was charged with nothing on record to attach the money to. The cost is
  that an abandoned checkout leaves a row, which is why a customer's next
  checkout rewrites their open order rather than writing another - after
  expiring the previous Stripe session, because a session stays payable for
  24 hours and the webhook finds orders by session id.
- **Only the webhook marks an order paid.** The customer returning to the
  success page is not evidence: they can close the tab, lose signal, or
  visit that URL themselves. `src/app/api/stripe/webhook/route.ts` verifies
  the signature against the raw body, claims the event id so a redelivery is
  acted on once, and answers 500 on a failure it cannot resolve so Stripe
  retries.
- **`payment_status = 'processing'` means checkout opened, not that money
  arrived.** The enum says so in 0011. It was read as "Payment received" on
  the orders page, and every abandoned checkout told a customer their card
  had been charged. `paymentWording` in `src/components/shared/status-badge.tsx`
  is the one copy of what each state is called; `isPlaced` in
  `src/lib/orders/placed.ts` is the one copy of what counts as bought.
- **Stripe works out the tax, not us.** Sessions carry `automatic_tax`, so
  Stripe applies the rate for the billing address it collected and any VAT
  number entered. It also refuses to open a session at all when Tax has no
  origin address, and says nothing about tax when it does - the customer
  just sees that checkout would not open.
- **Readiness is measured, not configured.** `/admin/diagnostics` asks
  Stripe whether the key is live, the account can charge, Tax is active and
  an endpoint points here, because an afternoon of sandbox payments passed
  every test of the form "is the variable set". The one thing it cannot ask
  is whether the stored webhook secret belongs to that endpoint - Stripe
  shows a signing secret once - so the last verified delivery is reported
  beside it as the only proof there is.

## Where it runs

The functions run in `lhr1` and the database is in London. They have to match,
and `vercel.json` pins it rather than leaving it to a dashboard setting nobody
can see from here.

This is not a preference. Every query this application makes is an HTTP round
trip to Supabase, and with the functions in `iad1` - Vercel's default, in
Washington - one of them cost **131ms before the database did any work**. The
homepage's reads totalled 1,318ms; moving the functions to London took the
same reads to 434ms, and no query was changed to do it.

So before optimising a query, check what a round trip costs: `/admin/diagnostics`
times each of the homepage's reads against the live database and prints a
measured baseline to read them against. A page that makes four queries cannot
go faster than four baselines, and that arithmetic decides whether the work is
in the SQL or in the infrastructure. Changing the region in the Vercel
dashboard will not take effect while `vercel.json` names one.

## Verification

`npm run verify:all` runs every suite below and reports which failed rather
than stopping at the first, and `.github/workflows/verify.yml` runs the same
thing on every pull request, split into three: lint, types and build; the
suites that need nothing; and the three that need a local Postgres. The list
is read out of `package.json` by `scripts/run-verify.mjs`, so a suite added
there is a suite CI runs - there is no second list to keep up to date, which
is also why the count is not written down here.

Nothing in CI holds a secret, and nothing in it deploys. Every suite is
written to need no key, no network and no database, which is what lets the
checks run on a fork's pull request; Vercel builds the repository through its
own integration and nothing here should take that over.

- `npm run verify:rls` — replays every migration into a local Postgres and
  asserts the policies, as each role. Fails the run on any assertion that
  prints false, on a migration that is not safe to run twice, and on a
  flattened `.paste.sql` copy that has drifted from its migration. Every
  assertion is phrased so that passing prints true, including the half dozen
  that read as statements of fact - "the nightly import is off by default" -
  because a checker cannot tell a wrong answer from a right one worded
  backwards. Keep it that way when adding one.
- `npm run verify:stripe` - whether this deployment can take real money: live
  key or test, an endpoint in this mode pointing at our URL subscribed to both
  events, and what the one sentence at the top of the readiness panel says. No
  key, no network - these are the judgements, and the screen asks Stripe for
  the facts. Worth being exhaustive about because of how the failure presents:
  a check reporting what is configured rather than what is true shows a tick
  beside a site taking sandbox payments.
- `npm run verify:menus` — the header and footer menus: where a menu item may
  point, what survives being read back out of the column, and that the shipped
  menus come through the validator unchanged. It also asserts that the header
  and the footer take their menus as props rather than importing the arrays,
  which is the one way this feature can be quietly inert. No API key, no
  database, no network.
- `npm run verify:link-building` and `npm run verify:niche-edits` — that the
  two redrawn service pages still say everything the template said. Both
  render the old `ServicePage` and the new composition from the same shipped
  content and compare them, through `scripts/service-redraw.mts`; what each
  adds is its own page's illustrations and the claims they must not make. No
  key, no database, no network, no browser.
- `npm run verify:import` — the CSV importer.
- `npm run verify:enquiries` — what the pricing page's enquiry form accepts
  and refuses, and what survives the cleaning on the way to the column. No
  key, no database, no network. Worth being exhaustive about because it is
  the only form on the site a stranger can submit, and both directions cost:
  a rule too strict loses an agency that wanted to spend money and says
  nothing, while a rule too loose is a row the database refuses, which the
  person experiences as the form being broken.
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
- `npm run verify:planner` — the Link Building Planner's arithmetic and rules:
  what a month totals, what the reports say, which rows a filter keeps, what
  order they come back in, and what a spreadsheet becomes on the way in and
  out. It also asserts that grouping rows before summing them changes no
  figure, which is what 0083 rests on. No API key, no
  database, no network - and no lookup of any kind, which is the feature
  rather than an economy. What it cannot prove is the translation in
  `planner-service`: the filter and the comparator are applied directly here
  and turned into PostgREST there, and only the first of those runs from a
  clone. Every predicate in `src/lib/planner/filter.ts` is the simplest shape
  that translates one-to-one for that reason.
- `npm run verify:search` — that the marketplace's database-side search returns
  exactly what the browser-side filter it replaces returned. The same fixtures
  are inserted into a real Postgres and built as `WebsiteListItem`s, and every
  filter, every sort key and the topic repricing are run through both, with the
  id sequences compared in order. Needs the same local Postgres `verify:rls`
  wants. A port like this fails quietly - a customer sees a slightly different
  set of publishers and nothing says so - so neither side is trusted.
