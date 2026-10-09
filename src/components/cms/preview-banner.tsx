import { draftMode } from 'next/headers';
import { Eye, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hasPreviewGrant } from '@/lib/auth/preview-session';
import { exitPreviewAction } from '@/app/(marketing)/preview-actions';
import { PreviewPathField } from './preview-path-field';

/**
 * The bar that says this browser is not seeing what everybody else sees.
 *
 * ## The bug this exists for
 *
 * Previewing turns on two things that do not expire together. The grant is a
 * cookie with thirty minutes on it; draft mode is a session cookie with no
 * lifetime at all, and what draft mode does is stop the framework serving
 * this browser the prerendered page.
 *
 * So half an hour after a preview the grant has lapsed and `isPreview()`
 * correctly returns false - the published page is what renders - while the
 * browser goes on bypassing the cache on every marketing page, with nothing
 * on screen saying so. Measured against `next start` with the grant deleted
 * and only the draft-mode cookie left, the homepage went from 6-10ms served
 * from the cache to 35-53ms rendered fresh; a wrong cookie value put it back
 * to 5-6ms, which is what says it was the bypass and not the weather.
 * Against the live database those same reads measure 434ms, and there is no
 * edge cache in front of them either.
 *
 * One administrator previews one section and their browser is slow for the
 * rest of the day on a site that is fast for everybody else - including fast
 * for them the moment they open a private window, which is the kind of
 * evidence that sends you looking at the wrong thing.
 *
 * ## Why it costs ordinary visitors nothing
 *
 * `isEnabled` is the one request value readable inside a caching scope - the
 * framework has to know it to decide what to serve - so reading it here does
 * not make the page dynamic. The grant cookie is read second and only once
 * draft mode has passed, which is the ordering `isPreview()` keeps and for
 * the same reason: `cookies()` on the common path would undo the
 * prerendering this whole arrangement exists to protect.
 */
export async function PreviewBanner() {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return null;

  // Only reached in draft mode, where the page is already uncached.
  const granted = await hasPreviewGrant();

  return (
    <div
      className={
        granted
          ? 'border-b border-accent-200 bg-accent-50 text-accent-800'
          : 'border-b border-coral-200 bg-coral-50 text-coral-700'
      }
    >
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        {granted ? (
          <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}

        <p className="min-w-0 flex-1 text-[13px] leading-snug">
          {granted ? (
            <>
              <strong className="font-semibold">Previewing unpublished changes.</strong> Only
              this browser sees them, and only for half an hour.
            </>
          ) : (
            <>
              <strong className="font-semibold">Your preview has ended.</strong> This is the
              published page - but this browser is still skipping the cache, which makes every
              page slower until you leave.
            </>
          )}
        </p>

        {/*
          A plain form, so it works before any JavaScript has loaded. Somebody
          reading this bar is here because something is already not behaving,
          and the way out should not wait on the page finishing what it was
          doing.
        */}
        <form action={exitPreviewAction}>
          <PreviewPathField />
          <Button type="submit" size="sm" variant="primary">
            Exit preview
          </Button>
        </form>
      </div>
    </div>
  );
}
