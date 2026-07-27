/**
 * Captures the three states worth showing: the hero, the concept map, and the
 * diagnosis card. Output doubles as README imagery and as the review pass on
 * the design, since reading the DOM tells you a page is correct but not
 * whether it is any good.
 *
 * Usage: node scripts/screenshots.mjs   (dev server must be running)
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/shots";

const WRONG_EXPLANATION =
  "So Big-O measures how fast an algorithm runs. You work out the complexity and that tells " +
  "you the running time. Quicksort is O(n log n), insertion sort is O(n squared), so quicksort " +
  "is always going to be the faster algorithm - that's why every real sorting library uses quicksort.";

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const shot = async (name, options = {}) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...options });
  console.log(`  ${OUT}/${name}.png`);
};

console.log("Capturing:");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await shot("01-hero");

await page.getByRole("button", { name: /dot disappeared/i }).click();
await page.waitForTimeout(800);
await shot("02-hero-revealed");

await page.getByRole("button", { name: /use the sample lecture/i }).click();
await page.waitForTimeout(1500);
await shot("03-extracting");

await page.getByRole("navigation", { name: "Concepts" }).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1200);
await shot("04-concept-map");

await page.getByRole("button", { name: /Big-O/i }).first().click();
await page.waitForTimeout(800);
await shot("05-teach-back");

await page.getByPlaceholder("Start explaining…").fill(WRONG_EXPLANATION);
await page.waitForTimeout(500);
await page.getByRole("button", { name: /check my understanding/i }).click();
await page.getByRole("region", { name: "Assessment" }).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1500);
await shot("06-diagnosis");
await page.getByRole("region", { name: "Assessment" }).screenshot({ path: `${OUT}/07-diagnosis-card.png` });
console.log(`  ${OUT}/07-diagnosis-card.png`);

// Mobile, to confirm the layout actually collapses rather than merely shrinking.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const mobilePage = await mobile.newPage();
await mobilePage.goto(BASE, { waitUntil: "networkidle" });
await mobilePage.waitForTimeout(1000);
await mobilePage.screenshot({ path: `${OUT}/08-mobile-hero.png` });
console.log(`  ${OUT}/08-mobile-hero.png`);

await mobile.close();
await context.close();
await browser.close();
console.log("\nDone.");
