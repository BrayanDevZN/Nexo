import { test, expect } from "../../../src/frontend/test-kit";

// Only the looping CSS animations count; short transitions come and go.
const animationCount = () => document.getAnimations().filter(animation => animation instanceof CSSAnimation).length;

test("a weak device gets the lite rendering without losing any animation or element", async ({ browser }) => {
  const full = await browser.newPage();
  await full.addInitScript(() => Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 }));
  await full.goto("/");
  await expect(full.locator("html")).toHaveAttribute("data-perf", "full");
  const fullState = await full.evaluate(() => ({
    animations: document.getAnimations().filter(animation => animation instanceof CSSAnimation).length,
    drops: document.querySelectorAll(".ambient-drop").length,
    washes: document.querySelectorAll(".ambient-wash").length,
    cubeFaces: document.querySelectorAll(".cube-face").length,
    orbits: document.querySelectorAll(".core-orbit").length,
    blur: getComputedStyle(document.querySelector(".site-header")!).backdropFilter,
  }));
  expect(fullState.blur).toContain("blur");

  const lite = await browser.newPage();
  await lite.addInitScript(() => Object.defineProperty(navigator, "hardwareConcurrency", { value: 2 }));
  await lite.goto("/");
  await expect(lite.locator("html")).toHaveAttribute("data-perf", "lite");
  const liteState = await lite.evaluate(() => ({
    animations: document.getAnimations().filter(animation => animation instanceof CSSAnimation).length,
    drops: document.querySelectorAll(".ambient-drop").length,
    washes: document.querySelectorAll(".ambient-wash").length,
    cubeFaces: document.querySelectorAll(".cube-face").length,
    orbits: document.querySelectorAll(".core-orbit").length,
    blur: getComputedStyle(document.querySelector(".site-header")!).backdropFilter,
  }));
  // Only the live blur behind the header is dropped; everything else is identical.
  expect(liteState.blur).toBe("none");
  expect({ ...liteState, blur: "" }).toEqual({ ...fullState, blur: "" });
  expect(await lite.evaluate(animationCount)).toBeGreaterThan(10);
});

test("the brand symbol is a small image, not the original 1254px file", async ({ page }) => {
  const response = await page.request.get("/images/nexo-symbol-purple.png");
  expect(response.ok()).toBe(true);
  expect((await response.body()).length).toBeLessThan(100 * 1024);
  await page.goto("/");
  const natural = await page.evaluate(() => (document.querySelector(".brand img") as HTMLImageElement).naturalWidth);
  expect(natural).toBeLessThanOrEqual(512);
  expect(natural).toBeGreaterThanOrEqual(128);
});

test("the demo keeps typing at the same pace and finishes every line", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.getElementById("demonstracao")?.scrollIntoView());
  const typed = () => page.evaluate(() => [...document.querySelectorAll(".stream-console")][0].querySelectorAll("[data-desktop]").length
    ? [...[...document.querySelectorAll(".stream-console")][0].querySelectorAll("[data-desktop]")].map(node => node.textContent!.length) : []);
  await page.waitForTimeout(1500);
  const early = await typed();
  expect(early[0]).toBeGreaterThan(0);
  expect(early[3]).toBe(0);
  await expect.poll(async () => (await typed()).every(length => length > 40), { timeout: 15000 }).toBe(true);
  await expect(page.locator(".stream-console").first().locator("[data-result]")).toHaveText("Resumo pronto para conferência", { timeout: 20000 });
});
