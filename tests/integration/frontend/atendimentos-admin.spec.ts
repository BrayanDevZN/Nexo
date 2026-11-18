import { test, expect, type Page } from "../../../src/frontend/test-kit";

const owner = { id: "owner", name: "Principal", email: "owner@example.com", phone: "+5511999999999", status: "approved", role: "owner", profile_photo: null };
const person = (id: string, name: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, name, email: id + "@example.com", phone: null, has_photo: false, status, access_expires_at: null, access_source: null, role: null, role_label: null, businesses: [], created_at: "2026-11-10T12:00:00Z", ...extra,
});

// The panel's selects are listboxes: open one, then choose the option.
const pick = async (page: Page, label: string | RegExp, option: string) => { await (typeof label === "string" && label === "Sistema" ? page.locator("#members-system") : page.getByLabel(label)).click(); await page.getByRole("option", { name: option, exact: true }).click(); };

async function mock(page: Page) {
  const accounts = [person("bia", "Bia Souza", "pending"), person("rafa", "Rafael Moura", "approved", { access_source: "link", access_expires_at: "2027-01-10T00:00:00Z", role: "owner", role_label: "Dono", businesses: [{ name: "Barbearia Navalha", role: "owner" }] })];
  const calls: { method: string; path: string; body: unknown }[] = [];
  const links: Record<string, unknown>[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api", "");
    const method = request.method();
    if (method !== "GET") calls.push({ method, path, body: request.postDataJSON?.() });
    let body: unknown = {}; let status = 200;
    if (path === "/auth/me") body = owner;
    else if (path === "/auth/csrf") body = { csrf_token: "test-csrf" };
    else if (path === "/realtime/ticket") body = { ticket: "t".repeat(43), expires_in: 30 };
    else if (path === "/admin/notifications" || path === "/admin/users" || path === "/members") body = [];
    else if (path === "/admin/users/principal") body = { id: "owner" };
    else if (path === "/admin/atendimentos/users" && method === "GET") {
      const wanted = url.searchParams.get("status");
      const rows = accounts.filter(row => !wanted || row.status === wanted);
      body = { counts: { pending: accounts.filter(row => row.status === "pending").length, approved: accounts.filter(row => row.status === "approved").length, rejected: accounts.filter(row => row.status === "rejected").length, expired: 0 }, users: rows };
    }
    else if (path.startsWith("/admin/atendimentos/users/") && method === "PATCH") {
      const target = accounts.find(row => row.id === path.split("/").pop())!;
      const data = request.postDataJSON();
      Object.assign(target, { status: data.decision, access_expires_at: data.days ? "2026-12-18T00:00:00Z" : null, access_source: "approval" });
      body = target;
    }
    else if (path === "/admin/atendimentos/links" && method === "GET") body = links;
    else if (path === "/admin/atendimentos/links" && method === "POST") {
      const data = request.postDataJSON();
      const row = { id: "l1", note: data.note, access_days: data.access_days ?? null, max_uses: data.max_uses, uses: 0, expires_at: "2026-12-02T00:00:00Z", created_at: "2026-11-18T00:00:00Z", active: true, url: "http://localhost/atendimentos?access=tok123" };
      links.push({ ...row, url: null }); body = row; status = 201;
    }
    else status = 404;
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { accounts, calls };
}

test("the owner approves people for the Atendimentos, makes access links and sees new sign-ups live", async ({ page }) => {
  const { accounts, calls } = await mock(page);
  const sockets: { send: (message: string) => void }[] = [];
  await page.routeWebSocket("**/api/realtime", socket => { sockets.push(socket); socket.send(JSON.stringify({ type: "ready" })); });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Geral" }).click();
  await page.getByRole("button", { name: /Solicitações/ }).first().click();
  await page.getByRole("tab", { name: /Atendimento/ }).click();
  await expect(page.getByRole("heading", { name: "Permissões do Atendimento" })).toBeVisible();
  await expect(page.getByText("Bia Souza")).toBeVisible();

  // Approve for 30 days.
  await page.getByRole("button", { name: "Liberar", exact: true }).click();
  await pick(page, "Validade do acesso", "30 dias");
  await page.getByRole("button", { name: "Liberar acesso" }).click();
  await expect(page.getByText("Acesso liberado. A pessoa recebe um e-mail.")).toBeVisible();
  expect(calls.find(call => call.method === "PATCH")?.body).toEqual({ decision: "approved", days: 30 });
  await expect(page.getByText("Ninguém esperando")).toBeVisible();

  // An access link, with the permission lasting 90 days, shown once.
  await page.getByRole("button", { name: "Criar link de acesso" }).click();
  await page.getByLabel("Para quem é (opcional)").fill("Barbearia do João");
  await pick(page, "Validade da permissão", "90 dias");
  await page.getByRole("button", { name: "Gerar link" }).click();
  await expect(page.getByLabel(/Link pronto/)).toHaveValue("http://localhost/atendimentos?access=tok123");
  expect(calls.find(call => call.path === "/admin/atendimentos/links")?.body).toMatchObject({ note: "Barbearia do João", access_days: 90, max_uses: 1 });
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).last().click();
  await expect(page.getByText("Barbearia do João")).toBeVisible();

  // Someone signs up while the screen is open: it appears without reloading.
  accounts.push(person("caio", "Caio Lima", "pending"));
  await expect.poll(() => sockets.length).toBeGreaterThan(0);
  sockets[sockets.length - 1].send(JSON.stringify({ type: "booking.access.changed" }));
  await expect(page.getByText("Caio Lima")).toBeVisible();
});

test("members from the CRM and the Atendimento share one list, tell the system and the role, filter by system and lose access in one click", async ({ page }) => {
  const { calls } = await mock(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Geral" }).click();
  await page.getByRole("button", { name: "Gerenciar membros", exact: true }).click();
  const card = page.locator("[data-slot=card]").filter({ hasText: "Rafael Moura" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Atendimento", { exact: true })).toBeVisible();
  await expect(card.getByText("Dono", { exact: true }).first()).toBeVisible();
  await expect(card.getByText(/Acesso liberado · até 10\/01\/2027/)).toBeVisible();
  await expect(card.getByText("Barbearia Navalha (Dono)")).toBeVisible();

  await pick(page, "Sistema", "CRM");
  await expect(page.getByText("Rafael Moura")).toHaveCount(0);
  await pick(page, "Sistema", "Atendimento");
  await expect(page.getByText("Rafael Moura")).toBeVisible();

  await page.getByRole("button", { name: "Tirar permissão de Rafael Moura" }).click();
  await page.getByRole("button", { name: "Tirar permissão", exact: true }).click();
  await expect(page.getByText("Permissão removida.")).toBeVisible();
  expect(calls.find(call => call.method === "PATCH")?.body).toEqual({ decision: "rejected" });
  await expect(page.locator("[data-slot=card]").filter({ hasText: "Rafael Moura" }).getByText(/Acesso removido/)).toBeVisible();
});
