import { ApiError, GoogleGenAI, createPartFromBase64, type Part } from "@google/genai";
import OpenAI from "openai";
import { z } from "zod";

/**
 * Two providers, one chain.
 *
 * Claude Sonnet 5 leads because it is the strongest model available here at a
 * sane price, and it is reached through OpenRouter rather than Anthropic
 * directly so that spend is capped by prepaid credit instead of an open-ended
 * billing account. OpenRouter speaks the OpenAI chat-completions format, hence
 * the second SDK.
 *
 * The Gemini entries are the safety net: when the OpenRouter credit is spent,
 * requests fall through to the free tier rather than the app going dark. Free
 * tier allows only 20 requests per day *per model*, metered separately for
 * each, so listing several multiplies the daily budget.
 *
 * Ordering within Gemini is measured, not assumed — `scripts/adversarial-test.mjs`
 * pinned to each model showed 3.5-flash-lite holds the decisive judgement as
 * well as 3.6-flash at a fifth of the price, so it sits directly behind it.
 * `gemini-3.5-flash` is excluded entirely despite being nominally stronger than
 * lite: it is the one model observed answering 503 "high demand", which its SDK
 * retries internally with backoff, blocking a request for minutes rather than
 * failing over.
 */
export type ModelSpec = { provider: "openrouter" | "gemini"; model: string };

export const MODEL_CHAIN: readonly ModelSpec[] = [
  { provider: "openrouter", model: "anthropic/claude-sonnet-5" },
  { provider: "gemini", model: "gemini-3.6-flash" },
  { provider: "gemini", model: "gemini-3.5-flash-lite" },
  { provider: "gemini", model: "gemini-flash-latest" },
  { provider: "gemini", model: "gemini-3-flash-preview" },
];

/**
 * `BLINDSPOT_MODEL` pins the chain to one model so the adversarial test can
 * benchmark a single candidate. Prefix with `openrouter:` to reach OpenRouter;
 * a bare value is treated as a Gemini model.
 */
function resolveChain(): readonly ModelSpec[] {
  const override = process.env.BLINDSPOT_MODEL;
  if (!override) return MODEL_CHAIN;
  return override.startsWith("openrouter:")
    ? [{ provider: "openrouter", model: override.slice("openrouter:".length) }]
    : [{ provider: "gemini", model: override }];
}

/**
 * A model that is merely busy stalls rather than failing, so each attempt is
 * capped and the chain moves on.
 *
 * This must stay comfortably under the routes' `maxDuration` (60s, Vercel's
 * ceiling on the hobby tier) or the cap is unreachable: the platform would kill
 * the request first and the fall-through would never run. 40s leaves room for a
 * stalled leading model plus one fast fallback — flash-lite answers in about a
 * second — inside a single request budget.
 */
const ATTEMPT_TIMEOUT_MS = 40_000;

class AttemptTimeout extends Error {
  constructor(model: string) {
    super(`${model} did not respond within ${ATTEMPT_TIMEOUT_MS}ms`);
  }
}

export class MissingKeyError extends Error {
  constructor(which: string) {
    super(`${which} is not set. Copy .env.example to .env.local and add your keys.`);
    this.name = "MissingKeyError";
  }
}

export class UnreadableResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableResponseError";
  }
}

let gemini: GoogleGenAI | null = null;
let openrouter: OpenAI | null = null;

function geminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new MissingKeyError("GEMINI_API_KEY");
  gemini ??= new GoogleGenAI({ apiKey });
  return gemini;
}

function openrouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new MissingKeyError("OPENROUTER_API_KEY");
  openrouter ??= new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    // OpenRouter attributes usage to the app that sent it.
    defaultHeaders: { "HTTP-Referer": "https://blindspot-rust.vercel.app", "X-Title": "Blindspot" },
  });
  return openrouter;
}

/**
 * Zod v4 emits JSON Schema directly, but with two things the providers reject:
 * a `$schema` key neither wants, and numeric/string bounds that OpenAI-style
 * strict mode refuses outright. The bounds were never load-bearing — the score
 * is clamped where it is rendered — so they are dropped rather than worked
 * around.
 */
const UNSUPPORTED_KEYWORDS = [
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
];

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([key]) => !UNSUPPORTED_KEYWORDS.includes(key))
        .map(([key, value]) => [key, sanitize(value)]),
    );
  }
  return node;
}

function toResponseSchema(schema: z.ZodType): Record<string, unknown> {
  return sanitize(z.toJSONSchema(schema)) as Record<string, unknown>;
}

/** What a caller asks for, independent of which provider ends up serving it. */
export type StructuredRequest<T extends z.ZodType> = {
  system: string;
  prompt: string;
  /** Base64 PDF, sent as a document rather than extracted to text first. */
  pdfBase64?: string;
  /** Extra source material supplied as plain text. */
  sourceText?: string;
  schema: T;
};

async function callGemini(
  model: string,
  request: StructuredRequest<z.ZodType>,
): Promise<string | undefined> {
  const parts: Part[] = [];
  if (request.pdfBase64) parts.push(createPartFromBase64(request.pdfBase64, "application/pdf"));
  if (request.sourceText) parts.push({ text: request.sourceText });
  parts.push({ text: request.prompt });

  const response = await geminiClient().models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: request.system,
      responseMimeType: "application/json",
      responseJsonSchema: toResponseSchema(request.schema),
    },
  });
  return response.text;
}

async function callOpenRouter(
  model: string,
  request: StructuredRequest<z.ZodType>,
): Promise<string | undefined> {
  const content: Array<Record<string, unknown>> = [];
  if (request.pdfBase64) {
    content.push({
      type: "file",
      file: {
        filename: "source.pdf",
        file_data: `data:application/pdf;base64,${request.pdfBase64}`,
      },
    });
  }
  if (request.sourceText) content.push({ type: "text", text: request.sourceText });
  content.push({ type: "text", text: request.prompt });

  // `plugins` is an OpenRouter extension the OpenAI SDK doesn't type. Pinning
  // the PDF engine to `native` matters: left unset, OpenRouter silently falls
  // back to a paid OCR engine when it can't confirm native support.
  const params = {
    model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "blindspot_result", strict: true, schema: toResponseSchema(request.schema) },
    },
    plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
  } as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;

  const completion = await openrouterClient().chat.completions.create(params);
  return completion.choices[0]?.message?.content ?? undefined;
}

/**
 * Whether to try the next model instead of failing the request.
 *
 * OpenRouter failures are treated as transient almost unconditionally: spent
 * credit (402), a rejected or revoked key (401/403), rate limits, and outages
 * should all degrade to the free tier rather than show a judge an error page.
 * The exception is 400 — a malformed request is a bug in this code, it would
 * fail identically on any provider, and silently falling through would hide it.
 *
 * Gemini is last in the chain, so classifying its errors changes nothing about
 * routing; the narrower rule just keeps the surfaced message accurate.
 */
function isTransient(error: unknown): boolean {
  if (error instanceof AttemptTimeout) return true;
  // An unconfigured provider is skipped, not fatal — a deployment that has only
  // the Gemini key set should still work, just without the Claude tier. If no
  // provider in the chain is configured, the last error surfaces as a 500 that
  // names the missing variable.
  if (error instanceof MissingKeyError) return true;
  if (error instanceof ApiError) return error.status === 429 || error.status >= 500;
  if (error instanceof OpenAI.APIError) return error.status !== 400;
  return false;
}

export async function generateStructured<T extends z.ZodType>(
  request: StructuredRequest<T>,
): Promise<z.infer<T>> {
  let text: string | undefined;
  let lastTransientError: unknown;

  for (const spec of resolveChain()) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const call = spec.provider === "gemini" ? callGemini : callOpenRouter;
      text = await Promise.race([
        call(spec.model, request),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new AttemptTimeout(spec.model)), ATTEMPT_TIMEOUT_MS);
        }),
      ]);
      if (text) break;
      // An empty body is not a transport failure, so it wouldn't throw — but it
      // is still worth trying the next model rather than failing the request.
      lastTransientError = new UnreadableResponseError(`${spec.model} returned an empty response.`);
    } catch (error) {
      // A malformed request or a bad key fails identically everywhere; only
      // capacity problems are worth retrying on a different model.
      if (!isTransient(error)) throw error;
      lastTransientError = error;
      console.warn(`${spec.model} unavailable (${(error as Error).message}); falling through.`);
    } finally {
      clearTimeout(timer);
    }
  }

  if (!text) {
    throw lastTransientError ?? new UnreadableResponseError("No model was reachable.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new UnreadableResponseError("The model returned malformed JSON.");
  }

  const parsed = request.schema.safeParse(raw);
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

  const status =
    error instanceof ApiError || error instanceof OpenAI.APIError ? (error.status ?? 0) : 0;

  if (status === 429 || status === 402) {
    return Response.json(
      {
        error:
          "Every model is currently unavailable — the Claude credit and the free-tier " +
          "daily quotas are both spent. The quotas reset on Google's clock.",
      },
      { status: 429 },
    );
  }
  if (status === 401 || status === 403) {
    return Response.json({ error: "An API key was rejected." }, { status: 500 });
  }
  if (status >= 500) {
    return Response.json({ error: `Upstream model error (${status}).` }, { status: 502 });
  }

  console.error("Unhandled route error:", error);
  return Response.json({ error: "Something went wrong on our end." }, { status: 500 });
}
