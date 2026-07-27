import { ApiError, GoogleGenAI, type ContentListUnion } from "@google/genai";
import { z } from "zod";

/**
 * Flash rather than Pro, and not for cost reasons: the Gemini free tier returns
 * 429 for every Pro model, so Flash is the strongest tier actually reachable
 * without a billing account. Assessment quality is the whole product, so the
 * choice is validated rather than assumed — `scripts/adversarial-test.mjs`
 * checks the model still ranks a confident wrong answer below a vague correct
 * one, which is the judgement Flash could plausibly get wrong.
 *
 * The free tier allows only 20 requests per day *per model*, which a handful of
 * visitors would exhaust. That quota is metered separately for each model, so
 * falling through this chain on a 429 multiplies the daily budget by its length
 * instead of leaving the app dead for the rest of the day. Ordered strongest
 * first; every entry is a Flash-tier model of comparable capability, so a
 * fallback degrades throughput rather than answer quality.
 */
/*
  Order is measured, not assumed. Running scripts/adversarial-test.mjs pinned to
  each model (via BLINDSPOT_MODEL) showed 3.5-flash-lite holds the decisive
  judgement just as well as 3.6-flash — 3/3 verdicts, confident-wrong still
  ranked below vague — at a fifth of the input price and about half the latency.
  3.6-flash stays first only because it words the misconception label more
  precisely, and that label is the most-read line in the UI.

  3.5-flash is last despite being nominally stronger than lite: it is the one
  model observed answering 503 "high demand", which the SDK retries internally
  and which stalls a request for minutes.
*/
export const MODEL_CHAIN = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
] as const;

/**
 * A model that is merely busy stalls rather than failing: the SDK retries 503
 * internally with backoff and can block for minutes. Capping each attempt turns
 * that into a fast fall-through to the next model.
 */
const ATTEMPT_TIMEOUT_MS = 45_000;

class AttemptTimeout extends Error {
  constructor(model: string) {
    super(`${model} did not respond within ${ATTEMPT_TIMEOUT_MS}ms`);
  }
}

/**
 * `BLINDSPOT_MODEL` pins the chain to a single model. Only used for
 * benchmarking — it lets scripts/adversarial-test.mjs measure whether a cheaper
 * model still tells a confident wrong answer from a vague correct one, rather
 * than that being decided by assumption.
 */
const override = process.env.BLINDSPOT_MODEL;
const chain: readonly string[] = override ? [override] : MODEL_CHAIN;

/** Kept as named entry points so callers read intent, not a model string. */
export const MODELS = {
  extraction: chain,
  assessment: chain,
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
  models,
  system,
  contents,
  schema,
}: {
  models: readonly string[];
  system: string;
  contents: ContentListUnion;
  schema: T;
}): Promise<z.infer<T>> {
  const config = {
    systemInstruction: system,
    responseMimeType: "application/json",
    responseJsonSchema: toResponseSchema(schema),
  };

  let response;
  let lastTransientError: unknown;

  for (const model of models) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      response = await Promise.race([
        ai().models.generateContent({ model, contents, config }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new AttemptTimeout(model)), ATTEMPT_TIMEOUT_MS);
        }),
      ]);
      break;
    } catch (error) {
      // Spent quota (429), an overloaded model (5xx), and a stall are all
      // reasons another model might succeed. A malformed request or a bad key
      // fails identically everywhere, so those surface immediately.
      const isTransient =
        error instanceof AttemptTimeout ||
        (error instanceof ApiError && (error.status === 429 || error.status >= 500));

      if (!isTransient) throw error;

      lastTransientError = error;
      const reason =
        error instanceof AttemptTimeout
          ? "stalled"
          : (error as ApiError).status === 429
            ? "out of daily quota"
            : "overloaded";
      console.warn(`${model} ${reason}; falling through.`);
    } finally {
      clearTimeout(timer);
    }
  }

  if (!response) {
    throw lastTransientError ?? new UnreadableResponseError("No model was reachable.");
  }

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
        {
          error:
            "Every model has spent its free-tier daily quota (20 requests each). " +
            "It resets on Google's clock — try again tomorrow, or add your own key.",
        },
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
