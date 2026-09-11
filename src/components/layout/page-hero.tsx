import { Container } from './container';

export function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-12 lg:py-16">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 text-[16px] leading-relaxed text-muted lg:text-[17px]">
              {description}
            </p>
          ) : null}
          {children ? <div className="mt-7">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}
