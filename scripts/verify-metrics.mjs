import { chromium } from 'playwright';
const BASE = 'http://localhost:3100';
const fails = [];
const ok = (l) => console.log(`  PASS  ${l}`);
const bad = (l, d) => { fails.push(l); console.log(`  FAIL  ${l}${d ? ` - ${d}` : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));

// A separate, customer-authenticated context. Listing pages are gated, so
// fetching them without a customer session returns the gateway and every
// assertion about their contents would pass for the wrong reason.
const shopper = await browser.newContext();
const shopperPage = await shopper.newPage();
await shopperPage.goto(`${BASE}/login`);
await shopperPage.getByLabel(/email/i).fill('buyer@example.com');
await shopperPage.getByLabel(/password/i).fill('whatever-in-mock-mode');
await shopperPage.getByRole('button', { name: /log in|sign in/i }).first().click();
await shopperPage.waitForURL(/\/dashboard/, { timeout: 15000 });

async function listingHtml(slug) {
  const response = await shopperPage.request.get(`${BASE}/websites/${slug}`);
  const body = await response.text();
  if (!body.includes('SEO Metrics')) {
    throw new Error(`Listing page not reachable as a customer (status ${response.status()})`);
  }
  // React's server render puts <!-- --> between adjacent text nodes, so
  // "82% of the audience" arrives as "82<!-- -->% of the audience". Strip the
  // separators before matching, or every assertion about a sentence
  // containing an interpolated value fails for a reason that is not a bug.
  return body.replace(/<!--.*?-->/g, '');
}

await page.goto(`${BASE}/admin/login`);
await page.getByRole('button', { name: /shared team password/i }).click();
await page.getByLabel('Your work email').fill('james@omniaagency.co');
await page.getByLabel('Shared password').fill('testpw123');
await page.getByRole('button', { name: /sign in with shared password/i }).click();
await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });

// --- add a site the way a person would, leaving the metrics blank
const domain = `metrics-${Date.now().toString(36)}.com`;
await page.goto(`${BASE}/admin/websites/new`);
for (const label of ['Audience in primary country (%)', '6 month traffic change (%)', 'Spam score (%)']) {
  (await page.getByLabel(label).count()) === 1 ? ok(`admin has "${label}"`) : bad(`admin has "${label}"`);
}
await page.getByLabel('Domain*').fill(domain);
await page.locator('input[name="price_guest-post"]').fill('250');
await page.getByLabel('Country', { exact: true }).selectOption('GB');
await page.getByLabel('Listing status').selectOption('active');
await page.getByRole('button', { name: /create website/i }).click();
await page.waitForURL(/\/admin\/websites$/, { timeout: 15000 });
ok('created a site with the metrics left blank');

// --- the public listing must not invent zeros
const slug = domain.replace(/\./g, '-');
const html = await listingHtml(slug);

/0% of the audience is based in/.test(html)
  ? bad('no "0% of the audience" claim', 'still present')
  : ok('no "0% of the audience" claim');
/primary market is United Kingdom/.test(html)
  ? ok('says the primary market without inventing a share')
  : bad('says the primary market without inventing a share');
/Spam score/.test(html) ? bad('spam score row hidden when unmeasured') : ok('spam score row hidden when unmeasured');
/6 month trend/.test(html) ? bad('trend row hidden when unmeasured') : ok('trend row hidden when unmeasured');
/Not recorded/.test(html) ? ok('trend cell says "Not recorded"') : bad('trend cell says "Not recorded"');

// --- now record a figure and confirm it is published
await page.goto(`${BASE}/admin/websites`);
await page.locator('tr', { hasText: domain }).first().getByRole('link').first().click();
await page.waitForURL(/\/admin\/websites\/[^/]+$/, { timeout: 15000 });
await page.getByLabel('Audience in primary country (%)').fill('82');
await page.getByLabel('Spam score (%)').fill('0');
await page.getByRole('button', { name: /save changes/i }).click();
await page.waitForURL(/\/admin\/websites$/, { timeout: 15000 });

const html2 = await listingHtml(slug);
/82% of the audience is based in United Kingdom/.test(html2)
  ? ok('an entered share is published') : bad('an entered share is published');
/Spam score/.test(html2) ? ok('a genuine zero spam score IS shown') : bad('a genuine zero spam score IS shown');

// --- and clearing it again removes the claim
await page.goto(`${BASE}/admin/websites`);
await page.locator('tr', { hasText: domain }).first().getByRole('link').first().click();
await page.waitForURL(/\/admin\/websites\/[^/]+$/, { timeout: 15000 });
(await page.getByLabel('Audience in primary country (%)').inputValue()) === '82'
  ? ok('the entered value round-trips') : bad('the entered value round-trips');
await page.getByLabel('Audience in primary country (%)').fill('');
await page.getByRole('button', { name: /save changes/i }).click();
await page.waitForURL(/\/admin\/websites$/, { timeout: 15000 });

const html3 = await listingHtml(slug);
/82% of the audience/.test(html3)
  ? bad('clearing the field removes the claim', 'still says 82%')
  : ok('clearing the field removes the claim');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
