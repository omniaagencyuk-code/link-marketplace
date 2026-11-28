import { revalidatePath } from 'next/cache';
import { attemptSignIn } from '@/lib/auth/credentials';
import { refuseCrossSite, respondTo, sameOrigin } from '@/lib/auth/form-response';

/**
 * Where the login form posts.
 *
 * A URL rather than a server action, because an action is addressed by an id
 * baked into the client bundle and a deploy invalidates every page already
 * open: the submit after a deploy posted an id this deployment had never
 * heard of, and the person saw a form that did nothing. See
 * `src/lib/auth/credentials.ts` for the rule itself - this route reads the
 * form, calls it, and shapes the answer.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuseCrossSite();

  const form = await request.formData();
  const next = String(form.get('next') ?? '') || null;

  const outcome = await attemptSignIn({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
    next,
  });

  // The chrome changes the moment somebody is signed in, and the layout is
  // cached. Left here rather than inside `respondTo` so it is visible at the
  // one place it happens.
  if (outcome.kind === 'signed-in') revalidatePath('/', 'layout');

  return respondTo(request, outcome, '/login', next);
}
