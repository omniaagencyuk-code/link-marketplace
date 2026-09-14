import {
  BarChart3,
  ClipboardList,
  CreditCard,
  FolderKanban,
  PenLine,
  Receipt,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';

/**
 * What the platform actually does.
 *
 * Anything not yet built carries a "Coming soon" badge rather than being
 * quietly listed as though it exists. Flip `comingSoon` when a feature ships.
 */
const features = [
  {
    icon: ShieldCheck,
    title: 'Hand vetted publishers',
    body: 'Traffic quality, outbound link patterns, indexation and editorial standards all checked before a site is listed.',
  },
  {
    icon: BarChart3,
    title: 'Transparent SEO metrics',
    body: 'Domain rating, organic traffic, referring domains and audience geography shown on every listing.',
  },
  {
    icon: Receipt,
    title: 'Upfront pricing',
    body: 'One price per placement, visible before you order. No enquiry forms and no negotiation.',
  },
  {
    icon: Timer,
    title: 'Fast turnaround',
    body: 'Each listing states its own typical turnaround, so a campaign can be planned rather than guessed at.',
  },
  {
    icon: ClipboardList,
    title: 'Order management',
    body: 'Every placement tracked from brief to live URL, with status against each item in one queue.',
  },
  {
    icon: PenLine,
    title: 'Content writing',
    body: 'Order articles alongside a placement or entirely on their own, briefed against your keyword and target page.',
  },
  {
    icon: CreditCard,
    title: 'Single billing',
    body: 'One account and one invoice instead of a separate supplier relationship for every publisher.',
    comingSoon: true,
  },
  {
    icon: FolderKanban,
    title: 'Campaign management',
    body: 'Group orders by client or project, with per-campaign reporting and user seats for your team.',
    comingSoon: true,
  },
];

export function PlatformFeatures() {
  return (
    <section className="border-b border-line bg-white" aria-labelledby="platform-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <h2
            id="platform-heading"
            className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
          >
            One platform for the whole job
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Finding publishers is only part of it. These are the pieces that keep a campaign
            moving once it starts.
          </p>
        </div>

        <ul className="mt-11 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <li key={feature.title}>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-sunken text-ink-soft">
                <feature.icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                {feature.title}
                {feature.comingSoon ? (
                  <Badge tone="outline" size="sm">
                    Coming soon
                  </Badge>
                ) : null}
              </h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{feature.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
