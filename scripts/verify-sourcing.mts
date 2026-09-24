/**
 * Prove the mbox reader does what the ingestion step depends on.
 *
 * No API key and no database: this is the half of the pipeline that decides
 * which messages ever reach the model, so it has to be checkable on its own.
 * If this is wrong, extraction is wrong and it costs money to find out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readMbox, readPastedEmail, domainFromSubject, stripQuotedHistory } from '../src/lib/sourcing/mbox';
import { extractionResultSchema, fromWire, wireResultSchema, type ExtractedListing } from '../src/lib/sourcing/schema';
import { applyGeneralPriceToNiches, countLowConfidence, expandListings, flagsFor, sellableNiches } from '../src/lib/sourcing/review';
import { sensitiveNicheSlugs } from '../src/lib/config/accepted-niches';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);

const raw = fs.readFileSync(path.join(process.cwd(), 'scripts/fixtures/sourcing-synthetic.mbox'), 'utf8');
const { messages, skipped } = readMbox(raw);

console.log('\n--- what was read ---');
is('every message is separated', messages.length + skipped.length, 12);
is('our own outreach is skipped', skipped.filter((s) => s.reason === 'ours').length, 1);
is('the bounce is skipped', skipped.filter((s) => s.reason === 'bounce').length, 1);
is('the rest are kept', messages.length, 10);

console.log('\n--- headers ---');
const network = messages.find((m) => m.fromAddress === 'mette@holdsport.example');
network ? ok('a sender address is parsed out of "Name <addr>"') : bad('sender parsed');
is('the display name comes through', network?.fromName, 'Mette Holm');
is('the date is an ISO timestamp', network?.sentAt?.slice(0, 10), '2026-09-22');

console.log('\n--- the domain we asked about ---');
is('recovered from the subject', network?.askedAboutDomain, 'holdsport.example');
is('a Re: prefix does not hide it', domainFromSubject('Re: Advertisements on foo.example'), 'foo.example');
is('a German AW: prefix does not either', domainFromSubject('AW: Advertisements on foo.example'), 'foo.example');
is('"your website" is not a domain', domainFromSubject('Re: Advertisements on your website'), undefined);
is('www is stripped', domainFromSubject('Advertisements on www.foo.example'), 'foo.example');
const noDomain = messages.find((m) => m.fromAddress === 'redaktion@klatschrunde.example');
is('so that email has none', noDomain?.askedAboutDomain, undefined);

console.log('\n--- encodings ---');
const base64 = messages.find((m) => m.fromAddress === 'priya@businessvantage.example');
/General topics — £100/.test(base64?.bodyText ?? '')
  ? ok('base64 bodies decode, em dash and pound intact') : bad('base64 decodes', base64?.bodyText?.slice(0, 60));
/Crypto, forex, loans — £150/.test(base64?.bodyText ?? '')
  ? ok('and the whole rate list survives') : bad('base64 rate list');
const qp = messages.find((m) => m.fromAddress === 'giulia.zanotti@webmail.example');
/perché la casella/.test(qp?.bodyText ?? '')
  ? ok('quoted-printable decodes accented text') : bad('quoted-printable', qp?.bodyText?.slice(0, 80));
const german = noDomain?.bodyText ?? '';
/Mit freundlichen Grüßen/.test(german) ? ok('German umlauts and eszett survive') : bad('German text', german.slice(0, 60));

console.log('\n--- html-only replies ---');
const html = messages.find((m) => m.fromAddress === 'camila@modabolha.example');
/R\$1\.130/.test(html?.bodyText ?? '') ? ok('an html rate table becomes readable text') : bad('html table', html?.bodyText?.slice(0, 120));
/R\$980/.test(html?.bodyText ?? '') ? ok('both payment rates are kept') : bad('second html rate');
!/<table>|<td>/.test(html?.bodyText ?? '') ? ok('no markup reaches the model') : bad('markup stripped');
/Olá Jack/.test(html?.bodyText ?? '') ? ok('html entities are decoded') : bad('entities decoded', html?.bodyText?.slice(0, 40));

console.log('\n--- quoted history ---');
const stripped = messages.filter((m) => /I'm getting in touch about advertising/.test(m.bodyText));
is('our outreach is gone from every reply', stripped.length, 0);
messages.every((m) => m.bodyText.trim().length > 0) ? ok('and no body was emptied by the strip') : bad('a body was emptied');
messages.some((m) => /I'm getting in touch about advertising/.test(m.bodyRaw))
  ? ok('the raw body still has it, for a re-read') : bad('raw body kept');

is(
  'an English "On ... wrote:" marker cuts',
  stripQuotedHistory('Yes, 150 EUR.\n\nOn Mon, 22 Sep 2026 at 09:14, Jack <j@x.com> wrote:\n> our email'),
  'Yes, 150 EUR.',
);
is(
  'a German "Am ... schrieb ...:" marker cuts',
  stripQuotedHistory('Preis 150 EUR.\n\nAm 22.09.2026 um 09:14 schrieb Jack:\n> unsere Mail'),
  'Preis 150 EUR.',
);
is(
  'a body that is entirely quoted is kept whole',
  stripQuotedHistory('> only quoted lines here').length > 0,
  true,
);

console.log('\n--- pasting one email ---');
const pasted = readPastedEmail('Hi Jack,\n\nGuest post is 200 GBP.\n\nThanks', 'editor@site.example');
is('a bare body is accepted', pasted?.bodyText.includes('200 GBP'), true);
is('and given an address from the form', pasted?.fromAddress, 'editor@site.example');
const pastedTwice = readPastedEmail('Hi Jack,\n\nGuest post is 200 GBP.\n\nThanks', 'editor@site.example');
is('pasting the same text twice dedupes to one id', pasted?.messageId, pastedTwice?.messageId);
const withHeaders = readPastedEmail(
  'From: Ed <ed@site.example>\nSubject: Re: Advertisements on site.example\nMessage-ID: <abc@x>\n\nRate is 300 EUR.',
);
is('headers are used when pasted', withHeaders?.fromAddress, 'ed@site.example');
is('including the domain we asked about', withHeaders?.askedAboutDomain, 'site.example');

console.log('\n--- re-reading the same export ---');
const again = readMbox(raw);
is('produces the same message ids', again.messages.map((m) => m.messageId).join(), messages.map((m) => m.messageId).join());
const doubled = readMbox(`${raw}\n${raw}`);
is('and a doubled file still yields each message once', doubled.messages.length, messages.length);

// ---------------------------------------------------------------------------
// The review rules. These decide what a human is shown and what a bulk
// action is allowed to touch, so they are checked without a key or a database.

/** A listing with everything unstated, which is what most fields really are. */
function blank(over: Partial<ExtractedListing> = {}): ExtractedListing {
  return {
    domain: 'test.example', relationship: null,
    contact_email: null, contact_name: null, contact_notes: null,
    language: null, currency: null,
    guest_post_cost: null, guest_post_cost_written_by_publisher: null,
    link_insertion_cost: null, homepage_link_cost: null, homepage_link_period: null,
    banner_cost: null, banner_period: null,
    niches: Object.fromEntries(
      sensitiveNicheSlugs.map((slug) => [slug, { accepted: 'unknown', guest_post_cost: null, link_insertion_cost: null }]),
    ),
    dofollow: 'unknown', sponsored_tag: 'unknown', dofollow_expires_after_months: null,
    permanence: 'unknown', min_live_months: null,
    min_word_count: null, max_word_count: null, max_links: null,
    turnaround_min_days: null, turnaround_max_days: null,
    link_insertion_offered: 'unknown', homepage_placement: 'unknown', topic_restriction: null,
    prices_exclude_vat: null, vat_notes: null, payment_methods: [], payment_timing: 'unknown',
    minimum_order: null, bulk_discount_notes: null, price_valid_until: null, future_price_notes: null,
    notes: null, confidence: [], evidence: [], also_applies_to: [],
    ...over,
  };
}

/** The parsed listing really carries the entry, rather than dropping it. */
function wellFormedConfidence(result: ReturnType<typeof extractionResultSchema.safeParse>): boolean {
  if (!result.success) return false;
  const entries = result.data.listings[0]?.confidence ?? [];
  return entries.length === 1 && entries[0]!.level === 'low';
}

/**
 * The schema actually sent to the API must have somewhere to put an entry.
 * A closed, empty object type-checks and passes every local test while
 * making the field impossible to populate - which is exactly what happened.
 */
function generatedSchemaAcceptsEntries(): boolean {
  const format = zodOutputFormat(extractionResultSchema) as unknown as Record<string, any>;
  const listing = (format.schema ?? format.json_schema?.schema)?.properties?.listings?.items;
  const node = listing?.properties?.confidence;
  if (node?.type !== 'array') return false;
  const entry = node.items;
  return entry?.type === 'object' && Boolean(entry.properties?.field) && Boolean(entry.properties?.level);
}

/** Union-typed nodes in the schema actually sent to the API. */
function countUnions(): number {
  const format = zodOutputFormat(wireResultSchema) as unknown as Record<string, any>;
  let count = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.type) || node.anyOf || node.oneOf) count += 1;
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  };
  walk(format.schema ?? format.json_schema?.schema);
  return count;
}

console.log('--- the schema ---');
const wellFormed = extractionResultSchema.safeParse({ usable: true, ignore_reason: null, listings: [blank()] });
is('a complete listing validates', wellFormed.success, true);
is(
  'a missing field is rejected rather than defaulted',
  extractionResultSchema.safeParse({ usable: true, ignore_reason: null, listings: [{ domain: 'x.example' }] }).success,
  false,
);
is(
  'a price of zero is rejected',
  extractionResultSchema.safeParse({ usable: true, ignore_reason: null, listings: [blank({ guest_post_cost: 0 })] }).success,
  false,
);
is(
  'an invented stance is rejected',
  extractionResultSchema.safeParse({
    usable: true, ignore_reason: null,
    listings: [blank({ niches: { ...blank().niches, gambling: { accepted: 'maybe', guest_post_cost: null, link_insertion_cost: null } } })],
  }).success,
  false,
);
is('every sensitive niche has a slot', Object.keys(blank().niches).length, 7);

// The bug this shape exists to prevent: a Zod record compiles to a closed,
// empty object under strict JSON Schema, so the model could never return a
// confidence entry and every draft read as fully confident.
const withConfidence = extractionResultSchema.safeParse({
  usable: true, ignore_reason: null,
  listings: [blank({ confidence: [{ field: 'guest_post_cost', level: 'low' }], evidence: [{ field: 'guest_post_cost', quote: '150 EUR' }] })],
});
is('a confidence entry survives the schema', wellFormedConfidence(withConfidence), true);
is('and the generated JSON schema lets the model send one', generatedSchemaAcceptsEntries(), true);

// Structured outputs refuse a schema with more than 16 union-typed
// parameters, and every nullable field is a union. Thirty-odd optional
// fields put the first version 8 over the limit, and the request was
// rejected outright rather than degrading.
const unions = countUnions();
unions <= 16
  ? ok(`the wire schema has ${unions} union-typed parameters (limit 16)`)
  : bad('wire schema unions', `${unions} exceeds the limit of 16`);

console.log('\n--- sentinels on the wire ---');
const wire = wireResultSchema.safeParse({
  usable: true, ignore_reason: '',
  listings: [{
    domain: 'test.example', also_applies_to: [], relationship: '',
    contact_email: '', contact_name: '', contact_notes: '',
    language: '', currency: 'EUR',
    guest_post_cost: 150, guest_post_cost_written_by_publisher: 0,
    link_insertion_cost: 0, homepage_link_cost: 0, homepage_link_period: '',
    banner_cost: 0, banner_period: '',
    niches: Object.fromEntries(sensitiveNicheSlugs.map((slug) => [slug, { accepted: 'unknown', guest_post_cost: 0, link_insertion_cost: 0 }])),
    dofollow: 'yes', sponsored_tag: 'unknown', dofollow_expires_after_months: 0,
    permanence: 'unknown', min_live_months: 0, min_word_count: 0, max_word_count: 0, max_links: 0,
    turnaround_min_days: 1, turnaround_max_days: 5,
    link_insertion_offered: 'unknown', homepage_placement: 'unknown', topic_restriction: '',
    prices_exclude_vat: 'unknown', vat_notes: '', payment_methods: [], payment_timing: 'unknown',
    minimum_order: '', bulk_discount_notes: '', price_valid_until: '', future_price_notes: '',
    notes: '', confidence: [{ field: 'guest_post_cost', level: 'high' }], evidence: [],
  }],
});
is('a sentinel-filled reply validates', wire.success, true);

if (wire.success) {
  const converted = fromWire(wire.data);
  const listing = converted.listings[0]!;
  is('a real price survives', listing.guest_post_cost, 150);
  is('a zero price becomes not-stated', listing.link_insertion_cost, null);
  is('an empty string becomes not-stated', listing.contact_email, null);
  is('an empty period becomes not-stated', listing.banner_period, null);
  is('"unknown" VAT becomes not-stated', listing.prices_exclude_vat, null);
  is('a zero niche price becomes not-stated', listing.niches.gambling!.guest_post_cost, null);
  is('and the stance is untouched', listing.niches.gambling!.accepted, 'unknown');
  is('the converted listing satisfies the internal schema', extractionResultSchema.safeParse(converted).success, true);
  is('a single price with no topics is still flagged', flagsFor(listing).includes('single-price-confirm-niches'), true);
}
is('and loan is one of them', sensitiveNicheSlugs.includes('loan'), true);

console.log('\n--- single price with no topics named ---');
const single = blank({ guest_post_cost: 150, contact_email: 'a@b.example' });
is('is flagged for a human', flagsFor(single).includes('single-price-confirm-niches'), true);
is('and every niche is left unknown', Object.values(single.niches).every((n) => n.accepted === 'unknown'), true);

const spread = applyGeneralPriceToNiches(single);
is('the button prices all seven', Object.values(spread.niches).every((n) => n.guest_post_cost === 150), true);
is('and accepts them', Object.values(spread.niches).every((n) => n.accepted === 'yes'), true);
is('without touching the general price', spread.guest_post_cost, 150);

const withRefusal = applyGeneralPriceToNiches(
  blank({ guest_post_cost: 150, niches: { ...blank().niches, adult: { accepted: 'no', guest_post_cost: null, link_insertion_cost: null } } }),
);
is('an explicit refusal survives the button', withRefusal.niches.adult!.accepted, 'no');
is('and stays unpriced', withRefusal.niches.adult!.guest_post_cost, null);

console.log('\n--- a price with no currency ---');
{
  // The one that got through: a reply quoting 109 with no currency was
  // stored as a bare number and read as pounds by everything downstream.
  const noCurrency = blank({ guest_post_cost: 109, contact_email: 'a@b.example' });
  is('is flagged for a human', flagsFor(noCurrency).includes('price-without-currency'), true);

  const stated = blank({ guest_post_cost: 109, currency: 'USD', contact_email: 'a@b.example' });
  is('a stated currency is not', flagsFor(stated).includes('price-without-currency'), false);

  // No money quoted at all is a different problem, and not this one.
  const noPrice = blank({ contact_email: 'a@b.example' });
  is('a reply quoting nothing is not flagged for it', flagsFor(noPrice).includes('price-without-currency'), false);

  // A price hiding in the niche rate card counts just as much as a headline.
  const nicheOnly = blank({
    contact_email: 'a@b.example',
    niches: { ...blank().niches, gambling: { accepted: 'yes', guest_post_cost: 350, link_insertion_cost: null } },
  });
  is('a niche-only price still needs a currency', flagsFor(nicheOnly).includes('price-without-currency'), true);

  const banner = blank({ banner_cost: 50, contact_email: 'a@b.example' });
  is('and so does a banner price', flagsFor(banner).includes('price-without-currency'), true);
}

console.log('\n--- what is not flagged ---');
const itemised = blank({
  guest_post_cost: 100, contact_email: 'p@b.example',
  niches: { ...blank().niches, gambling: { accepted: 'yes', guest_post_cost: 350, link_insertion_cost: 350 } },
});
is('an itemised reply is not a single-price reply', flagsFor(itemised).includes('single-price-confirm-niches'), false);
is('a reply with a contact is not flagged for one', flagsFor(itemised).includes('no-contact-email'), false);
is('a reply with no contact is', flagsFor(blank({ guest_post_cost: 1 })).includes('no-contact-email'), true);
is(
  'an offered alternative site is flagged',
  flagsFor(blank({ relationship: 'offered instead of x.example', contact_email: 'a@b.example' })).includes('different-site-offered'),
  true,
);
is(
  'a future price rise is flagged',
  flagsFor(blank({ contact_email: 'a@b.example', price_valid_until: '2027-01-01' })).includes('price-changes-later'),
  true,
);

console.log('\n--- a reply covering a whole network ---');
{
  const network = expandListings([
    blank({ domain: 'a.example', also_applies_to: ['b.example', 'www.c.example'], guest_post_cost: 400 }),
  ]);
  is('every domain becomes its own draft', network.length, 3);
  is('including the one the terms were quoted on', network.some((d) => d.domain === 'a.example'), true);
  is('www is stripped on the way in', network.some((d) => d.domain === 'c.example'), true);
  is('the terms are carried across', network.every((d) => d.listing.guest_post_cost === 400), true);
  is('and each draft speaks only for itself', network.every((d) => d.listing.also_applies_to.length === 0), true);
  is('the carried ones say where the terms came from', network.filter((d) => d.inheritedFrom === 'a.example').length, 2);
  is('the quoted one does not', network.find((d) => d.domain === 'a.example')?.inheritedFrom, undefined);
}

{
  // The case that would silently lose money: a network rate plus one site
  // priced differently, or one that refuses a topic the others take.
  const withException = expandListings([
    blank({ domain: 'a.example', also_applies_to: ['b.example', 'c.example'], guest_post_cost: 250 }),
    blank({ domain: 'c.example', guest_post_cost: 500 }),
  ]);
  is('an exception still produces one draft per domain', withException.length, 3);
  is('and keeps its own price', withException.find((d) => d.domain === 'c.example')?.listing.guest_post_cost, 500);
  is('while the rest keep the network price', withException.find((d) => d.domain === 'b.example')?.listing.guest_post_cost, 250);
  is('the exception is not marked as inherited', withException.find((d) => d.domain === 'c.example')?.inheritedFrom, undefined);
}

{
  const refusal = expandListings([
    blank({ domain: 'a.example', also_applies_to: ['lochside.example'], guest_post_cost: 250 }),
    blank({
      domain: 'lochside.example', guest_post_cost: 250,
      niches: { ...blank().niches, gambling: { accepted: 'no', guest_post_cost: null, link_insertion_cost: null } },
    }),
  ]);
  is("a site's own refusal survives the network", refusal.find((d) => d.domain === 'lochside.example')?.listing.niches.gambling!.accepted, 'no');
  is('and the others are unaffected', refusal.find((d) => d.domain === 'a.example')?.listing.niches.gambling!.accepted, 'unknown');
}

{
  const messy = expandListings([
    blank({ domain: 'a.example', also_applies_to: ['a.example', 'https://b.example/page', '', 'not a domain'] }),
  ]);
  is('a domain repeated in its own network list is not duplicated', messy.filter((d) => d.domain === 'a.example').length, 1);
  is('a url is reduced to its domain', messy.some((d) => d.domain === 'b.example'), true);
  is('junk entries are dropped', messy.length, 2);
}

console.log('\n--- what a listing ends up selling ---');
const silent = blank({ guest_post_cost: 100 });
is('a topic nobody mentioned is sellable', sellableNiches(silent).length, 7);
const refusedAdult = blank({
  guest_post_cost: 100,
  niches: { ...blank().niches, adult: { accepted: 'no', guest_post_cost: null, link_insertion_cost: null } },
});
is('an explicit refusal is not', sellableNiches(refusedAdult).includes('adult'), false);
is('and the rest still are', sellableNiches(refusedAdult).length, 6);
is(
  'the draft still records that nobody said',
  silent.niches.gambling!.accepted,
  'unknown',
);

console.log('\n--- bulk approval safety ---');
// A genuinely clean draft states what it is charging in. The currency was
// missing from this fixture, which is the same omission that let a real one
// through.
const confident = blank({ guest_post_cost: 100, currency: 'GBP', contact_email: 'a@b.example', confidence: [{ field: 'guest_post_cost', level: 'high' }],
  niches: { ...blank().niches, gambling: { accepted: 'yes', guest_post_cost: 200, link_insertion_cost: null } } });
is('a clean draft has no low-confidence fields', countLowConfidence(confident), 0);
is('and no flags, so bulk approve may take it', flagsFor(confident).length, 0);

// The safety property that matters here: a price whose currency nobody
// stated must never be swept in by Approve all.
const currencyless = { ...confident, currency: null };
is('a draft with no currency is never swept up in bulk', flagsFor(currencyless).length > 0, true);
const shaky = blank({ guest_post_cost: 100, contact_email: 'a@b.example', confidence: [
  { field: 'guest_post_cost', level: 'low' }, { field: 'turnaround_min_days', level: 'low' },
] });
is('a guessed draft counts its low fields', countLowConfidence(shaky), 2);
is('and is never swept up in bulk', countLowConfidence(shaky) > 0 || flagsFor(shaky).length > 0, true);

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
