import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 text-center">
      <Logo />
      <p className="mt-10 text-[13px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        We could not find that page
      </h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
        The link may be out of date, or the website listing you were looking for is no longer
        available in the marketplace.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild variant="primary">
          <Link href="/websites">Browse websites</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
