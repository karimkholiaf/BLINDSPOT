import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Turns an uploaded file into plain text before it ever reaches a model.
 *
 * This exists because of a latency measurement, not a feature request. Handing
 * the PDF straight to the model meant the `native` engine rendered every page
 * as an image: the six-page sample lecture arrived as 16,946 prompt tokens and
 * a deployed extraction took 58.6s against the route's 60s ceiling — close
 * enough that the per-attempt cap fired first and threw away a response that
 * was about to succeed, leaving the fallback chain no time to run. The same
 * lecture as extracted text is roughly 5,100 tokens.
 *
 * Reading the text ourselves also makes Word support fall out for free, since
 * by the time the model is involved every format looks the same.
 */

/** Beyond this the request starts drifting back toward the ceiling. */
const MAX_SOURCE_CHARS = 50_000;

/**
 * Under this, the file is treated as having no usable text layer. Scanned
 * lectures are images in a PDF wrapper and legitimately extract to almost
 * nothing; they still need to reach the model as a document.
 */
const MIN_USEFUL_CHARS = 400;

export type SourceKind = "pdf" | "docx";

export type ExtractedSource =
  /** Text we pulled out ourselves — the fast path. */
  | { via: "text"; text: string; kind: SourceKind; pages?: number; truncated: boolean }
  /** No usable text layer; hand the original file to the model instead. */
  | { via: "document"; kind: "pdf" };

export class UnsupportedSource extends Error {}

/**
 * Magic bytes rather than the filename: a file picker will happily hand over
 * `notes.pdf` that is really a Word document, and the extension is the one
 * piece of this the user can get wrong without noticing.
 */
function sniff(bytes: Uint8Array): SourceKind | "doc-legacy" | "unknown" {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "pdf"; // %PDF
  if (starts(0x50, 0x4b, 0x03, 0x04)) return "docx"; // PK.. (zip container)
  // Legacy Word (.doc) is an OLE compound file. Mammoth cannot read it.
  if (starts(0xd0, 0xcf, 0x11, 0xe0)) return "doc-legacy";
  return "unknown";
}

/** Collapses the ragged whitespace that both extractors leave behind. */
function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fromPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text: tidy(text), pages: totalPages };
}

async function fromDocx(bytes: Uint8Array): Promise<string> {
  // Mammoth wants a Node Buffer, and `value` is the document's raw text.
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return tidy(value);
}

export async function extractSource(base64: string): Promise<ExtractedSource> {
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  const kind = sniff(bytes);

  if (kind === "doc-legacy") {
    throw new UnsupportedSource(
      "That's a legacy .doc file. Save it as .docx or PDF and try again.",
    );
  }
  if (kind === "unknown") {
    throw new UnsupportedSource("That file isn't a PDF or a Word document.");
  }

  if (kind === "docx") {
    const text = await fromDocx(bytes);
    if (text.length < MIN_USEFUL_CHARS) {
      // Unlike a PDF, there is no useful way to show a .docx to the model.
      throw new UnsupportedSource(
        "That Word file doesn't have enough text in it to build a map from.",
      );
    }
    return {
      via: "text",
      kind,
      text: text.slice(0, MAX_SOURCE_CHARS),
      truncated: text.length > MAX_SOURCE_CHARS,
    };
  }

  const { text, pages } = await fromPdf(bytes);
  if (text.length < MIN_USEFUL_CHARS) return { via: "document", kind: "pdf" };

  return {
    via: "text",
    kind,
    pages,
    text: text.slice(0, MAX_SOURCE_CHARS),
    truncated: text.length > MAX_SOURCE_CHARS,
  };
}
