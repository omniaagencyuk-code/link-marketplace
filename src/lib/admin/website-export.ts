import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { linkTypeLabels } from '@/lib/utils/labels';
import { placementMargins, worstPlacement, type TrueCostIndex } from '@/lib/utils/margin';
import type { CsvColumn } from './export-csv';
import type { LinkTypeSlug, WebsiteListItem } from '@/lib/types';

/**
 * What a listing looks like in a spreadsheet.
 *
 * Everything the admin table knows, flattened: what we sell it for, what it
 * costs us, who the publisher is and what they will take. It is the file you
 * work from when the job is not one the screen does - pasting domains into
 * Majestic, reconciling costs, sending a shortlist to somebody.
 *
 * Money is written in major units with no symbol, because a spreadsheet
 * should be able to add up the column. The currency has a column of its own
 * rather than being glued to each figure - the same rule the rest of the
 * codebase follows, for the same reason: a number and its unit have to travel
 * together, but they must not travel *inside* each other.
 */

/** Minor units to a plain number a spreadsheet can total. */
function major(minor: number | null | undefined): string {
  return typeof minor === 'number' ? (minor / 100).toFixed(2) : '';
}

function priceOf(website: WebsiteListItem, type: LinkTypeSlug): number | undefined {
  return website.services.find((service) => service.type === type)?.priceMinor;
}

function costOf(website: WebsiteListItem, type: LinkTypeSlug): number | undefined {
  return website.services.find((service) => service.type === type)?.costPriceMinor;
}

/**
 * The rate card in one cell.
 *
 * Twenty-one columns for seven topics across three placements would be mostly
 * empty, and a spreadsheet of mostly empty columns is one nobody scrolls. One
 * readable list instead, in the same shape a person would write it.
 */
function topicRates(website: WebsiteListItem): string {
  return website.nichePrices
    .filter((price) => price.priceMinor > 0)
    .map(
      (price) =>
        `${acceptedNicheLabel(price.niche)} ${linkTypeLabels[price.linkType]} ${(price.priceMinor / 100).toFixed(2)}`,
    )
    .join('; ');
}

export function websiteExportColumns(
  trueCosts: Record<string, TrueCostIndex> = {},
): CsvColumn<WebsiteListItem>[] {
  const worstFor = (website: WebsiteListItem) =>
    worstPlacement(placementMargins(website, trueCosts[website.id]));

  return [
    { header: 'Domain', value: (w) => w.domain },
    { header: 'Title', value: (w) => w.title },
    { header: 'Status', value: (w) => w.status },
    { header: 'Niche', value: (w) => nicheName(w.niche) },
    { header: 'Secondary niches', value: (w) => w.secondaryNiches.map(nicheName).join('; ') },
    { header: 'Country', value: (w) => (w.country ? countryShortName(w.country) : '') },
    { header: 'Language', value: (w) => w.language },

    { header: 'DR', value: (w) => w.metrics.domainRating },
    { header: 'Organic traffic', value: (w) => w.metrics.organicTraffic },
    { header: 'Referring domains', value: (w) => w.metrics.referringDomains },

    { header: 'Guest post price', value: (w) => major(priceOf(w, 'guest-post')) },
    { header: 'Niche edit price', value: (w) => major(priceOf(w, 'niche-edit')) },
    { header: 'Digital PR price', value: (w) => major(priceOf(w, 'digital-pr')) },
    { header: 'Topic rates', value: topicRates },

    { header: 'Guest post cost', value: (w) => major(costOf(w, 'guest-post')) },
    { header: 'Niche edit cost', value: (w) => major(costOf(w, 'niche-edit')) },
    { header: 'Digital PR cost', value: (w) => major(costOf(w, 'digital-pr')) },
    // The publisher's own currency, once. Gluing it to each figure would stop
    // the price columns adding up, which is most of what a spreadsheet is for.
    { header: 'Cost currency', value: (w) => w.costCurrency ?? '' },

    // The thinnest margin across everything sellable, topic rates included -
    // the same figure the Margin column shows, so the file and the screen
    // cannot disagree.
    { header: 'Worst margin %', value: (w) => worstFor(w)?.marginPct ?? '' },
    { header: 'Worst margin is', value: (w) => {
      const worst = worstFor(w);
      if (!worst) return '';
      return worst.niche
        ? `${acceptedNicheLabel(worst.niche)} ${linkTypeLabels[worst.type]}`
        : linkTypeLabels[worst.type];
    } },

    { header: 'Publisher email', value: (w) => w.contact?.email ?? '' },
    { header: 'Publisher name', value: (w) => w.contact?.name ?? '' },
    { header: 'Publisher notes', value: (w) => w.contact?.notes ?? '' },

    { header: 'Accepts', value: (w) => (w.rules.acceptedNiches ?? []).map(acceptedNicheLabel).join('; ') },
    { header: 'Will not take', value: (w) => (w.rules.restrictedNiches ?? []).join('; ') },
    { header: 'Min words', value: (w) => w.rules.minWordCount || '' },
    { header: 'Max words', value: (w) => w.rules.maxWordCount || '' },
    { header: 'Max links', value: (w) => w.rules.maxLinks || '' },
    { header: 'Link attribute', value: (w) => w.rules.linkAttribute },

    { header: 'Turnaround min days', value: (w) => w.headlineService?.turnaroundMinDays ?? '' },
    { header: 'Turnaround max days', value: (w) => w.headlineService?.turnaroundMaxDays ?? '' },
    { header: 'Verified', value: (w) => (w.verified ? 'yes' : 'no') },
    { header: 'Updated', value: (w) => w.updatedAt },
  ];
}
