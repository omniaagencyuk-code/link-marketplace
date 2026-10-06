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
import { applyGeneralPriceToNiches, assumedNicheCosts, countLowConfidence, expandListings, fillGeneralFromNiches, flagsFor, sellableNiches, sensitiveRate } from '../src/lib/sourcing/review';
import { sensitiveNicheSlugs } from '../src/lib/config/accepted-niches';
import { extractLinks, looksLikeRateCardLead } from '../src/lib/sourcing/links';
import { offersAgree, offersNote, rankOffers, senderSignal } from '../src/lib/sourcing/offers';
import {
  DIFFERENT_SELLER,
  defaultChoices,
  fromADifferentSeller,
  splitByKind,
  waitingForReview,
} from '../src/lib/sourcing/queue';
import {
  MAX_IMAGES,
  TRANSCRIPTION_RULES,
  checkImages,
} from '../src/lib/sourcing/rate-card-image';
import { healthOf, progressMessage, runProgress, type BatchRow } from '../src/lib/sourcing/batch-health';
import { describeSkip, nightlySkipReason, type NightlyState } from '../src/lib/sourcing/schedule';
import { extractionLimit } from '../src/lib/sourcing/limits';
import {
  DOMAINS_PER_PASS,
  MOST_DOMAINS_WORTH_READING,
  domainsToRead,
  mergeParts,
  passes,
  readInParts,
} from '../src/lib/sourcing/in-parts';
import { APPROVE_CHUNK_SIZE, chunk, progressText } from '../src/lib/sourcing/approving';
import {
  MAX_CSV_ROWS,
  decodeSheetBytes,
  looksLikeSheet,
  readRateCardCsv,
} from '../src/lib/sourcing/rate-card-csv';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const isTrue = (label: string, actual: boolean) => (actual ? ok(label) : bad(label, 'expected true'));
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

console.log('\n--- a reply that priced only the sensitive topics ---');
{
  // The shape that put a listing on the marketplace at zero: they answered
  // "what for gambling?" with one number and never stated a standard rate.
  const onlyNiches = blank({
    currency: 'EUR',
    niches: {
      ...blank().niches,
      gambling: { accepted: 'yes', guest_post_cost: 499, link_insertion_cost: 300 },
      cbd: { accepted: 'yes', guest_post_cost: 650, link_insertion_cost: null },
    },
  });

  const filled = fillGeneralFromNiches(onlyNiches);
  is('the general price is the cheapest they quoted', filled.guest_post_cost, 499);
  is('and not the dearest', filled.guest_post_cost === 650, false);
  is('link insertions are filled separately', filled.link_insertion_cost, 300);
  is('the niches themselves are untouched', filled.niches.gambling?.guest_post_cost, 499);

  // A stated general price is a fact. It is never replaced by an assumption,
  // even when a niche rate is lower.
  const stated = blank({
    guest_post_cost: 550,
    niches: { ...blank().niches, gambling: { accepted: 'yes', guest_post_cost: 400, link_insertion_cost: null } },
  });
  is('a quoted general price wins', fillGeneralFromNiches(stated).guest_post_cost, 550);

  // Nothing is invented from nothing.
  const silent = blank({});
  is('a reply with no prices gains none', fillGeneralFromNiches(silent).guest_post_cost, null);
  is('and comes back as it went in', fillGeneralFromNiches(silent), silent);

  // A refusal is not a price, even if a number was left beside it.
  const refused = blank({
    niches: {
      ...blank().niches,
      adult: { accepted: 'no', guest_post_cost: 100, link_insertion_cost: null },
      gambling: { accepted: 'yes', guest_post_cost: 700, link_insertion_cost: null },
    },
  });
  is('a refused topic does not set the general price', fillGeneralFromNiches(refused).guest_post_cost, 700);
}

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

console.log('\n--- two people offering the same site ---');
{
  is('a reply from the site itself is the owner', senderSignal('hello@modalova.com', 'modalova.com'), 'owner-match');
  is('www does not change that', senderSignal('hello@modalova.com', 'www.modalova.com'), 'owner-match');
  // The person who runs the domain runs its subdomains.
  is('nor does a subdomain', senderSignal('hello@modalova.com', 'us.modalova.com'), 'owner-match');
  is('or the other way round', senderSignal('hello@us.modalova.com', 'modalova.com'), 'owner-match');
  is('a gmail address is flagged as free', senderSignal('mediagroup.links.swe@gmail.com', 'leedsunited.se'), 'free-email');
  is('a business address elsewhere is neither', senderSignal('ana@someagency.co.uk', 'leedsunited.se'), 'third-party');
  // A near-miss must not read as ownership.
  is('a lookalike domain is not a match', senderSignal('hello@modalova-media.com', 'modalova.com'), 'third-party');
  is('and a malformed address is not either', senderSignal('nonsense', 'modalova.com'), 'third-party');
}

{
  const rates = new Map([['EUR', 1.14], ['GBP', 1.33], ['USD', 1]]);
  const ranked = rankOffers([
    { draftId: 'a', domain: 'modalova.com', fromAddress: 'hello@modalova.com', cost: 400, currency: 'EUR', sentAt: null, status: 'pending' },
    { draftId: 'b', domain: 'modalova.com', fromAddress: 'broker@gmail.com', cost: 300, currency: 'GBP', sentAt: null, status: 'pending' },
    { draftId: 'c', domain: 'modalova.com', fromAddress: 'x@agency.com', cost: 250, currency: null, sentAt: null, status: 'pending' },
  ], rates);

  // 400 EUR = 456, 300 GBP = 399. The pound offer is cheaper despite the
  // smaller number, which is the whole reason this converts before sorting.
  is('the cheapest is by converted cost, not by the number', ranked[0]?.draftId, 'b');
  is('and it is marked', ranked[0]?.cheapest, true);
  is('the owner offer is second', ranked[1]?.draftId, 'a');
  // A price with no currency is unknown, not cheap. It sorts last.
  is('a price with no currency cannot be compared', ranked[2]?.draftId, 'c');
  is('so it is not the cheapest', ranked[2]?.cheapest, false);
  is('only one is marked cheapest', ranked.filter((o) => o.cheapest).length, 1);

  has('the note names the disagreement', offersNote(ranked) ?? '', 'not the one writing from');
}

{
  const rates = new Map([['USD', 1]]);
  const agreeing = rankOffers([
    { draftId: 'a', domain: 'x.com', fromAddress: 'hi@x.com', cost: 100, currency: 'USD', sentAt: null, status: 'pending' },
    { draftId: 'b', domain: 'x.com', fromAddress: 'b@gmail.com', cost: 200, currency: 'USD', sentAt: null, status: 'pending' },
  ], rates);
  has('when they agree the note says so', offersNote(agreeing) ?? '', 'also the one writing from');

  is('one offer is not worth a note', offersNote(agreeing.slice(0, 1)), null);

  const unconvertible = rankOffers([
    { draftId: 'a', domain: 'x.com', fromAddress: 'hi@x.com', cost: 100, currency: 'RUB', sentAt: null, status: 'pending' },
    { draftId: 'b', domain: 'x.com', fromAddress: 'b@gmail.com', cost: 200, currency: 'RUB', sentAt: null, status: 'pending' },
  ], rates);
  has('and two unconvertible ones say they cannot be compared', offersNote(unconvertible) ?? '', 'cannot be compared');
}

console.log('\n--- nothing to choose between them ---');
{
  const rates = new Map([['USD', 1]]);
  const offer = (draftId: string, over: Record<string, unknown> = {}) => ({
    draftId,
    domain: 'gpacalculator.app',
    fromAddress: 'support@guestpostspro.com',
    cost: 10,
    currency: 'USD',
    sentAt: null,
    status: 'pending',
    ...over,
  });

  // The shape that prompted this: one reseller, one price, seven replies.
  // Reading seven rows to learn they are one offer is the work being saved,
  // so this has to be right or the note tells somebody not to look when they
  // should have.
  const same = rankOffers([offer('a'), offer('b'), offer('c')], rates);
  is('one sender at one price has nothing to choose between', offersAgree(same), true);

  const dearer = rankOffers([offer('a'), offer('b', { cost: 15 })], rates);
  is('a different price is a choice', offersAgree(dearer), false);

  const elsewhere = rankOffers([offer('a'), offer('b', { fromAddress: 'sales@other.com' })], rates);
  is('a different sender is a choice', offersAgree(elsewhere), false);

  // Case and stray spacing in an address are not a second person.
  const shouty = rankOffers([offer('a'), offer('b', { fromAddress: ' SUPPORT@GuestPostsPro.com ' })], rates);
  is('the same address written differently is still one person', offersAgree(shouty), true);

  // A currency that could not be converted still has to match. Two prices of
  // 10 in different currencies are two different offers.
  const currencies = rankOffers([offer('a'), offer('b', { currency: 'EUR' })], rates);
  is('the same number in another currency is a choice', offersAgree(currencies), false);

  // Only what is still waiting. An approved draft is a listing already, and
  // counting it would call a real decision trivial.
  const settled = rankOffers([offer('a'), offer('b', { status: 'approved', cost: 99 })], rates);
  is('an approved offer is not one of the ones waiting', offersAgree(settled), false);

  is('one waiting draft agrees with nothing', offersAgree(rankOffers([offer('a')], rates)), false);
  is('and none at all is not agreement', offersAgree([]), false);

  // Two priceless repeats from one sender are still one offer repeated.
  const priceless = rankOffers([offer('a', { cost: null, currency: null }), offer('b', { cost: null, currency: null })], rates);
  is('two replies with no price from one sender still agree', offersAgree(priceless), true);
}

console.log('\n--- approving in pieces ---');
// Two hundred approvals in one request ran past the function ceiling and
// answered nothing: the work happened, the page showed no count and lost no
// rows, and reloading by hand was the only way to find out. These are the
// two things the fix depends on - that the list really is broken up, and
// that what comes back is reported honestly.
{
  const ids = Array.from({ length: 200 }, (_, at) => `draft-${at}`);
  const parts = chunk(ids, APPROVE_CHUNK_SIZE);

  is('two hundred drafts go in ten requests', parts.length, 10);
  is('none of them is oversized', parts.every((part) => part.length <= APPROVE_CHUNK_SIZE), true);
  is('every draft is sent exactly once', parts.flat().length, ids.length);
  is('and in order', parts.flat().join() === ids.join(), true);

  const ragged = chunk(['a', 'b', 'c'], 2);
  is('a remainder gets its own request', ragged.length, 2);
  is('and holds what is left', ragged[1]?.length, 1);
  is('nothing to approve is no requests', chunk([], 20).length, 0);
}

{
  const running = progressText({
    done: 40, total: 200, approved: 40, failures: [], skipped: 0, finished: false,
  });
  has('while it runs it says how far through', running, '40 of 200');

  const done = progressText({
    done: 200, total: 200, approved: 197, failures: ['a.com'], skipped: 2, finished: true,
  });
  has('the total is what was asked for, not what worked', done, '197 of 200');
  // Silent failures are how a domain goes missing. Both the held-back and
  // the failed have to be in the sentence, or 197 of 200 is a mystery.
  has('drafts held back for a human are counted', done, '2 were left in the queue');
  has('and failures are named', done, 'a.com');

  const clean = progressText({
    done: 5, total: 5, approved: 5, failures: [], skipped: 0, finished: true,
  });
  is('a clean run says only what happened', clean, 'Approved 5 of 5.');
}

console.log('\n--- bulk approve cannot walk past a contested domain ---');
// The competing-offer flag is worked out when the page renders, not stored on
// the row, so a server action filtering on `flags` cannot see it. Bulk
// approve did exactly that, and the last approval of a domain wins: one
// offer's price and contact quietly overwrote the other's. Checked here
// rather than remembered, because the next person to touch this action will
// not know the flag is invisible to it.
{
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/app/admin/(protected)/sourcing/actions.ts'),
    'utf8',
  );
  const action = source
    .slice(source.indexOf('export async function bulkApproveConfidentAction'))
    .split('\nexport ')[0];

  is(
    'the bulk action asks which domains are contested',
    action.includes('domainsWithCompetingOffers'),
    true,
  );
  is('and leaves them out', action.includes('!contested.has('), true);
}

console.log('\n--- a network table bigger than one response ---');
{
  /*
    A real Danish rate card pasted as a table: 120 domains, each with its own
    price and its own per-niche prices. One listing serialises to around 440
    tokens, so the old 16000 ceiling held about thirty-six of them and the
    rest arrived as JSON cut off mid-object - which reads as a schema error
    rather than as "this was too long".

    Measured rather than guessed: the number below is the width of a real
    listing with every field the schema requires.
  */
  const TOKENS_PER_LISTING = 444;
  const clientSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/sourcing/client.ts'), 'utf8');
  const ceiling = Number(/max_tokens: (\d+)/.exec(clientSource)?.[1] ?? 0);

  is('the output ceiling is set', ceiling > 0, true);
  is(
    `the ceiling holds a 120-domain network (${Math.floor(ceiling / TOKENS_PER_LISTING)} listings)`,
    Math.floor(ceiling / TOKENS_PER_LISTING) >= 120,
    true,
  );

  // The SDK needs streaming above its non-streaming timeout, and a ceiling
  // this high without it fails having already been charged for the tokens.
  is('a ceiling that large is streamed', /messages\.stream\(/.test(clientSource), true);
  is('and not sent as a plain request', /messages\.parse\(/.test(clientSource), false);

  // Both paths read the answer the same way, so only one of them can learn
  // to tell a truncated reply from a malformed one.
  is(
    'one reader for the live path and the batch',
    (clientSource.match(/readMessage\(/g) ?? []).length >= 3,
    true,
  );
  /*
    Truncation is a flag, not a phrase.

    This used to assert the wording of the error message - and then the live
    path learned to retry on truncation, which meant the decision had to be
    something a caller could branch on. A behaviour asserted by grepping for a
    sentence breaks the day somebody rewords the sentence, and silently.
  */
  is('a truncated answer is flagged as truncated', /truncated: true/.test(clientSource), true);
  is(
    'and the live path reads the flag rather than the message',
    /if \(outcome\.truncated\) return extractInParts\(/.test(clientSource),
    true,
  );

  /*
    The ceiling is now the model's own, so the next reply longer than it cannot
    be answered by raising a number again. Reading in parts is what answers it,
    and the email itself is never what gets cut: every pass sees the whole
    reply and is told which domains to return.
  */
  is('the ceiling is the model maximum, not another guess', ceiling, 128000);
  is(
    'a reply past it is read in parts rather than refused',
    clientSource.includes('async function extractInParts('),
    true,
  );
  is(
    'and every pass is given the whole request, narrowed only by domain',
    /requestBody\(request, model, domains\)/.test(clientSource),
    true,
  );
  is(
    'the body is never sliced',
    /request\.body\.slice\(|splitBody|body\.substring\(/.test(clientSource),
    false,
  );
}

console.log('\n--- reading a rate card out of a picture ---');
{
  /*
    A publisher's prices arrive as a screenshot often enough that typing them
    out was the slowest thing on the no-draft list. The picture is now read
    into text, which the reviewer checks, and the ordinary extraction runs on
    that text afterwards - two steps, each one checkable, rather than one
    prompt doing transcription and judgement at once.

    These are the limits the server applies. A browser can be told anything;
    the action is an endpoint.
  */
  const png = (bytes: number) => ({ mediaType: 'image/png', data: 'A'.repeat(Math.ceil((bytes * 4) / 3)) });

  is('nothing to read is refused', checkImages([]), 'Paste an image first.');
  is('one small image is fine', checkImages([png(1000)]), null);
  is(`${MAX_IMAGES} is still fine`, checkImages(Array.from({ length: MAX_IMAGES }, () => png(1000))), null);
  has(
    'one more than that is refused',
    checkImages(Array.from({ length: MAX_IMAGES + 1 }, () => png(1000))) ?? '',
    'more than',
  );

  // A PDF is not an image the API reads, and sending one is a 400 that would
  // surface as "the image could not be read" with no reason.
  has('a PDF is refused by type', checkImages([{ mediaType: 'application/pdf', data: 'AAAA' }]) ?? '', 'not an image');
  is('jpeg is accepted', checkImages([{ mediaType: 'image/jpeg', data: 'AAAA' }]), null);
  is('webp is accepted', checkImages([{ mediaType: 'image/webp', data: 'AAAA' }]), null);

  // Measured on the bytes, not on the length of the base64 holding them.
  is('an image just under the ceiling passes', checkImages([png(5 * 1024 * 1024 - 100)]), null);
  has('and one over it is refused', checkImages([png(6 * 1024 * 1024)]) ?? '', 'larger than');

  // One bad image in a batch stops the batch. Sending the rest would read a
  // media kit with a page silently missing from it.
  has('a bad image among good ones still refuses', checkImages([png(100), { mediaType: 'image/bmp', data: 'AAAA' }]) ?? '', 'not an image');

  /*
    One client, one place the workspace header is set.

    An organisation-level key must name a workspace on every request. The
    extraction client does that; the image reader built its own
    `new Anthropic(...)` and did not, so the first real rate card came back
    as a 400 about workspace scoping with nothing in the UI able to explain
    it. Checked here rather than remembered, because the next caller will be
    written the same way.
  */
  {
    const readFile = (at: string) => fs.readFileSync(path.join(process.cwd(), at), 'utf8');
    const clientSource = readFile('src/lib/sourcing/client.ts');
    is(
      'the client factory sets the workspace header',
      /anthropic-workspace-id/.test(clientSource),
      true,
    );

    const imageSource = readFile('src/lib/sourcing/rate-card-image.ts');
    is('reading an image goes through that factory', imageSource.includes('getClient()'), true);
    is('and builds no client of its own', /new Anthropic\(/.test(imageSource), false);
    is('its failures go through the shared describer', imageSource.includes('messageFor('), true);
  }

  /*
    The transcription prompt has one job. If it starts deciding what a price
    covers, the rules about niches and refusals exist in two places - and
    AGENTS.md is explicit that they live in one.
  */
  has('it is told to transcribe, not interpret', TRANSCRIPTION_RULES, 'Do not interpret');
  has('currencies are never converted', TRANSCRIPTION_RULES, 'Never convert between currencies');
  has('nothing is rounded', TRANSCRIPTION_RULES, 'Never round');
  has('unreadable is written, not guessed', TRANSCRIPTION_RULES, '[unreadable]');
  is('it does not decide about niches', /niche|gambling|sensitive/i.test(TRANSCRIPTION_RULES), false);
  is('nor about what to approve', /approve|listing|draft/i.test(TRANSCRIPTION_RULES), false);
}

console.log('\n--- the queue that appeared to refill forever ---');
{
  /*
    The review queue asked for the first two hundred pending drafts and then
    dropped the contested ones from what came back. Several hundred domains
    were offered twice, so most of that two hundred was spent on rows that
    were then discarded, and the table showed whatever few survived.
    Approving those cleared them, the next read surfaced another few, and it
    looked like a queue that would not empty. Fifty-eight waiting, twenty
    approved, again, and again.

    The fix is the order of two steps, so the order of two steps is what is
    checked. The case below is the one that tells them apart: everything the
    limit would have covered is contested, and everything a person could
    actually approve is behind it.
  */
  const draft = (domain: string) => ({ domain });
  const contested = new Set(Array.from({ length: 200 }, (_, i) => `taken${i}.com`));
  const all = [
    ...Array.from({ length: 200 }, (_, i) => draft(`taken${i}.com`)),
    ...Array.from({ length: 50 }, (_, i) => draft(`mine${i}.com`)),
  ];

  const got = waitingForReview(all, contested, 200);
  is('a queue behind 200 contested drafts is not empty', got.rows.length, 50);
  is('and the count is what is waiting, not what is shown', got.total, 50);
  is('the rows are the ones a person can approve', got.rows[0]?.domain, 'mine0.com');

  // The slice still applies - it is a page, not a promise to render
  // everything - but it is taken after the filter rather than before it.
  const capped = waitingForReview(all, contested, 20);
  is('a smaller page shows fewer rows', capped.rows.length, 20);
  is('while still reporting everything waiting', capped.total, 50);

  // Nothing contested means nothing is removed.
  is('an uncontested queue is untouched', waitingForReview(all, new Set(), 500).total, 250);
  is('and nothing is waiting when nothing is pending', waitingForReview([], contested, 200).total, 0);

  // A limit of zero shows nothing and still counts honestly, which is the
  // combination a header reading "0 drafts" over a full queue came from.
  is('a zero page still knows what is behind it', waitingForReview(all, contested, 0).total, 50);
}

console.log('\n--- ticking a page of contested domains at once ---');
{
  /*
    Two hundred and fifty domains settled one card at a time is the work this
    replaces, so "select all" has to mean something exact: one chosen draft
    per domain, defaulting to the offer already marked cheapest, and nothing
    at all for a domain with no decision left in it.
  */
  const group = (domain: string, offers: { draftId: string; status: string }[]) => ({ domain, offers });

  const chosen = defaultChoices([
    group('newry.ie', [
      { draftId: 'cheap', status: 'pending' },
      { draftId: 'dearer', status: 'pending' },
    ]),
    group('edinburgh.co.uk', [
      { draftId: 'done', status: 'approved' },
      { draftId: 'waiting', status: 'pending' },
    ]),
  ]);

  is('one choice per domain, not one per draft', chosen.size, 2);
  is('and it is the first still waiting, which is the cheapest', chosen.get('newry.ie'), 'cheap');
  // An approved offer is a listing already. Choosing it would re-approve
  // something nobody asked about.
  is('an approved offer is never the default', chosen.get('edinburgh.co.uk'), 'waiting');

  // A domain already dealt with belongs in neither count nor action.
  const settled = defaultChoices([group('settled.com', [{ draftId: 'x', status: 'approved' }])]);
  is('a domain with nothing waiting is not selected', settled.size, 0);
  is('and nothing at all selects nothing', defaultChoices([]).size, 0);

  // Keyed by domain, so a second card for one domain cannot queue it twice.
  const twice = defaultChoices([
    group('same.com', [{ draftId: 'first', status: 'pending' }]),
    group('same.com', [{ draftId: 'second', status: 'pending' }]),
  ]);
  is('one domain cannot be settled twice in one run', twice.size, 1);
}

console.log('\n--- settling a contested domain from the list ---');
/*
  Two properties of the one-click approve, both of which are about what
  happens on a bad day rather than a good one.

  It approves before it deletes. Deleting first and approving second would,
  on an approval that throws, leave a domain with no drafts and no listing -
  the offers gone, the decision unmade, and nothing on screen saying which.

  And "leave as is" never reaches the approval path. Its entire purpose is to
  clear the queue without touching what we sell, so a listing somebody
  checked by hand cannot be overwritten by the button that promises not to.
*/
{
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/app/admin/(protected)/sourcing/actions.ts'),
    'utf8',
  );

  // Comments first. Both actions are documented at length in terms of
  // `approveDraft` and deleting, so a check against the raw text matches the
  // explanation of the rule instead of the code that keeps it.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  /*
    A function's own body, exported or not. The two helpers that hold the
    ordering are module-private on purpose - nothing outside this file should
    be able to approve without sweeping - so a check that only found exports
    would report them missing and look like the rule was gone.
  */
  const body = (name: string) => {
    const start = code.search(new RegExp(`(?:export )?async function ${name}\\b`));
    if (start === -1) return '';
    const rest = code.slice(start + 10);
    const end = rest.search(/\n(?:export )?async function /);
    return end === -1 ? rest : rest.slice(0, end);
  };

  /*
    The settling itself lives in one helper now, because a single domain and
    a batch of them are the same decision and two copies of this ordering is
    one copy too many. So the helper is what gets checked, plus the fact that
    every public way in goes through it.
  */
  const settle = body('settleContested');
  is('the one place a contested domain is settled exists', settle.length > 0, true);
  is('it approves through the one approval path', settle.includes('approveDraft('), true);
  is(
    'and approves before it deletes anything',
    settle.indexOf('approveDraft(') < settle.indexOf('.delete()'),
    true,
  );
  // The domain it sweeps is read from the winning draft, so the delete
  // cannot be aimed at a domain the reviewer was not looking at.
  is('the sweep is scoped to pending rows', settle.includes("eq('status', 'pending')"), true);
  is('and never deletes the draft it just approved', settle.includes("neq('id', keepDraftId)"), true);

  for (const name of ['resolveDuplicateAction', 'resolveDuplicatesAction']) {
    const action = body(name);
    is(`"${name}" exists`, action.length > 0, true);
    is(`"${name}" settles through that one helper`, action.includes('settleContested('), true);
    // Never its own copy of the ordering - that is how two paths drift.
    is(`"${name}" has no approval of its own`, action.includes('approveDraft('), false);
  }

  const clear = body('clearContested');
  is('clearing drafts has one place too', clear.length > 0, true);
  is('and it only deletes pending ones', clear.includes("eq('status', 'pending')"), true);
  is('and never approves anything', clear.includes('approveDraft'), false);

  for (const name of ['leaveDomainAsIsAction', 'leaveDomainsAsIsAction']) {
    const action = body(name);
    is(`"${name}" exists`, action.length > 0, true);
    is(`"${name}" clears through that one helper`, action.includes('clearContested('), true);
    is(`"${name}" does not go near the approval path`, action.includes('approveDraft'), false);
    is(`"${name}" nor writes to the websites table`, action.includes("from('websites')"), false);
  }

  // Proving the comment strip has not simply blanked the file.
  is('the strip leaves the code it is checking', code.includes('listing_drafts'), true);
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

console.log('\n--- a reply listing more sites than one answer can hold ---');
{
  /*
    Five agency replies ran past the output ceiling. The error told whoever
    read it to paste the email in two halves by hand, which is work the thing
    that noticed should be doing - and they were publishers worth having.

    The email is never split. A long rate card is a few thousand tokens in and
    a hundred thousand out, because every domain expands into forty-odd fields,
    so the input was never the problem. Splitting it would hand the second half
    to the model without the header row of the table, without the currency
    stated once at the top, and without the terms that apply to every site
    below them - and the listings read from it would be quietly wrong rather
    than visibly missing.
  */
  const listed = domainsToRead(['  a.com ', 'B.com', 'a.com', 'A.COM', '', '   ', 'c.com']);
  is('the domains are trimmed', listed[0], 'a.com');
  is('the same domain twice is read once', listed.length, 3);
  is('and case does not make it a different one', listed.includes('A.COM'), false);
  is('order is the order they appeared', listed.join(','), 'a.com,B.com,c.com');

  const many = Array.from({ length: 95 }, (_, index) => `site${index}.com`);
  const split = passes(many);
  is('ninety-five domains become three passes', split.length, 3);
  is('each full pass asks for the batch size', split[0]?.length, DOMAINS_PER_PASS);
  is('and the last takes the remainder', split[2]?.length, 95 - DOMAINS_PER_PASS * 2);
  is(
    'every domain is asked for exactly once',
    split.flat().length === many.length && new Set(split.flat()).size === many.length,
    true,
  );
  is('a short list is still one pass', passes(['only.com']).length, 1);
  is('and no domains means no passes', passes([]).length, 0);

  // The guard that stops this becoming a thousand API calls.
  is('the ceiling on what is worth reading as an email', MOST_DOMAINS_WORTH_READING > 0, true);
  is(
    'which is more passes than any real rate card',
    Math.ceil(MOST_DOMAINS_WORTH_READING / DOMAINS_PER_PASS),
    15,
  );
}

console.log('\n--- putting the parts back together ---');
{
  const part = (over: Partial<ExtractionResult>): ExtractionResult =>
    ({ usable: false, ignore_reason: null, listings: [], ...over }) as ExtractionResult;
  const listing = (domain: string) => ({ domain }) as ExtractedListing;

  const merged = mergeParts([
    part({ usable: true, listings: [listing('a.com'), listing('b.com')] }),
    part({ usable: true, listings: [listing('c.com')] }),
  ]);
  is('every part contributes its listings', merged.listings.length, 3);
  is('in the order the passes ran', merged.listings.map((l) => l.domain).join(','), 'a.com,b.com,c.com');

  /*
    A rate card whose first forty domains are all "we stopped doing that" is
    still a usable email if domain forty-one has a price. Reading usable as
    "every part was usable" would throw the reply away for being mostly dead.
  */
  const mixed = mergeParts([
    part({ usable: false, ignore_reason: 'No rates in this part.' }),
    part({ usable: true, listings: [listing('late.com')] }),
  ]);
  is('one usable part makes the reply usable', mixed.usable, true);
  is('and a reason to ignore it no longer applies', mixed.ignore_reason, null);
  is('the listing from the usable part survives', mixed.listings.length, 1);

  const nothing = mergeParts([
    part({ ignore_reason: 'Out of office.' }),
    part({ ignore_reason: 'Still out of office.' }),
  ]);
  is('nothing usable keeps the first reason given', nothing.ignore_reason, 'Out of office.');
  is('and the reply stays unusable', nothing.usable, false);

  // A model asked about domains 41-80 sometimes mentions one from 1-40 again.
  const repeated = mergeParts([
    part({ usable: true, listings: [listing('dup.com'), listing('one.com')] }),
    part({ usable: true, listings: [listing('DUP.com'), listing('two.com')] }),
  ]);
  is('a domain repeated across passes is kept once', repeated.listings.length, 3);
  is('at its first reading', repeated.listings[0]?.domain, 'dup.com');
  is('no part is empty-domained into the result', mergeParts([part({ listings: [listing('  ')] })]).listings.length, 0);
}

console.log('\n--- driving the parts, end to end ---');
{
  /*
    The sequence itself, against a fake: name the domains, then ask for them a
    batch at a time. Checked here rather than reasoned about, because against
    the real API this would cost money to run and could not assert what was
    asked - and what was asked is the whole point.
  */
  const part = (domains: string[]): ExtractionResult =>
    ({
      usable: true,
      ignore_reason: null,
      listings: domains.map((domain) => ({ domain }) as ExtractedListing),
    }) as ExtractionResult;
  const free = { inputTokens: 0, outputTokens: 0 };
  const all = Array.from({ length: 95 }, (_, index) => `site${index}.com`);

  const askedFor: string[][] = [];
  const whole = await readInParts(
    async () => ({ domains: all, usage: { inputTokens: 500, outputTokens: 900 } }),
    async (domains) => {
      askedFor.push(domains);
      return { result: part(domains), usage: { inputTokens: 2000, outputTokens: 17000 } };
    },
    { inputTokens: 1000, outputTokens: 128000 },
  );

  is('ninety-five domains take three passes', askedFor.length, 3);
  is('every domain was asked for', askedFor.flat().length, 95);
  is('none of them twice', new Set(askedFor.flat()).size, 95);
  is('and every one came back', whole.result?.listings.length, 95);
  is('in the order the reply listed them', whole.result?.listings[0]?.domain, 'site0.com');
  is('with no error', whole.error, undefined);

  /*
    The truncated first attempt is charged for. Those tokens were produced and
    billed before anything was cut off, so leaving them out of the total would
    under-report what a long reply actually cost.
  */
  is('the abandoned first attempt is still paid for', whole.usage.outputTokens, 128000 + 900 + 17000 * 3);
  is('and so is every pass that followed', whole.usage.inputTokens, 1000 + 500 + 2000 * 3);

  // A reply whose domains cannot even be listed is a human's problem, said so.
  const unlistable = await readInParts(async () => ({ domains: null, usage: free }), async () => ({ result: part([]), usage: free }), free);
  is('a reply whose domains cannot be listed says so', /reading by hand/.test(unlistable.error ?? ''), true);
  is('and returns no half-answer', unlistable.result, undefined);

  // The guard against a reply that is really a database.
  const enormous = await readInParts(
    async () => ({
      domains: Array.from({ length: MOST_DOMAINS_WORTH_READING + 1 }, (_, i) => `d${i}.com`),
      usage: free,
    }),
    async () => {
      bad('a reply past the ceiling should never reach a pass');
      return { result: part([]), usage: free };
    },
    free,
  );
  is('a reply listing hundreds of domains is refused as a CSV job', /import it as a CSV/.test(enormous.error ?? ''), true);

  /*
    One failing pass fails the read, naming which. A partial answer would be
    worse than none: a listing missing from the marketplace is visible, a
    listing silently absent from a merge is not.
  */
  let seen = 0;
  const broken = await readInParts(
    async () => ({ domains: all, usage: free }),
    async (domains) => {
      seen += 1;
      return seen === 2
        ? { error: 'the model returned nothing', usage: free }
        : { result: part(domains), usage: free };
    },
    free,
  );
  is('a failed pass fails the whole read', broken.result, undefined);
  is('and says which part it was', /part 2 of 3/.test(broken.error ?? ''), true);
  is('without running the passes after it', seen, 2);
}

console.log('\n--- approving new is not the same as approving an update ---');
{
  /*
    They are two different actions wearing one button. A new draft creates a
    listing nobody was selling; an update overwrites what we pay on a listing
    already in the marketplace - its cost price, its per-niche costs, its
    payment terms - and leaves the sell price where it is. So a hundred
    updates approved in one press can cut the margin on a hundred listings
    with nothing on the screen changing.
  */
  const rows = [
    { id: '1', matched: false },
    { id: '2', matched: true },
    { id: '3', matched: false },
    { id: '4', matched: true },
  ];
  const { created, updated } = splitByKind(rows);
  is('the new ones are the unmatched ones', created.map((r) => r.id).join(','), '1,3');
  is('and the updates are the matched ones', updated.map((r) => r.id).join(','), '2,4');
  is('between them they are every draft', created.length + updated.length, rows.length);
  is('an empty queue splits into nothing', splitByKind([]).created.length, 0);
}

console.log('\n--- an update from somebody else ---');
{
  /*
    The duplicates page holds back a domain that two *pending replies* offer.
    It says nothing about a reply competing with a listing already approved:
    one draft for that domain is not contested, so it sits in the ordinary
    queue and bulk approve walks through it, replacing the price one seller
    gave us with another seller's - which is the case worth catching, because
    it looks exactly like routine work.
  */
  const sameSeller = fromADifferentSeller({
    matched: true,
    fromAddress: 'pas@mgdk.dk',
    lastQuotedBy: 'pas@mgdk.dk',
  });
  is('the same publisher requoting is not flagged', sameSeller, false);

  is(
    'a different address quoting the same listing is',
    fromADifferentSeller({ matched: true, fromAddress: 'reseller@agency.com', lastQuotedBy: 'pas@mgdk.dk' }),
    true,
  );
  is(
    'and case or spacing does not make a seller a different one',
    fromADifferentSeller({ matched: true, fromAddress: '  PAS@MGDK.dk ', lastQuotedBy: 'pas@mgdk.dk' }),
    false,
  );

  // A new listing has nothing to overwrite, so there is nothing to warn about.
  is(
    'a new listing is never flagged',
    fromADifferentSeller({ matched: false, fromAddress: 'anyone@x.com', lastQuotedBy: 'other@y.com' }),
    false,
  );

  /*
    Unknown is not suspicious. A listing imported from a CSV has no email
    behind its price, and flagging every one of those would make the flag
    noise - which is how a flag stops being read.
  */
  is(
    'a listing with no email behind its price is not flagged',
    fromADifferentSeller({ matched: true, fromAddress: 'someone@x.com', lastQuotedBy: null }),
    false,
  );
  is(
    'nor is one where we do not know who is writing',
    fromADifferentSeller({ matched: true, fromAddress: '', lastQuotedBy: 'pas@mgdk.dk' }),
    false,
  );

  /*
    The flag has to reach `flags`, because "Approve all" takes the drafts with
    nothing flagged - a warning the bulk button does not read is a warning
    that changes nothing.
  */
  const service = fs.readFileSync(path.join(process.cwd(), 'src/lib/services/sourcing-service.ts'), 'utf8');
  is(
    'the queue adds it to the flags the bulk button reads',
    /flags = \[\.\.\.draft\.flags, DIFFERENT_SELLER\]/.test(service),
    true,
  );
  const table = fs.readFileSync(path.join(process.cwd(), 'src/components/admin/sourcing/drafts-table.tsx'), 'utf8');
  is('and the table has a label for it', table.includes('[DIFFERENT_SELLER]:'), true);
  is(
    'both sides spell it the same way, because they share the constant',
    DIFFERENT_SELLER,
    'different-seller',
  );

  // The one that decides whether any of this runs.
  is(
    'the bulk button still skips anything flagged',
    /lowConfidenceCount === 0 && draft\.flags\.length === 0/.test(table),
    true,
  );
}


console.log('\n--- a rate card that arrived as a spreadsheet ---');

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

/*
  The encoding rule, which is the whole reason this module reads bytes rather
  than taking a string.

  Excel on Windows saves CSV as Windows-1252, where a pound sign is the single
  byte 0xA3 - not valid UTF-8. Decoded leniently it becomes the replacement
  character, so "£250" arrives as "\uFFFD250", the currency is gone, and the
  extraction rules then correctly treat it as a price with no currency. A
  silently de-pounded rate card is the failure this exists to prevent.
*/
const windows1252 = new Uint8Array([
  0x44, 0x6f, 0x6d, 0x61, 0x69, 0x6e, 0x2c, 0x50, 0x72, 0x69, 0x63, 0x65, 0x0a, // Domain,Price
  0x61, 0x2e, 0x63, 0x6f, 0x6d, 0x2c, 0xa3, 0x32, 0x35, 0x30, // a.com,£250
]);
const decoded = decodeSheetBytes(windows1252.buffer as ArrayBuffer);
if ('error' in decoded) {
  bad('a Windows-1252 file is read', decoded.error);
} else {
  has('the pound sign survives', decoded.text, '£250');
  isTrue('and the re-encoding is reported', decoded.reEncoded);
}

const utf8 = decodeSheetBytes(bytesOf('Domain,Price\na.com,£250'));
if ('error' in utf8) {
  bad('a UTF-8 file is read', utf8.error);
} else {
  has('the pound sign survives there too', utf8.text, '£250');
  isTrue('and nothing is reported as re-encoded', !utf8.reEncoded);
}

/*
  The two wrong files people actually pick.

  An .xlsx is a zip; parsed as text it produces a page of binary that looks
  like it half worked. Detected by its own magic bytes, so a renamed file is
  still caught.
*/
const xlsx = decodeSheetBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]).buffer as ArrayBuffer);
isTrue('an xlsx is refused', 'error' in xlsx);
if ('error' in xlsx) has('and says to save as CSV', xlsx.error, 'save as CSV');

const pdf = decodeSheetBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]).buffer as ArrayBuffer);
isTrue('a PDF is refused', 'error' in pdf);
if ('error' in pdf) has('and says to screenshot it', pdf.error, 'screenshot');

isTrue('an empty file is refused', 'error' in decodeSheetBytes(new ArrayBuffer(0)));

console.log('\n--- the table it produces ---');

const simple = readRateCardCsv('Domain,Guest post,Link insertion\na.com,£250,£120\nb.com,£300,£150');
if (!simple.ok) {
  bad('an ordinary rate card reads', simple.error);
} else {
  is('three rows', simple.table.rows, 3);
  is('three columns', simple.table.columns, 3);
  has('the header row survives', simple.table.text, 'Domain | Guest post | Link insertion');
  has('and a data row', simple.table.text, 'a.com | £250 | £120');
}

/*
  Parsed without a header row on purpose.

  `header: true` on a file that has no headings silently promotes the first
  site's prices into column names - losing a row, and a publisher's cheapest
  one at that.
*/
const headerless = readRateCardCsv('a.com,250\nb.com,300\nc.com,350');
isTrue('a file with no heading row keeps every row', headerless.ok && headerless.table.rows === 3);

// Papa works the delimiter out, so a tab or semicolon export needs no telling.
const tabbed = readRateCardCsv('Domain\tPrice\na.com\t250');
isTrue('a tab-separated file is read', tabbed.ok && tabbed.table.columns === 2);
const semi = readRateCardCsv('Domain;Price\na.com;250');
isTrue('a semicolon-separated one is too', semi.ok && semi.table.columns === 2);

// Quoted commas are a value, not a new column.
const quoted = readRateCardCsv('Domain,Notes\na.com,"Finance, crypto and forex"');
isTrue('a quoted comma stays inside its cell', quoted.ok && quoted.table.columns === 2);
if (quoted.ok) has('with the text intact', quoted.table.text, 'Finance, crypto and forex');

/*
  Trailing empty columns dropped.

  A sheet saved after somebody clicked into column Z carries twenty-five empty
  cells on every row: noise to whoever reads the box, and several hundred
  tokens of nothing in the prompt.
*/
const padded = readRateCardCsv('Domain,Price,,,,\na.com,250,,,,');
isTrue('empty trailing columns are dropped', padded.ok && padded.table.columns === 2);

/*
  One column and more than one row means the delimiter was not recognised.
  Handing over a column of sentences and letting the model do its best is how
  prose becomes a price.
*/
const prose = readRateCardCsv('We charge about two fifty for a guest post\nand one twenty for an insertion');
isTrue('prose in a .csv is refused', !prose.ok);
if (!prose.ok) has('and says to paste it instead', prose.error, 'paste them into the box');

// A genuine single-column list of domains is a real thing, so one row alone
// is not an error.
isTrue('a single row is not refused', readRateCardCsv('a.com').ok);

isTrue('an empty file is refused', !readRateCardCsv('   ').ok);

const many = readRateCardCsv(
  ['Domain,Price', ...Array.from({ length: MAX_CSV_ROWS + 50 }, (_, i) => `d${i}.com,${i}`)].join('\n'),
);
isTrue('a huge file is capped', many.ok && many.table.rows === MAX_CSV_ROWS);
isTrue('and says how many it dropped', many.ok && many.table.truncated > 0);

console.log('\n--- which files go down this path ---');
isTrue('a .csv does', looksLikeSheet({ name: 'rates.csv' }));
isTrue('a .tsv does', looksLikeSheet({ name: 'rates.tsv' }));
isTrue('a text/csv type does', looksLikeSheet({ name: 'rates', type: 'text/csv' }));
isTrue('a screenshot does not', !looksLikeSheet({ name: 'shot.png', type: 'image/png' }));

/*
  An .xlsx goes down this path even though it cannot be read, and that is the
  point: the question is "is somebody handing us a spreadsheet", not "can we
  read it".

  Routing by readability was the bug. An .xlsx fell through to the image
  handler and got "nothing readable in that
  (application/vnd.openxmlformats-...)" - true, useless, and not the sentence
  that tells somebody to save it as CSV. The specific message existed and was
  unreachable. Driving the real control in a browser is what caught it; the
  build could not.
*/
isTrue('an .xlsx does, so it can be refused properly', looksLikeSheet({ name: 'rates.xlsx' }));
isTrue('and so does an .ods', looksLikeSheet({ name: 'rates.ods' }));
isTrue(
  'and one identified only by its mime type',
  looksLikeSheet({ name: 'download', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
);

// An old .xls is an OLE compound file, not a zip, so it needs its own check.
const oldXls = decodeSheetBytes(
  new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer as ArrayBuffer,
);
isTrue('an old .xls is refused', 'error' in oldXls);
if ('error' in oldXls) has('and says to save as CSV', oldXls.error, 'save as CSV');

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
