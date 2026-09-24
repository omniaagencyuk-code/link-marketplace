import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { EXTRACTION_RULES, PROMPT_VERSION, buildUserMessage } from './extraction-rules';
import { extractionResultSchema, type ExtractionResult } from './schema';

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

function getClient(): Anthropic {
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
function requestBody(request: ExtractionRequest, model: string) {
  return {
    model,
    max_tokens: 8000,
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
        }),
      },
    ],
    output_config: { format: zodOutputFormat(extractionResultSchema) },
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
    const response = await getClient().messages.parse(requestBody(request, model));

    if (!response.parsed_output) {
      return {
        emailId: request.emailId,
        error: `The model did not return usable JSON (stop reason: ${response.stop_reason ?? 'unknown'}).`,
      };
    }

    return {
      emailId: request.emailId,
      result: response.parsed_output,
      usage: {
        inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    return { emailId: request.emailId, error: messageFor(error) };
  }
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
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const parsed = extractionResultSchema.safeParse(safeJson(text));
    if (!parsed.success) {
      outcomes.push({
        emailId,
        error: `The model's JSON did not match the schema: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
      });
      continue;
    }

    outcomes.push({
      emailId,
      result: parsed.data,
      usage: {
        inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0),
        outputTokens: message.usage.output_tokens,
      },
    });
  }

  return outcomes;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function messageFor(error: unknown): string {
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
