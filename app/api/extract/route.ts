import { z } from "zod";
import { EXTRACTION_CHAIN, errorResponse, generateStructured } from "@/lib/ai";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { OutlineSchema, RubricSchema, type Concept } from "@/lib/schemas";
import {
  EXTRACTION_SYSTEM,
  RUBRIC_SYSTEM,
  extractionUserPrompt,
  rubricUserPrompt,
} from "@/lib/prompts";
import { UnsupportedSource, extractSource } from "@/lib/source-text";

export const maxDuration = 60;

const ExtractRequest = z
  .object({
    /** Base64 PDF or .docx. `pdfBase64` is the older name for the same field. */
    fileBase64: z.string().optional(),
    pdfBase64: z.string().optional(),
    text: z.string().optional(),
    hint: z.string().optional(),
  })
  .transform((body) => ({ ...body, fileBase64: body.fileBase64 ?? body.pdfBase64 }))
  .refine((body) => Boolean(body.fileBase64 || body.text?.trim()), {
    message: "Provide a file or some text to build a map from.",
  });

export async function POST(request: Request) {
  try {
    const parsed = ExtractRequest.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { fileBase64, text, hint } = parsed.data;

    // Checked before spending a request: base64 inflates by roughly a third,
    // and an oversized body is rejected by the platform with a response the UI
    // can't explain to the user.
    if (fileBase64 && (fileBase64.length * 3) / 4 > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: "That file is over 3 MB. Try a single chapter, or paste the text instead." },
        { status: 413 },
      );
    }

    /*
      Reading the file to text here rather than handing it to the model is what
      keeps this route inside its 60s budget — see lib/source-text.ts. A PDF
      with no text layer is the one case that still travels as a document.
    */
    let sourceText = text?.trim() ?? "";
    let pdfBase64: string | undefined;

    if (fileBase64) {
      const source = await extractSource(fileBase64);
      if (source.via === "document") pdfBase64 = fileBase64;
      else sourceText = [source.text, sourceText].filter(Boolean).join("\n\n");
    }

    const material = sourceText
      ? `<source_material>\n${sourceText}\n</source_material>`
      : undefined;

    const started = Date.now();
    const outline = await generateStructured({
      system: EXTRACTION_SYSTEM,
      prompt: extractionUserPrompt(hint),
      pdfBase64,
      sourceText: material,
      schema: OutlineSchema,
      chain: EXTRACTION_CHAIN,
    });
    const outlineMs = Date.now() - started;

    /*
      Rubrics are written concurrently, so the wall time is the slowest single
      concept rather than the sum. `allSettled` because one concept failing is
      not worth discarding a whole map for — but a concept without a rubric is
      ungradeable, so those are dropped rather than shipped empty.
    */
    const settled = await Promise.allSettled(
      outline.concepts.map((concept) =>
        generateStructured({
          system: RUBRIC_SYSTEM,
          prompt: rubricUserPrompt(concept),
          pdfBase64,
          sourceText: material,
          schema: RubricSchema,
          chain: EXTRACTION_CHAIN,
        }),
      ),
    );

    const concepts: Concept[] = outline.concepts.flatMap((concept, index) => {
      const result = settled[index];
      return result.status === "fulfilled" ? [{ ...concept, ...result.value }] : [];
    });

    if (concepts.length < 3) {
      const failure = settled.find((r) => r.status === "rejected");
      throw failure?.status === "rejected" ? failure.reason : new Error("Couldn't build a map.");
    }

    // This route lives against a hard platform ceiling, so the split between
    // its two phases is worth being able to see in a log rather than inferring.
    console.log(
      `extract: outline ${outlineMs}ms + ${outline.concepts.length} rubrics ` +
        `${Date.now() - started - outlineMs}ms = ${Date.now() - started}ms`,
    );

    return Response.json({ sourceTitle: outline.sourceTitle, concepts });
  } catch (error) {
    if (error instanceof UnsupportedSource) {
      return Response.json({ error: error.message }, { status: 415 });
    }
    return errorResponse(error);
  }
}
