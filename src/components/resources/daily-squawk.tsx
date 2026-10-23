import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/cms/reveal';
import { Float } from '@/components/marketing/page-motion';
import type { Animation } from '@/lib/cms/sections';
import type { BlogPost } from '@/lib/types/blog';

const FADE_UP: Animation = { entrance: 'fade-up', speed: 'normal', delay: 'none' };
const SLIDE_RIGHT: Animation = { entrance: 'slide-right', speed: 'normal', delay: 'none' };

/**
 * The Daily Squawk.
 *
 * The house paper, as a band across the middle of the index. The same
 * masthead /digital-pr's hero draws, because it is the same invented
 * publication and two spellings of a joke is one too many.
 *
 * ## There is no sign-up box, and that is deliberate
 *
 * The design this was drawn from has an email field, a Subscribe button and
 * "Join 1,000+ SEOs and marketers already subscribed". There is no mailing
 * list in this codebase - no list, no double opt-in, no sender, no
 * unsubscribe - so a field here would collect addresses nothing would ever
 * send to, and the line under it would be a number nobody counted.
 *
 * `sales_suppressions` and the approval rules on `outbound_emails` exist
 * because an email that has left cannot be recalled; a form that quietly
 * banked addresses outside all of that is the same mistake with a nicer
 * front end. So the band points at the writing that already exists, which is
 * what a reader came for, and the field can be added the day there is
 * somewhere for it to post.
 */
export function DailySquawk({ latest }: { latest?: BlogPost }) {
  return (
    <section className="overflow-x-clip border-b border-line bg-accent-50/50">
      <Container size="wide" className="py-16 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
          {/* ------------------------------------------------ the paper */}
          <Reveal animation={SLIDE_RIGHT}>
            <div className="relative mx-auto w-full max-w-sm">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-accent-400/20 blur-3xl"
              />

              <div
                aria-hidden="true"
                className="relative rounded-xl border border-line bg-white p-5 shadow-[var(--shadow-pop)]"
              >
                <p className="text-center text-[10px] font-semibold tracking-[0.3em] text-muted uppercase">
                  The house paper
                </p>
                <p className="mt-1 text-center font-masthead text-[1.6rem] leading-none font-black tracking-tight text-ink">
                  The Daily Squawk
                </p>
                <div className="mt-3 border-y border-ink/15 py-1 text-center text-[9px] tracking-[0.18em] text-muted uppercase">
                  Real insights · Real strategies
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[0, 1].map((column) => (
                    <div key={column} className="space-y-1.5">
                      {['w-full', 'w-10/12', 'w-full', 'w-9/12'].map((width, index) => (
                        <span
                          key={width + index}
                          className={`block h-1.5 rounded bg-surface-sunken ${width}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Decorative: the words beside it say everything it says. */}
              <Float seconds={8} className="pointer-events-none absolute -right-4 -bottom-8">
                <Image
                  src="/images/parrots/gambling-parrot.webp"
                  alt=""
                  width={160}
                  height={160}
                  aria-hidden="true"
                  className="h-24 w-24 object-contain"
                />
              </Float>
            </div>
          </Reveal>

          {/* ------------------------------------------------- the words */}
          <Reveal animation={FADE_UP}>
            <div className="min-w-0">
              <p className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
                The Daily Squawk
              </p>

              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                Everything we have worked out, written down
              </h2>

              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
                The guides here come from running the marketplace: what publishers actually charge,
                what editors actually accept, and which campaigns were worth the money. They are
                free to read and need no account.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {latest ? (
                  <Button asChild variant="accent" size="lg">
                    <Link href={`/resources/${latest.slug}`}>
                      Read the latest guide
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="lg">
                  <Link href="#topics">Browse by topic</Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
