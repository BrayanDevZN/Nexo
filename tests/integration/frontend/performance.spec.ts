import { test, expect } from "../../../src/frontend/test-kit";

const running = () => document.getAnimations().filter(animation => animation instanceof CSSAnimation && animation.playState === "running").length;

test("a weak device gets the lite rendering without losing any element or animation", async ({ browser }) => {
  const read = () => document.querySelectorAll(".vt-orb").length;
  const full = await browser.newPage();
  await full.addInitScript(() => Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 }));
  await full.goto("/");
  await expect(full.locator("html")).toHaveAttribute("data-perf", "full");
  const fullOrbs = await full.evaluate(read);

  const lite = await browser.newPage();
  await lite.addInitScript(() => Object.defineProperty(navigator, "hardwareConcurrency", { value: 2 }));
  await lite.goto("/");
  await expect(lite.locator("html")).toHaveAttribute("data-perf", "lite");
  expect(await lite.evaluate(read)).toBe(fullOrbs);
  expect(fullOrbs).toBeGreaterThan(0);
  expect(await lite.evaluate(running)).toBeGreaterThan(0);
});

test("the brand images are small files", async ({ page }) => {
  for (const path of ["/images/nexo-symbol-light.png", "/images/nexo-logo-green.png"]) {
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    expect((await response.body()).length).toBeLessThan(100 * 1024);
  }
  await page.goto("/");
  const natural = await page.evaluate(() => (document.querySelector(".vt-chip img") as HTMLImageElement).naturalWidth);
  expect(natural).toBeLessThanOrEqual(1000);
});

test("animations play even when the operating system asks to reduce motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(running)).toBeGreaterThan(0);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".vt-orb")!).animationName)).toBe("vt-float");
  await context.close();
});

test("the home shows the veterinary services with real photos", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/clínicas veterinárias/i);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(8);
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } });
  const broken = await page.evaluate(() => [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src));
  expect(broken).toEqual([]);
});

test("the top bar has a gradient so content scrolling under it stays readable", async ({ page }) => {
  await page.goto("/");
  const image = await page.evaluate(() => getComputedStyle(document.querySelector(".vt-header")!, "::before").backgroundImage);
  expect(image).toContain("linear-gradient");
});

test("photos are small WebP files with a smaller version for phones", async ({ page }) => {
  await page.goto("/");
  const sources = await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".vt-photo img, .vt-orb")].map(img => ({ src: img.getAttribute("src")!, srcset: img.getAttribute("srcset") })));
  expect(sources.length).toBeGreaterThan(8);
  for (const { src, srcset } of sources) {
    expect(src).toMatch(/\.webp$/);
    expect(srcset).toMatch(/ \d+w, .* \d+w$/);
  }
  const sizes = await Promise.all(["/images/vet/atendimento-640.webp", "/images/vet/estoque-640.webp", "/images/vet/hero-gato-240.webp"].map(async path => (await (await page.request.get(path)).body()).length));
  for (const size of sizes) expect(size).toBeLessThan(80 * 1024);
});

test("the public page does not load the admin stylesheet", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", request => requested.push(request.url()));
  await page.goto("/");
  await page.waitForTimeout(500);
  expect(requested.some(url => /AdminApp[^/]*\.css/.test(url) || /admin\.css/.test(url))).toBe(false);
});
