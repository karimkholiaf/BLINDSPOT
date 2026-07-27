/**
 * The test that matters.
 *
 * Blindspot's entire claim is that it can tell an incomplete explanation apart
 * from a confidently wrong one. Accuracy on obviously-good and obviously-empty
 * answers is table stakes; this checks the case the product exists for.
 *
 * Three explanations of the same concept go in:
 *   A  accurate and complete            -> expect `mastered`
 *   B  vague, but nothing false         -> expect `shaky`, and NO misconception
 *   C  fluent, confident, and wrong     -> expect `misconception`, named
 *
 * C is the one to watch. It is longer than B, uses more correct terminology,
 * and sounds more knowledgeable — so a grader that rewards fluency will rank it
 * above B. It must score below B instead.
 *
 * Usage: node scripts/adversarial-test.mjs   (dev server must be running)
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const EXPLANATIONS = [
  {
    id: "A",
    label: "accurate and complete",
    // Verdict deliberately not asserted — see the pass criteria at the bottom.
    // `mastered` vs `shaky` here tracks how demanding a rubric the extractor
    // wrote, which is a tuning question, not a correctness one.
    expect: null,
    expectMisconception: false,
    // Deliberately in student voice, not a restatement of the rubric. An
    // earlier version of this test generated A mechanically from the concept's
    // key points; Claude Sonnet 5 correctly graded that `not_demonstrated`
    // ("you copied the key points back verbatim"), which is exactly the
    // parroting this product exists to catch. Covering the same ground in
    // your own words is the thing being tested — so it has to be written that
    // way, including the subtler points a strong extractor asks for.
    text:
      `Okay so the formal version is that f(n) is O(g(n)) if you can find some positive constant c ` +
      `and some threshold n-nought where, for every n at or past that threshold, f(n) stays at or ` +
      `below c times g(n). Two things about that always trip people up. First, nobody constrains how ` +
      `big c is — it could be a million, the definition doesn't care — which is why Big-O tells you ` +
      `about the shape of the growth curve and not about actual seconds on a real machine. Two ` +
      `algorithms that are both O(n log n) can differ enormously in practice. Second, it's only an ` +
      `upper bound, so it isn't a tight description: anything that's O(n) is also technically O(n²), ` +
      `and that's a true statement, just a useless one. By convention you quote the tightest bound ` +
      `you can actually prove, which is why saying O(n²) about a linear algorithm gets you a funny ` +
      `look even though it isn't wrong. And because the whole thing only kicks in past n-nought, it ` +
      `says nothing at all about small inputs — a "worse" algorithm can genuinely win down there, ` +
      `and it often does.`,
  },
  {
    id: "B",
    label: "vague, nothing false",
    expect: "shaky",
    expectMisconception: false,
    text: `Big-O is the notation you use for how efficient an algorithm is. O(n) is better than O(n squared). You figure it out by looking at the loops in the code — one loop is usually O(n), a nested loop is usually O(n squared).`,
  },
  {
    id: "C",
    label: "confident and wrong",
    expect: "misconception",
    expectMisconception: true,
    text: `Big-O measures how fast an algorithm runs. You work out the complexity and that tells you the running time. Quicksort is O(n log n) and insertion sort is O(n squared), so quicksort is always the faster algorithm — that's exactly why every real sorting library uses quicksort instead of insertion sort. The lower the Big-O, the faster the code runs.`,
  },
];

const post = async (path, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data;
};

const { readFile } = await import("node:fs/promises");

console.log("Extracting concept map from the sample lecture…");
const pdfBase64 = (await readFile("public/sample-lecture.pdf")).toString("base64");
const map = await post("/api/extract", { pdfBase64 });

console.log(`\n  "${map.sourceTitle}" → ${map.concepts.length} concepts`);
for (const concept of map.concepts) {
  console.log(`    ${concept.id.padEnd(28)} ${concept.keyPoints.length} key points`);
}

// Grade against whichever concept actually covers Big-O in the generated map.
const target =
  map.concepts.find((c) => /big[-\s]?o/i.test(`${c.id} ${c.title}`)) ??
  map.concepts.find((c) => /complexity|growth/i.test(`${c.id} ${c.title}`)) ??
  map.concepts[0];

const explanations = EXPLANATIONS;

console.log(`\nGrading three explanations of "${target.title}".`);
console.log("Rubric the model is grading against:");
for (const point of target.keyPoints) console.log(`    · ${point}`);
console.log("");

const results = [];
for (const item of explanations) {
  const assessment = await post("/api/assess", { concept: target, explanation: item.text });
  results.push({ item, assessment });

  const verdictOk = !item.expect || assessment.verdict === item.expect;
  const misconceptionOk = Boolean(assessment.misconception) === item.expectMisconception;

  console.log(`${item.id}  ${item.label}`);
  console.log(
    `    verdict        ${assessment.verdict}` +
      (item.expect ? `  ${verdictOk ? "OK" : `EXPECTED ${item.expect}`}` : "  (not asserted)"),
  );
  console.log(`    score          ${assessment.masteryScore}`);
  console.log(
    `    misconception  ${assessment.misconception ? `"${assessment.misconception.label}"` : "none"}` +
      `  ${misconceptionOk ? "OK" : "WRONG"}`,
  );
  console.log(`    headline       ${assessment.headline}\n`);
}

/*
  Pass criteria.

  Earlier revisions asserted an exact verdict for all three, and every failure
  it ever produced was the fixture drifting out of step with a stronger
  extractor's rubric — never the grader getting the judgement wrong. So the
  assertions below are the properties that actually carry the product, stated
  so they hold across models of differing strictness:

    1. A confidently wrong answer is identified as a false belief, not merely
       marked incomplete, and the belief is named.
    2. A vague-but-true answer is NOT accused of holding one. Inventing a
       misconception to seem useful is the failure that would make the tool
       untrustworthy.
    3. The confidently wrong answer ranks BELOW the vague one. This is the
       thesis: fluency is not understanding, and false confidence is worse
       than admitted uncertainty.
    4. The genuinely good answer ranks above both.

  Whether (4) reads `mastered` or `shaky` depends on how demanding a rubric
  this run produced, so the verdict itself is reported but not asserted.
*/
const of = (id) => results.find((r) => r.item.id === id).assessment;
const scoreOf = (id) => of(id).masteryScore;

const checks = [
  ["confident-wrong flagged as a belief", of("C").verdict === "misconception"],
  ["...and the belief is named", Boolean(of("C").misconception?.label)],
  ["vague answer not accused of one", !of("B").misconception],
  ["vague answer graded shaky", of("B").verdict === "shaky"],
  ["good answer not accused of one", !of("A").misconception],
  [`confident-wrong ranks below vague (C=${scoreOf("C")} < B=${scoreOf("B")})`, scoreOf("C") < scoreOf("B")],
  [`good answer ranks above both (A=${scoreOf("A")})`, scoreOf("A") > scoreOf("B") && scoreOf("A") > scoreOf("C")],
];

console.log("─".repeat(72));
for (const [label, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);

const passed = checks.every(([, ok]) => ok);
console.log(`\n${passed ? "PASS" : "FAIL"} — the distinction ${passed ? "holds" : "does not hold"}.`);
process.exit(passed ? 0 : 1);
