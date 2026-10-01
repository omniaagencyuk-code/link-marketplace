/**
 * The country a domain's own suffix names.
 *
 * Every listing used to be created claiming the United Kingdom, because that
 * was the default `newWebsiteDefaults` supplied and the column could not be
 * null. A publisher list rarely carries a country and an email never does, so
 * the default was the answer for almost all of them - and filtering the
 * marketplace for anywhere else found nothing.
 *
 * A country-code suffix is the one country signal we already hold for every
 * domain, needing no API call and no publisher to answer anything. `mgdk.dk`
 * is Danish and `terracetalk.co.uk` is British, and saying so is a great deal
 * better than saying everything is British.
 *
 * It is a signal, not proof: a German company can own a `.com` and an agency
 * can own a `.de` for a site about anywhere. So this never overrides a country
 * somebody stated or a traffic breakdown measured - it fills in the blank that
 * would otherwise have been filled in with a guess.
 */

/**
 * Suffixes deliberately NOT read as a country.
 *
 * Each of these is a country's own code sold and used as a generic word, so
 * the suffix says nothing about the audience. Reading `.io` as the British
 * Indian Ocean Territory or `.ai` as Anguilla would put the guess back, just
 * in a less obvious place.
 */
const SOLD_AS_GENERIC = new Set([
  'io', // British Indian Ocean Territory - the developer default
  'ai', // Anguilla - every AI product
  'co', // Colombia - sold as a short "company"
  'me', // Montenegro - sold as the English word
  'tv', // Tuvalu - sold to broadcasters
  'cc', // Cocos Islands
  'fm', // Micronesia - sold to radio
  'am', // Armenia - sold to radio
  'ly', // Libya - sold for word endings ("bit.ly")
  'to', // Tonga - sold for word endings
  'gg', // Guernsey - sold to gaming
  'sh', // St Helena - sold to shops and shells
  'so', // Somalia - sold as the English word
  'la', // Laos - sold as Los Angeles
  'st', // Sao Tome
  'ws', // Samoa - sold as "website"
  'nu', // Niue
  'gl', // Greenland - sold as a short link
  'mu', // Mauritius
  'bz', // Belize - sold as "biz"
  'vc', // St Vincent - sold to venture capital
  'ag', // Antigua - sold as the German "AG"
  'sc', // Seychelles
  'cx', // Christmas Island
  'pw', // Palau - sold as "password"
  'im', // Isle of Man - sold as the English verb
  'as', // American Samoa - sold as the English word
  'by', // Belarus - sold as the English word
  'do', // Dominican Republic - sold as the English verb
  'tk', // Tokelau - given away free, so it names nothing
  'ml', // Mali - given away free
  'ga', // Gabon - given away free
  'cf', // Central African Republic - given away free
  'gq', // Equatorial Guinea - given away free
]);

/**
 * ccTLDs read as their country, mapped to the ISO 3166-1 alpha-2 code.
 *
 * Only `uk` needs an entry of its own: the suffix is `uk` and the country code
 * is `GB`. Everything else is its own code uppercased, which is why this holds
 * the exceptions rather than two hundred identical pairs.
 */
const SUFFIX_EXCEPTIONS: Record<string, string> = {
  uk: 'GB',
};

/**
 * Suffixes trusted to name a market.
 *
 * An allow-list, not a block-list, because a new ccTLD sold as a generic word
 * appears every year and the failure is silent: a wrong country is invisible
 * until a buyer orders a placement for the wrong market. Anything not listed
 * here leaves the country unknown, which is the honest answer.
 */
const NAMES_A_COUNTRY = new Set([
  // Europe
  'uk', 'ie', 'de', 'at', 'ch', 'fr', 'be', 'nl', 'lu', 'dk', 'se', 'no', 'fi',
  'ee', 'lv', 'lt', 'pl', 'cz', 'sk', 'hu', 'si', 'hr', 'ro', 'bg',
  'gr', 'it', 'es', 'pt', 'tr', 'ua', 'ru', 'cy', 'mt', 'al', 'ba', 'mk', 'rs', 'is',
  // Americas
  'us', 'ca', 'mx', 'br', 'ar', 'cl', 'pe', 'uy', 'py', 'bo', 'ec',
  've', 'cr', 'pa', 'gt', 'hn', 'ni', 'sv', 'cu',
  // Asia-Pacific
  'au', 'nz', 'jp', 'kr', 'cn', 'hk', 'tw', 'sg', 'my', 'th', 'ph',
  'vn', 'id', 'in', 'pk', 'bd', 'lk', 'np', 'kh', 'mn', 'kz', 'uz',
  // Middle East and Africa
  'ae', 'sa', 'qa', 'kw', 'bh', 'om', 'jo', 'lb', 'il', 'eg', 'za',
  'ng', 'ke', 'ma', 'tn', 'dz', 'gh', 'tz', 'ug', 'et', 'sn', 'ci',
]);

/**
 * The country a domain's suffix names, or undefined.
 *
 * Reads the last label only, so `example.com.au` and `example.au` both give
 * Australia and no second-level list has to be maintained.
 */
export function countryFromDomain(domain: string): string | undefined {
  const suffix = domain.trim().toLowerCase().replace(/\.$/, '').split('.').pop();
  if (!suffix || suffix.length !== 2) return undefined;
  if (SOLD_AS_GENERIC.has(suffix)) return undefined;
  if (!NAMES_A_COUNTRY.has(suffix)) return undefined;
  return SUFFIX_EXCEPTIONS[suffix] ?? suffix.toUpperCase();
}
