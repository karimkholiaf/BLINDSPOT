import { z } from "zod";

/**
 * A single idea pulled out of the source material.
 *
 * `keyPoints` is the load-bearing field: it doubles as the grading rubric that
 * /api/assess checks an explanation against. Extraction produces the rubric,
 * assessment consumes it — which is why both live in one schema file.
 */
/**
 * The outline half of a concept — what a first pass over the material yields.
 *
 * Extraction runs in two phases because one call producing 6-10 fully-rubricked
 * concepts is 3-4k output tokens, which measured at 45-90s regardless of which
 * model served it and did not fit the route's 60s ceiling. The outline is small
 * and fast; the rubrics are then written per concept, in parallel, each one a
 * tiny call. Same result, none of the individual requests near the limit.
 */
export const ConceptOutlineSchema = z.object({
  id: z
    .string()
    .describe("Short lowercase slug, e.g. 'big-o-notation'. Unique within the map."),
  title: z.string().describe("The concept's name, 2-5 words."),
  definition: z
    .string()
    .describe("One or two sentences defining the concept, faithful to the source material."),
});

export const OutlineSchema = z.object({
  sourceTitle: z.string().describe("Title of the source material."),
  concepts: z
    .array(ConceptOutlineSchema)
    .describe("6-10 concepts, ordered so prerequisites come before the concepts that need them."),
});

/** The graded half, written per concept in phase two. */
export const RubricSchema = z.object({
  keyPoints: z
    .array(z.string())
    .describe(
      "3-5 specific claims a genuinely correct explanation must contain. These are graded " +
        "individually, so make each one a single checkable idea rather than a paragraph.",
    ),
  commonMisconception: z
    .string()
    .describe(
      "The single most common way students get this wrong — drawn from your own knowledge of " +
        "how this topic is misunderstood, not just from the source text. One sentence.",
    ),
});

export const ConceptSchema = ConceptOutlineSchema.extend(RubricSchema.shape);

export const ConceptMapSchema = z.object({
  sourceTitle: z.string().describe("Title of the source material."),
  concepts: z.array(ConceptSchema),
});

export type ConceptOutline = z.infer<typeof ConceptOutlineSchema>;
export type Rubric = z.infer<typeof RubricSchema>;
export type Concept = z.infer<typeof ConceptSchema>;
export type ConceptMap = z.infer<typeof ConceptMapSchema>;

/** Drives the concept node's colour and the session summary. */
export const VERDICTS = ["mastered", "shaky", "misconception", "not_demonstrated"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const MisconceptionSchema = z.object({
  label: z
    .string()
    .describe(
      "Name the misconception in under 8 words, as a claim the learner believes. " +
        "e.g. 'Big-O measures speed, not growth rate'.",
    ),
  whatYouSaid: z
    .string()
    .describe("Quote or closely paraphrase the specific part of their explanation that revealed it."),
  whyItsWrong: z.string().describe("One or two sentences. Address the learner as 'you'."),
  whatsActuallyTrue: z
    .string()
    .describe("The correction, stated positively and concretely. Include a counterexample if one is short."),
});

export const AssessmentSchema = z.object({
  verdict: z
    .enum(VERDICTS)
    .describe(
      "mastered = accurate and complete. shaky = nothing false but vague or incomplete. " +
        "misconception = contains something actively false. not_demonstrated = too little " +
        "content to judge, or restates the question.",
    ),
  masteryScore: z
    .number()
    .int()
    .describe(
      "0-100. A confident wrong answer scores LOWER than an honest 'I'm not sure', because " +
        "it means the learner will not go back and check.",
    ),
  headline: z
    .string()
    .describe("One sentence to the learner about what just happened. Direct, not congratulatory."),
  gotRight: z
    .array(z.string())
    .describe("Key points they genuinely demonstrated, in your words. Empty array if none."),
  missed: z
    .array(z.string())
    .describe("Key points absent or too vague to count. Empty array if none."),
  misconception: MisconceptionSchema.nullable().describe(
    "Populated ONLY when verdict is 'misconception'. Null otherwise — do not invent one to be helpful.",
  ),
  followUpQuestion: z
    .string()
    .describe(
      "One Socratic question targeting the single biggest gap. It must be answerable from the " +
        "source material and must not contain its own answer.",
    ),
});

export type Assessment = z.infer<typeof AssessmentSchema>;
export type Misconception = z.infer<typeof MisconceptionSchema>;
