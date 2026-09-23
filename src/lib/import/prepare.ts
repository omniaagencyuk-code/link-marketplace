import { importFieldByKey, nicheFromPriceFieldKey, type ImportFieldKey } from './fields';
import type { ColumnMapping } from './auto-map';
import {
  isValidDomain,
  normaliseDomain,
  parseBoolean,
  parseCountry,
  parseLanguage,
  parseList,
  parseNiche,
  parseNumber,
  parsePrice,
  parseStatus,
  sanitiseText,
} from './normalise';
import type { PreparedRow, RowIssue, RowStatus, RowValues } from './types';
import type { NicheSlug } from '@/lib/types';

export interface PrepareOptions {
  /** Normalised domain -> existing website id. */
  existingDomains: Map<string, string>;
  /** Marketplace currency, used to flag mismatched prices. */
  currency: string;
}

/** Highest sensible values, used to catch obviously wrong cells. */
const limits = {
  domainRating: 100,
  organicTraffic: 1_000_000_000,
  referringDomains: 10_000_000,
  price: 1_000_000,
  turnaround: 365,
  wordCount: 20_000,
  links: 50,
};

function readCell(row: Record<string, string>, mappings: ColumnMapping[], field: ImportFieldKey) {
  const mapping = mappings.find((candidate) => candidate.field === field);
  if (!mapping) return '';
  return (row[mapping.header] ?? '').trim();
}

/**
 * Turn one raw CSV row into typed values plus any problems found.
 *
 * Nothing here throws: a bad cell becomes an issue on the row so the rest of
 * the file can still import.
 */
function prepareValues(
  raw: Record<string, string>,
  mappings: ColumnMapping[],
  options: PrepareOptions,
) {
  const values: RowValues = {};
  const supplied: ImportFieldKey[] = [];
  const issues: RowIssue[] = [];

  const cell = (field: ImportFieldKey) => readCell(raw, mappings, field);
  const note = (field: ImportFieldKey, message: string, severity: RowIssue['severity']) =>
    issues.push({ field, message, severity });

  // ---------------------------------------------------------------- domain
  const domainCell = cell('domain');
  const domain = domainCell ? normaliseDomain(domainCell) : null;
  if (!domainCell) {
    note('domain', 'Missing domain', 'error');
  } else if (!domain || !isValidDomain(domain)) {
    note('domain', `Invalid domain "${sanitiseText(domainCell, 80)}"`, 'error');
  } else {
    values.domain = domain;
    supplied.push('domain');
  }

  // ------------------------------------------------------------------ text
  for (const field of [
    'website_name',
    'description',
    'notes',
    'contact_email',
    'contact_name',
    'contact_notes',
  ] as const) {
    const value = cell(field);
    if (!value) continue;
    values[field] = sanitiseText(value);
    supplied.push(field);
  }

  // ---------------------------------------------------------------- niches
  const nicheCell = cell('primary_niche');
  if (nicheCell) {
    const niche = parseNiche(nicheCell);
    if (niche) {
      values.primary_niche = niche;
      supplied.push('primary_niche');
    } else {
      note('primary_niche', `Unknown niche "${sanitiseText(nicheCell, 40)}"`, 'error');
    }
  }

  const secondaryCell = cell('secondary_niches');
  if (secondaryCell) {
    const parsed = parseList(secondaryCell);
    const known = parsed.map(parseNiche).filter((niche): niche is NicheSlug => niche !== null);
    if (known.length) {
      values.secondary_niches = Array.from(new Set(known));
      supplied.push('secondary_niches');
    }
    if (known.length < parsed.length) {
      note('secondary_niches', 'Some secondary niches were not recognised and were dropped', 'warning');
    }
  }

  // --------------------------------------------------------------- country
  const countryCell = cell('country');
  if (countryCell) {
    const country = parseCountry(countryCell);
    if (country) {
      values.country = country;
      supplied.push('country');
    } else {
      note('country', `Unknown country "${sanitiseText(countryCell, 40)}"`, 'error');
    }
  }

  const languageCell = cell('language');
  if (languageCell) {
    const language = parseLanguage(languageCell);
    if (language) {
      values.language = language;
      supplied.push('language');
    } else {
      note('language', `Unknown language "${sanitiseText(languageCell, 40)}", defaulting to English`, 'warning');
    }
  }

  // --------------------------------------------------------------- numbers
  // `min` defaults to 0. Traffic change is the one column where a negative is
  // meaningful - a site losing traffic - so rejecting it would silently drop
  // exactly the figure a buyer most wants to see.
  const numberFields: { key: ImportFieldKey; max: number; min?: number; label: string }[] = [
    { key: 'domain_rating', max: limits.domainRating, label: 'domain rating' },
    { key: 'organic_traffic', max: limits.organicTraffic, label: 'organic traffic' },
    { key: 'referring_domains', max: limits.referringDomains, label: 'referring domains' },
    { key: 'minimum_word_count', max: limits.wordCount, label: 'minimum word count' },
    { key: 'maximum_links', max: limits.links, label: 'maximum links' },
    { key: 'top_country_share', max: 100, label: 'audience share' },
    { key: 'spam_score', max: 100, label: 'spam score' },
    { key: 'traffic_change_pct', max: 10_000, min: -100, label: 'traffic change' },
  ];

  for (const { key, max, min = 0, label } of numberFields) {
    const value = cell(key);
    if (!value) continue;
    const parsed = parseNumber(value);
    if (parsed === null) {
      note(key, `Invalid ${label} value "${sanitiseText(value, 40)}"`, 'error');
    } else if (parsed < min || parsed > max) {
      note(key, `${label} out of range: ${parsed}`, 'error');
    } else {
      (values as Record<string, unknown>)[key] = parsed;
      supplied.push(key);
    }
  }

  // An address that cannot be one is worth flagging: a mis-mapped column is
  // far commoner than a publisher with an unusual address, and importing it
  // silently means somebody emails nobody later.
  if (values.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.contact_email)) {
    note('contact_email', `"${sanitiseText(values.contact_email, 40)}" is not an email address`, 'warning');
  }

  // ---------------------------------------------------------------- prices
  const declaredCurrency = cell('currency').trim().toUpperCase();
  if (declaredCurrency) {
    values.currency = declaredCurrency;
    supplied.push('currency');
    if (declaredCurrency !== options.currency) {
      note('currency', `Prices are in ${declaredCurrency}, marketplace uses ${options.currency}`, 'warning');
    }
  }

  const priceColumns = [
    'guest_post_price',
    'niche_edit_price',
    'digital_pr_price',
    // Cost columns parse exactly like sell prices. They are checked against
    // the sell price further down, because a cost above the price is usually
    // a mis-mapped column rather than a genuinely loss-making placement.
    'guest_post_cost',
    'niche_edit_cost',
    'digital_pr_cost',
  ] as const;

  for (const key of priceColumns) {
    const value = cell(key);
    if (!value) continue;
    const parsed = parsePrice(value);
    if (parsed === null) {
      note(key, `Invalid price "${sanitiseText(value, 40)}"`, 'error');
      continue;
    }
    if (parsed.amount > limits.price) {
      note(key, `Price out of range: ${parsed.amount}`, 'error');
      continue;
    }
    values[key] = parsed.amount;
    supplied.push(key);
    if (parsed.currency && parsed.currency !== options.currency && !declaredCurrency) {
      note(key, `Price appears to be in ${parsed.currency}, marketplace uses ${options.currency}`, 'warning');
    }
  }

  // ----------------------------------------------------- prices by niche
  // Parsed exactly like any other price, and only for columns the admin
  // actually mapped - an unmapped niche is not a niche priced at zero.
  for (const mapping of mappings) {
    const niche = mapping.field ? nicheFromPriceFieldKey(mapping.field) : null;
    if (!niche || !mapping.field) continue;

    const value = cell(mapping.field);
    if (!value) continue;

    const parsed = parsePrice(value);
    if (parsed === null) {
      note(mapping.field, `Invalid ${niche} price "${sanitiseText(value, 40)}"`, 'error');
      continue;
    }
    if (parsed.amount <= 0 || parsed.amount > limits.price) {
      note(mapping.field, `${niche} price out of range: ${parsed.amount}`, 'error');
      continue;
    }

    (values as Record<string, unknown>)[mapping.field] = parsed.amount;
    supplied.push(mapping.field);
  }

  // A cost above the sell price loses money on every order. It is occasionally
  // real, so this warns rather than rejects - but it is far more often a
  // column mapped to the wrong field, which is worth catching before import.
  const costPairs = [
    ['guest_post_price', 'guest_post_cost', 'Guest post'],
    ['niche_edit_price', 'niche_edit_cost', 'Niche edit'],
    ['digital_pr_price', 'digital_pr_cost', 'Digital PR'],
  ] as const;

  for (const [priceKey, costKey, label] of costPairs) {
    const price = values[priceKey];
    const cost = values[costKey];
    if (typeof cost !== 'number') continue;

    if (typeof price !== 'number') {
      // A service only exists once it has a sell price, so a cost with no
      // price has nothing to attach to unless the listing already offers that
      // service. Duplicate detection has not run at this point, so the warning
      // covers both cases rather than claiming the cost is definitely lost.
      note(
        costKey,
        `${label} cost given with no ${label.toLowerCase()} price - ignored unless this site already offers it`,
        'warning',
      );
      continue;
    }

    if (cost > price) {
      note(costKey, `${label} cost (${cost}) is above its price (${price})`, 'warning');
    }
  }

  // ------------------------------------------------------------ turnaround
  const minCell = cell('turnaround_min_days');
  const maxCell = cell('turnaround_max_days');
  // Publisher lists often put the whole window in one column, e.g. "2-3 days".
  const rangeMatch = minCell ? /^(\d+)\s*(?:-|–|—|to)\s*(\d+)/i.exec(minCell.trim()) : null;

  const readTurnaround = (key: 'turnaround_min_days' | 'turnaround_max_days', value: string) => {
    const parsed = parseNumber(value);
    if (parsed === null || parsed < 1 || parsed > limits.turnaround) {
      note(key, `Invalid turnaround "${sanitiseText(value, 40)}"`, 'error');
      return;
    }
    values[key] = parsed;
    supplied.push(key);
  };

  if (minCell) {
    if (rangeMatch) {
      values.turnaround_min_days = Number(rangeMatch[1]);
      supplied.push('turnaround_min_days');
    } else {
      readTurnaround('turnaround_min_days', minCell);
    }
  }

  if (maxCell) {
    readTurnaround('turnaround_max_days', maxCell);
  } else if (rangeMatch && values.turnaround_min_days !== undefined) {
    // Only the combined column was supplied, so take the upper bound from it.
    values.turnaround_max_days = Number(rangeMatch[2]);
    supplied.push('turnaround_max_days');
  }

  if (
    values.turnaround_min_days !== undefined &&
    values.turnaround_max_days !== undefined &&
    values.turnaround_min_days > values.turnaround_max_days
  ) {
    note('turnaround_max_days', 'Turnaround minimum is greater than the maximum', 'error');
  }

  // -------------------------------------------------------------- booleans
  for (const key of ['dofollow', 'sponsored_tag'] as const) {
    const value = cell(key);
    if (!value) continue;
    const parsed = parseBoolean(value);
    if (parsed === null) {
      note(key, `Could not read "${sanitiseText(value, 40)}" as yes or no`, 'warning');
    } else {
      values[key] = parsed;
      supplied.push(key);
    }
  }

  // ----------------------------------------------------------- topic lists
  for (const key of ['accepted_niches', 'restricted_niches'] as const) {
    const value = cell(key);
    if (!value) continue;
    const parsed = parseList(value).map((entry) => sanitiseText(entry, 40));
    if (parsed.length) {
      values[key] = parsed;
      supplied.push(key);
    }
  }

  // ---------------------------------------------------------------- status
  const statusCell = cell('status');
  if (statusCell) {
    const status = parseStatus(statusCell);
    if (status) {
      values.status = status;
      supplied.push('status');
    } else {
      note('status', `Unknown status "${sanitiseText(statusCell, 40)}"`, 'error');
    }
  }

  return { values, supplied, issues };
}

function statusFor(issues: RowIssue[]): RowStatus {
  if (issues.some((issue) => issue.severity === 'error')) return 'error';
  if (issues.length) return 'warning';
  return 'ready';
}

/**
 * Prepare every row: normalise, validate, then resolve duplicates both against
 * the marketplace and within the file itself.
 */
export function prepareRows(
  rawRows: Record<string, string>[],
  mappings: ColumnMapping[],
  options: PrepareOptions,
): PreparedRow[] {
  const seenInFile = new Map<string, number>();

  return rawRows.map((raw, index) => {
    const rowNumber = index + 1;
    const { values, supplied, issues } = prepareValues(raw, mappings, options);
    const domain = values.domain ?? '';

    let status = statusFor(issues);
    let existingId: string | undefined;
    let duplicateOfRow: number | undefined;

    if (domain && status !== 'error') {
      const firstSeen = seenInFile.get(domain);
      if (firstSeen !== undefined) {
        duplicateOfRow = firstSeen;
        status = 'duplicate';
        issues.push({
          field: 'domain',
          message: `Same domain as row ${firstSeen}`,
          severity: 'warning',
        });
      } else {
        seenInFile.set(domain, rowNumber);
        const match = options.existingDomains.get(domain);
        if (match) {
          existingId = match;
          status = 'existing';
          issues.push({
            field: 'domain',
            message: 'Already in the marketplace',
            severity: 'warning',
          });
        }
      }
    }

    return {
      rowNumber,
      raw,
      domain,
      values,
      supplied,
      issues,
      status,
      existingId,
      duplicateOfRow,
      // Errors and in-file duplicates are never imported by default.
      selected: status === 'ready' || status === 'warning' || status === 'existing',
    };
  });
}

/** Re-run preparation for a single row after an inline edit. */
export function reprepareRow(
  row: PreparedRow,
  mappings: ColumnMapping[],
  options: PrepareOptions,
  seenDomains: Map<string, number>,
): PreparedRow {
  const { values, supplied, issues } = prepareValues(row.raw, mappings, options);
  const domain = values.domain ?? '';
  let status = statusFor(issues);
  let existingId: string | undefined;

  if (domain && status !== 'error') {
    const firstSeen = seenDomains.get(domain);
    if (firstSeen !== undefined && firstSeen !== row.rowNumber) {
      status = 'duplicate';
      issues.push({ field: 'domain', message: `Same domain as row ${firstSeen}`, severity: 'warning' });
    } else {
      const match = options.existingDomains.get(domain);
      if (match) {
        existingId = match;
        status = 'existing';
        issues.push({ field: 'domain', message: 'Already in the marketplace', severity: 'warning' });
      }
    }
  }

  return { ...row, values, supplied, issues, domain, status, existingId };
}

/** Field labels, for error messages shown in the review table. */
export function fieldLabel(key: ImportFieldKey) {
  return importFieldByKey.get(key)?.label ?? key;
}
