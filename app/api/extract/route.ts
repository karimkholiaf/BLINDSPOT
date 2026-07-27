import { z } from "zod";
import { errorResponse, generateStructured } from "@/lib/ai";
import { MAX_PDF_BYTES } from "@/lib/constants";
import { ConceptMapSchema } from "@/lib/schemas";
import { EXTRACTION_SYSTEM, extractionUserPrompt } from "@/lib/prompts";

export const maxDuration = 60;

const ExtractRequest = z
  .object({
    pdfBase64: z.string().optional(),
    text: z.string().optional(),
    hint: z.string().optional(),
  })
  .refine((body) => Boolean(body.pdfBase64 || body.text?.trim()), {
    message: "Provide either a PDF or some text to build a map from.",
  });

export async function POST(request: Request) {
  try {
    const parsed = ExtractRequest.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { pdfBase64, text, hint } = parsed.data;

    // Checked before spending a request: base64 inflates by roughly a third,
    // and an oversized body is rejected by the platform with a response the UI
    // can't explain to the user.
    if (pdfBase64 && (pdfBase64.length * 3) / 4 > MAX_PDF_BYTES) {
      return Response.json(
        { error: "That PDF is over 3 MB. Try a single chapter, or paste the text instead." },
        { status: 413 },
      );
    }

    const map = await generateStructured({
      system: EXTRACTION_SYSTEM,
      prompt: extractionUserPrompt(hint),
      pdfBase64,
      sourceText: text?.trim() ? `<source_material>\n${text.trim()}\n</source_material>` : undefined,
      schema: ConceptMapSchema,
    });

    return Response.json(map);
  } catch (error) {
    return errorResponse(error);
  }
}
