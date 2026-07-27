# Blindspot

**A study tool that finds what you're confident about and wrong about.**

**[Try it →](https://blindspot-rust.vercel.app)** · [2-minute demo](docs/blindspot-demo.mp4)

Upload a lecture PDF. Blindspot pulls out the concepts and writes a grading rubric for each one. You then explain each concept back in your own words — typed or spoken — and it grades your explanation against that rubric.

The part that matters: it separates *incomplete* from *wrong*. A vague answer gets prompted for more. A fluent, confident, false answer gets named — the specific belief you hold, the phrase that gave you away, and what is actually true instead.

Three explanations of Big-O, graded against the same generated rubric by `scripts/adversarial-test.mjs`:

| Explanation | Verdict | Score |
| --- | --- | --- |
| Accurate and complete | `mastered` | 98 |
| Vague, but nothing false | `shaky` | 40 |
| Fluent, confident, and wrong | `misconception` | 20 |

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

1. **Upload.** The browser base64-encodes the PDF and posts it to `/api/extract`. The PDF is passed to Gemini as an inline document part — there is no text-extraction or pdf.js layer, so tables, pseudocode blocks and layout reach the model intact. Pasting raw text is supported as an alternative.
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

Both routes go through one function, `generateStructured` in `lib/ai.ts`. The Zod v4 schema is converted with `z.toJSONSchema()` and handed to Gemini as `responseJsonSchema`, so the response is constrained at generation time — and then re-validated against the same Zod schema at runtime, so a route handler can trust its parsed value completely. A malformed or off-shape response becomes a 422 with a sentence the UI can show a user, not a crash.

### Model choice

Both calls use `gemini-3.6-flash`. Flash rather than Pro, and not for cost reasons: the Gemini free tier returns HTTP 429 for every Pro model, so Flash is the strongest tier actually reachable without a billing account. Assessment quality is the whole product, so that constraint was validated instead of assumed.

## The adversarial test

`scripts/adversarial-test.mjs` checks the one judgement the product exists for. Accuracy on obviously-good and obviously-empty answers is table stakes; the case that matters is whether a grader can be fooled by fluency.

It extracts a concept map from `public/sample-lecture.pdf`, finds the concept covering Big-O, and posts three explanations of it against that concept's generated rubric:

- **A** — accurate and complete. Expects `mastered`.
- **B** — vague, but nothing in it is false. Expects `shaky`, and **no misconception object**, because inventing a misconception for a merely incomplete answer is its own failure.
- **C** — fluent, confident, and wrong. Expects `misconception`, named.

C is the one to watch. It is longer than B, contains more correct terminology, and reads as more authoritative, so any grader that rewards fluency will rank it above B.

```
node scripts/adversarial-test.mjs    # dev server must be running
```

Result: 3/3 verdicts correct, and C scored **20** against B's **40**. The misconception was named, not merely flagged — "Big-O measures execution speed, not growth rate". The script exits non-zero if any verdict is wrong, if a misconception is invented for B, or if C fails to score below B.

## Running it locally

```bash
npm install
cp .env.example .env.local
```

Put a Gemini API key in `.env.local` as `GEMINI_API_KEY`. Get one at <https://aistudio.google.com/apikey> — free, no credit card.

```bash
npm run dev
```

Open <http://localhost:3000> and click "Use the sample lecture" to try it without finding a PDF first.

`public/sample-lecture.pdf` is original course material written for this project — a six-page handout, "Lecture 4: Algorithmic Complexity". It is not copied from any textbook. `scripts/make_sample_pdf.py` regenerates it reproducibly and verifies that the output has a real extractable text layer containing the phrases the demo depends on.

Other scripts: `npm run build`, `npm start`, `npm run lint`. Deploys to Vercel as-is; the only environment variable is `GEMINI_API_KEY`.

## Project structure

```
app/
  api/extract/route.ts    PDF or text in, concept map with rubrics out
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
  ai.ts                   Gemini client, structured generation, error mapping
  verdict.ts              verdict to label, glyph and colour
  constants.ts            upload cap and sample path
scripts/
  adversarial-test.mjs    the incomplete-vs-wrong gate
  make_sample_pdf.py      regenerates and verifies the sample lecture
docs/
  video-script.md         demo video shot list
  devpost-submission.md   submission copy
```

Next.js 16.2.12 (App Router), React 19.2, TypeScript, Tailwind v4, `@google/genai` 2.13, Zod 4.

## Limitations

- **Dictation is Chrome and Edge only.** It uses the Web Speech API, which Firefox and Safari do not implement. `TeachBack` feature-detects support and hides the button rather than offering something that will not work. Typing works everywhere.
- **Scanned or image-only PDFs will not work.** There is no OCR step. The document goes to the model as a PDF part and needs a real text layer. If your material is a photocopy, paste the text instead.
- **3 MB upload cap.** Vercel caps request bodies at 4.5 MB and base64 inflates by roughly a third, so the practical ceiling is about 3 MB. It is enforced twice — in the browser before the upload, and in the route before a request is spent. A whole textbook needs splitting by chapter.
- **Free-tier rate limits apply.** Extraction and assessment are one model call each, and a burst of them on a free key will return 429. The UI surfaces this as a plain "wait a few seconds and try again" rather than a stack trace, but the limit is real, and both routes allow up to 60 seconds.
- **Nothing is saved.** The concept map, your explanations and your results live in React state for the length of the session. A refresh clears them. There is no account, no database, and no history.
- **Assessment is a language model's judgement, not ground truth.** It can miss a genuine misconception, and it can call something wrong that is merely phrased unusually. The adversarial test shows the incomplete-versus-wrong distinction holds on a case built to break it; that is evidence, not a guarantee. Treat a "Blind spot" verdict as a strong reason to go back to the source and check — which is the behaviour the tool is trying to produce anyway.
