import type Anthropic from '@anthropic-ai/sdk';
import { getClient, isExtractionConfigured, messageFor } from './client';

/**
 * Reading a rate card that arrived as a picture or a PDF.
 *
 * A publisher's prices are often a screenshot, a photographed media kit page
 * or a PDF media kit. Typing one of those out by hand is the slowest thing on
 * the no-draft worklist, and the least useful: it is transcription, and
 * transcription is what a model is for.
 *
 * PDFs go to the model whole, as `document` blocks, rather than being parsed
 * for a text layer first. That is the decision worth defending: a text-layer
 * parse returns nothing from a scanned media kit and returns a column-shuffled
 * mess from a table, and both failures are silent - what comes back looks like
 * a transcription. The model sees the rendered pages, so a scan and a vector
 * table read the same way.
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
export const TRANSCRIPTION_VERSION = '2026-10-06.1';

/**
 * What the model is asked to do with the picture.
 *
 * Written to be dull. Every instruction here is about fidelity, because the
 * judgement happens later and a transcription that has quietly tidied the
 * numbers is worse than no transcription at all - it is wrong in a way that
 * reads as right.
 */
export const TRANSCRIPTION_RULES = `You are transcribing a publisher's rate card from an image or a PDF so that it can be read as text.

Write out what is in it. Do not interpret it, summarise it, or decide what it means for anybody.

Rules:

- Reproduce every price exactly as written, with its currency symbol or code. Never convert between currencies. Never round.
- Keep the table structure. Use one line per row and a tab between columns, so the columns stay lined up when it is read back.
- Keep the column headings, in the words the publisher used.
- Transcribe the other text too - turnaround times, link rules, word counts, conditions, footnotes. A condition in small print under a table is often the thing that matters.
- Keep the original language. Do not translate.
- Where something is genuinely unreadable, write [unreadable] in its place rather than guessing at it. A guessed digit in a price is the worst thing this can produce.
- A PDF may run to several pages. Transcribe every page that carries rates or conditions, in order, and ignore pages that are only photographs, a cover or a contents list.
- If there are no prices or rate information at all, say exactly: NO RATES IN THIS IMAGE

Output the transcription only. No preamble, no commentary, no markdown fences.`;

/** A file as the browser handed it over. */
export interface PastedImage {
  /** An image type the API accepts, or application/pdf. */
  mediaType: string;
  /**
   * Base64, without the data: prefix and without newlines.
   *
   * The newline part is a real requirement rather than tidiness: the API
   * rejects a base64 document payload that carries them, and some encoders
   * wrap at 76 characters out of habit.
   */
  data: string;
}

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export const PDF_TYPE = 'application/pdf';

/** Everything the transcriber accepts, for a file picker's `accept`. */
export const ACCEPTED_ATTACHMENT_TYPES = [...ACCEPTED_IMAGE_TYPES, PDF_TYPE];

export function isPdf(file: { mediaType?: string; type?: string; name?: string }): boolean {
  const type = file.mediaType ?? file.type ?? '';
  if (type === PDF_TYPE) return true;
  // A PDF dragged out of some mail clients arrives with no type at all.
  return (file.name ?? '').toLowerCase().endsWith('.pdf');
}

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
 * A PDF is allowed to be bigger than a screenshot, and still well short of
 * the request ceiling.
 *
 * A media kit runs to a few megabytes; anything past this is a brochure with
 * photographs in it, and the prices in it are worth less than the tokens.
 */
export const MAX_PDF_BYTES = 12 * 1024 * 1024;

/**
 * What one request may carry, in raw bytes before base64.
 *
 * The API's limit is 32MB on the encoded request, and base64 costs four
 * characters for every three bytes - so the real ceiling is around 24MB of
 * file, and 22 leaves room for the prompt.
 *
 * This is not hypothetical tidiness: the existing per-image limit alone
 * allowed five five-megabyte images, which is 25MB of file and about 33MB
 * once encoded. Over the limit, failing at the API with a message about
 * request size that nothing in the UI could explain.
 */
export const MAX_REQUEST_BYTES = 22 * 1024 * 1024;

/** Base64 carries three bytes in every four characters. */
function rawBytes(data: string): number {
  return (data.length * 3) / 4;
}

/**
 * Whether these files can be sent, and why not when they cannot.
 *
 * Pure, and checked on the server rather than only in the browser: the action
 * is an endpoint, and a limit enforced in a React component is a suggestion.
 * Returns the sentence a reviewer should read, or null when there is nothing
 * to say.
 */
export function checkImages(images: PastedImage[]): string | null {
  if (images.length === 0) return 'Attach a file first.';
  if (images.length > MAX_IMAGES) {
    return `That is more than ${MAX_IMAGES} files. Send them in batches.`;
  }

  for (const image of images) {
    const pdf = image.mediaType === PDF_TYPE;

    if (!pdf && !ACCEPTED_IMAGE_TYPES.includes(image.mediaType)) {
      return `${image.mediaType} is not something this can read. Attach a PDF, or paste a screenshot.`;
    }

    const ceiling = pdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
    if (rawBytes(image.data) > ceiling) {
      return pdf
        ? `That PDF is larger than ${MAX_PDF_BYTES / 1024 / 1024}MB. Send the pages with the rates on, rather than the whole brochure.`
        : `One of those images is larger than ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`;
    }
  }

  /*
    The whole request, not just each file.

    Five files each under their own ceiling can still be more than one request
    may carry. Checked here so the reviewer is told which rule they hit,
    rather than being handed the API's own message about request size.
  */
  const total = images.reduce((sum, image) => sum + rawBytes(image.data), 0);
  if (total > MAX_REQUEST_BYTES) {
    return `Those come to ${Math.round(total / 1024 / 1024)}MB together, which is more than one request can carry. Send them in two goes.`;
  }

  return null;
}

export interface TranscriptionOutcome {
  text?: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * One file, as the content block its type needs.
 *
 * A PDF is a `document` block and an image is an `image` block - the API will
 * not take a PDF as an image, and the failure is a 400 rather than anything
 * the UI could explain. Both go before the text block in the message, which
 * is what the API expects for documents.
 *
 * Whitespace is stripped from the base64 on the way out. The API rejects a
 * document payload containing newlines, and an encoder that wraps at 76
 * characters is a normal thing to meet.
 */
function toContentBlock(file: PastedImage) {
  const data = file.data.replace(/\s+/g, '');

  if (file.mediaType === PDF_TYPE) {
    return {
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data },
    };
  }

  return {
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: file.mediaType as 'image/png',
      data,
    },
  };
}

/**
 * Send the files, get the text back.
 *
 * One call for all of them, so a media kit spread over three screenshots is
 * read as one document rather than three unrelated ones - a column heading on
 * the first page belongs to the rows on the second. A PDF and a screenshot
 * can go together in the same call for the same reason.
 */
export async function transcribeRateCard(
  images: PastedImage[],
  model: string,
): Promise<TranscriptionOutcome> {
  if (!isExtractionConfigured()) return { error: 'No ANTHROPIC_API_KEY is configured.' };
  if (images.length === 0) return { error: 'No files were sent.' };

  /*
    The same client the extraction uses, not a second one. An organisation-
    level key needs the workspace header, and building a client here meant
    building one without it - a 400 saying so, on the first real rate card,
    with nothing in the UI able to explain it.
  */
  const client = getClient();

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
            ...images.map((file) => toContentBlock(file)),
            {
              type: 'text' as const,
              text:
                images.length === 1
                  ? 'Transcribe this rate card.'
                  : `Transcribe these ${images.length} files as one rate card, in the order given.`,
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
    // Through the shared describer, so the workspace and credit errors
    // arrive as instructions rather than as raw API text.
    return { error: messageFor(error) };
  }
}
