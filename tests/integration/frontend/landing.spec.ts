import { test, expect } from "../../../src/frontend/test-kit";

const NUMBER = "553199705688";

test("the accounting page has one goal and no way out to the rest of the site", async ({ page }) => {
  await page.goto("/contabilidade");
  await expect(page).toHaveTitle(/contabilidade/i);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pare de correr atrás de documento");
  await expect(page.getByRole("link", { name: "Soluções" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Explorar soluções" })).toHaveCount(0);
  const links = page.locator("a[href^='https://wa.me/']");
  await expect(links).toHaveCount(4);
  for (const href of await links.evaluateAll(nodes => nodes.map(node => node.getAttribute("href")))) {
    expect(href).toMatch(new RegExp(`^https://wa\\.me/${NUMBER}\\?text=`));
    expect(decodeURIComponent(href!)).toContain("página de contabilidade");
    expect(decodeURIComponent(href!)).not.toContain("origem");
  }
  await expect(page.locator(".page-ambient")).toHaveCount(1);
  await expect(page.locator(".cube-face")).toHaveCount(6);
});

test("an ad click tags the WhatsApp message with its origin", async ({ page }) => {
  await page.goto("/contabilidade?gclid=test123");
  for (const href of await page.locator("a[href^='https://wa.me/']").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")))) {
    expect(decodeURIComponent(href!)).toContain("(origem: google-ads)");
  }
});

test("a WhatsApp click is reported as the conversion, with where it happened", async ({ page }) => {
  await page.addInitScript(() => {
    const events: unknown[][] = [];
    (window as unknown as { __events: unknown[][] }).__events = events;
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag = (...args) => { events.push(args); };
  });
  await page.goto("/contabilidade");
  const popup = page.waitForEvent("popup");
  await page.locator("a[href^='https://wa.me/']").nth(1).click();
  await (await popup).close();
  const events = await page.evaluate(() => (window as unknown as { __events: unknown[][] }).__events);
  expect(events).toEqual([
    ["event", "whatsapp_click", { page: "contabilidade", placement: "hero" }],
    ["event", "conversion", { send_to: "AW-18538355330/NOysCLr2yKodEIK144dF", value: 1, currency: "BRL" }],
  ]);
});

test("the questions open and close", async ({ page }) => {
  await page.goto("/contabilidade");
  const question = page.getByRole("button", { name: "Quanto custa?" });
  await question.scrollIntoViewIfNeeded();
  await question.click();
  await expect(page.getByText("apresentamos uma proposta com valores claros")).toBeVisible();
  await question.click();
  await expect(page.getByText("apresentamos uma proposta com valores claros")).toBeHidden();
});

test("on a phone the button is on the first screen and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/contabilidade");
  const hero = page.locator(".lp-hero a[href^='https://wa.me/']");
  await expect(hero).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("the main site is unchanged and the page is only served at its own path", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Mais capacidade.");
  await expect(page.getByRole("link", { name: "Soluções" }).first()).toBeVisible();
  await page.goto("/contabilidade/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pare de correr atrás de documento");
});

test("the hero illustration is described, labelled as illustrative and shows no real client", async ({ page }) => {
  await page.goto("/contabilidade");
  const figure = page.getByRole("figure", { name: /Ilustração: extratos, notas fiscais e comprovantes/ });
  await expect(figure).toBeVisible();
  await expect(figure).toContainText("Visão ilustrativa");
  await expect(figure).toContainText("Cliente A");
  await expect(figure).not.toContainText(/\d/);
});

test("the privacy policy is served at its own path and linked from both pages", async ({ page }) => {
  await page.goto("/privacidade");
  await expect(page).toHaveTitle(/privacidade/i);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Política de privacidade");
  await expect(page.getByRole("heading", { name: "Cookies" })).toBeVisible();
  for (const path of ["/", "/contabilidade"]) {
    await page.goto(path);
    await expect(page.locator("footer").getByRole("link", { name: "Política de privacidade" })).toHaveAttribute("href", "/privacidade");
  }
});

test("the Google tag loads only after the visitor accepts cookies", async ({ page }) => {
  const tagRequests: string[] = [];
  await page.route(/googletagmanager\.com/, route => { tagRequests.push(route.request().url()); return route.fulfill({ status: 200, contentType: "text/javascript", body: "" }); });
  await page.goto("/contabilidade");
  const notice = page.getByRole("dialog", { name: "Aviso de cookies" });
  await expect(notice).toBeVisible();
  await expect(page.locator("script[src*='googletagmanager']")).toHaveCount(0);
  expect(tagRequests).toHaveLength(0);
  await notice.getByRole("button", { name: "Recusar" }).click();
  await page.reload();
  await expect(notice).toHaveCount(0);
  expect(tagRequests).toHaveLength(0);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("dialog", { name: "Aviso de cookies" }).getByRole("button", { name: "Aceitar" }).click();
  await expect.poll(() => tagRequests.length).toBeGreaterThan(0);
  expect(tagRequests[0]).toContain("id=AW-18538355330");
});

test("both public pages show the privacy link and the contact email in the footer", async ({ page }) => {
  for (const path of ["/", "/contabilidade"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "nexo.bd.owners@gmail.com" })).toHaveAttribute("href", "mailto:nexo.bd.owners@gmail.com");
  }
});

test("each public page has its own canonical address and the panel is kept out of search", async ({ page }) => {
  for (const [path, canonical] of [["/", "https://nexoaicompany.com/"], ["/contabilidade/", "https://nexoaicompany.com/contabilidade"], ["/privacidade", "https://nexoaicompany.com/privacidade"]]) {
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);
  }
  await page.goto("/admin");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  const robots = await (await page.request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("Sitemap: https://nexoaicompany.com/sitemap.xml");
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  for (const url of ["/", "/contabilidade", "/privacidade"]) expect(sitemap).toContain(`<loc>https://nexoaicompany.com${url}</loc>`);
});


test("an ad visit is saved in the paid-traffic funnel and the WhatsApp click moves it to the next stage", async ({ page }) => {
  const calls: { url: string; body: unknown }[] = [];
  await page.route("**/api/public/paid-leads/**", route => {
    calls.push({ url: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    return route.fulfill({ status: 201, contentType: "application/json", body: '{"id":"11111111-1111-1111-1111-111111111111"}' });
  });
  await page.context().route(/wa\.me/, route => route.fulfill({ status: 200, body: "ok" }));
  await page.goto("/contabilidade?gclid=Cj0abc_123");
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ url: "/api/public/paid-leads/visit", body: { page: "contabilidade", origin: "google-ads", click_id: "Cj0abc_123" } });
  const popup = page.waitForEvent("popup");
  await page.locator("a[href^='https://wa.me/']").nth(1).click();
  await (await popup).close();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]).toEqual({ url: "/api/public/paid-leads/11111111-1111-1111-1111-111111111111/whatsapp", body: { placement: "hero" } });
});

test("a visit that did not come from an ad is not recorded and the button still works", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/public/paid-leads/**", route => { calls += 1; return route.fulfill({ status: 201, body: "{}" }); });
  await page.context().route(/wa\.me/, route => route.fulfill({ status: 200, body: "ok" }));
  await page.goto("/contabilidade");
  const popup = page.waitForEvent("popup");
  await page.locator("a[href^='https://wa.me/']").nth(1).click();
  await (await popup).close();
  await page.waitForTimeout(500);
  expect(calls).toBe(0);
});

test("if saving the visit fails the visitor still reaches WhatsApp", async ({ page }) => {
  await page.route("**/api/public/paid-leads/**", route => route.fulfill({ status: 503, body: "down" }));
  await page.context().route(/wa\.me/, route => route.fulfill({ status: 200, body: "ok" }));
  await page.goto("/contabilidade?gclid=abc");
  const popup = page.waitForEvent("popup");
  await page.locator("a[href^='https://wa.me/']").nth(1).click();
  const opened = await popup;
  await expect.poll(() => opened.url()).toContain("wa.me/553199705688");
  await opened.close();
});
