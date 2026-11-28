import { revalidatePath } from 'next/cache';
import { attemptSignUp } from '@/lib/auth/credentials';
import { refuseCrossSite, respondTo, sameOrigin } from '@/lib/auth/form-response';

/**
 * Where the signup form posts.
 *
 * This is the one the failure was measured on: twelve refused submissions
 * between 28 October and 27 November, every one of them "Failed to find
 * Server Action". See `src/lib/auth/credentials.ts`.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuseCrossSite();

  const form = await request.formData();
  const next = String(form.get('next') ?? '') || null;

  const outcome = await attemptSignUp({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
    fullName: String(form.get('name') ?? ''),
    company: String(form.get('company') ?? ''),
    next,
  });

  if (outcome.kind === 'signed-in') revalidatePath('/', 'layout');

  return respondTo(request, outcome, '/signup', next);
}
