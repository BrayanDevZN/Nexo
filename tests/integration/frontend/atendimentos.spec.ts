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
  await expect(page.getByText("Você ainda não tem nenhum negócio.")).toBeVisible();
  await page.getByRole("button", { name: "Criar negócio" }).click();
  await page.getByLabel("Nome do negócio").fill("Barbearia do Zé");
  await page.getByRole("button", { name: "Criar negócio" }).click();
  await expect(page.getByRole("navigation", { name: "Seções" })).toBeVisible();
  await expect(page.getByText("Nenhum atendimento neste dia.")).toBeVisible();

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
  await expect(item).toContainText("Marcado");
  await item.click();
  await page.getByRole("button", { name: "Concluído", exact: true }).click();
  await expect(page.getByRole("button", { name: /João/ })).toContainText("Concluído");
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
