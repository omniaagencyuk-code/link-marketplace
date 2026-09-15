# Supabase setup

The application runs entirely on mock data today. Nothing in this folder is
required to start the app locally. Follow these steps when you are ready to
move the marketplace onto a real database.

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and create a new project.
2. Choose a region close to your users (London for a UK-first marketplace).
3. Save the database password somewhere safe.

## 2. Apply the schema

**Option A - SQL editor (fastest)**

Open the SQL editor in the Supabase dashboard and run the migration files in
order:

1. `migrations/0001_init.sql` - tables, enums, indexes, `updated_at` triggers
   and the `auth.users` -> `profiles` trigger.
2. `migrations/0002_rls.sql` - row level security policies.
3. `migrations/0003_seed_reference_data.sql` - categories and the settings row.
4. `migrations/0004_content_orders.sql` - content orders, articles, revisions,
   messages and deliveries.
5. `migrations/0005_cms.sql` - editable page content and the blog.
6. `migrations/0006_gate_marketplace.sql` - **important.** Replaces the public
   read policies from 0002 with signed-in-only ones. Without this the anon key
   would expose the whole publisher list through the REST API, undoing the
   access control the application enforces everywhere else. Also adds the
   `marketplace_stats()` function the public pages use for their counts, and
   the import history table.

Run all six, in order. Running 0001-0003 alone leaves the inventory publicly
readable.

**Option B - Supabase CLI**

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## 3. Add the environment variables

Copy `.env.example` to `.env.local` in the project root and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server-side only, never commit
NEXT_PUBLIC_DATA_SOURCE=supabase
```

Both public keys are found under **Project Settings → API**.

## 4. Import the website inventory

The 72 seed websites live in `src/lib/data/websites.raw.ts`. Write a one-off
import script that reads that array and inserts into `websites` and `services`
using the service role key, or export it to CSV and use the Supabase table
import UI. The column names map one to one onto the fields in
`src/lib/types/website.ts`.

## 5. Switch the service layer over

Every component reads data through `src/lib/services/*`. Nothing imports the
mock JSON directly. To migrate:

1. Install the client: `npm install @supabase/supabase-js @supabase/ssr`.
2. Add `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts`
   (server components, using cookies) following the Supabase Next.js guide.
3. For each service, add a Supabase implementation and select it with the
   `dataSource` flag in `src/lib/services/data-source.ts`:

```ts
export const websiteService =
  dataSource === 'supabase' ? supabaseWebsiteService : mockWebsiteService;
```

The method signatures are already async and already return the same shapes, so
no component or page needs to change.

## 6. Connect authentication

`src/lib/providers/auth-provider.tsx` holds the mock session. Replace the three
placeholder calls:

| Mock call         | Supabase replacement                        |
| ----------------- | ------------------------------------------- |
| `signIn(email)`   | `supabase.auth.signInWithPassword({ ... })` |
| `signUp(email)`   | `supabase.auth.signUp({ ... })`             |
| `signOut()`       | `supabase.auth.signOut()`                   |

Then add `middleware.ts` to refresh the session cookie, and protect
`/dashboard` and `/admin` server-side. The development guard in
`src/components/admin/admin-guard.tsx` must be swapped for a real check against
`profiles.role` at that point.

## 7. Move favourites and orders off localStorage

`favourites-provider.tsx` and `order-draft-provider.tsx` persist to
localStorage. Once auth is live, write to the `favourites` and
`orders` / `order_items` tables instead. The provider APIs stay the same, so
the UI does not change.

## Table overview

| Table                | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `profiles`           | One row per auth user, holds role and plan            |
| `categories`         | Marketplace niches                                    |
| `websites`           | Publisher inventory, metrics and publishing rules     |
| `website_categories` | Secondary niches (many to many)                       |
| `services`           | Guest post / niche edit / digital PR offers and prices|
| `orders`             | Customer orders                                       |
| `order_items`        | One placement per row                                 |
| `favourites`         | Saved websites per user                               |
| `settings`           | Editable brand and marketplace defaults (single row)  |

All tables use UUID primary keys plus `created_at` and `updated_at`
timestamps, with an `updated_at` trigger applied on update.
