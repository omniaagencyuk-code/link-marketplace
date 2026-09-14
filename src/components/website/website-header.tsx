import Link from 'next/link';
import { ChevronRight, Globe2, Languages, MapPin, Star } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { VerifiedBadge } from '@/components/shared/verified-badge';
import { nicheName } from '@/lib/data/categories';
import { countryName } from '@/lib/data/countries';
import { languageLabels } from '@/lib/utils/labels';
import type { Website } from '@/lib/types';

export function WebsiteHeader({ website }: { website: Website }) {
  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-6 lg:py-8">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
            <li>
              <Link href="/marketplace" className="hover:text-ink">
                Marketplace
              </Link>
            </li>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <li>
              <Link href={`/marketplace?niche=${website.niche}`} className="hover:text-ink">
                {nicheName(website.niche)}
              </Link>
            </li>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <li aria-current="page" className="text-ink-soft">
              {website.domain}
            </li>
          </ol>
        </nav>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {website.domain}
          </h1>
          {website.verified ? <VerifiedBadge withLabel /> : null}
        </div>

        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">
          {website.description}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-soft">
          <span className="flex items-center gap-1.5">
            <Globe2 className="h-4 w-4 text-muted" aria-hidden="true" />
            {nicheName(website.niche)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-muted" aria-hidden="true" />
            {countryName(website.country)}
          </span>
          <span className="flex items-center gap-1.5">
            <Languages className="h-4 w-4 text-muted" aria-hidden="true" />
            {languageLabels[website.language] ?? website.language}
          </span>
          <span className="flex items-center gap-1.5">
            <Star className="h-4 w-4 text-muted" aria-hidden="true" />
            <span className="tabular">{website.rating.toFixed(1)}</span>
            <span className="text-muted">({website.completedOrders} orders)</span>
          </span>
          {website.secondaryNiches.map((niche) => (
            <Badge key={niche} tone="outline">
              {nicheName(niche)}
            </Badge>
          ))}
        </div>
      </Container>
    </section>
  );
}
