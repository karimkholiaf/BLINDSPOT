import { ApiError, GoogleGenAI, type ContentListUnion } from "@google/genai";
import { z } from "zod";

/**
 * Flash rather than Pro, and not for cost reasons: the Gemini free tier
 * returns 429 for every Pro model, so Flash is the strongest tier actually
 * reachable without a billing account. Assessment quality is the whole product,
 * so this choice is validated rather than assumed — `scripts/adversarial-test.mjs`
 * checks that the model still ranks a confident wrong answer below a vague
 * correct one, which is the judgement Flash could plausibly get wrong.
 */
export const MODELS = {
  extraction: "gemini-3.6-flash",
  assessment: "gemini-3.6-flash",
} as const;

let client: GoogleGenAI | null = null;

/** Lazy so a missing key is a handled 500 at request time, not a build failure. */
function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("PASTE_")) throw new MissingKeyError();
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export class MissingKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set. Copy .env.example to .env.local and add your key.");
    this.name = "MissingKeyError";
  }
}

export class UnreadableResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableResponseError";
  }
}

/**
 * Gemini accepts JSON Schema via `responseJsonSchema`, and zod v4 emits it
 * directly — but it stamps a `$schema` key the API has no use for, so it goes.
 */
function toResponseSchema(schema: z.ZodType): Record<string, unknown> {
  const emitted = z.toJSONSchema(schema) as Record<string, unknown>;
  delete emitted.$schema;
  return emitted;
}

/**
 * One call path for both routes. The response is constrained by the schema at
 * generation time *and* validated against it after, so a route handler can
 * trust its parsed value completely.
 */
export async function generateStructured<T extends z.ZodType>({
  model,
  system,
  contents,
  schema,
}: {
  model: string;
  system: string;
  contents: ContentListUnion;
  schema: T;
}): Promise<z.infer<T>> {
  const response = await ai().models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: toResponseSchema(schema),
    },
  });

  const text = response.text;
  if (!text) {
    throw new UnreadableResponseError(
      "The model returned nothing. This usually means the material couldn't be read.",
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new UnreadableResponseError("The model returned malformed JSON.");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new UnreadableResponseError(
      `The model's response didn't match the expected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  return parsed.data;
}

/** Maps failures onto responses the UI can render honestly. */
export function errorResponse(error: unknown): Response {
  if (error instanceof MissingKeyError) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (error instanceof UnreadableResponseError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return Response.json(
        { error: "Hit the Gemini rate limit. Wait a few seconds and try again." },
        { status: 429 },
      );
    }
    if (error.status === 401 || error.status === 403) {
      return Response.json({ error: "Google rejected the API key." }, { status: 500 });
    }
    return Response.json(
      { error: `Gemini API error (${error.status}): ${error.message}` },
      { status: 502 },
    );
  }
  console.error("Unhandled route error:", error);
  return Response.json({ error: "Something went wrong on our end." }, { status: 500 });
}
