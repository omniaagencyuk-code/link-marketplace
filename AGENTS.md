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

## Verification

- `npm run verify:rls` — replays every migration into a local Postgres and
  asserts the policies, as each role.
- `npm run verify:import` — the CSV importer.
- `npm run verify:sourcing` — mbox reading and the review rules. Needs no API
  key and no database.
