/**
 * Drives the demo and records it, so the footage is deterministic instead of
 * depending on a steady hand. Playwright records the viewport directly, which
 * also keeps the desktop out of frame.
 *
 * Real extraction takes ~25s, which is far longer than the beat it gets in the
 * script — the raw capture is deliberately generous and the dead air is
 * trimmed afterwards by scripts/cut-demo.ps1.
 *
 * Usage: node scripts/record-demo.mjs   (dev server must be running)
 */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/footage";

const WRONG_EXPLANATION =
  "So Big-O measures how fast an algorithm runs. You work out the complexity and that tells " +
  "you the running time. Quicksort is O(n log n), insertion sort is O(n squared), so quicksort " +
  "is always going to be the faster algorithm - that's why every real sorting library uses quicksort.";

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

console.log("Recording:");
await page.goto(BASE, { waitUntil: "networkidle" });
await beat(page, 2500, "hero settles");

// Shot 1 — the blind-spot test. Hover the marks so the eye goes there.
await page.mouse.move(1030, 300, { steps: 30 });
await beat(page, 4000, "hold on the scotoma test");
await page.getByRole("button", { name: /dot disappeared/i }).click();
await beat(page, 5000, "payoff line reveals");

// Shot 3 — ingest.
await page.getByRole("button", { name: /use the sample lecture/i }).click();
await beat(page, 1500, "extraction begins");
await page.getByRole("navigation", { name: "Concepts" }).waitFor({ timeout: 90_000 });
await beat(page, 2500, "concept map lands");

// Shot 4 — pick the concept the demo turns on.
const bigO = page.getByRole("button", { name: /Big-O/i }).first();
await bigO.click();
await beat(page, 1800, "concept selected");

// Shot 5 — the wrong explanation, typed at human speed.
const box = page.getByPlaceholder("Start explaining…");
await box.click();
await box.type(WRONG_EXPLANATION, { delay: 28 });
await beat(page, 1500, "explanation finished");

// Shot 6 — the pause that sets up the reveal.
await page.getByRole("button", { name: /check my understanding/i }).click();
await beat(page, 1200, "submitted");
await page.getByRole("region", { name: "Assessment" }).waitFor({ timeout: 90_000 });
await beat(page, 3000, "diagnosis lands - hold");

// Shot 7 — read the card.
await page.getByText("The belief").scrollIntoViewIfNeeded();
await beat(page, 3500, "the belief");
await page.getByText("You said").scrollIntoViewIfNeeded();
await beat(page, 3000, "the quote");
await page.getByText("What's actually true").scrollIntoViewIfNeeded();
await beat(page, 4000, "the correction");
await page.getByText("Answer this next").scrollIntoViewIfNeeded();
await beat(page, 3000, "the follow-up");

// Shot 8 — the flagged node in the rail.
await page.mouse.wheel(0, -2000);
await beat(page, 3500, "rail shows the flag");

await context.close();
await browser.close();
console.log(`\nFootage written to ${OUT}/`);
