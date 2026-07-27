import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, errorResponse, EFFORT, MODEL } from "@/lib/anthropic";
import { AssessmentSchema, ConceptSchema } from "@/lib/schemas";
import { ASSESSMENT_SYSTEM, assessmentUserPrompt } from "@/lib/prompts";

export const maxDuration = 60;

const AssessRequest = z.object({
  concept: ConceptSchema,
  explanation: z.string(),
});

export async function POST(request: Request) {
  try {
    const parsed = AssessRequest.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { concept, explanation } = parsed.data;

    // Cheaper and more honest than asking the model to grade silence.
    if (explanation.trim().length < 15) {
      return Response.json(
        { error: "Say a bit more — a sentence or two at minimum." },
        { status: 400 },
      );
    }

    const response = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: ASSESSMENT_SYSTEM,
      output_config: {
        effort: EFFORT.assessment,
        format: zodOutputFormat(AssessmentSchema),
      },
      messages: [{ role: "user", content: assessmentUserPrompt(concept, explanation) }],
    });

    if (!response.parsed_output) {
      return Response.json({ error: "Couldn't assess that. Try rephrasing." }, { status: 422 });
    }

    return Response.json(response.parsed_output);
  } catch (error) {
    return errorResponse(error);
  }
}
