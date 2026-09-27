/**
 * Limits shared by the extraction service and the page that drives it.
 *
 * Pure on purpose: the button needs the batch size to say what pressing it
 * will do, and importing it from the service would drag the service-role
 * Supabase client into the browser bundle.
 */

/** How many emails one extraction run reads. */
export const EXTRACTION_BATCH_LIMIT = 25;
