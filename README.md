# Blindspot

**A study tool that finds what you're confident about and wrong about.**

**[Try it →](https://blindspot-rust.vercel.app)** · [2-minute demo](docs/blindspot-demo.mp4)

Upload a lecture as PDF or Word. Blindspot pulls out the concepts and writes a grading rubric for each one. You then explain each concept back in your own words — typed or spoken — and it grades your explanation against that rubric.

The part that matters: it separates *incomplete* from *wrong*. A vague answer gets prompted for more. A fluent, confident, false answer gets named — the specific belief you hold, the phrase that gave you away, and what is actually true instead.

Three explanations of Big-O, graded against the same generated rubric by `scripts/adversarial-test.mjs`:

| Explanation | Verdict | Score |
| --- | --- | --- |
| Accurate, in the student's own words | `mastered` | 88 |
| Vague, but nothing false | `shaky` | 28 |
| Fluent, confident, and wrong | `misconception` | 8 |

The wrong one is the longest of the three, uses the most correct terminology, and sounds the most knowledgeable. It scored the lowest. That inversion is the entire product.

---

## The problem

Re-reading your notes cannot find what you almost know.

Recognition is not recall. When you re-read, every sentence arrives with the feeling of familiarity, and your brain treats that feeling as evidence of understanding. It is the same trick your visual system plays with the optic-disc blind spot: it fills the gap with something plausible and does not tell you it did. The landing page ships a working scotoma test so you can watch it happen on your own retina in about five seconds.

Quizzes only partly help, because they check the questions someone thought to ask. The failure mode that actually costs you marks is the belief you hold confidently and never re-examine — you will not go back and check something you already think you know.

Explaining a concept out loud, with nothing in front of you, is the one exercise that surfaces it. That is the Feynman technique, and Blindspot is a grader for it.

## How it works

**Extraction produces the rubric.** This is the architectural idea the rest hangs off.

`/api/extract` does not summarise the PDF into a list of topics. Every concept it returns carries a `keyPoints` array — 3 to 5 individually checkable claims that a genuinely correct explanation has to contain — plus a `commonMisconception` drawn from how the topic is actually misunderstood by learners rather than from the source text, since material rarely states its own traps.

`/api/assess` then grades an explanation against that concept's own `keyPoints`. There is no global answer key and no per-subject tuning: the standard an explanation is measured against is generated from the same document the learner studied, so the tool works on arbitrary material. Both routes import `lib/schemas.ts` for exactly this reason — the shape extraction writes is the shape assessment reads.

The pipeline:

1. **Upload.** The browser base64-encodes the file and posts it to `/api/extract`, which reads it to text first — `unpdf` for PDF, `mammoth` for `.docx`. That began as a latency fix and turned into the reason Word works at all: by the time a model is involved, every format looks the same. A PDF with no usable text layer is the one case that still travels to the model as a document, so scanned handouts degrade rather than fail. Pasting raw text is supported as an alternative.
2. **Extract.** 6 to 10 concepts, ordered so prerequisites come before what depends on them, each with a definition, its rubric, and its known misconception.
3. **Teach back.** A textarea, plus optional dictation via the Web Speech API with a live interim transcript. Explaining out loud is closer to the real exercise than writing is.
4. **Assess.** The concept and the explanation go to `/api/assess`, which returns a verdict, a 0–100 mastery score, what you demonstrated, what you missed, a Socratic follow-up question that must not contain its own answer, and — only when something is genuinely false — a structured misconception object.
5. **Diagnose.** The misconception card names the belief, quotes the phrase in your own words that revealed it, explains why it is wrong, and states what is actually true. The concept rail marks each concept with its verdict and tallies solid concepts against blind spots.

Four verdicts, one display mapping in `lib/verdict.ts` so the rail, the card and the tally can never disagree:

| Schema value | Shown as |
| --- | --- |
| `mastered` | Solid |
| `shaky` | Thin in places |
| `misconception` | Blind spot |
| `not_demonstrated` | Not enough to go on |

### Structured output

Both routes go through one function, `generateStructured` in `lib/ai.ts`. The Zod v4 schema is converted with `z.toJSONSchema()` and handed to whichever provider serves the request — as a strict `json_schema` response format on OpenRouter, as `responseJsonSchema` on Gemini — so the response is constrained at generation time, and then re-validated against the same Zod schema at runtime, so a route handler can trust its parsed value completely. A malformed or off-shape response becomes a 422 with a sentence the UI can show a user, not a crash.

### Model choice

Both calls run through one chain of models in `lib/ai.ts`, tried in order until one answers.

**Primary: `anthropic/claude-sonnet-5`, reached through OpenRouter.** It is the strongest model available here at a sane price. It goes through OpenRouter rather than Anthropic directly so that spend is capped by prepaid credit instead of an open-ended billing account; OpenRouter speaks the OpenAI chat-completions format, which is why `openai` v6 sits alongside `@google/genai`. It leads the chain for `/api/assess`, where the product's judgement lives. Extraction runs a separate chain led by `google/gemini-3.5-flash-lite`, also through OpenRouter: reading material into a fixed shape rewards speed rather than judgement, and that route has a hard ceiling to fit inside. When a PDF with no text layer does reach the model as a document, the PDF engine is pinned to `native` so OpenRouter never quietly falls back to a paid OCR engine.

**Fallback: four Gemini Flash models on the free tier** — `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-flash-latest`, `gemini-3-flash-preview`. They exist so the app degrades instead of going dark once the prepaid credit is spent.

A request falls through to the next model on spent credit (402), a rejected key (401/403), a rate limit (429), a server error (5xx), or a 90-second per-attempt stall cap. The stall cap earns its place: one Gemini model answers 503 "high demand", and its SDK retries that internally, which can block a request for minutes. The one status that does *not* fall through is 400 — a malformed request is a bug in this code, it would fail identically on every provider, and falling through would hide it.

The fallback is verified, not assumed: running with a deliberately invalid OpenRouter key, the request fell through to Gemini and still identified the misconception correctly, with the server logging `anthropic/claude-sonnet-5 unavailable (401 User not found.); falling through.`

## The adversarial test

`scripts/adversarial-test.mjs` checks the one judgement the product exists for. Accuracy on obviously-good and obviously-empty answers is table stakes; the case that matters is whether a grader can be fooled by fluency.

It extracts a concept map from `public/sample-lecture.pdf`, finds the concept covering Big-O, and posts three explanations of it against that concept's generated rubric:

- **A** — accurate, and written in a student's own words rather than as a restatement of the rubric.
- **B** — vague, but nothing in it is false. Expects `shaky`, and **no misconception object**, because inventing a misconception for a merely incomplete answer is its own failure.
- **C** — fluent, confident, and wrong. Expects `misconception`, named.

C is the one to watch. It is longer than B, contains more correct terminology, and reads as more authoritative, so any grader that rewards fluency will rank it above B.

```
node scripts/adversarial-test.mjs    # dev server must be running
```

Result against Claude Sonnet 5: all seven checks pass. A came back `mastered` at **88**, B `shaky` at **28** with no misconception invented, and C `misconception` at **8**, with the belief named — "Big-O measures actual speed, not growth rate".

### What the test asserts, and why it changed

The pass criteria used to assert an exact verdict for all three explanations. Every failure that version ever produced was the hand-written fixture drifting out of step with a stronger model's rubric, never the grader getting the judgement wrong. One revision made the point sharply: A had been generated mechanically from the concept's own key points, and Claude Sonnet 5 graded it `not_demonstrated` — "you copied the key points back verbatim" — which is precisely the parroting this product exists to catch. The grader was right and the fixture was wrong.

So the script now asserts the properties that carry the product: C is flagged as a false belief and the belief is named, B is not falsely accused of holding one, C ranks below B, and A ranks above both. Whether A reads `mastered` or `shaky` is reported but not asserted, because that tracks how demanding a rubric the extractor happened to write rather than whether the grading is correct.

## Running it locally

```bash
npm install
cp .env.example .env.local
```

`.env.example` lists both keys the app needs, with links:

- `OPENROUTER_API_KEY` — the primary provider, Claude Sonnet 5. Create a key at <https://openrouter.ai/keys> and top it up with prepaid credit; there is no open-ended billing account to leave running.
- `GEMINI_API_KEY` — the free-tier fallback. Get one at <https://aistudio.google.com/apikey> — free, no credit card.

There is also an optional `BLINDSPOT_MODEL`, commented out in `.env.example`, which pins every request to a single model so the adversarial test can benchmark one candidate at a time.

```bash
npm run dev
```

Open <http://localhost:3000> and click "Use the sample lecture" to try it without finding a PDF first.

`public/sample-lecture.pdf` is original course material written for this project — a six-page handout, "Lecture 4: Algorithmic Complexity". It is not copied from any textbook. `scripts/make_sample_pdf.py` regenerates it reproducibly and verifies that the output has a real extractable text layer containing the phrases the demo depends on.

Other scripts: `npm run build`, `npm start`, `npm run lint`. Deploys to Vercel as-is; the environment variables are `OPENROUTER_API_KEY` and `GEMINI_API_KEY`.

## Project structure

```
app/
  api/extract/route.ts    PDF, Word or text in, concept map with rubrics out
  api/assess/route.ts     concept + explanation in, verdict + diagnosis out
  page.tsx                the client flow; owns the map, drafts and results
  layout.tsx              fonts and metadata
  globals.css             Tailwind v4 theme
components/
  Uploader.tsx            drag-drop, file picker, sample lecture, paste-text fallback
  ConceptRail.tsx         concept list with verdict marks and a session tally
  TeachBack.tsx           explanation textarea and Web Speech dictation
  Diagnosis.tsx           verdict card, including the misconception breakdown
  BlindSpotTest.tsx       the working scotoma demo on the landing page
lib/
  schemas.ts              Zod schemas shared by both routes; keyPoints is the rubric
  prompts.ts              extraction and assessment system prompts
  ai.ts                   the model chain, structured generation, error mapping
  verdict.ts              verdict to label, glyph and colour
  constants.ts            upload cap and sample path
scripts/
  adversarial-test.mjs    the incomplete-vs-wrong gate
  make_sample_pdf.py      regenerates and verifies the sample lecture
docs/
  video-script.md         demo video shot list
  devpost-submission.md   submission copy
```

Next.js 16.2.12 (App Router), React 19.2, TypeScript, Tailwind v4, `openai` 6 (for OpenRouter), `@google/genai` 2.13, Zod 4.

## Limitations

- **Dictation is Chrome and Edge only.** It uses the Web Speech API, which Firefox and Safari do not implement. `TeachBack` feature-detects support and hides the button rather than offering something that will not work. Typing works everywhere.
- **Scanned or image-only PDFs are unreliable.** There is no OCR step. A PDF with no text layer falls back to being sent to the model as a document, which often works but is slower and costs more. If your material is a photocopy, pasting the text is the dependable route. Word's older `.doc` format is rejected outright — `.docx` only.
- **3 MB upload cap.** Vercel caps request bodies at 4.5 MB and base64 inflates by roughly a third, so the practical ceiling is about 3 MB. It is enforced twice — in the browser before the upload, and in the route before a request is spent. A whole textbook needs splitting by chapter.
- **Quality degrades when the credit runs out.** Extraction and assessment are one model call each, billed against prepaid OpenRouter credit. When that credit is spent — or the key is rejected, or the request is rate-limited or stalls past 90 seconds — the request falls through to the Gemini free tier rather than failing, which keeps the app up but means the answer may come from a weaker model than the one the results above were measured on. The free tier has its own daily per-model quota; once every model in the chain is exhausted, the UI says so in a sentence rather than showing a stack trace.
- **Nothing is saved.** The concept map, your explanations and your results live in React state for the length of the session. A refresh clears them. There is no account, no database, and no history.
- **Assessment is a language model's judgement, not ground truth.** It can miss a genuine misconception, and it can call something wrong that is merely phrased unusually. The adversarial test shows the incomplete-versus-wrong distinction holds on a case built to break it; that is evidence, not a guarantee. Treat a "Blind spot" verdict as a strong reason to go back to the source and check — which is the behaviour the tool is trying to produce anyway.
