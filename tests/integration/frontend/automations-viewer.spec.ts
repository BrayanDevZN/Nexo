import { test, expect } from "../../../src/frontend/test-kit";

const user = { id: "dev", name: "Dev", email: "dev@example.com", phone: "+5511999999999", status: "approved", role: "dev", profile_photo: null };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const media = [1, 2, 3].map(n => ({ id: `m${n}`, kind: "image", content_type: "image/jpeg", filename: `foto-${n}.png`, size: 100 }));
const automation = { id: "a1", name: "Nexo Concierge", description: "Descrição longa. ".repeat(40), filename: "workflow.json", file_size: 2048,
  created_by_id: "dev", created_by_name: "Dev", has_image: false, can_manage: true, created_at: "2026-11-18T10:00:00", updated_at: "2026-11-18T10:00:00", media };

test("automation viewer opens wide and scrolls through every image", async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api", "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/me") return json(user);
    if (path === "/auth/csrf") return json({ csrf_token: "t" });
    if (path === "/automations") return json([automation]);
    if (path.startsWith("/automations/a1/media/")) return route.fulfill({ status: 200, contentType: "image/png", body: png });
    if (["/members", "/admin/users", "/admin/notifications", "/notifications"].includes(path)) return json([]);
    return json({}, 404);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Desenvolvimento" }).click();
  await page.getByRole("button", { name: "Automações" }).click();
  await page.getByRole("button", { name: "Abrir", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThan(1200);
  expect(box.height).toBeGreaterThan(780);
  await expect(dialog.getByText("1 / 3")).toBeVisible();
  await dialog.getByText("3 / 3").scrollIntoViewIfNeeded();
  await expect(dialog.getByText("3 / 3")).toBeInViewport();
});
