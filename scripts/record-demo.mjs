/**
 * Drives the demo and records it, so the footage is deterministic instead of
 * depending on a steady hand. Playwright records the viewport directly, which
 * also keeps the desktop out of frame.
 *
 * Timeouts are generous because a request may fall through several models when
 * the leading one has spent its daily free-tier quota, and each fallback costs
 * a fresh round trip.
 *
 * Usage: node scripts/record-demo.mjs   (server must be running)
 */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/footage";
const PATIENT = { timeout: 240_000 };

const WRONG_EXPLANATION =
  "So Big-O measures how fast an algorithm runs. You work out the complexity and that tells " +
  "you the running time. Quicksort is O(n log n), insertion sort is O(n squared), so quicksort " +
  "is always going to be the faster algorithm - that's why every real sorting library uses quicksort.";

/** What the learner says once the diagnosis has taught them the distinction. */
const CORRECTED_EXPLANATION =
  "Big-O is an asymptotic upper bound on growth rate, not a measure of speed. Formally, f of n " +
  "is O of g of n if there are positive constants c and n-nought where f of n is at most c times " +
  "g of n for every n at or beyond n-nought. You drop constant factors and lower-order terms, so " +
  "3n squared plus 5n plus 100 is just O of n squared. And because the constants are dropped it " +
  "says nothing about small inputs, which is exactly why real libraries fall back to insertion " +
  "sort on small arrays even though insertion sort is O of n squared.";

const beat = (page, ms, note) => {
  console.log(`  ${String(ms).padStart(5)}ms  ${note}`);
  return page.waitForTimeout(ms);
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2, // crisp text once Devpost re-encodes
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

// Everything below runs inside try/finally: Playwright only flushes the video
// file when the context closes, so throwing mid-take would discard an
// otherwise usable recording.
try {
console.log("Recording:");
await page.goto(BASE, { waitUntil: "networkidle" });
await beat(page, 2500, "hero settles");

// Shot 1 - the scotoma test. Move the pointer so the eye follows it there.
await page.mouse.move(1030, 300, { steps: 30 });
await beat(page, 4000, "hold on the scotoma test");
await page.getByRole("button", { name: /dot disappeared/i }).click();
await beat(page, 5000, "payoff line reveals");

// Shot 3 - ingest.
await page.getByRole("button", { name: /use the sample lecture/i }).click();
await beat(page, 1500, "extraction begins");
await page.getByRole("navigation", { name: "Concepts" }).waitFor(PATIENT);
await beat(page, 2500, "concept map lands");

// Shot 4 - pick the concept the demo turns on.
await page.getByRole("button", { name: /Big-O/i }).first().click();
await beat(page, 1800, "concept selected");

// Shot 5 - the wrong explanation, typed at human speed.
const box = page.getByPlaceholder("Start explaining…");
await box.click();
await box.type(WRONG_EXPLANATION, { delay: 28 });
await beat(page, 1500, "explanation finished");

// Shot 6 - the pause that sets up the reveal.
await page.getByRole("button", { name: /check my understanding/i }).click();
await beat(page, 1200, "submitted");
await page.getByRole("region", { name: "Assessment" }).waitFor(PATIENT);
await beat(page, 3000, "diagnosis lands - hold");

// Shot 7 - read the card.
await page.getByText("The belief").scrollIntoViewIfNeeded();
await beat(page, 3500, "the belief");
await page.getByText("You said").scrollIntoViewIfNeeded();
await beat(page, 3000, "the quote");
await page.getByText("What's actually true").scrollIntoViewIfNeeded();
await beat(page, 4000, "the correction");
await page.getByText("Answer this next").scrollIntoViewIfNeeded();
await beat(page, 3000, "the follow-up");

// Shot 8 - the flagged node in the rail.
await page.mouse.wheel(0, -2000);
await beat(page, 3000, "rail shows the flag");

// Shot 9 - close the loop. Re-explaining the same concept correctly flips the
// node from red to green on camera, which is what shows the tool teaches
// rather than merely scolds.
await box.click();
await box.fill(""); // Control+A appended instead of replacing, garbling the answer.
await beat(page, 600, "cleared");
await box.type(CORRECTED_EXPLANATION, { delay: 22 });
await beat(page, 1200, "corrected explanation entered");
await page.getByRole("button", { name: /check my understanding/i }).click();
await beat(page, 1200, "resubmitted");

// Wait for the verdict to land without demanding a specific one. When quota
// pushes this call onto a weaker fallback model the grade may come back
// `shaky` rather than `mastered`; that makes shot 9 less punchy but it must not
// throw away the whole take.
await page.waitForFunction(
  () => !document.body.innerText.includes("Comparing your explanation"),
  undefined,
  PATIENT,
);
const flipped = await page
  .getByRole("region", { name: "Assessment" })
  .getByText("Solid", { exact: true })
  .isVisible()
  .catch(() => false);
console.log(`  verdict on the corrected answer: ${flipped ? "Solid - shot 9 lands" : "not Solid - trim shot 9"}`);
await beat(page, 3500, "verdict settles");
await page.mouse.wheel(0, -2000);
await beat(page, 4000, "rail state - hold on the finish");
} finally {
  await context.close();
  await browser.close();
  console.log(`\nFootage written to ${OUT}/`);
}
