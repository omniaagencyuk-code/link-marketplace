/**
 * Load the seed data into Supabase.
 *
 * Usage, with .env.local present:
 *   npx tsx scripts/seed-supabase.ts
 *   npx tsx scripts/seed-supabase.ts --reset   (delete existing rows first)
 *
 * Runs with the service role key, because it writes rows that belong to no
 * signed-in user and has to bypass row level security to do it. That key must
 * never reach the browser - this script is the reason it exists at all.
 *
 * Idempotent: websites and posts are matched on their unique slug, so running
 * it twice updates rather than duplicating.
 */
import { createClient } from '@supabase/supabase-js';
import { websites as seedWebsites } from '../src/lib/data/websites';
import { seedPosts } from '../src/lib/data/blog-posts';
import { categories as seedCategories } from '../src/lib/data/categories';
import { websiteToRow, postToRow } from '../src/lib/supabase/mappers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Put both in .env.local, then run: npx tsx scripts/seed-supabase.ts',
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const reset = process.argv.includes('--reset');

async function main() {
  if (reset) {
    console.log('Resetting seeded tables...');
    // Services and website_categories cascade from websites.
    await supabase.from('websites').delete().neq('slug', '');
    await supabase.from('posts').delete().neq('slug', '');
  }

  // ---------------------------------------------------------- categories
  console.log(`Categories: upserting ${seedCategories.length}...`);
  const { error: categoryError } = await supabase.from('categories').upsert(
    seedCategories.map((category, index) => ({
      slug: category.slug,
      name: category.name,
      description: category.description ?? '',
      position: index,
      featured: category.featured ?? true,
    })),
    { onConflict: 'slug' },
  );
  if (categoryError) throw new Error(`categories: ${categoryError.message}`);

  const { data: categoryRows } = await supabase.from('categories').select('id, slug');
  const categoryId = new Map(
    (categoryRows ?? []).map((row) => [row.slug as string, row.id as string]),
  );

  // ------------------------------------------------------------ websites
  console.log(`Websites: upserting ${seedWebsites.length}...`);
  let created = 0;

  for (const website of seedWebsites) {
    const row = {
      ...websiteToRow(website),
      slug: website.slug,
      domain: website.domain,
      title: website.title,
      primary_category_id: categoryId.get(website.niche) ?? null,
    };

    const { data, error } = await supabase
      .from('websites')
      .upsert(row, { onConflict: 'slug' })
      .select('id')
      .single();
    if (error) throw new Error(`${website.domain}: ${error.message}`);

    // Services are replaced wholesale rather than merged - the seed file is
    // the source of truth for them, and matching on type would leave stale
    // rows behind if a website stopped offering one.
    await supabase.from('services').delete().eq('website_id', data.id);
    if (website.services.length) {
      const { error: serviceError } = await supabase.from('services').insert(
        website.services.map((service) => ({
          website_id: data.id,
          type: service.type,
          price_minor: service.priceMinor,
          turnaround_min_days: service.turnaroundMinDays,
          turnaround_max_days: service.turnaroundMaxDays,
          available: service.available,
          note: service.note ?? null,
        })),
      );
      if (serviceError) throw new Error(`${website.domain} services: ${serviceError.message}`);
    }

    // Secondary niches, through the join table.
    await supabase.from('website_categories').delete().eq('website_id', data.id);
    const secondaryIds = website.secondaryNiches
      .map((niche) => categoryId.get(niche))
      .filter((id): id is string => Boolean(id));
    if (secondaryIds.length) {
      await supabase
        .from('website_categories')
        .insert(secondaryIds.map((id) => ({ website_id: data.id, category_id: id })));
    }

    created += 1;
    if (created % 20 === 0) console.log(`  ${created}/${seedWebsites.length}`);
  }

  // ---------------------------------------------------------------- blog
  console.log(`Posts: upserting ${seedPosts.length}...`);
  const { error: postError } = await supabase
    .from('posts')
    .upsert(seedPosts.map(postToRow), { onConflict: 'slug' });
  if (postError) throw new Error(`posts: ${postError.message}`);

  // ------------------------------------------------------------ settings
  const { count } = await supabase.from('settings').select('id', { count: 'exact', head: true });
  if (!count) {
    console.log('Settings: inserting the default row...');
    await supabase.from('settings').insert({});
  }

  // -------------------------------------------------------------- report
  const [{ count: websiteCount }, { count: postCount }, { count: serviceCount }] =
    await Promise.all([
      supabase.from('websites').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('id', { count: 'exact', head: true }),
      supabase.from('services').select('id', { count: 'exact', head: true }),
    ]);

  console.log('\nDone.');
  console.log(`  websites:   ${websiteCount}`);
  console.log(`  services:   ${serviceCount}`);
  console.log(`  posts:      ${postCount}`);
  console.log(`  categories: ${categoryId.size}`);
}

main().catch((error) => {
  console.error('\nSeeding failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
