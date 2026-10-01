import Anthropic from '@anthropic-ai/sdk';

/**
 * Reading a rate card that arrived as a picture.
 *
 * A publisher's prices are often a screenshot, a photographed media kit page
 * or a table in a PDF somebody has clipped. Typing one of those out by hand
 * is the slowest thing on the no-draft worklist, and the least useful: it is
 * transcription, and transcription is what a model is for.
 *
 * ## This transcribes. It does not extract.
 *
 * Deliberately a separate job from `extraction-rules.ts`, and a separate
 * prompt. That file decides what a listing is - which niches a price covers,
 * what counts as a refusal, what is left unknown - and it is the one place
 * those rules live. Letting it read pictures as well would put two different
 * kinds of judgement in one prompt and make the reading of an email depend on
 * whether an image happened to be attached.
 *
 * So this does one narrow thing: turn the picture into the text that was in
 * it. The result goes into the box the reviewer is already looking at, they
 * read it, and the ordinary extraction runs on it afterwards exactly as it
 * would on text the publisher had typed. Two steps, each checkable.
 *
 * ## Nothing is stored
 *
 * The image is held in the browser, sent once, and dropped. It is never
 * written to a table or a bucket, so there is no new place for a publisher's
 * document to sit and no migration to run. What survives is the text, in the
 * email body, stamped with who added it - the same record the typed version
 * leaves.
 */

/** Bumped when the wording below changes, the way PROMPT_VERSION is. */
export const TRANSCRIPTION_VERSION = '2026-10-01.1';

/**
 * What the model is asked to do with the picture.
 *
 * Written to be dull. Every instruction here is about fidelity, because the
 * judgement happens later and a transcription that has quietly tidied the
 * numbers is worse than no transcription at all - it is wrong in a way that
 * reads as right.
 */
export const TRANSCRIPTION_RULES = `You are transcribing a publisher's rate card from an image so that it can be read as text.

Write out what is in the image. Do not interpret it, summarise it, or decide what it means for anybody.

Rules:

- Reproduce every price exactly as written, with its currency symbol or code. Never convert between currencies. Never round.
- Keep the table structure. Use one line per row and a tab between columns, so the columns stay lined up when it is read back.
- Keep the column headings, in the words the publisher used.
- Transcribe the other text too - turnaround times, link rules, word counts, conditions, footnotes. A condition in small print under a table is often the thing that matters.
- Keep the original language. Do not translate.
- Where something is genuinely unreadable, write [unreadable] in its place rather than guessing at it. A guessed digit in a price is the worst thing this can produce.
- If the image contains no prices or rate information at all, say exactly: NO RATES IN THIS IMAGE

Output the transcription only. No preamble, no commentary, no markdown fences.`;

/** An image as the browser handed it over. */
export interface PastedImage {
  /** image/png, image/jpeg, image/gif or image/webp - what the API accepts. */
  mediaType: string;
  /** Base64, without the data: prefix. */
  data: string;
}

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * How many, and how large.
 *
 * Five is more pages of a media kit than anybody pastes at once, and the
 * ceiling is well under the API's own request limit with room for the rest of
 * the message. Both are checked on the server, because a limit enforced only
 * in the browser is a suggestion.
 */
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Whether these images can be sent, and why not when they cannot.
 *
 * Pure, and checked on the server rather than only in the browser: the action
 * is an endpoint, and a limit enforced in a React component is a suggestion.
 * Returns the sentence a reviewer should read, or null when there is nothing
 * to say.
 */
export function checkImages(images: PastedImage[]): string | null {
  if (images.length === 0) return 'Paste an image first.';
  if (images.length > MAX_IMAGES) {
    return `That is more than ${MAX_IMAGES} images. Send them in batches.`;
  }

  for (const image of images) {
    if (!ACCEPTED_IMAGE_TYPES.includes(image.mediaType)) {
      return `${image.mediaType} is not an image this can read.`;
    }
    // Base64 carries three bytes in every four characters, so this is the
    // real size rather than the size of the string holding it.
    if ((image.data.length * 3) / 4 > MAX_IMAGE_BYTES) {
      return 'One of those images is larger than 5MB.';
    }
  }

  return null;
}

export interface TranscriptionOutcome {
  text?: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Send the pictures, get the text back.
 *
 * One call for all of them, so a media kit spread over three screenshots is
 * read as one document rather than three unrelated ones - a column heading on
 * the first page belongs to the rows on the second.
 */
export async function transcribeRateCard(
  images: PastedImage[],
  model: string,
): Promise<TranscriptionOutcome> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: 'No ANTHROPIC_API_KEY is configured.' };
  if (images.length === 0) return { error: 'No images were sent.' };

  const client = new Anthropic({ apiKey: key });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      system: [
        {
          type: 'text' as const,
          text: TRANSCRIPTION_RULES,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: [
        {
          role: 'user' as const,
          content: [
            ...images.map((image) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: image.mediaType as 'image/png',
                data: image.data,
              },
            })),
            {
              type: 'text' as const,
              text:
                images.length === 1
                  ? 'Transcribe this rate card.'
                  : `Transcribe these ${images.length} images as one rate card, in the order given.`,
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The image could not be read.' };
  }
}
