/**
 * Shared by the upload route and the client uploader. Kept out of `lib/ai.ts`
 * so importing a size limit into a client component doesn't drag the Gemini
 * SDK into the browser bundle.
 */

/** Vercel's request body cap is 4.5 MB and base64 inflates by roughly a third. */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** What the file picker offers and what the drop zone will accept. */
export const ACCEPTED_UPLOAD = ".pdf,.docx,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"] as const;

export const SAMPLE_PDF_PATH = "/sample-lecture.pdf";
