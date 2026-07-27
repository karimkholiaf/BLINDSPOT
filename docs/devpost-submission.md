# Devpost submission copy

Each `##` heading below maps to one Devpost field. Copy the body of the section, not the heading.

---

## Project name

Blindspot

---

## Elevator pitch

> Devpost caps this field at 200 characters. The text below is **191 characters**.

Fluency isn't understanding. Explain a lecture back in your own words and Blindspot names the specific belief you have wrong — scoring a confident wrong answer below an honest "I'm not sure".

---

## About the project

### Inspiration

Everyone has an optic-disc blind spot, and nobody perceives a hole. The visual system fills the gap with plausible background and does not report that it did anything. We built the classic scotoma test into the landing page because it makes the argument faster than a paragraph can: in about five seconds you watch a dot vanish and your own brain paper over it, confidently, without telling you.

Understanding fails the same way. When you re-read your notes, every sentence arrives feeling familiar, and that feeling gets treated as evidence that you know it. It isn't — it's recognition, not recall. That is why people walk into an exam confident and walk out confused.

Quizzes only partly fix this, because they test the questions someone thought to ask. The thing that actually costs you marks is the belief you hold confidently and never re-examine, because you will not go back and check something you already think you know. Explaining a concept out loud with nothing in front of you is the one exercise that reliably surfaces it. That's the Feynman technique, and we wanted to build a grader for it.

### What it does

You upload a lecture as PDF or Word. Blindspot returns 6 to 10 concepts, ordered so that anything needed to understand a later concept comes first, and each concept carries its own grading rubric — 3 to 5 individually checkable claims a correct explanation has to contain — plus the way that specific topic is most commonly misunderstood.

You then teach each concept back in your own words, typed or dictated out loud through the Web Speech API with a live transcript. Blindspot grades what you said against that concept's rubric and returns one of four verdicts: Solid, Thin in places, Blind spot, or Not enough to go on. Alongside it you get a 0–100 mastery score, what you actually demonstrated, what you missed, and one Socratic follow-up question that is answerable from the material and does not contain its own answer.

The verdict that matters is Blind spot. Most graders can only tell you a score. When your explanation contains something actively false, Blindspot names the belief ("Big-O measures actual speed, not growth rate"), quotes the exact phrase in your own words that revealed it, explains why it's wrong, and states what's actually true — with a counterexample where a short one exists. Being vague does not trigger it. Being wrong does. Those two need opposite responses: one needs prompting, the other needs correcting.

A rail down the side of the app marks every concept with its verdict as you go, so a study session ends with a specific list of what to revisit rather than a general feeling about how it went.

### How we built it

Next.js 16.2.12 on the App Router, React 19.2, TypeScript, Tailwind v4, deployed on Vercel. Two API routes and no database — the session lives in React state.

The architectural decision the whole thing rests on is that **extraction produces the rubric**. `/api/extract` doesn't summarise the PDF into topics; every concept it emits carries a `keyPoints` array written as a grading rubric, where each entry is one claim a grader can mark present or absent without a judgement call. `/api/assess` then grades an explanation against that concept's own key points. There's no global answer key and no per-subject tuning, which is what lets it work on arbitrary material. Both routes import the same `lib/schemas.ts` — the shape extraction writes is the shape assessment reads.

The AI layer is a two-provider chain in `lib/ai.ts`. Claude Sonnet 5 leads, reached through OpenRouter with the `openai` v6 client, because it's the strongest model available to us at a sane price and because going through OpenRouter caps spend at whatever prepaid credit we bought instead of opening a billing account. Behind it sit four Gemini Flash models on the free tier through `@google/genai` v2.13 — `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-flash-latest`, `gemini-3-flash-preview` — so that when the credit runs out the app degrades instead of going dark. A request falls through on spent credit (402), a rejected key (401/403), a rate limit (429), a server error, or a 90-second per-attempt stall cap. The one status that doesn't fall through is 400: a malformed request is our bug, it would fail identically everywhere, and falling through would hide it.

Structured output is belt and braces, and identical on both providers: we define the response shape once as a Zod v4 schema, convert it with `z.toJSONSchema()`, and hand it over as a strict `json_schema` response format on OpenRouter or as `responseJsonSchema` on Gemini, so generation is constrained — then re-validate the returned JSON against the same Zod schema at runtime, so a route handler can trust its parsed value completely. An off-shape response becomes a 422 with a sentence a user can read, not a crash.

Extraction runs in two phases, and the reason is a measurement. Asking one call for 6-10 fully-rubricked concepts is 3-4k output tokens, which timed at 45-90 seconds no matter which model served it — against a 60-second platform ceiling. So the first call returns just the outline, and the rubric for each concept is then written in its own small call, all of them concurrently. Same result, no individual request anywhere near the limit: **58.6 seconds became about 6**, and the cost of an extraction fell from $0.057 to $0.015.

Files are read to text before a model sees them — `unpdf` for PDF, `mammoth` for `.docx`. That started as part of the same latency work and is why Word documents are supported at all: by the time the model is involved, every format looks identical. A PDF with no usable text layer still travels as a native document part, with OpenRouter's PDF engine pinned so it can't quietly fall back to a paid OCR engine. The trade-off is a 3 MB cap, since Vercel's request body limit is 4.5 MB and base64 inflates by about a third.

We built this with AI-assisted development, using Claude Code. This is an AI hackathon and the organisers' own resources page recommends coding assistants, so we'd rather state it plainly than leave it implied: the prompts, the schema design, the adversarial test and the product decisions are ours; a lot of the typing is not. The prompt engineering in `lib/prompts.ts` is where most of the actual work went, and it's worth reading — the assessment system prompt carries three worked examples on one concept, because worked examples outweigh abstract rules, and it explicitly forbids manufacturing a misconception to seem useful.

For the demo we needed source material we could publish, so we wrote our own: `public/sample-lecture.pdf` is an original six-page handout, "Lecture 4: Algorithmic Complexity", generated reproducibly by `scripts/make_sample_pdf.py`, which also verifies the output has a genuine extractable text layer containing the phrases the demo depends on. Nothing in it is copied from a textbook.

### Challenges we ran into

**Getting a model at all.** We originally built against Anthropic's API directly. The free-credit path turned out to require a billing account we didn't have, which is the kind of wall that ends a hackathon project. Moving to Gemini cost us under an hour, because of one decision made early: the prompts, the Zod schemas, the routes and the entire UI were written provider-agnostically, and only the client layer knew which vendor it was talking to. The migration commit deletes `lib/anthropic.ts` (62 lines) and adds `lib/ai.ts`; `lib/prompts.ts`, `lib/schemas.ts` and every component are untouched in that diff. The lesson generalises — the model client is the only thing that should know the vendor's name.

Gemini's free tier then turned out to have limits of its own. Every Pro model returns HTTP 429, not just under load, so Flash wasn't a cost optimisation but the strongest tier reachable without billing. And the free tier allows only 20 requests per day *per model* — metered separately for each, which is why the fallback lists several Flash models rather than one: it multiplies the daily budget.

Where we landed is a two-provider chain, and it solves the original problem rather than working around it. Claude Sonnet 5 leads, but through OpenRouter, where spend is capped by prepaid credit — so we get a top-tier model without the open-ended billing account that blocked us on day one. The Gemini free tier sits behind it as a safety net, so the demo stays up even if the credit is spent mid-judging. We verified that end to end by running with a deliberately invalid OpenRouter key: the request fell through to Gemini and still identified the misconception correctly, with the server logging `anthropic/claude-sonnet-5 unavailable (401 User not found.); falling through.`

**Trusting the grader.** The nuanced judgement at the centre of this product — telling a confidently wrong explanation apart from a vague one — is exactly the kind of thing a model can plausibly get wrong, and assuming otherwise would have been the easy move. So we wrote `scripts/adversarial-test.mjs` to find out instead. It extracts the concept map from the sample lecture, locates the Big-O concept, and grades three explanations against that concept's generated rubric: one accurate, one vague but containing nothing false, and one that is fluent, confident and wrong. The third is deliberately the longest, uses the most correct terminology and reads as the most authoritative, so any grader that rewards fluency ranks it highest.

It scored the lowest. Against Claude Sonnet 5 all seven checks pass: the confidently wrong answer scored **8** against the vague answer's **28** and the accurate one's **88**, and the misconception was named rather than merely flagged — "Big-O measures actual speed, not growth rate". The vague answer was not accused of holding a false belief, which was its own tuning problem: a model told to look for misconceptions will happily find one in an answer that's just thin, and a student who's told they hold a false belief when they were only incomplete will stop trusting the tool, correctly.

**Writing a test that fails for the right reason.** The gate originally asserted an exact verdict for all three explanations, and it did fail — but every single failure was our hand-written fixture drifting out of step with a stronger model's rubric, never the grader misjudging. One revision made that unmistakable: we had generated the "good" explanation mechanically from the concept's own key points, and Claude Sonnet 5 graded it `not_demonstrated` — "you copied the key points back verbatim" — which is precisely the parroting this product exists to catch. The grader was right and our fixture was wrong.

So we rewrote the pass criteria to assert the properties that actually carry the product: the wrong answer is flagged and the belief is named, the vague one is not falsely accused, the wrong one ranks below the vague one, and the good one ranks above both. Whether the good answer reads `mastered` or `shaky` is reported but not asserted, because that tracks how strict a rubric the extractor happened to write, not whether the grading is correct.

**Making the model grade meaning rather than vocabulary.** The failure this product exists to catch is an explanation that uses all the right terms in the wrong relationships. Early prompts rewarded that, because it looks like a good answer. The fix was making the scoring rule explicit and counterintuitive in the prompt: a confident false claim scores *lower* than an honest "I'm not sure", because false confidence stops future learning while admitted uncertainty invites it. An answer that's 80% right with one confidently wrong load-bearing claim is not an 80.

### Accomplishments that we're proud of

The score inversion, measured rather than asserted: 88 for the correct explanation, 28 for the vague one, 8 for the confident wrong one — with the wrong one being the longest and most fluent of the three. That single ordering is the product's whole thesis, and we can demonstrate it on demand instead of claiming it.

The diagnosis card. Naming the belief, quoting the phrase that revealed it, and giving a concrete counterexample is a categorically different experience from being told you scored 8/100, and it's the difference between marking and teaching.

Shipping an honest gate at all. It would have been faster to write a demo, assert the model was good enough, and hope no judge tested the edge case. The test exists precisely because we couldn't afford the model tier we wanted.

The scotoma test on the landing page. It's a working perceptual demo, it costs the visitor five seconds, and after it the value proposition needs no argument.

And the migration itself — a vendor wall at hour N of a hackathon that cost under an hour to walk around, because of a boundary drawn before we needed it.

### What we learned

Keep the vendor's name in one file. Prompts, schemas and UI that don't know which provider they're talking to are what turned an unrecoverable-looking billing wall into an afternoon's detour.

Constrain output *and* validate it. `responseJsonSchema` at generation time plus Zod at runtime sounds redundant until the first response that satisfies the schema loosely and breaks a component, and having both means route handlers stop defensively checking fields.

Worked examples beat rules in a prompt. The assessment prompt got dramatically better when we stopped describing the incomplete-versus-wrong distinction abstractly and showed three graded explanations of one concept, including exactly why the wrong one must rank below the vague one.

Test the property, not the happy path. Grading an obviously good answer correctly proves nothing about a tool whose reason to exist is catching fluent nonsense. The only test worth writing was the one designed to break it.

And test the model tier instead of assuming it. "Flash is probably fine" is a claim, and it took about forty lines of Node to turn it into a result.

### What's next for Blindspot

Persistence, first — right now a refresh loses your map, your explanations and your results, which is fine for a demo and wrong for a study tool. After that: spaced repetition that resurfaces flagged concepts on a schedule, weighted so a Blind spot comes back sooner than a Thin in places.

Then multi-document maps, so a whole module's handouts build one concept graph and prerequisite links work across lectures rather than within a single file. Ordering already encodes dependency loosely; making it explicit would let the rail show which concepts are wobbly *because* something underneath them is wrong.

Beyond that: OCR so scanned handouts work, a spoken follow-up loop where you answer the Socratic question out loud and get re-graded on the same concept, and an export of your flagged misconceptions as a revision sheet — the highest-value page of notes anyone could take into an exam, because it's the list of things you were about to get wrong.

---

## Built with

next.js, react, typescript, tailwindcss, openrouter, claude-sonnet-5, anthropic, openai, google-gemini, gemini-3.6-flash, zod, web-speech-api, vercel, node.js, claude-code, python, reportlab

---

## Try it out links

- https://blindspot-rust.vercel.app
- https://github.com/karimkholiaf/BLINDSPOT
