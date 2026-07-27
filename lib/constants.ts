/**
 * Shared by the upload route and the client uploader. Kept out of
 * `lib/anthropic.ts` so importing a size limit into a client component doesn't
 * drag the Anthropic SDK into the browser bundle.
 */

/** Vercel's request body cap is 4.5 MB and base64 inflates by roughly a third. */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

export const SAMPLE_PDF_PATH = "/sample-lecture.pdf";
