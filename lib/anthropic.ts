import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5";

/**
 * Extraction reads a whole document and builds a rubric, so it can afford to
 * think. Assessment runs while the learner waits, so it runs lean — the
 * judgement it makes is nuanced but small, and latency here is felt directly.
 */
export const EFFORT = {
  extraction: "medium",
  assessment: "low",
} as const;

let client: Anthropic | null = null;

/**
 * Lazily constructed so a missing key surfaces as a handled 500 at request
 * time rather than blowing up the build.
 */
export function anthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "PASTE_YOUR_KEY_HERE") {
    throw new MissingKeyError();
  }
  client ??= new Anthropic({ apiKey });
  return client;
}

export class MissingKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key.");
    this.name = "MissingKeyError";
  }
}

/** Maps SDK and validation failures onto responses the UI can render honestly. */
export function errorResponse(error: unknown): Response {
  if (error instanceof MissingKeyError) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return Response.json(
      { error: "Rate limited by the Anthropic API. Wait a moment and try again." },
      { status: 429 },
    );
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return Response.json({ error: "Anthropic rejected the API key." }, { status: 500 });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return Response.json({ error: "Could not reach the Anthropic API." }, { status: 502 });
  }
  if (error instanceof Anthropic.APIError) {
    return Response.json(
      { error: `Anthropic API error (${error.status}): ${error.message}` },
      { status: 502 },
    );
  }
  console.error("Unhandled route error:", error);
  return Response.json({ error: "Something went wrong on our end." }, { status: 500 });
}
