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
