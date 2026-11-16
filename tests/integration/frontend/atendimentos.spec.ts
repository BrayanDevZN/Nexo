import { test, expect, type Page } from "../../../src/frontend/test-kit";

const user = { id: "u1", name: "Ana Silva", email: "ana@example.com", phone: "+5511999999999" };
const hours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

async function mock(page: Page, options: { signedIn?: boolean } = {}) {
  let session = options.signedIn ? user : undefined;
  const businesses: Record<string, unknown>[] = [];
  const services: Record<string, unknown>[] = [];
  const appointments: Record<string, unknown>[] = [];
  await page.route("**/api/atendimentos/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/atendimentos", "");
    const method = request.method();
    let body: unknown = {};
    let status = 200;
    const csrf = () => expect(request.headers()["x-csrf-token"]).toBe("test-csrf");
    if (path === "/auth/me") { body = session || {}; status = session ? 200 : 401; }
    else if (path === "/auth/csrf") body = { csrf_token: "test-csrf" };
    else if (path === "/auth/login") { session = user; body = user; }
    else if (path === "/auth/logout") { csrf(); session = undefined; status = 204; }
    else if (path === "/businesses" && method === "GET") body = businesses;
    else if (path === "/businesses" && method === "POST") {
      csrf();
      const row = { ...request.postDataJSON(), id: "b1", owner_id: user.id, slug: "barbearia", timezone: "America/Sao_Paulo", my_role: "owner", created_at: "2026-11-16", updated_at: "2026-11-16" };
      businesses.push(row); body = row; status = 201;
    }
    else if (path === "/businesses/b1/photo" && method === "PUT") {
      csrf();
      const upload = request.postDataBuffer() || Buffer.alloc(0);
      expect(upload.length).toBeLessThan(2 * 1024 * 1024); expect(upload.includes(Buffer.from("image/jpeg"))).toBe(true);
      Object.assign(businesses[0], { has_photo: true }); body = businesses[0];
    }
    else if (path === "/businesses/b1/photo" && method === "GET") { await route.fulfill({ status: 404 }); return; }
    else if (path === "/businesses/b1/overview") body = { today: appointments.length, next_7_days: appointments.length, upcoming: appointments.length, finished: 0, by_status: { scheduled: appointments.length, confirmed: 0, done: 0, cancelled: 0, no_show: 0 }, next: appointments };
    else if (path === "/businesses/b1/members") body = [{ id: "m1", business_id: "b1", user_id: user.id, role: "owner", name: user.name, email: user.email, created_at: "2026-11-16" }];
    else if (path === "/businesses/b1/invitations" && method === "GET") body = [];
    else if (path === "/businesses/b1/services" && method === "GET") body = services;
    else if (path === "/businesses/b1/services" && method === "POST") {
      csrf();
      const data = request.postDataJSON();
      expect(data.duration_minutes).toBe(30); expect(data.price).toBe("45.00");
      const row = { ...data, id: "s1", business_id: "b1", price: 45, created_at: "2026-11-16", updated_at: "2026-11-16" };
      services.push(row); body = row; status = 201;
    }
    else if (path === "/businesses/b1/appointments" && method === "GET") body = appointments;
    else if (path === "/businesses/b1/appointments" && method === "POST") {
      csrf();
      const data = request.postDataJSON();
      expect(data.service_id).toBe("s1"); expect(data.starts_at).toMatch(/Z$/);
      const row = { ...data, id: "a1", business_id: "b1", service_name: "Corte", staff_name: null, ends_at: new Date(new Date(data.starts_at).getTime() + 30 * 60000).toISOString(), status: "scheduled", price: 45, created_by_id: user.id, created_at: "2026-11-16", updated_at: "2026-11-16" };
      appointments.push(row); body = row; status = 201;
    }
    else if (path === "/businesses/b1/appointments/a1" && method === "PATCH") { csrf(); Object.assign(appointments[0], request.postDataJSON()); body = appointments[0]; }
    else status = 404;
    await route.fulfill({ status, ...(status === 204 ? {} : { contentType: "application/json", body: JSON.stringify(body) }) });
  });
}

test("signs in, creates a business, a service and an appointment, then marks it done", async ({ page }) => {
  await mock(page);
  await page.goto("/atendimentos");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Você ainda não tem nenhum negócio")).toBeVisible();
  await page.getByRole("button", { name: "Criar negócio" }).click();
  await page.getByLabel("Nome do negócio").fill("Barbearia do Zé");
  await page.getByRole("button", { name: "Criar negócio" }).click();
  await expect(page.getByRole("navigation", { name: "Seções" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Semana" })).toBeVisible();

  await page.getByRole("button", { name: "Serviços" }).click();
  await page.getByRole("button", { name: "Novo serviço" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Corte");
  await page.getByLabel("Preço (R$)").fill("45,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("30 min · R$ 45,00")).toBeVisible();

  await page.getByRole("button", { name: "Agenda" }).click();
  await page.getByRole("button", { name: "Marcar atendimento" }).click();
  await page.getByLabel("Nome do cliente").fill("João");
  await page.getByLabel("Serviço", { exact: true }).click();
  await page.getByRole("option", { name: /Corte/ }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  const item = page.getByRole("button", { name: /João/ });
  await expect(item).toHaveAttribute("aria-label", /Marcado/);
  await item.click();
  await page.getByRole("button", { name: "Concluído", exact: true }).click();
  await expect(page.getByRole("button", { name: /João/ })).toHaveAttribute("aria-label", /Concluído/);
  // No panel session, no storage besides the chosen business.
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("nexo:atendimentos:business"))).toBe("b1");
});

test("the invitation link is read before signing in", async ({ page }) => {
  await mock(page);
  await page.route("**/api/atendimentos/invitations/tok", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ business_name: "Barbearia do Zé", role: "staff", email: "bia@example.com", expires_at: "2026-11-23T00:00:00Z" }) }));
  await page.goto("/atendimentos?invite=tok");
  await expect(page.getByText("Você foi convidado para Barbearia do Zé como atendente.")).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue("bia@example.com");
});

test("a large phone photo chosen for a new business is shrunk, previewed and sent after creating it", async ({ page }) => {
  await mock(page, { signedIn: true });
  await page.goto("/atendimentos");
  await page.getByRole("button", { name: "Criar negócio" }).click();
  // 2500x1700 BMP (~12 MB): far over 2 MB and not a type the server accepts, like many phone photos.
  const width = 2500, height = 1700, rowSize = width * 3, pixels = rowSize * height;
  const bmp = Buffer.alloc(54 + pixels);
  bmp.write("BM"); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18); bmp.writeInt32LE(height, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
  for (let i = 54; i < bmp.length; i++) bmp[i] = (i * 7) % 256;
  await page.locator('input[type="file"]').setInputFiles({ name: "foto.bmp", mimeType: "image/bmp", buffer: bmp });
  await expect(page.getByAltText("Prévia da foto do negócio")).toBeVisible();
  await page.getByLabel("Nome do negócio").fill("Barbearia do Zé");
  await page.getByRole("button", { name: "Criar negócio" }).click();
  await expect(page.getByRole("navigation", { name: "Seções" })).toBeVisible();
});

test("the calendar books a free slot on click and remembers its customization", async ({ page }) => {
  await mock(page, { signedIn: true });
  await page.addInitScript(() => sessionStorage.setItem("nexo:atendimentos:business", "b1"));
  await page.route("**/api/atendimentos/businesses", route => route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "b1", owner_id: "u1", name: "Barbearia", slug: "b", cnpj: null, description: null, phone: null, email: null, address: null, city: null, state: null, timezone: "America/Sao_Paulo", opening_hours: hours, has_photo: false, my_role: "owner", created_at: "2026-11-16", updated_at: "2026-11-16" }]) })
    : route.fallback());
  await page.route("**/api/atendimentos/businesses/b1", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "b1", owner_id: "u1", name: "Barbearia", slug: "b", cnpj: null, description: null, phone: null, email: null, address: null, city: null, state: null, timezone: "America/Sao_Paulo", opening_hours: hours, has_photo: false, my_role: "owner", created_at: "2026-11-16", updated_at: "2026-11-16" }) }));
  await page.goto("/atendimentos");
  await expect(page.getByRole("radio", { name: "Semana" })).toBeChecked();
  // Clicking an empty spot of today's column opens the form with that time already filled in.
  await page.locator(".bk-tg-col[data-today]").click({ position: { x: 20, y: 3 * 56 + 10 } });
  await expect(page.getByRole("heading", { name: "Novo atendimento" })).toBeVisible();
  await expect(page.getByLabel("Início")).toHaveValue(/T\d\d:(00|30)$/);
  await page.getByRole("button", { name: "Cancelar" }).click();
  // Month view and the customization are applied at once and kept for the next visit.
  await page.getByRole("radio", { name: "Mês" }).click();
  await expect(page.locator(".bk-month")).toBeVisible();
  await page.getByRole("button", { name: "Personalizar agenda" }).click();
  await page.getByLabel("Mostrar fins de semana").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".bk-month-head")).toHaveCount(5);
  await page.reload();
  await page.getByRole("radio", { name: "Semana" }).click();
  await expect(page.locator(".bk-tg-day")).toHaveCount(5);
});
