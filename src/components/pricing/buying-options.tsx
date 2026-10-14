import { Circle, Handshake, Layers, Repeat, ShoppingCart, type LucideIcon } from 'lucide-react';

/**
 * The four ways to buy.
 *
 * Deliberately not shaped like plan cards: no price, no cadence, no feature
 * list, no "most popular" badge and no button on each one. Three of the four
 * end in the same place - the enquiry form - and giving each its own CTA
 * would turn a description of how buying works into four competing offers.
 */

export interface BuyingOption extends Record<string, unknown> {
  icon: string;
  heading: string;
  description: string;
}

/**
 * The icons an editor may choose, by name.
 *
 * A fixed registry rather than a free text class name: the content is
 * editable in the admin, and an editable field that reaches into an icon
 * library is an editable field that can render nothing and break the row.
 * An unrecognised name gets the neutral dot, which looks deliberate.
 */
const ICONS: Record<string, LucideIcon> = {
  cart: ShoppingCart,
  layers: Layers,
  repeat: Repeat,
  handshake: Handshake,
};

export function BuyingOptions({ items }: { items: BuyingOption[] }) {
  return (
    <div data-reveal-items="" className="mt-10 grid gap-5 sm:grid-cols-2">
      {items.map((item, index) => {
        const Icon = ICONS[item.icon?.trim().toLowerCase() ?? ''] ?? Circle;
        return (
          <div
            key={item.heading || index}
            className="group rounded-[var(--radius-card)] border border-line bg-white p-6 transition-colors duration-150 hover:border-line-strong hover:bg-surface/40"
          >
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-50 text-accent-700 transition-colors duration-150 group-hover:bg-accent-100"
              aria-hidden="true"
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <h3 className="mt-4 text-[17px] font-semibold text-ink">{item.heading}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{item.description}</p>
          </div>
        );
      })}
    </div>
  );
}
