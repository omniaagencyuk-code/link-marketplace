import { redirect } from 'next/navigation';

/**
 * Legacy marketplace URL.
 *
 * The marketplace now lives at /marketplace, which serves the signed-out
 * gateway as well as the listings. Existing links and bookmarks land there,
 * carrying any search or filter they arrived with.
 *
 * `proxy.ts` gates this path too, so a signed-out visitor is sent to the
 * gateway before this component ever runs.
 */
export default async function WebsitesIndexRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const query = params.toString();
  redirect(query ? `/marketplace?${query}` : '/marketplace');
}
