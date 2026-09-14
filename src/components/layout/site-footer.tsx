import Link from 'next/link';
import { Container } from './container';
import { Logo } from './logo';
import { brand } from '@/lib/config/brand';
import { footerNav } from '@/lib/config/navigation';

export function SiteFooter() {
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

          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-[12px] font-semibold tracking-wide text-ink uppercase">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {group.items.map((item) => (
                  <li key={`${group.title}-${item.href}-${item.label}`}>
                    <Link
                      href={item.href}
                      className="text-[13px] text-muted transition-colors hover:text-ink"
                    >
                      {item.label}
                    </Link>
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
