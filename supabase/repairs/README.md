# Repairs

One-off statements that change production **data**, not schema.

They live here for the same reason migrations do: a change to live data with
nothing recording it is a change nobody can check afterwards. A migration is
replayed into every database and must be safe to run twice; a repair is run
once, against one database, to undo damage a bug did before it was fixed.

Rules, which are the migrations' rules minus the replay:

- **Name the bug it repairs**, in the file, with what was observed.
- **Re-runnable anyway.** `on conflict do nothing` or an equivalent guard, so
  a second paste is not a second change.
- **Never guess a value.** A repair that invents data is worse than the damage;
  it looks repaired. Where the right answer is not recoverable, the repair
  leaves those rows alone and says so.
- **Not applied by `verify:rls`.** This folder is deliberately outside
  `migrations/`, so replaying every migration never replays a repair.

| File | Repairs |
|---|---|
| `0001_recover_lost_cost_currency.sql` | 410 listings holding a cost with no record of its currency. Their commercial terms were refused by the database at approval and the error was never checked, so `cost_currency` was lost while the cost was kept. Each listing takes the currency from its own publisher's draft - 409 EUR and one GBP, which is why it is per listing and not a blanket update. |
| `0002_the_copy_the_blocks_were_added_with.sql` | Homepage blocks still rendering the twelve-month traffic claim #68 removed. A component's `defaults` are copied into `page_sections.values` when an editor adds the block, so correcting the defaults never reaches a row that already exists. Matches on the exact strings that shipped, so a second paste finds nothing and a block somebody has since reworded is left alone rather than reverted. `section_drafts` on the same terms, or the old wording would come back the next time somebody published. |
| `0003_checkouts_nobody_finished.sql` | Order rows left behind by checkouts nobody finished - one per press of Pay, because the order is written before the customer is sent to Stripe so that a payment can never arrive with nothing to attach itself to. Three attempts at one basket left three orders in the admin list. The application no longer adds to them (a customer's next checkout rewrites their open order, after expiring the previous Stripe session); this clears what accumulated first. Only `draft`, only never paid, and only older than 25 hours - a Stripe session is payable for 24, and deleting an order whose session can still be paid is the one thing in this folder that would actually lose money. |
