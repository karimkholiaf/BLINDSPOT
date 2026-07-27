import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, errorResponse, EFFORT, MODEL } from "@/lib/anthropic";
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

    // Guard before spending a request: base64 inflates ~33%, and an oversized
    // body is rejected by the platform with a response the UI can't explain.
    if (pdfBase64 && (pdfBase64.length * 3) / 4 > MAX_PDF_BYTES) {
      return Response.json(
        { error: "That PDF is over 3 MB. Try a single chapter, or paste the text instead." },
        { status: 413 },
      );
    }

    const content: Array<Record<string, unknown>> = [];
    if (pdfBase64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
      });
    }
    if (text?.trim()) {
      content.push({ type: "text", text: `<source_material>\n${text.trim()}\n</source_material>` });
    }
    content.push({ type: "text", text: extractionUserPrompt(hint) });

    const response = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: EXTRACTION_SYSTEM,
      output_config: {
        effort: EFFORT.extraction,
        format: zodOutputFormat(ConceptMapSchema),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: content as any }],
    });

    if (!response.parsed_output) {
      return Response.json(
        { error: "Couldn't read that material. Try a text-based PDF rather than a scan." },
        { status: 422 },
      );
    }

    return Response.json(response.parsed_output);
  } catch (error) {
    return errorResponse(error);
  }
}
