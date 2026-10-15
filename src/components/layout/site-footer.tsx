import Link from 'next/link';
import { Container } from './container';
import { Logo } from './logo';
import { brand } from '@/lib/config/brand';
import { defaultMenu } from '@/lib/navigation/defaults';
import type { MenuNode } from '@/lib/navigation/menus';

/**
 * The footer, drawn from a menu it is given.
 *
 * The columns arrive as a prop for the same reason the header's do: they are
 * editable, and a component that imported `footerNav` directly would be a
 * component no edit could reach. The default is that same array, so a caller
 * with no menu to hand renders exactly what shipped.
 *
 * A column is a top-level item and its links are that item's children - one
 * shape for the header and the footer, with the difference drawn here rather
 * than stored. What a column has instead of a dropdown is a heading, and the
 * heading is a link only when somebody gave it one.
 */
export function SiteFooter({ menu = defaultMenu('footer') }: { menu?: MenuNode[] } = {}) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-white">
      <Container size="wide">
        <div className="grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:py-14">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              {brand.description}
            </p>
            <p className="font-handwritten mt-5 text-[19px] leading-tight text-accent-700">
              No squawk. Just quality links.
            </p>
            <div className="mt-5 space-y-1 text-[13px] text-muted">
              <p>
                <a
                  className="text-ink-soft hover:text-accent-700"
                  href={`mailto:${brand.supportEmail}`}
                >
                  {brand.supportEmail}
                </a>
              </p>
              {brand.phone ? <p>{brand.phone}</p> : null}
            </div>
          </div>

          {menu.map((group, groupIndex) => (
            <nav key={`${groupIndex}-${group.label}`} aria-label={group.label}>
              <h2 className="text-[12px] font-semibold tracking-wide text-ink uppercase">
                {/* A heading that was given a destination keeps it, which is
                    what a one-link column looks like. Without one it is text,
                    not an anchor to nowhere. */}
                {group.href ? (
                  <Link href={group.href} className="transition-colors hover:text-accent-700">
                    {group.label}
                  </Link>
                ) : (
                  group.label
                )}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {group.children.map((item, itemIndex) => (
                  <li key={`${itemIndex}-${item.label}`}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="text-[13px] text-muted transition-colors hover:text-ink"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      /* Half a row, left visible. An editor who typed a label
                         and no link should see it in the footer and go back
                         for the link, rather than wonder where it went. */
                      <span className="text-[13px] text-muted-soft">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-line py-6 text-[12px] text-muted md:flex-row md:items-center md:justify-between">
          <p>
            &copy; {year} {brand.company.legalName}.
            {brand.company.registrationNumber ? ` Company no. ${brand.company.registrationNumber}.` : ''}
            {brand.company.vatNumber ? ` VAT ${brand.company.vatNumber}.` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {brand.company.addressLines.length ? (
              <span>{brand.company.addressLines.join(', ')}</span>
            ) : null}
            {brand.social.x ? (
              <a href={brand.social.x} className="hover:text-ink" rel="noreferrer noopener">
                X
              </a>
            ) : null}
            {brand.social.linkedin ? (
              <a href={brand.social.linkedin} className="hover:text-ink" rel="noreferrer noopener">
                LinkedIn
              </a>
            ) : null}
          </div>
        </div>
      </Container>
    </footer>
  );
}
