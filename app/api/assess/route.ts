import { z } from "zod";
import { errorResponse, generateStructured, MODELS } from "@/lib/ai";
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

    const assessment = await generateStructured({
      models: MODELS.assessment,
      system: ASSESSMENT_SYSTEM,
      contents: assessmentUserPrompt(concept, explanation),
      schema: AssessmentSchema,
    });

    return Response.json(assessment);
  } catch (error) {
    return errorResponse(error);
  }
}
