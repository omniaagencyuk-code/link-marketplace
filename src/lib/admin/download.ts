/**
 * Hand the browser a file it has already been given the contents of.
 *
 * No round trip: the admin table is holding every row it would ask the server
 * for, so a download that fetched them again would be slower, would cost a
 * second query, and could disagree with what is on screen.
 *
 * The BOM is not decoration. Excel on Windows reads a UTF-8 file as the local
 * code page unless one is present, which turns every accented domain and
 * every euro sign into mojibake - and these are German, Spanish and Brazilian
 * publishers.
 */
export function downloadTextFile(filename: string, text: string, type = 'text/csv'): void {
  const blob = new Blob([`﻿${text}`], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();

  // Freed on the next tick rather than immediately: revoking synchronously
  // cancels the download in some browsers before it has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Put text on the clipboard, falling back where the modern API is refused.
 *
 * `navigator.clipboard` needs a secure context and a permission that a
 * browser can decline, and a copy button that silently does nothing is worse
 * than no button. The fallback is the old selection trick, which works
 * everywhere this admin runs.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}
