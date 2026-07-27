# Devpost submission copy

Each `##` heading below maps to one Devpost field. Copy the body of the section, not the heading.

---

## Project name

Blindspot

---

## Elevator pitch

> Devpost caps this field at 200 characters. The text below is **185 characters**.

Upload a lecture, explain each concept back in your own words, and Blindspot names the specific misconception you hold — telling a confidently wrong answer apart from an incomplete one.

---

## About the project

### Inspiration

Everyone has an optic-disc blind spot, and nobody perceives a hole. The visual system fills the gap with plausible background and does not report that it did anything. We built the classic scotoma test into the landing page because it makes the argument faster than a paragraph can: in about five seconds you watch a dot vanish and your own brain paper over it, confidently, without telling you.

Understanding fails the same way. When you re-read your notes, every sentence arrives feeling familiar, and that feeling gets treated as evidence that you know it. It isn't — it's recognition, not recall. That is why people walk into an exam confident and walk out confused.

Quizzes only partly fix this, because they test the questions someone thought to ask. The thing that actually costs you marks is the belief you hold confidently and never re-examine, because you will not go back and check something you already think you know. Explaining a concept out loud with nothing in front of you is the one exercise that reliably surfaces it. That's the Feynman technique, and we wanted to build a grader for it.

### What it does

You upload a lecture PDF. Blindspot returns 6 to 10 concepts, ordered so prerequisites come first, and each concept carries its own grading rubric — 3 to 5 individually checkable claims a correct explanation has to contain — plus the way that specific topic is most commonly misunderstood.

You then teach each concept back in your own words, typed or dictated out loud through the Web Speech API with a live transcript. Blindspot grades what you said against that concept's rubric and returns one of four verdicts: Solid, Thin in places, Blind spot, or Not enough to go on. Alongside it you get a 0–100 mastery score, what you actually demonstrated, what you missed, and one Socratic follow-up question that is answerable from the material and does not contain its own answer.

The verdict that matters is Blind spot. Most graders can only tell you a score. When your explanation contains something actively false, Blindspot names the belief ("Big-O measures execution speed, not growth rate"), quotes the exact phrase in your own words that revealed it, explains why it's wrong, and states what's actually true — with a counterexample where a short one exists. Being vague does not trigger it. Being wrong does. Those two need opposite responses: one needs prompting, the other needs correcting.

A rail down the side of the app marks every concept with its verdict as you go, so a study session ends with a specific list of what to revisit rather than a general feeling about how it went.

### How we built it

Next.js 16.2.12 on the App Router, React 19.2, TypeScript, Tailwind v4, deployed on Vercel. Two API routes and no database — the session lives in React state.

The architectural decision the whole thing rests on is that **extraction produces the rubric**. `/api/extract` doesn't summarise the PDF into topics; every concept it emits carries a `keyPoints` array written as a grading rubric, where each entry is one claim a grader can mark present or absent without a judgement call. `/api/assess` then grades an explanation against that concept's own key points. There's no global answer key and no per-subject tuning, which is what lets it work on arbitrary material. Both routes import the same `lib/schemas.ts` — the shape extraction writes is the shape assessment reads.

The AI layer is Google Gemini through `@google/genai` v2.13, model `gemini-3.6-flash` for both calls. Structured output is belt and braces: we define the response shape once as a Zod v4 schema, convert it with `z.toJSONSchema()`, and pass it to Gemini as `responseJsonSchema` so generation is constrained — then re-validate the returned JSON against the same Zod schema at runtime, so a route handler can trust its parsed value completely. An off-shape response becomes a 422 with a sentence a user can read, not a crash.

The PDF goes to Gemini directly as an inline base64 document part. There's no text-extraction or pdf.js step, which means the tables, pseudocode blocks and layout in a real lecture handout reach the model intact instead of being flattened into a wall of text first. The trade-off is a 3 MB cap, since Vercel's request body limit is 4.5 MB and base64 inflates by about a third.

We built this with AI-assisted development, using Claude Code. This is an AI hackathon and the organisers' own resources page recommends coding assistants, so we'd rather state it plainly than leave it implied: the prompts, the schema design, the adversarial test and the product decisions are ours; a lot of the typing is not. The prompt engineering in `lib/prompts.ts` is where most of the actual work went, and it's worth reading — the assessment system prompt carries three worked examples on one concept, because worked examples outweigh abstract rules, and it explicitly forbids manufacturing a misconception to seem useful.

For the demo we needed source material we could publish, so we wrote our own: `public/sample-lecture.pdf` is an original six-page handout, "Lecture 4: Algorithmic Complexity", generated reproducibly by `scripts/make_sample_pdf.py`, which also verifies the output has a genuine extractable text layer containing the phrases the demo depends on. Nothing in it is copied from a textbook.

### Challenges we ran into

**The provider migration.** We originally built against Anthropic's API. The free-credit path turned out to require a billing account we didn't have, which is the kind of wall that ends a hackathon project. It cost us under an hour, because of one decision made early: the prompts, the Zod schemas, the routes and the entire UI were written provider-agnostically, and only the client layer knew which vendor it was talking to. The migration commit deletes `lib/anthropic.ts` (62 lines) and adds `lib/ai.ts`; `lib/prompts.ts`, `lib/schemas.ts` and every component are untouched in that diff. The lesson generalises — the model client is the only thing that should know the vendor's name.

**Then the free tier had no Pro quota at all.** Gemini's free tier returns HTTP 429 for every Pro model, not just under load. So Flash wasn't a cost optimisation, it was the strongest tier reachable without billing. That's uncomfortable, because the nuanced judgement at the centre of this product — telling a confidently wrong explanation apart from a vague one — is exactly the kind of thing a smaller model plausibly gets wrong. Assuming Flash was good enough would have been the easy move.

So we wrote `scripts/adversarial-test.mjs` to find out instead. It extracts the concept map from the sample lecture, locates the Big-O concept, and grades three explanations against that concept's generated rubric: one accurate and complete, one vague but containing nothing false, and one that is fluent, confident and wrong. The third is deliberately the longest, uses the most correct terminology and reads as the most authoritative, so any grader that rewards fluency ranks it highest.

It scored the lowest. Verdicts came back 3/3 correct, the confidently wrong answer scored **20** against the vague answer's **40** and the accurate one's **98**, and the misconception was named rather than merely flagged. The script exits non-zero if any verdict is wrong, if C fails to score below B, or — just as importantly — if a misconception object gets invented for the merely vague answer, which was its own tuning problem: a model told to look for misconceptions will happily find one in an answer that's just thin, and a student who's told they hold a false belief when they were only incomplete will stop trusting the tool, correctly.

**Making the model grade meaning rather than vocabulary.** The failure this product exists to catch is an explanation that uses all the right terms in the wrong relationships. Early prompts rewarded that, because it looks like a good answer. The fix was making the scoring rule explicit and counterintuitive in the prompt: a confident false claim scores *lower* than an honest "I'm not sure", because false confidence stops future learning while admitted uncertainty invites it. An answer that's 80% right with one confidently wrong load-bearing claim is not an 80.

### Accomplishments that we're proud of

The score inversion, measured rather than asserted: 98 for the correct explanation, 40 for the vague one, 20 for the confident wrong one — with the wrong one being the longest and most fluent of the three. That single ordering is the product's whole thesis, and we can demonstrate it on demand instead of claiming it.

The diagnosis card. Naming the belief, quoting the phrase that revealed it, and giving a concrete counterexample is a categorically different experience from being told you scored 20/100, and it's the difference between marking and teaching.

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

Then multi-document maps, so a whole module's handouts build one concept graph and prerequisite links work across lectures rather than within a single PDF. The `prerequisites` field is already in the schema and currently under-used — the rail could show which concepts are wobbly *because* something underneath them is wrong.

Beyond that: OCR so scanned handouts work, a spoken follow-up loop where you answer the Socratic question out loud and get re-graded on the same concept, and an export of your flagged misconceptions as a revision sheet — the highest-value page of notes anyone could take into an exam, because it's the list of things you were about to get wrong.

---

## Built with

next.js, react, typescript, tailwindcss, google-gemini, gemini-3.6-flash, zod, web-speech-api, vercel, node.js, claude-code, python, reportlab

---

## Try it out links

- https://blindspot-rust.vercel.app
- https://github.com/karimkholiaf/BLINDSPOT
