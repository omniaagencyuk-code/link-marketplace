# Rollbacks

One file per migration that can be undone, named for the migration it
reverses. Running one leaves the database as though that migration had never
been applied.

These are not run automatically and are not part of `verify:rls`. They exist
so a feature can be backed out from the Supabase SQL editor without waiting
for someone to write the undo under pressure.

Every file says at the top what it destroys. Read that first: a rollback that
drops a table drops the rows in it, and no rollback here asks for
confirmation.

Migrations before 0019 have no rollback file. They are the marketplace
itself - websites, orders, payments - and undoing them is not a
back-this-feature-out operation but a restore-from-backup one.

| Rollback | Undoes | Destroys |
|---|---|---|
| `0019_publisher_sourcing_down.sql` | `0019_publisher_sourcing.sql` | Imported emails, unapproved drafts, extraction history, publisher cost and commercial terms. Listings already approved from drafts are ordinary listings and survive. |
| `0043_country_nobody_stated_down.sql` | `0043_country_nobody_stated.sql` | Every market the backfill established, and every one an administrator has set since. The column goes back to `not null`, so unknown has to become something: everything unknown becomes `GB` again, which is the state 0043 was written to fix. |
| `0044_country_source_down.sql` | `0044_country_source.sql` | The record of where each country came from. The countries survive, but the nightly Ahrefs refresh can no longer tell a country a person chose from one it worked out itself, and the invented United Kingdom marked `default` becomes indistinguishable from a real one. |
| `0045_refresh_one_tier_down.sql` | `0045_refresh_one_tier.sql` | Nothing. It drops the two-argument form of the due-domains selection, leaving the one-argument form from 0013. Only run it alongside application code that does not pass a tier, or every run fails its RPC call. |
| `0046_link_monitoring_down.sql` | `0046_link_monitoring.sql` | Every monitoring row: which links were checked, which were lost and when, and every guarantee claim with the amount it was opened for. The durability scores go with them and cannot be recomputed afterwards. Take a dump of the three tables first if any claim has ever been opened. |
| `0047_promo_codes_down.sql` | `0047_promo_codes.sql` | Every promo code and every redemption of one. Orders keep the amount taken off them only until the three columns go with it, after which a discounted order reads as though it was sold at a price nobody charged. Stripe coupons are left alone - archive them in the Stripe dashboard if you want them gone. |
| `0048_description_runs_down.sql` | `0048_description_runs.sql` | The record of which description sweeps have run, and of which listings have already been read. The descriptions themselves survive. Losing the read record means the next sweep works through the whole inventory again, including the homepages already known to carry nothing usable. |
