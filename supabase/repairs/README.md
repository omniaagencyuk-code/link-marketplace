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
