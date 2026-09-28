/**
 * Prove the mbox reader does what the ingestion step depends on.
 *
 * No API key and no database: this is the half of the pipeline that decides
 * which messages ever reach the model, so it has to be checkable on its own.
 * If this is wrong, extraction is wrong and it costs money to find out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { splitForUpload } from '../src/lib/sourcing/split-upload';
import { readMbox, readPastedEmail, domainFromSubject, stripQuotedHistory } from '../src/lib/sourcing/mbox';
import { extractionResultSchema, fromWire, wireResultSchema, type ExtractedListing } from '../src/lib/sourcing/schema';
import { applyGeneralPriceToNiches, assumedNicheCosts, countLowConfidence, expandListings, flagsFor, sellableNiches, sensitiveRate } from '../src/lib/sourcing/review';
import { sensitiveNicheSlugs } from '../src/lib/config/accepted-niches';
import { extractLinks, looksLikeRateCardLead } from '../src/lib/sourcing/links';
import { healthOf, progressMessage, runProgress, type BatchRow } from '../src/lib/sourcing/batch-health';
import { describeSkip, nightlySkipReason, type NightlyState } from '../src/lib/sourcing/schedule';
import { extractionLimit } from '../src/lib/sourcing/limits';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const has = (label: string, haystack: string, needle: string) =>
  haystack.includes(needle) ? ok(label) : bad(label, `missing ${JSON.stringify(needle)} in ${JSON.stringify(haystack)}`);

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
// The four subjects the Hunter campaigns actually went out under, typo and
// all. Matching the shape rather than the wording is what makes this list a
// record of what happened rather than a list to maintain.
is('"quick one about"', domainFromSubject('Re: quick one about foo.example'), 'foo.example');
is('"advertisements on"', domainFromSubject('advertisements on foo.example'), 'foo.example');
is(
  '"ad services and prices on"',
  domainFromSubject('Re: ad services and prices on foo.example'),
  'foo.example',
);
is(
  'and the one with the typo in it',
  domainFromSubject('quick on about ads on foo.example'),
  'foo.example',
);
is('a subject nobody has written yet', domainFromSubject('Re: rates for foo.example'), 'foo.example');
is('a merge tag that rendered a url', domainFromSubject('quick one about https://foo.example/blog'), 'foo.example');
is('trailing punctuation is not part of it', domainFromSubject('quick one about foo.example?'), 'foo.example');
is('a subject with no domain at all', domainFromSubject('Re: your invoice'), undefined);
is('nor a sentence that merely ends in a word', domainFromSubject('Following up on this'), undefined);
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

console.log('\n--- cutting an export into uploadable pieces ---');
{
  const message = (n: number, bodyKb = 1) =>
    `From sender${n}@example.com Mon Sep 21 10:0${n} 2026\n` +
    `From: Pub ${n} <p${n}@example.com>\n` +
    `Message-ID: <m${n}@example.com>\n` +
    `Subject: Advertisements on site${n}.com\n\n` +
    `Our guest post price is 200 USD.\n` +
    'x'.repeat(bodyKb * 1024);

  const export4 = [1, 2, 3, 4].map((n) => message(n)).join('\n');
  const split = splitForUpload(export4, 3 * 1024);

  is('every message is found', split.messageCount, 4);
  is('and they are spread over several batches', split.batches.length > 1, true);
  is('nothing is truncated when each one fits', split.truncated.length, 0);

  // The whole point: each batch has to parse as an mbox on its own, using the
  // same reader the server uses. A batch the server cannot read is worse than
  // a failed upload, because it fails silently.
  const readBack = split.batches.flatMap((batch) => readMbox(batch).messages);
  is('every message survives the round trip', readBack.length, 4);
  is(
    'and keeps its own Message-ID, so dedupe still works',
    new Set(readBack.map((m) => m.messageId)).size,
    4,
  );
  is('with the text intact', readBack[0]!.bodyText.includes('200 USD'), true);

  // A single message larger than one request. Skipping it would lose the
  // listing; keeping its front keeps the prices, which are never in the
  // attachments at the end.
  const huge = [message(1), message(2, 40), message(3)].join('\n');
  const bigSplit = splitForUpload(huge, 10 * 1024);
  is('an oversized message is truncated, not dropped', bigSplit.truncated.length, 1);
  is('and it is the big one', bigSplit.truncated[0]!.at, 1);
  const bigRead = bigSplit.batches.flatMap((batch) => readMbox(batch).messages);
  is('all three still arrive', bigRead.length, 3);
  is(
    'and the truncated one kept its price',
    bigRead.find((m) => m.messageId === '<m2@example.com>')!.bodyText.includes('200 USD'),
    true,
  );

  // Windows line endings are what an export actually contains.
  const crlf = export4.replace(/\n/g, '\r\n');
  is('CRLF exports split the same way', splitForUpload(crlf, 3 * 1024).messageCount, 4);

  // Junk before the first separator is not a message.
  is(
    'leading rubbish is not mistaken for mail',
    splitForUpload(`nonsense\nmore nonsense\n${message(1)}`, 99999).messageCount,
    1,
  );
  is('an empty file yields nothing', splitForUpload('', 1024).messageCount, 0);
}

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

console.log('\n--- what an unmentioned topic costs ---');
// The real reply this came from: 550 EUR generally, 700 EUR for
// "casino / CBD / poker / gambling", adult refused, silence on the rest.
{
  const quoted = blank({
    guest_post_cost: 550,
    currency: 'EUR',
    niches: {
      ...blank().niches,
      gambling: { accepted: 'yes', guest_post_cost: 700, link_insertion_cost: 400 },
      cbd: { accepted: 'yes', guest_post_cost: 650, link_insertion_cost: null },
      adult: { accepted: 'no', guest_post_cost: null, link_insertion_cost: null },
    },
  });

  is('the sensitive rate is the highest they quoted', sensitiveRate(quoted, 'guest-post'), 700);
  is('per placement type, not shared', sensitiveRate(quoted, 'niche-edit'), 400);

  const costs = assumedNicheCosts(quoted);
  const guestPost = costs.filter((c) => c.linkType === 'guest-post');
  is(
    'an unmentioned topic costs the sensitive rate, not the general one',
    guestPost.find((c) => c.niche === 'crypto')?.cost,
    700,
  );
  is('a topic they refused is never costed', costs.some((c) => c.niche === 'adult'), false);
  is('nor is one they priced themselves', costs.some((c) => c.niche === 'gambling'), false);
  // cbd was accepted and priced for guest posts but not for link insertions.
  // Nothing is assumed for it at all, because this rule is about topics
  // nobody mentioned - and cbd was mentioned. The insertion side of it still
  // falls through to the general rate, which is a separate gap.
  is('a topic they accepted is left alone entirely', costs.some((c) => c.niche === 'cbd'), false);
  is('the four nobody mentioned are all costed', guestPost.length, 4);
}

{
  // The case the rules forbid inventing anything for: one number, no topics.
  const lone = blank({ guest_post_cost: 550, currency: 'EUR' });
  is('a lone price yields no sensitive rate', sensitiveRate(lone, 'guest-post'), null);
  is('and nothing is assumed from it', assumedNicheCosts(lone).length, 0);
  is('it is still flagged for a human', flagsFor(lone).includes('single-price-confirm-niches'), true);
}

console.log('\n--- links a publisher sent instead of a price ---');
{
  const body = [
    'Hi Jack,',
    '',
    'Our full rate card is here: https://docs.google.com/spreadsheets/d/abc123/edit?usp=sharing',
    'There is also a PDF: https://example.com/media/rates-2026.pdf.',
    'Our blog: https://example.com',
    '',
    'Best, Ana',
    '<https://example.com/unsubscribe?id=99>',
    'https://track.example.com/pixel.gif',
    'https://www.linkedin.com/in/ana',
  ].join('\n');

  const links = extractLinks(body);
  is('the sheet is found', links.some((l) => l.kind === 'sheet'), true);
  is('and ranked first, because that is where the prices are', links[0]?.kind, 'sheet');
  is('a pdf is recognised as a file', links.some((l) => l.kind === 'file'), true);
  is(
    'a full stop after a url is punctuation, not path',
    links.find((l) => l.kind === 'file')?.url.endsWith('.pdf'),
    true,
  );
  is('an unsubscribe link is not a rate card', links.some((l) => l.url.includes('unsubscribe')), false);
  is('nor is a tracking pixel', links.some((l) => l.url.includes('pixel.gif')), false);
  is('nor a signature social link', links.some((l) => l.url.includes('linkedin')), false);
  is('their own site is kept, it is often the domain in question', links.some((l) => l.url === 'https://example.com'), true);
  is('nothing is listed twice', new Set(links.map((l) => l.url)).size, links.length);
}

{
  is('an empty body has no links', extractLinks('').length, 0);
  is('and prose with no urls has none either', extractLinks('We will get back to you.').length, 0);
  const wrapped = extractLinks('See (https://docs.google.com/spreadsheets/d/x/edit) for rates');
  is('a bracketed url loses the bracket', wrapped[0]?.url.endsWith(')'), false);
}

{
  // What puts an email on the worklist at all. A reply with neither an
  // attachment nor a link failed for some other reason, and burying the
  // real leads under it is how a worklist stops being read.
  is(
    'an attachment is enough',
    looksLikeRateCardLead({ attachments: [{ filename: 'r.pdf', mimeType: 'application/pdf', size: 1 }] }),
    true,
  );
  is('so is a link', looksLikeRateCardLead({ bodyText: 'see https://docs.google.com/spreadsheets/d/x/edit' }), true);
  is('a bare refusal is not a lead', looksLikeRateCardLead({ bodyText: 'No thank you.' }), false);
  is('nor is an empty one', looksLikeRateCardLead({}), false);
}

console.log('\n--- is a run progressing or stuck ---');
{
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();
  const batch = (over: Partial<BatchRow>): BatchRow => ({
    id: 'b', status: 'running', mode: 'batch', createdAt: at(5),
    providerBatchId: 'msgbatch_1', emailCount: 10, ...over,
  });

  is('a fresh batch is working', healthOf(batch({})), 'working');
  is('an hour and a half is slow', healthOf(batch({ createdAt: at(95) })), 'slow');
  is('a day and a bit is abandoned', healthOf(batch({ createdAt: at(27 * 60) })), 'abandoned');

  // The one that stranded eleven emails: claimed, never handed over, and
  // skipped by the collector for ever because there was nothing to collect.
  is(
    'no provider id and old means it never reached the API',
    healthOf(batch({ providerBatchId: null, createdAt: at(10) })),
    'never-submitted',
  );
  is(
    'but a moment after submitting, that is just the gap between two writes',
    healthOf(batch({ providerBatchId: null, createdAt: at(1) })),
    'working',
  );

  const done = runProgress([batch({ status: 'completed' })]);
  is('a collected batch is not outstanding', done.running, 0);
  is('and nothing is stuck', done.stuck, false);

  const mixed = runProgress([
    batch({ id: 'a', createdAt: at(2) }),
    batch({ id: 'b', createdAt: at(200), providerBatchId: null }),
  ]);
  is('two batches are counted', mixed.running, 2);
  is('their emails are added up', mixed.emails, 20);
  is('the age is the oldest, not the newest', mixed.oldestMinutes, 200);
  is('and the worst state wins', mixed.worst, 'never-submitted');
  is('which is something to act on', mixed.stuck, true);

  // The message has to say what to do, because a number nobody can
  // interpret is what left somebody refreshing a page for an hour.
  has('a working run says results arrive on their own', progressMessage(runProgress([batch({})])), 'arrive on their own');
  has('a stuck one says to put them back', progressMessage(mixed), 'Put them back');
  has('and a slow one says it is longer than usual', progressMessage(runProgress([batch({ createdAt: at(95) })])), 'longer than usual');
}

console.log('\n--- is tonight run due ---');
{
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
  const state = (over: Partial<NightlyState>): NightlyState => ({
    enabled: true, lastRunAt: null, jobInFlight: false, ...over,
  });

  is('off means off', nightlySkipReason(state({ enabled: false })), 'off');
  is('never run and switched on is due', nightlySkipReason(state({})), null);
  is('a full day later it is due again', nightlySkipReason(state({ lastRunAt: ago(25 * 60) })), null);

  // Running twice costs a second read of everything it finds.
  is('an hour later it is not', nightlySkipReason(state({ lastRunAt: ago(60) })), 'already-ran');
  is('nor nineteen hours later', nightlySkipReason(state({ lastRunAt: ago(19 * 60) })), 'already-ran');
  // Cron fires on a wall clock and runs take minutes, so consecutive nights
  // are never exactly 24 hours apart.
  is('but twenty-one hours counts as the next night', nightlySkipReason(state({ lastRunAt: ago(21 * 60) })), null);

  is(
    'last night still fetching means wait',
    nightlySkipReason(state({ jobInFlight: true, lastRunAt: ago(25 * 60) })),
    'still-running',
  );
  is('and off beats everything', nightlySkipReason(state({ enabled: false, jobInFlight: true })), 'off');

  has('every reason says why', describeSkip('already-ran'), 'already ran');
  has('including the unfinished one', describeSkip('still-running'), 'not finished');
}

console.log('\n--- how many one press sends ---');
{
  // Real time makes one blocking call per email inside a single request, so
  // its ceiling is how long a function may live. Batch hands everything over
  // in one call and collects later, so it has no such problem - and applying
  // the real-time number to it turned a backlog of eight hundred into
  // thirty-two presses.
  is('real time stays small', extractionLimit('realtime'), 25);
  is('batch sends far more', extractionLimit('batch'), 500);
  is('and batch is the larger of the two', extractionLimit('batch') > extractionLimit('realtime'), true);
}

console.log('\n--- the claim is honoured everywhere ---');
// Twice now a row has been claimed by writing `batch_id` and then handed out
// again by a query that only looked at `status`. Once it double-spent the
// extraction; once it only lied on a button. Both were the same omission, so
// it is checked here rather than remembered: any statement selecting on
// status 'new' must say something about batch_id too.
{
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/services/sourcing-service.ts'),
    'utf8',
  );
  const statements = source
    .split(".from('inbound_emails')")
    .slice(1)
    .map((chunk) => chunk.split(';')[0]);
  const unclaimed = statements.filter(
    (chunk) => chunk.includes("eq('status', 'new')") && !chunk.includes('batch_id'),
  );
  is(
    'no query treats a claimed email as waiting',
    unclaimed.length,
    0,
  );
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
