import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { EXTRACTION_RULES, PROMPT_VERSION, buildUserMessage } from './extraction-rules';
import { z } from 'zod';
import { fromWire, wireResultSchema, type ExtractionResult } from './schema';
import { readInParts } from './in-parts';

/**
 * Talking to the model.
 *
 * Server-only. The key is read from the environment at call time and never
 * passed to a component, so there is no path by which it reaches a browser -
 * the same arrangement as the Stripe secret and the Supabase service role.
 *
 * Two shapes, one prompt: a real-time call for a handful of emails where the
 * answer is wanted now, and a Batch submission for a whole export, at half
 * the price, collected later. The prompt, the schema and the parsing are
 * shared, so the two modes cannot produce different readings of the same
 * email.
 */

export interface ExtractionRequest {
  /** Our key for the result, so a batch can be matched back to its email. */
  emailId: string;
  askedAboutDomain: string | null;
  fromAddress: string;
  subject: string | null;
  body: string;
}

export interface ExtractionUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractionOutcome {
  emailId: string;
  result?: ExtractionResult;
  error?: string;
  usage?: ExtractionUsage;
  /**
   * The answer was cut off at the output ceiling, rather than being wrong.
   *
   * A separate flag and not a string match on `error`, because this is the one
   * failure that is worth retrying differently - `extractInParts` reads the
   * reply in batches - and deciding that by looking for words in a message
   * meant for a human breaks the day somebody rewords the message.
   */
  truncated?: boolean;
}

/** Cost per million tokens, for the budget guard and the spend shown to an admin. */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** The Batch API is half price, which is the reason it is worth the wait. */
export function estimateCostUsd(
  model: string,
  usage: ExtractionUsage,
  mode: 'realtime' | 'batch',
): number {
  const rate = PRICING[model] ?? PRICING['claude-opus-5']!;
  const full =
    (usage.inputTokens / 1_000_000) * rate.input + (usage.outputTokens / 1_000_000) * rate.output;
  return mode === 'batch' ? full / 2 : full;
}

export function isExtractionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * The configured client.
 *
 * Exported because there is now a second caller - reading a rate card out of
 * an image - and a second `new Anthropic(...)` is a second place to forget
 * the workspace header. That is not hypothetical: it was forgotten, and the
 * first real image produced a 400 nobody could act on.
 */
export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Extraction needs ANTHROPIC_API_KEY. Add it to the Vercel project environment and redeploy.',
    );
  }

  /*
    An organisation-level key has to say which workspace to bill and attribute
    the call to; a workspace-scoped key carries that already and needs no
    header. Supporting both means an existing key keeps working - swapping a
    key that is referenced in one place is easy, but it is not free, and there
    is no reason to force it.
  */
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

  return new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
  });
}

/**
 * The request body, built once and used by both modes.
 *
 * The rules go in `system` with a cache breakpoint and the email in the user
 * turn, in that order and never the other way round: the rules are ~2,000
 * tokens that are byte-identical on every call, so cached they cost a tenth,
 * and anything volatile placed before them would throw the cache away on
 * every email.
 */
function requestBody(request: ExtractionRequest, model: string, onlyDomains?: string[]) {
  return {
    model,
    /*
      Room for the answer, not a guess at it.

      A thread read whole is a longer input than a single message, and a
      network reply expands into one listing per domain - forty-odd fields
      each. At 8000 the JSON was being cut off mid-object, which arrives as
      unparseable text rather than as an error, and the reply is charged for
      either way.

      16000 was not enough either. One listing serialises to about 440
      tokens, so that ceiling held thirty-six domains - and a Danish network
      rate card pasted in as a table ran to a hundred and twenty, each with
      its own price. 64000 held that, and then five agency replies listing
      several hundred sites each ran past it too.

      128000 is the model's own ceiling, not another guess, so this is the
      last time this number moves. Billing is on tokens actually produced, so
      the ceiling costs nothing until it is needed; what it costs is the right
      to use a plain request, since the SDK needs streaming at this size to
      avoid the HTTP timeout.

      A ceiling is not a plan, though. `extractInParts` below is what handles
      a reply longer than any ceiling.
    */
    max_tokens: 128000,
    system: [
      {
        type: 'text' as const,
        text: EXTRACTION_RULES,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [
      {
        role: 'user' as const,
        content: buildUserMessage({
          askedAboutDomain: request.askedAboutDomain,
          fromAddress: request.fromAddress,
          subject: request.subject,
          body: request.body,
          onlyDomains,
        }),
      },
    ],
    output_config: { format: zodOutputFormat(wireResultSchema) },
  };
}

/**
 * Extract one email now.
 *
 * Errors are returned rather than thrown: one unreadable email in a run of
 * fifty must not lose the other forty-nine, and the email it failed on is
 * marked `failed` with this message so it can be retried on its own.
 */
export async function extractNow(
  request: ExtractionRequest,
  model: string,
): Promise<ExtractionOutcome> {
  try {
    /*
      Streamed, not because anybody watches it arrive, but because the SDK
      needs it at this output ceiling: a plain request holding 64000 tokens
      open runs past the HTTP timeout and fails with nothing to show for the
      tokens it has already been charged for. `finalMessage()` waits for the
      whole thing and hands back the same message a plain call would.
    */
    const stream = getClient().messages.stream(requestBody(request, model));
    const message = await stream.finalMessage();

    const outcome = readMessage(message, request.emailId);

    /*
      A reply that lists more sites than one answer can hold.

      Five agency replies hit this, each listing several hundred domains. The
      error told whoever read it to paste the email in two halves by hand,
      which is work the thing that noticed should be doing - and these were
      publishers worth having.
    */
    if (outcome.truncated) return extractInParts(request, model, message.usage);

    return outcome;
  } catch (error) {
    return { emailId: request.emailId, error: messageFor(error) };
  }
}

const domainListSchema = z.object({
  domains: z.array(z.string()),
});

/**
 * Read a reply that is too long for one answer, in parts.
 *
 * The sequence lives in `in-parts.ts` and takes its two calls as arguments, so
 * it can be driven by a fake: what it does - name the domains, then ask for
 * them a batch at a time, with the whole email in every pass - is the part
 * worth checking, and against the real API that check would cost money and
 * could not assert what was asked.
 */
async function extractInParts(
  request: ExtractionRequest,
  model: string,
  firstAttempt: { input_tokens: number; output_tokens: number },
): Promise<ExtractionOutcome> {
  const client = getClient();
  const spent = (usage: { input_tokens: number; output_tokens: number }) => ({
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  });

  const parts = await readInParts(
    // The domains, and nothing else. Ten-odd tokens each, so a reply listing
    // six hundred of them still answers inside a fraction of the ceiling.
    async () => {
      const message = await client.messages
        .stream({
          model,
          max_tokens: 16000,
          system: [
            {
              type: 'text' as const,
              text: EXTRACTION_RULES,
              cache_control: { type: 'ephemeral' as const },
            },
          ],
          messages: [
            {
              role: 'user' as const,
              content: `${buildUserMessage({
                askedAboutDomain: request.askedAboutDomain,
                fromAddress: request.fromAddress,
                subject: request.subject,
                body: request.body,
              })}

Do not extract anything yet. List every domain this reply offers a placement
on, in the order they appear, and nothing else.`,
            },
          ],
          output_config: { format: zodOutputFormat(domainListSchema) },
        })
        .finalMessage();

      const named = domainListSchema.safeParse(safeJson(textOf(message.content)));
      return { domains: named.success ? named.data.domains : null, usage: spent(message.usage) };
    },

    // The whole email every time, and only the answer narrowed.
    async (domains) => {
      const message = await client.messages
        .stream(requestBody(request, model, domains))
        .finalMessage();
      const outcome = readMessage(message, request.emailId);
      return { result: outcome.result, error: outcome.error, usage: spent(message.usage) };
    },

    spent(firstAttempt),
  );

  return { emailId: request.emailId, ...parts };
}

/** Submit a whole run and return the provider's batch id to collect against. */
export async function submitBatch(
  requests: ExtractionRequest[],
  model: string,
): Promise<string> {
  const batch = await getClient().messages.batches.create({
    requests: requests.map((request) => ({
      // Our email id, so results - which come back in any order - can be
      // matched by key rather than by position.
      custom_id: request.emailId,
      params: requestBody(request, model),
    })),
  });
  return batch.id;
}

export type BatchState = 'running' | 'completed' | 'cancelled' | 'failed';

export async function checkBatch(providerBatchId: string): Promise<BatchState> {
  const batch = await getClient().messages.batches.retrieve(providerBatchId);
  if (batch.processing_status !== 'ended') return 'running';
  if (batch.cancel_initiated_at) return 'cancelled';
  return 'completed';
}

/**
 * Collect a finished batch.
 *
 * Results arrive in any order, keyed by the custom_id we sent, and a single
 * request can have failed while the rest succeeded - so each one is turned
 * into the same outcome shape a real-time call produces and handled
 * identically downstream.
 */
export async function collectBatch(providerBatchId: string): Promise<ExtractionOutcome[]> {
  const outcomes: ExtractionOutcome[] = [];

  for await (const entry of await getClient().messages.batches.results(providerBatchId)) {
    const emailId = entry.custom_id;

    if (entry.result.type !== 'succeeded') {
      outcomes.push({
        emailId,
        error:
          entry.result.type === 'errored'
            ? `Batch request errored: ${JSON.stringify(entry.result.error).slice(0, 300)}`
            : `Batch request ${entry.result.type}.`,
      });
      continue;
    }

    const message = entry.result.message;
    outcomes.push(readMessage(message, emailId));
  }

  return outcomes;
}

/**
 * A finished message, turned into an outcome.
 *
 * Shared by the real-time path and the batch collector, because they were
 * doing the same four things and only one of them had learned to tell a
 * truncated answer from a malformed one. The other reported "did not return
 * usable JSON" and left whoever read it to work out that the reply simply
 * listed more domains than the response could hold.
 */
function readMessage(
  message: {
    content: { type: string }[];
    stop_reason: string | null;
    usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null };
  },
  emailId: string,
): ExtractionOutcome {
  const text = textOf(message.content);

  /*
    Two different failures, told apart.

    `safeJson` returns null when the text is not JSON at all, and a null root
    fails the schema with "expected object, received null" and an empty path.
    Reported as a schema mismatch it sends whoever reads it to look at the
    schema, which is fine - the actual cause is usually that the model ran
    out of output tokens half way through an object, and `stop_reason` has
    been saying so all along.
  */
  const json = safeJson(text);
  if (json === null) {
    if (message.stop_reason === 'max_tokens') {
      return {
        emailId,
        truncated: true,
        error:
          'This reply lists more sites than one answer can hold. Press "Retry failed" and then Read - read on its own rather than in a batch, it is taken in parts.',
      };
    }
    return {
      emailId,
      error: `The model did not return JSON (stop reason: ${message.stop_reason ?? 'unknown'}). It produced ${text.trim().length} characters.`,
    };
  }

  const parsed = wireResultSchema.safeParse(json);
  if (!parsed.success) {
    return {
      emailId,
      error: `The model's JSON did not match the schema: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'the result'} ${issue.message}`)
        .join('; ')}`,
    };
  }

  return {
    emailId,
    // Sentinels back to nulls at the boundary, so nothing downstream ever
    // sees the shape the wire forced on us.
    result: fromWire(parsed.data),
    usage: {
      inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0),
      outputTokens: message.usage.output_tokens,
    },
  };
}

/** The text of a message, which both readers want and neither should repeat. */
function textOf(content: { type: string }[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * An API failure in words somebody can do something about.
 *
 * Exported for the same reason as the client above: the useful sentences -
 * the workspace one especially - are worth more than the raw message, and
 * every caller should get them.
 */
export function messageFor(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the API. Try a smaller run, or switch the mode to batch.';
  }
  if (error instanceof Anthropic.APIError) {
    // The one error whose fix is not guessable from its own wording.
    if (/not scoped to a workspace/i.test(error.message)) {
      return (
        'This API key belongs to the organisation rather than to a workspace. ' +
        'Either create a workspace-scoped key in the Anthropic console and replace ' +
        'ANTHROPIC_API_KEY, or set ANTHROPIC_WORKSPACE_ID in Vercel to the workspace id ' +
        '(it is in the console URL when you open the workspace, starting wrkspc_). Redeploy after either.'
      );
    }
    if (/credit balance/i.test(error.message)) {
      return 'The Anthropic account has no credit. Top it up in the console, then press Retry.';
    }
    return `API error ${error.status}: ${error.message}`.slice(0, 400);
  }
  return error instanceof Error ? error.message.slice(0, 400) : 'Unknown error.';
}

export { PROMPT_VERSION };
