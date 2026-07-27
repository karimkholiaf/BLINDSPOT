# Blindspot — session handoff

Everything needed to pick this up cold.

## The competition

**Prometheus July AI Challenge** (Devpost) — students-only online AI/ML hackathon.

- **Deadline: Fri Jul 31, 6:45 AM Egypt local** = Jul 30, 11:45 PM EDT. Devpost's countdown says 11:45 PM EDT; the rules page says 11:59 — the earlier one is the wall.
- **Submit:** ≤2:00 demo video (over 2:00 and judges don't watch it at all), source repo, working prototype.
- **Judging, 25 pts each:** Educational Impact · Creative Use of AI/ML · Technical Execution (code + UI/UX) · Pitch & Demo.
- **Rules:** all code written in the contest window; open-source libs and pre-trained models encouraged, core logic must be new. 752 participants.
- Registration is done (Devpost account, joined, organizers' Google Form all complete).

## What it is

**Blindspot** — a Feynman-technique study tool. Upload a lecture PDF → it extracts a concept map where each concept carries its own grading rubric → you explain each concept back in your own words (typed or spoken) → it grades you against that rubric and, critically, **distinguishes an incomplete answer from a confidently wrong one**, naming the specific belief you hold.

The thesis: fluency is not understanding. A fluent, confident, false answer must score *below* a vague but true one, because false confidence stops future learning.

- **Live:** https://blindspot-rust.vercel.app
- **Repo:** https://github.com/karimkholiaf/BLINDSPOT (branch `master`)
- **Local:** `K:\Projects\Education_College\Prometheus July AI Challenge\blindspot`

## Architecture

**Stack:** Next.js 16.2.12 (App Router), React 19.2, TypeScript, Tailwind v4, deployed on Vercel. Node 22. No database — session state lives in React.

**The architectural idea:** *extraction produces the rubric.* `/api/extract` doesn't summarise the PDF into topics; every concept it emits carries a `keyPoints` array written as a grading rubric (individually checkable claims) plus a `commonMisconception` drawn from how the topic is actually misunderstood. `/api/assess` then grades against that concept's own key points. No global answer key, no per-subject tuning — which is what lets it work on arbitrary material. Both routes import `lib/schemas.ts`; the shape extraction writes is the shape assessment reads.

**AI layer — two-provider chain in `lib/ai.ts`:**

1. **Primary: `anthropic/claude-sonnet-5` via OpenRouter** (`openai` npm v6, OpenAI-compatible). Via OpenRouter rather than Anthropic directly so spend is capped by prepaid credit instead of an open-ended billing account. PDF engine pinned to `native` so it can't silently fall back to paid OCR.
2. **Fallback: four Gemini Flash models on the free tier** (`@google/genai` v2.13) — `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-flash-latest`, `gemini-3-flash-preview`. So the app degrades instead of going dark.

Fall-through triggers on: spent credit (402), rejected/missing key (401/403/unset), rate limit (429), 5xx, and a 40s per-attempt stall cap. **HTTP 400 does not fall through** — a malformed request is our bug and would fail identically everywhere.

Structured output on both providers from the same Zod v4 schemas (`z.toJSONSchema()`), re-validated with Zod at runtime, so route handlers can trust their parsed value. PDF goes to the model as a document part — no pdf.js/text-extraction layer.

**Env vars:** `OPENROUTER_API_KEY`, `GEMINI_API_KEY`. Optional `BLINDSPOT_MODEL` pins the whole chain to one model for benchmarking (prefix `openrouter:` for OpenRouter, bare = Gemini).

## Decisions and why

- **Provider journey:** started on Anthropic's API directly → hit a billing wall (free credits weren't API credits) → moved to Gemini free tier in under an hour, because prompts/schemas/UI were written provider-agnostically and only the client layer knew the vendor → discovered the free tier caps at **20 requests/day per model** → landed on the current chain, which gets a top-tier model with capped spend plus a free-tier safety net.
- **Model choices are measured, not assumed.** Every model in the chain was benchmarked with `scripts/adversarial-test.mjs` pinned via `BLINDSPOT_MODEL`. That's how `gemini-3.5-flash-lite` was promoted (holds the decisive judgement as well as 3.6-flash at a fifth of the price) and how `gemini-3.5-flash` was excluded (returns 503 "high demand"; its SDK retries internally, blocking a request for minutes).
- **The gate asserts properties, not exact verdicts.** Earlier revisions asserted a specific verdict for all three fixtures, and *every* failure it produced was the fixture drifting out of step with a stronger model's rubric — never the grader being wrong. One revision generated the "good" answer mechanically from the concept's key points, and Sonnet 5 correctly graded it `not_demonstrated` for copying them back verbatim — exactly the parroting the product exists to catch. It now asserts what carries the product and reports, without asserting, whether the good answer reads `mastered` or `shaky` (that tracks rubric strictness, not correctness).
- **Design:** the hero is a working optic-disc blind-spot test — it makes the product's claim true on the visitor's own retina in ~5 seconds. Grotesk display over serif body (inverted from the usual pairing), state glyphs instead of 01/02/03 numbering, and red rationed so it appears *only* when a misconception is found.
- **Sample material is original.** `public/sample-lecture.pdf` is a six-page handout written for this project, generated reproducibly by `scripts/make_sample_pdf.py`. Not copied from any textbook — avoids any redistribution question in a public repo.

## Current state — all verified, not assumed

- **Adversarial gate passes 7/7 on Claude Sonnet 5.** Three explanations of Big-O graded against a rubric the tool itself extracted: accurate-in-own-words → `mastered` **88**; vague-but-true → `shaky` **28** (no invented misconception); fluent-confident-wrong → `misconception` **8**, named *"Big-O measures actual speed, not growth rate"*. The wrong one is the longest and most confident and scored lowest.
- **Live deployment confirmed served by Sonnet 5** — verified via OpenRouter usage delta (note: that endpoint lags ~30s; a tight before/after window falsely reads as "Gemini served it").
- **Fallback verified twice** — with a deliberately invalid OpenRouter key, and with the variable absent entirely. Both fell through to Gemini and still caught the misconception.
- Production build clean; API keys absent from all build artifacts; `.env.local` untracked; SDKs stay server-side.
- **Demo video done:** `docs/blindspot-demo.mp4` — 52.8s, 1280×720, h264, 1.5 MB, **silent**, awaiting voiceover.
- Screenshots in `docs/shots/` (8 states incl. mobile). README and Devpost copy written and current.

**Costs (measured):** ~$0.0105 per assessment; a full session (1 extraction + ~5 explanations) ≈ **$0.09**, so $5 ≈ **55 sessions**. ~$0.38 consumed by testing so far. Against 12 judges that's ~4× headroom, with Gemini catching anything beyond.

## What's left

1. **Record the voiceover.** `docs/video-script.md` — ~128 words, timed beat-by-beat to the 52.8s cut. The 5-second silence at 0:29 over the spinner is load-bearing; it sets up the reveal. Save as `docs/voiceover.wav`, then `pwsh scripts/add-voiceover.ps1` → produces `docs/blindspot-demo-final.mp4` and checks it's under 2:00.
2. **Submit on Devpost.** Paste the fields from `docs/devpost-submission.md` (elevator pitch is 185/200 chars; live URL and repo link already filled in). Upload the video to YouTube/Vimeo unlisted first.
3. **Rotate both API keys after Jul 31** — they were pasted into a chat transcript.

The silent cut is submittable as-is, so there's a complete entry either way. Narration is worth real points on a 25-point criterion.

## Gotchas discovered the hard way

- **Vercel binds env vars at build time.** Adding a variable does not affect the running deployment — you must redeploy. An empty commit works.
- **Next.js 16 ships its own docs** at `node_modules/next/dist/docs/`, and `AGENTS.md` in the repo root says to read them before writing Next code. Turbopack is default; `next lint` is removed.
- **OpenRouter's `/auth/key` usage figure lags ~30 seconds.** Don't conclude from a tight before/after window.
- **`ATTEMPT_TIMEOUT_MS` must stay under the routes' `maxDuration`** (60s, Vercel hobby ceiling) or the stall cap is unreachable dead code. Currently 40s.
- **PowerShell `Get-Content` reads as ANSI**, which corrupts UTF-8 source files on rewrite. Use the editor tools, not shell text munging.
- **Screenshots via the in-app Browser pane need the pane displayed.** Playwright (`scripts/screenshots.mjs`) sidesteps this entirely and is the reliable path — capture against the **production** server so the Next.js dev badge stays out of frame.

## Key files

| Path | What |
|---|---|
| `lib/prompts.ts` | **The core IP.** Assessment system prompt carries three worked examples teaching the incomplete-vs-wrong distinction. |
| `lib/schemas.ts` | Zod schemas shared by both routes; `keyPoints` is the rubric. |
| `lib/ai.ts` | Two-provider chain, fall-through logic, schema sanitising. |
| `lib/verdict.ts` | One display mapping so rail/card/tally can't disagree. |
| `app/api/{extract,assess}/route.ts` | The two endpoints. |
| `components/BlindSpotTest.tsx` | The scotoma test — the signature element. |
| `scripts/adversarial-test.mjs` | **The gate.** Run it after any model or prompt change. |
| `scripts/{record-demo.mjs,cut-demo.ps1,add-voiceover.ps1}` | Video pipeline. |
| `scripts/make_sample_pdf.py` | Regenerates + self-verifies the sample lecture. |

## Commands

```bash
npm run dev            # dev server
npm run build && npm start   # production (use this for screenshots/recording)

node scripts/adversarial-test.mjs   # THE GATE — server must be running
node scripts/screenshots.mjs        # docs/shots/
node scripts/record-demo.mjs        # raw capture → docs/footage/
pwsh scripts/cut-demo.ps1           # → docs/blindspot-demo.mp4
pwsh scripts/add-voiceover.ps1      # muxes docs/voiceover.wav
```

Benchmark a single model:

```bash
BLINDSPOT_MODEL=openrouter:anthropic/claude-sonnet-5 npm start
BLINDSPOT_MODEL=gemini-3.5-flash-lite npm start
```
