/**
 * Cutting a Takeout export into pieces small enough to upload.
 *
 * A Server Action's request body is capped - Next defaults to 1MB and Vercel
 * refuses anything over 4.5MB whatever the config says - and a year of one
 * mailbox is tens of megabytes. The upload failed with "page couldn't load",
 * which is what a rejected request body looks like from a browser.
 *
 * Most of that weight is never wanted. The server already throws attachments
 * away when it extracts the text, so a 7.8MB email of base64 signature images
 * crosses the wire to contribute two kilobytes. The answer is to stop sending
 * it rather than to raise a limit until it fits.
 *
 * Each batch is itself a valid mbox - a contiguous run of messages, each
 * starting with its own `From ` line - so the server parser is completely
 * unchanged. It cannot tell a batch from a small export, which is the point:
 * two parsers that must agree about message boundaries would eventually
 * disagree.
 */

/** Matches the server's separator exactly. Divergence here would lose mail. */
const MBOX_SEPARATOR = /^From \S+ (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[ ,]/;

export interface SplitResult {
  /** Each one a valid mbox, each under the size limit. */
  batches: string[];
  messageCount: number;
  /** Messages too big to send whole, and what was kept. */
  truncated: { at: number; keptBytes: number }[];
}

/**
 * Split an export into uploadable batches.
 *
 * `maxBytes` is the budget for one request, measured in UTF-8 bytes rather
 * than characters: an export full of accented names and CJK subjects is
 * bigger on the wire than its length suggests, and a limit measured in the
 * wrong unit is one that passes here and fails at the server.
 */
export function splitForUpload(raw: string, maxBytes: number): SplitResult {
  const normalised = raw.replace(/\r\n/g, '\n');
  const lines = normalised.split('\n');

  const messages: string[] = [];
  let current: string[] = [];
  let started = false;

  for (const line of lines) {
    if (MBOX_SEPARATOR.test(line)) {
      if (started && current.length) messages.push(current.join('\n'));
      current = [line];
      started = true;
      continue;
    }
    if (started) current.push(line);
  }
  if (started && current.length) messages.push(current.join('\n'));

  const encoder = new TextEncoder();
  const sizeOf = (text: string) => encoder.encode(text).length;

  const batches: string[] = [];
  const truncated: SplitResult['truncated'] = [];
  let batch: string[] = [];
  let batchBytes = 0;

  messages.forEach((message, index) => {
    let body = message;
    let bytes = sizeOf(body);

    // One message bigger than a whole request. Keep the front of it: MIME
    // puts the readable parts before the attachments, so the text survives
    // and what is lost is the base64 nobody reads. Truncating is better than
    // skipping - a publisher's prices are in the first kilobyte, and dropping
    // the message would lose the listing entirely.
    if (bytes > maxBytes) {
      const keep = Math.floor(maxBytes * 0.9);
      let low = 0;
      let high = body.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (sizeOf(body.slice(0, mid)) <= keep) low = mid;
        else high = mid - 1;
      }
      body = body.slice(0, low);
      bytes = sizeOf(body);
      truncated.push({ at: index, keptBytes: bytes });
    }

    if (batch.length && batchBytes + bytes > maxBytes) {
      batches.push(batch.join('\n'));
      batch = [];
      batchBytes = 0;
    }

    batch.push(body);
    batchBytes += bytes + 1;
  });

  if (batch.length) batches.push(batch.join('\n'));

  return { batches, messageCount: messages.length, truncated };
}
