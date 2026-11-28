import { safeReturnPath } from '@/lib/auth/return-to';
import type { CredentialOutcome } from '@/lib/auth/credentials';

/**
 * Turning what an attempt decided into what the browser gets back.
 *
 * One endpoint has to answer two callers. The form enhances itself with
 * `fetch` and wants the message as JSON so it can render it without losing
 * what somebody typed; the same form with JavaScript off is an ordinary POST
 * and wants a redirect, because that is the only way a browser can be told
 * anything. Both arrive at the same route, and which one it is shows in the
 * `Accept` header the enhanced path sets.
 *
 * Kept separate from the route handlers so it can be asserted against:
 * nothing here reads a database, a cookie or the clock, so every function is
 * a value in and a response out. Revalidating the layout on a successful
 * sign-in is left at the call site, where it is visible.
 */

/** No cache may keep any of this: the body depends on a credential. */
const PRIVATE = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  Vary: 'Accept, Cookie',
};

/** What the enhanced form sends, and what it asks for back. */
export const JSON_ACCEPT = 'application/json';

export function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes(JSON_ACCEPT);
}

/**
 * Whether the post came from our own pages.
 *
 * A server action checked this for us and a route handler does not, so
 * dropping it on the way out of `useActionState` would have been a quiet
 * regression. The attack it refuses is login CSRF: a form on somebody else's
 * site posting the attacker's own credentials here, which signs the visitor
 * into an account the attacker controls and then collects whatever they do
 * in it. Nothing about that needs the victim's password, so "they would have
 * to know the credentials" is not a defence.
 *
 * A browser always sends `Origin` on a cross-origin POST, and sends it on a
 * same-origin one too, so a missing header is not a browser form and is
 * refused with the rest. `Host` is what the request was addressed to, which
 * is what `Origin` has to agree with.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function refuseCrossSite(): Response {
  return new Response('Refused: this form may only be posted from the site itself.', {
    status: 403,
    headers: { ...PRIVATE, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * A redirect a browser follows with GET: on to where they were going, back
 * to the form with the reason, or out to a provider's own consent page.
 *
 * What goes in the header is a relative reference for everything on this
 * site. Next expands it to an absolute URL before it reaches the browser -
 * measured, not assumed - so this is not a behaviour change; it is that the
 * expansion is the framework's, done the same way as for every `redirect()`
 * in the application, rather than this module reconstructing our own address
 * out of `request.url` and being the one place that gets it wrong. Nothing
 * here needs to know what host we answer on, so nothing here is told.
 *
 * Google's consent URL is the one absolute target, passed through as it
 * stands. It never takes params, and nothing untrusted reaches `target`
 * either way: it is a literal path, a path `landingFor` has already checked,
 * or a URL Supabase built.
 */
export function seeOther(target: string, params: Record<string, string> = {}): Response {
  const query = new URLSearchParams(params).toString();
  const location = query ? `${target}${target.includes('?') ? '&' : '?'}${query}` : target;
  // 303, so the browser follows it with GET rather than re-posting the form.
  return new Response(null, { status: 303, headers: { ...PRIVATE, Location: location } });
}

/**
 * The answer to a credentials post.
 *
 * `formPath` is the page the form is on, which the route knows statically -
 * /login posts to the sign-in route and /signup to the sign-up one - rather
 * than being read off a `Referer` anybody can set.
 *
 * A refused credential answers 200 with a body rather than 4xx. The request
 * was well formed and was handled; what failed is the credential, which is
 * page state, and a status code that makes `fetch` wrappers throw would hide
 * the message this exists to deliver.
 */
export function respondTo(
  request: Request,
  outcome: CredentialOutcome,
  formPath: string,
  next: string | null | undefined,
): Response {
  const safeNext = safeReturnPath(next);

  if (outcome.kind === 'signed-in') {
    return wantsJson(request)
      ? Response.json({ next: outcome.next }, { headers: PRIVATE })
      : seeOther(outcome.next);
  }

  if (wantsJson(request)) {
    const body =
      outcome.kind === 'notice' ? { notice: outcome.message } : { error: outcome.message };
    return Response.json(body, { headers: PRIVATE });
  }

  /*
    `failed`, not `error`. /auth/confirm already sends people to
    `/login?error=link-expired` and the login page draws that as a warning
    about a link rather than as a refused credential; one param carrying both
    would make the page guess which it is from the code. Two names, two
    drawings, no guessing.
  */
  return seeOther(formPath, {
    [outcome.kind === 'notice' ? 'notice' : 'failed']: outcome.code,
    ...(safeNext ? { next: safeNext } : {}),
  });
}
