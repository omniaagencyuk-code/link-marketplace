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
import { extractionResultSchema, type ExtractedListing } from '../src/lib/sourcing/schema';
import { applyGeneralPriceToNiches, countLowConfidence, flagsFor } from '../src/lib/sourcing/review';
import { sensitiveNicheSlugs } from '../src/lib/config/accepted-niches';

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
    notes: null, confidence: {}, evidence: {},
    ...over,
  };
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

console.log('\n--- bulk approval safety ---');
const confident = blank({ guest_post_cost: 100, contact_email: 'a@b.example', confidence: { guest_post_cost: 'high' },
  niches: { ...blank().niches, gambling: { accepted: 'yes', guest_post_cost: 200, link_insertion_cost: null } } });
is('a clean draft has no low-confidence fields', countLowConfidence(confident), 0);
is('and no flags, so bulk approve may take it', flagsFor(confident).length, 0);
const shaky = blank({ guest_post_cost: 100, contact_email: 'a@b.example', confidence: { guest_post_cost: 'low', turnaround_min_days: 'low' } });
is('a guessed draft counts its low fields', countLowConfidence(shaky), 2);
is('and is never swept up in bulk', countLowConfidence(shaky) > 0 || flagsFor(shaky).length > 0, true);

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
