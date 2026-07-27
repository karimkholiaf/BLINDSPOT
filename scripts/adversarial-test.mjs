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
    expect: "mastered",
    expectMisconception: false,
    text: `Big-O describes how an algorithm's running time grows as the input gets larger. It's an asymptotic upper bound, so you drop constant factors and lower-order terms — 3n squared plus 5n plus 100 is just O(n squared). The important thing is that it's about the shape of the growth curve, not about actual speed in seconds. Two algorithms in the same class can have very different real-world performance, and an algorithm with worse asymptotic complexity can easily win on small inputs because the constants dominate there.`,
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

console.log(`\nGrading three explanations of "${target.title}".\n`);

const results = [];
for (const item of EXPLANATIONS) {
  const assessment = await post("/api/assess", { concept: target, explanation: item.text });
  results.push({ item, assessment });

  const verdictOk = assessment.verdict === item.expect;
  const misconceptionOk = Boolean(assessment.misconception) === item.expectMisconception;

  console.log(`${item.id}  ${item.label}`);
  console.log(
    `    verdict        ${assessment.verdict}  ${verdictOk ? "OK" : `EXPECTED ${item.expect}`}`,
  );
  console.log(`    score          ${assessment.masteryScore}`);
  console.log(
    `    misconception  ${assessment.misconception ? `"${assessment.misconception.label}"` : "none"}` +
      `  ${misconceptionOk ? "OK" : "WRONG"}`,
  );
  console.log(`    headline       ${assessment.headline}\n`);
}

// The property that separates this from a keyword matcher.
const scoreOf = (id) => results.find((r) => r.item.id === id).assessment.masteryScore;
const confidentWrongRankedBelowVague = scoreOf("C") < scoreOf("B");

console.log("─".repeat(72));
const failures = results.filter(
  (r) =>
    r.assessment.verdict !== r.item.expect ||
    Boolean(r.assessment.misconception) !== r.item.expectMisconception,
);

console.log(`verdicts correct                     ${results.length - failures.length}/3`);
console.log(
  `confident-wrong scored below vague   ${confidentWrongRankedBelowVague ? "yes" : "NO"}` +
    `   (C=${scoreOf("C")}, B=${scoreOf("B")})`,
);

const passed = failures.length === 0 && confidentWrongRankedBelowVague;
console.log(`\n${passed ? "PASS" : "FAIL"} — the distinction ${passed ? "holds" : "does not hold"}.`);
process.exit(passed ? 0 : 1);
