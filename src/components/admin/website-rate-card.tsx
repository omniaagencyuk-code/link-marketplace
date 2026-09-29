import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { formatPrice } from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import { rateCard } from '@/lib/utils/pricing';
import { placementMargins, worstPlacement, type PlacementMargin, type TrueCostIndex } from '@/lib/utils/margin';
import type { LinkTypeSlug, Website } from '@/lib/types';

/**
 * Everything this publisher charges us, and everything we charge for it.
 *
 * The row above shows the general rate and the thinnest margin on the
 * listing, which is what somebody scanning three hundred rows needs. This is
 * the rest of it: one line per topic, with the sell price, what it costs us
 * and what it leaves, per placement.
 *
 * One panel rather than a "read more" on each of price, cost and margin.
 * Three expanders a row, all opening the same rate card, would be three
 * clicks to the same answer and three chances to read a cost against the
 * wrong price.
 *
 * The prices come from `rateCard`, which the listing page and the order card
 * already use, so a topic with no premium on one placement shows the standard
 * rate rather than a gap to decode. The costs are laid over the top, because
 * they can be missing while the prices are not - and a panel that vanished
 * whenever a cost was unrecorded would hide the rate card exactly when
 * somebody is trying to find out what it is.
 */
export function WebsiteRateCard({
  website,
  costs,
}: {
  website: Pick<Website, 'services' | 'nichePrices'>;
  costs?: TrueCostIndex;
}) {
  const { placements, rows } = rateCard(website);
  const margins = placementMargins(website, costs);
  const worst = worstPlacement(margins);

  /*
    Topics with a cost of their own and no price of their own.

    They are not in the rate card - nothing is priced differently for them -
    but they cost differently, which is the state a listing is in between
    approving a publisher's email and the next pricing run. Left out, the
    panel would show a tidy standard rate on a site currently selling
    gambling below cost.
  */
  const pricedNiches = new Set(rows.map((row) => row.niche).filter(Boolean));
  const costOnly = [...new Set(margins.map((margin) => margin.niche))].filter(
    (niche): niche is string => Boolean(niche) && !pricedNiches.has(niche),
  );

  const lines: { key: string; label: string; niche: string | null }[] = [
    ...rows.map((row) => ({
      key: row.niche ?? 'standard',
      label: row.niche ? acceptedNicheLabel(row.niche) : 'Standard rate',
      niche: row.niche,
    })),
    ...costOnly.map((niche) => ({
      key: niche,
      label: `${acceptedNicheLabel(niche)} (no rate set)`,
      niche,
    })),
  ];

  if (placements.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-white p-3 text-[12px] text-muted">
        Nothing on this listing is on sale yet, so there is no rate card to show.
      </p>
    );
  }

  /** The price shown for a topic and placement, falling back to the standard. */
  function priceFor(niche: string | null, type: LinkTypeSlug) {
    const row = rows.find((candidate) => candidate.niche === niche);
    const cell = row?.cells.find((candidate) => candidate.linkType === type);
    if (cell) return { priceMinor: cell.priceMinor, override: cell.override };

    // A cost-only topic sells at the standard rate, which is what makes it
    // worth pointing at.
    const standard = rows[0]?.cells.find((candidate) => candidate.linkType === type);
    return standard ? { priceMinor: standard.priceMinor, override: false } : null;
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="mb-2 text-[12px] font-medium text-ink">
        What this publisher charges us, and what we sell it for
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-muted">Topic</th>
              {placements.map((type) => (
                <th key={type} className="px-2 py-1.5 text-right font-medium text-muted">
                  {linkTypeLabels[type]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-t border-line">
                <td className="px-2 py-1.5 whitespace-nowrap text-ink-soft">{line.label}</td>
                {placements.map((type) => (
                  <td key={type} className="tabular px-2 py-1.5 text-right whitespace-nowrap align-top">
                    <Figures
                      price={priceFor(line.niche, type)}
                      margin={margins.find(
                        (margin) => margin.niche === line.niche && margin.type === type,
                      )}
                      worst={worst}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        {lines.length === 1
          ? 'This publisher quoted one price for everything, so every topic sells at the standard rate and costs what the standard rate costs. '
          : 'Topics not listed here sell and cost the standard rate. '}
        Costs are what leaves our account: the publisher&rsquo;s price converted, with the FX buffer,
        the payment fee and any VAT they add.
      </p>
    </div>
  );
}

/** Sell price, cost and what it leaves - or the reason there is no answer. */
function Figures({
  price,
  margin,
  worst,
}: {
  price: { priceMinor: number; override: boolean } | null;
  margin: PlacementMargin | undefined;
  worst: PlacementMargin | null;
}) {
  if (!price) return <span className="text-muted">&mdash;</span>;

  const isWorst = worst != null && worst.niche === margin?.niche && worst.type === margin?.type;
  const losing = margin != null && !margin.unpriced && margin.profitMinor <= 0;

  return (
    <>
      <span className={`block ${price.override ? 'font-medium text-ink' : 'text-ink-soft'}`}>
        {price.priceMinor > 0 ? formatPrice(price.priceMinor) : 'not priced'}
      </span>

      {!margin ? (
        <span className="block text-[11px] text-muted">no cost recorded</span>
      ) : (
        <>
          <span className={`block text-[11px] ${losing ? 'text-coral-700' : 'text-muted'}`}>
            cost {formatPrice(margin.costMinor)}
            {margin.unpriced ? '' : (
              <>
                {' '}
                &middot; {margin.profitMinor > 0 ? '+' : ''}
                {formatPrice(margin.profitMinor)}
              </>
            )}
          </span>
          {margin.unpriced ? null : (
            <span className={`block text-[11px] ${losing ? 'text-coral-700' : 'text-muted'}`}>
              {margin.marginPct}%{isWorst ? ' · thinnest' : ''}
            </span>
          )}
        </>
      )}
    </>
  );
}
