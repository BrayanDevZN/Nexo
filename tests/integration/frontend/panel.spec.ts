import { test, expect, type Page } from "../../../src/frontend/test-kit";

const member = { id: "member", name: "Ana Silva", email: "ana@example.com", phone: "+5511999999999", status: "pending", role: "member", profile_photo: null };
async function mock(page: Page, options: { user?: typeof member; requests?: boolean } = {}) {
  let user = options.user;
  const rows: Record<string, unknown>[] = [];
  const members = [{ ...member, status: "approved", is_principal: false }, { ...member, id: "owner", name: "Principal", email: "owner@example.com", role: "owner", status: "approved", is_principal: true }];
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api", "");
    const method = request.method();
    let body: unknown = {};
    let status = 200;
    if (path === "/auth/me") { body = user || {}; status = user ? 200 : 401; }
    else if (path === "/auth/csrf") body = { csrf_token: "test-csrf" };
    else if (path === "/auth/login") { user = options.user || member; body = user; }
    else if (path === "/auth/register") { status = 202; }
    else if (path === "/auth/register/confirm") { user = member; body = member; status = 201; }
    else if (path === "/auth/google/profile") body = { name: "Ana", email: member.email, csrf_token: "google-csrf" };
    else if (path === "/auth/google/complete") { user = member; body = member; status = 201; expect(request.headers()["x-csrf-token"]).toBe("google-csrf"); }
    else if (path === "/auth/logout" || path === "/auth/password/change") { user = undefined; status = 204; }
    else if (path === "/auth/account/deletion/request") { status = 202; expect(request.headers()["x-csrf-token"]).toBe("test-csrf"); }
    else if (path === "/auth/account/deletion/confirm") {
      expect(request.headers()["x-csrf-token"]).toBe("test-csrf");
      if (request.postDataJSON().code === "12345678") { user = undefined; status = 204; }
      else { status = 400; body = { detail: "Invalid or expired deletion code" }; }
    }
    else if (path === "/auth/password/recovery/request") status = 202;
    else if (path === "/auth/password/recovery/confirm") status = 204;
    else if (path === "/admin/notifications") body = options.requests ? [{ id: "note", requested_user_id: "member", created_at: "2026-10-02T12:00:00" }] : [];
    else if (path === "/admin/users") body = members;
    else if (path === "/members") body = members.map(({ id, name, role }) => ({ id, name, role, has_photo: false }));
    else if (path.startsWith("/admin/users/") && method === "PATCH") {
      expect(request.headers()["x-csrf-token"]).toBe("test-csrf");
      const target = members.find(row => row.id === path.split("/").pop())!;
      Object.assign(target, request.postDataJSON()); body = target;
    }
    else if (path.startsWith("/admin/users/") && method === "DELETE") {
      expect(request.headers()["x-csrf-token"]).toBe("test-csrf");
      members.splice(members.findIndex(row => row.id === path.split("/").pop()), 1); status = 204;
    }
    else if (path.endsWith("/decision")) { expect(request.headers()["x-csrf-token"]).toBe("test-csrf"); options.requests = false; body = member; }
    else if (path === "/clients" && method === "GET") body = rows;
    else if (path === "/clients" && method === "POST") { const row = { ...request.postDataJSON(), id: "client", created_by_id: "member", created_by_name: "Ana Silva", created_at: "2026-10-02", updated_at: "2026-10-02" }; rows.push(row); body = row; status = 201; }
    else if (path === "/clients/client" && method === "PATCH") { Object.assign(rows[0], request.postDataJSON()); body = rows[0]; }
    else if (path === "/clients/client" && method === "DELETE") { rows.splice(0); status = 204; }
    else if (path === "/auth/profile/photo" && method === "PUT") {
      expect(request.headers()["x-csrf-token"]).toBe("test-csrf");
      expect(request.headers()["content-type"]).toContain("multipart/form-data");
      user = { ...user!, profile_photo: "photo.jpg" } as typeof member; body = user;
    }
    else if (path === "/auth/profile") { user = { ...user!, ...request.postDataJSON() }; body = user; }
    else status = 404;
    await route.fulfill({ status, ...(status === 204 ? {} : { contentType: "application/json", body: JSON.stringify(body) }) });
  });
}

test("login, pending permissions, profile and logout", async ({ page }) => {
  await mock(page);
  await page.goto("/admin");
  await page.getByLabel("E-mail", { exact: true }).fill(member.email);
  await page.getByLabel("Senha", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page.getByText("Seu acesso está em análise")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clientes", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Solicitações" })).toHaveCount(0);
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await page.getByLabel("Nome completo").fill("Ana Souza");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText("Perfil atualizado.")).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("Google onboarding submits browser CSRF and enters pending state", async ({ page }) => {
  await mock(page);
  await page.goto("/admin/complete-profile");
  await page.getByLabel("Nome completo").fill("Ana Google");
  await page.getByLabel("Celular").fill("11999999999");
  await page.getByRole("button", { name: "Solicitar acesso" }).click();
  await page.getByRole("button", { name: "Pular por enquanto" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Seu acesso está em análise")).toBeVisible();
});

test("approved member creates, edits and confirms deletion", async ({ page }) => {
  await mock(page, { user: { ...member, status: "approved" } });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome / empresa").fill("Loja Nexo");
  await dialog.getByLabel("Nicho", { exact: true }).fill("Varejo");
  await dialog.getByRole("button", { name: "Salvar cliente" }).click();
  await expect(page.getByText("Cliente salvo.")).toBeVisible();
  await page.screenshot({ path: "../../test-results/clients-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Editar Loja Nexo" }).click();
  await dialog.getByLabel("Situação do contrato").click();
  await page.getByRole("option", { name: "Fechado", exact: true }).click();
  await dialog.getByRole("button", { name: "Salvar cliente" }).click();
  await expect(page.locator("[data-slot=badge]").filter({ hasText: "Fechado" })).toBeVisible();
  await page.getByRole("button", { name: "Excluir Loja Nexo" }).click();
  await expect(page.getByText("Excluir cliente?")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page.getByText("Cliente removido.")).toBeVisible();
});

test("Owner sees notification and approves request", async ({ page }) => {
  await mock(page, { user: { ...member, id: "owner", role: "owner", status: "approved" }, requests: true });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Geral" }).click();
  await expect(page.getByText("Há solicitações de acesso aguardando sua decisão.")).toBeVisible();
  await page.getByRole("button", { name: "Ver solicitações" }).click();
  await page.getByRole("button", { name: "Autorizar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar decisão" }).click();
  await expect(page.getByText("Acesso autorizado.")).toBeVisible();
});

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("owner chooses among three areas and the menu follows each one", async ({ page }) => {
  await mock(page, { user: { ...member, id: "owner", role: "owner", status: "approved" } });
  await page.goto("/admin");
  for (const area of ["Geral", "Comercial", "Desenvolvimento"]) await expect(page.getByRole("button", { name: "Entrar na área " + area })).toBeVisible();
  await page.getByRole("button", { name: "Entrar na área Geral" }).click();
  for (const item of ["Início", "Documentos", "Chat", "Solicitações", "Avisos", "Membros", "Gerenciar membros", "Meu perfil"]) await expect(button(page, item).first()).toBeVisible();
  await expect(button(page, "Funil comercial")).toHaveCount(0);
  await expect(button(page, "Bancos de dados")).toHaveCount(0);
  await page.getByRole("button", { name: "Trocar de área" }).click();
  await page.getByRole("button", { name: "Entrar na área Comercial" }).click();
  for (const item of ["Início", "Dashboard do negócio", "Funil comercial", "Clientes", "Maps", "Chaves", "Avisos"]) await expect(button(page, item).first()).toBeVisible();
  for (const gone of ["Chat", "Documentos", "Automações", "Solicitações", "Gerenciar membros", "Membros", "Meu perfil"]) await expect(button(page, gone)).toHaveCount(0);
  await page.getByRole("button", { name: "Trocar de área" }).click();
  await page.getByRole("button", { name: "Entrar na área Desenvolvimento" }).click();
  for (const item of ["Início", "Automações", "API", "Bancos de dados"]) await expect(button(page, item).first()).toBeVisible();
  for (const gone of ["Chat", "Meu perfil", "Funil comercial", "Chaves"]) await expect(button(page, gone)).toHaveCount(0);
});

test("each role is offered only the areas it may enter", async ({ page }) => {
  await mock(page, { user: { ...member, role: "commercial", status: "approved" } });
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "Entrar na área Geral" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar na área Comercial" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar na área Desenvolvimento" })).toHaveCount(0);
  // The area the role cannot enter is still listed, locked.
  await expect(page.getByLabel("Área Desenvolvimento: sem acesso para o seu cargo")).toBeVisible();
  await expect(page.getByText("Sem acesso")).toBeVisible();
  const dev = await page.context().newPage();
  await mock(dev, { user: { ...member, role: "dev", status: "approved" } });
  await dev.goto("/admin");
  await expect(dev.getByRole("button", { name: "Entrar na área Geral" })).toBeVisible();
  await expect(dev.getByRole("button", { name: "Entrar na área Desenvolvimento" })).toBeVisible();
  await expect(dev.getByRole("button", { name: "Entrar na área Comercial" })).toHaveCount(0);
  await expect(dev.getByLabel("Área Comercial: sem acesso para o seu cargo")).toBeVisible();
});

test("announcements require choosing who receives them", async ({ page }) => {
  await mock(page, { user: { ...member, id: "owner", role: "owner", status: "approved" } });
  await page.route("**/api/notifications?*", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/admin/announcements", route => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "a1", title: "t", body: "b", audience: "commercial", recipients: 3, email_queued: 3, created_at: "2026-10-23T10:00:00" }) });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Geral" }).click();
  await page.getByRole("button", { name: "Avisos", exact: true }).click();
  await page.getByRole("button", { name: "Criar aviso" }).click();
  await page.getByLabel("Título").fill("Reunião do comercial");
  await page.getByLabel("Mensagem").fill("Sexta às 10h.");
  await page.getByRole("button", { name: "Publicar aviso" }).click();
  await expect(page.getByText("Escolha quem vai receber o aviso.")).toBeVisible();
  expect(sent).toHaveLength(0);
  await page.getByRole("radio", { name: "Público: Comercial" }).click();
  await expect(page.getByText("Só o time Comercial recebe")).toBeVisible();
  await page.getByRole("button", { name: "Publicar aviso" }).click();
  await expect(page.getByText("Aviso publicado e enviado para comercial.")).toBeVisible();
  expect(sent).toEqual([{ title: "Reunião do comercial", body: "Sexta às 10h.", audience: "commercial" }]);
});

test("general home explains Nexo without data from the other areas", async ({ page }) => {
  await mock(page, { user: { ...member, role: "commercial", status: "approved" } });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Geral" }).click();
  await expect(page.getByRole("heading", { name: "Início", exact: true })).toBeVisible();
  await expect(page.getByText("agência de inteligência artificial")).toBeVisible();
  await expect(page.getByText("Valor potencial")).toHaveCount(0);
  await expect(page.getByText("Chaves de API ativas")).toHaveCount(0);
});

test("commercial keys page creates a key, uses it in Maps and revokes it, without code samples", async ({ page }) => {
  await mock(page, { user: { ...member, role: "commercial", status: "approved" } });
  let keys: Record<string, unknown>[] = [];
  await page.route("**/api/auth/api-keys", async route => {
    if (route.request().method() === "POST") {
      const key = { id: "k1", name: route.request().postDataJSON().name, key_prefix: "nexo_live_abcd1234", created_at: "2026-10-23T10:00:00", last_used_at: null, key: "nexo_live_abcd1234secret" };
      keys = [key];
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(key) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(keys) });
  });
  await page.route("**/api/auth/api-keys/usage?*", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/auth/api-keys/k1", route => { keys = []; return route.fulfill({ status: 204 }); });
  let mapsKey = "";
  await page.route("**/api/maps/status", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: !!mapsKey, source: mapsKey ? "panel" : null, key_prefix: mapsKey.slice(0, 14) || null, updated_at: null, own: !!mapsKey }) }));
  await page.route("**/api/maps/key", route => { mapsKey = route.request().postDataJSON?.()?.api_key ?? JSON.parse(route.request().postData() || "{}").api_key; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, source: "panel", key_prefix: mapsKey.slice(0, 14), updated_at: null, own: true }) }); });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Comercial" }).click();
  await button(page, "Chaves").click();
  await expect(page.getByRole("heading", { name: "Chaves", exact: true })).toBeVisible();
  await expect(page.getByText("Authorization")).toHaveCount(0);
  await expect(page.getByText("curl")).toHaveCount(0);
  await page.getByRole("button", { name: "Criar chave" }).click();
  await expect(page.getByTestId("new-key")).toHaveText("nexo_live_abcd1234secret");
  await page.getByRole("button", { name: "Usar no Maps" }).click();
  await expect(page.getByText("Pronto! Essa chave agora é a que o Maps usa para você.")).toBeVisible();
  expect(mapsKey).toBe("nexo_live_abcd1234secret");
  await page.getByRole("button", { name: "Revogar Minha chave do Maps" }).click();
  await page.getByRole("button", { name: "Revogar", exact: true }).click();
  await expect(page.getByText("Chave revogada.")).toBeVisible();
});

test("dev home shows keys, API usage, databases and automations, each tolerating failures", async ({ page }) => {
  await mock(page, { user: { ...member, role: "dev", status: "approved" } });
  await page.route("**/api/auth/api-keys", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { id: "k1", name: "n8n produção", key_prefix: "nexo_live_ab12", created_at: "2026-10-01T10:00:00", last_used_at: null }]) }));
  await page.route("**/api/auth/api-keys/usage?*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { date: new Date().toISOString().slice(0, 10), count: 7, api_key_id: "k1", api_key_name: "n8n" }]) }));
  await page.route("**/api/admin/databases", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { id: "sqlite", name: "SQLite", status: "online", details: {} }, { id: "qdrant", name: "Qdrant", status: "unreachable", details: {} }]) }));
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Desenvolvimento" }).click();
  await expect(page.getByRole("heading", { name: "Início", exact: true })).toBeVisible();
  await expect(page.getByText("n8n produção")).toBeVisible();
  await expect(page.getByText("Sem conexão")).toBeVisible();
  await expect(page.getByText("Não foi possível carregar agora.").first()).toBeVisible();
  await page.getByRole("button", { name: "Gerenciar chaves" }).click();
  await expect(page.getByRole("button", { name: "Início", exact: true })).toBeVisible();
});

async function openMaps(page: Page, status: "working" | "ok", leadRequests: Record<string, unknown>[] = []) {
  await mock(page, { user: { ...member, role: "commercial", status: "approved" } });
  const json = (body: unknown, code = 200) => ({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/maps/status", route => route.fulfill(json({ configured: true, source: "panel", key_prefix: "nexo_live_ab12", updated_at: null, own: true })));
  await page.route("**/api/maps/jobs", route => route.fulfill(json([{ id: "11111111-1111-4111-8111-111111111111", name: "Alimentação · São Paulo", status, created_at: "2026-10-23T10:00:00" }])));
  await page.route("**/api/maps/jobs/*/results", route => route.fulfill(json({ total: 2, in_funnel: 0, truncated: false, rows: [
    { title: "Padaria A", category: "Padaria", address: "Rua A, 1", phone: "11 3333-4444", website: null, emails: null, review_rating: 4.5, review_count: 10, link: null, latitude: -23.5, longitude: -46.6 },
    { title: "Padaria B", category: "Padaria", address: "Rua B, 2", phone: null, website: null, emails: null, review_rating: null, review_count: null, link: null, latitude: null, longitude: null }] })));
  // The server saves the leads in the background: one more lead is done every two status polls.
  let total = 0, polls = 0;
  const snapshot = () => {
    const done = Math.min(total, Math.floor(polls / 2));
    return { id: "b1", total, done, created: done, skipped: 0, failed: 0, finished: done === total,
      items: Array.from({ length: total }, (_, index) => index < done ? "created" : index === done ? "processing" : "queued") };
  };
  await page.route("**/api/maps/funnel/batches", route => {
    const body = route.request().postDataJSON();
    leadRequests.push(body); total = body.leads.length; polls = 0;
    return route.fulfill(json({ ...snapshot(), items: Array(total).fill("queued") }, 202));
  });
  await page.route("**/api/maps/funnel/batches/b1", route => { polls += 1; return route.fulfill(json(snapshot())); });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Comercial" }).click();
  await button(page, "Maps").click();
  await page.getByRole("button", { name: /^Alimentação · São Paulo/ }).click();
}

test("maps shows a spinner while a search is running", async ({ page }) => {
  await openMaps(page, "working");
  await expect(page.getByText("Buscando empresas…")).toBeVisible();
  await expect(page.getByRole("status", { name: "Buscando empresas" })).toBeVisible();
});

test("adding a lead swaps its button for a spinner until the background task saves it", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await openMaps(page, "ok", requests);
  await page.getByRole("button", { name: "Adicionar Padaria A ao funil" }).click();
  await expect(page.getByRole("status", { name: "Adicionando Padaria A ao funil" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar Padaria A ao funil" })).toHaveCount(0);
  await expect(page.getByText("Adicionado!")).toBeVisible({ timeout: 10000 });
  expect(requests).toHaveLength(1);
  expect((requests[0].leads as unknown[]).length).toBe(1);
  await expect(page.getByRole("button", { name: "Adicionar Padaria B ao funil" })).toBeEnabled();
});

test("adding all leads queues one task per lead and follows the progress", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await openMaps(page, "ok", requests);
  await page.getByRole("button", { name: /Adicionar todos no funil/ }).click();
  await expect(page.getByRole("progressbar", { name: "Andamento da adição ao funil" })).toBeVisible();
  await expect(page.getByText("Na fila")).toBeVisible();
  await expect(page.getByText("Adicionado!")).toHaveCount(2, { timeout: 15000 });
  await expect(page.getByText("2 lead(s) adicionados ao funil.")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect((requests[0].leads as { title: string }[]).map(lead => lead.title)).toEqual(["Padaria A", "Padaria B"]);
});

test("mobile login and panel fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mock(page);
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../../test-results/login-mobile.png", fullPage: true });
  await page.getByLabel("E-mail", { exact: true }).fill(member.email);
  await page.getByLabel("Senha", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page.getByText("Seu acesso está em análise")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../../test-results/pending-mobile.png", fullPage: true });
});

test("password recovery shows generic message and accepts code", async ({ page }) => {
  await mock(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(member.email);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByText(/Se este e-mail tem uma conta/)).toBeVisible();
  await page.getByLabel("Código recebido por e-mail").fill("12345678");
  await page.getByLabel("Nova senha", { exact: true }).fill("new-password-123");
  await page.getByRole("button", { name: "Atualizar senha", exact: true }).click();
  await expect(page.getByText("Senha atualizada. Entre com sua nova senha.")).toBeVisible();
});

test("expired session returns to login", async ({ page }) => {
  await mock(page, { user: { ...member, status: "approved" } });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("nexo:session-expired")));
  await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeVisible();
});


for (const photoChoice of ["skip", "save"]) test("registration confirms email before optional photo step: " + photoChoice, async ({ page }) => {
  await mock(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Ainda não tem conta? Cadastre-se" }).click();
  await page.getByLabel("Nome completo").fill("Ana Silva");
  await page.getByLabel("Celular").fill("11999999999");
  await page.getByLabel("E-mail", { exact: true }).fill(member.email);
  await page.getByLabel("Nova senha", { exact: true }).fill("new-password-123");
  await page.getByLabel("Confirmar senha", { exact: true }).fill("new-password-123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByText("Confirme seu e-mail", { exact: true })).toBeVisible();
  await page.getByLabel("Código recebido por e-mail").fill("12345678");
  await page.getByRole("button", { name: "Confirmar cadastro" }).click();
  await expect(page.getByText("Adicione sua foto de perfil")).toBeVisible();
  if (photoChoice === "skip") await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../../test-results/signup-photo-" + photoChoice + ".png", fullPage: true });
  await expect(page.getByRole("button", { name: "Salvar foto e continuar" })).toBeDisabled();
  await page.getByLabel("Escolher foto").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGNsYGhgIAUwkaR6VMOohiGlAQBCPQEgiSD+iQAAAABJRU5ErkJggg==", "base64") });
  await expect(page.getByRole("button", { name: "Salvar foto e continuar" })).toBeEnabled();
  await expect(page.getByRole("img", { name: "Prévia da foto selecionada" })).toBeVisible();
  await page.getByRole("button", { name: photoChoice === "skip" ? "Pular por enquanto" : "Salvar foto e continuar" }).click();
  await expect(page.getByText("Seu acesso está em análise")).toBeVisible();
});


test("profile changes password with current password without email code", async ({ page }) => {
  await mock(page, { user: member });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await page.getByLabel("Senha atual", { exact: true }).fill("initial-password-123");
  await page.getByLabel("Nova senha", { exact: true }).fill("changed-password-123");
  await page.getByLabel("Confirmar nova senha").fill("changed-password-123");
  await expect(page.getByLabel("Código recebido por e-mail")).toHaveCount(0);
  await page.getByRole("button", { name: "Atualizar senha", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeVisible();
});


test("failed SMTP delivery keeps signup form and does not claim code was sent", async ({ page }) => {
  await mock(page);
  await page.route("**/api/auth/register", route => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Registration email unavailable" }),
  }));
  await page.goto("/admin");
  await page.getByRole("button", { name: "Ainda não tem conta? Cadastre-se" }).click();
  await page.getByLabel("Nome completo").fill("Ana Silva");
  await page.getByLabel("Celular").fill("11999999999");
  await page.getByLabel("E-mail", { exact: true }).fill(member.email);
  await page.getByLabel("Nova senha", { exact: true }).fill("new-password-123");
  await page.getByLabel("Confirmar senha", { exact: true }).fill("new-password-123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByText(/Não foi possível enviar o código por e-mail/)).toBeVisible();
  await expect(page.getByLabel("Código recebido por e-mail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar conta", exact: true })).toBeEnabled();
});


test("admin edits approved member role and data, protects principal and confirms deletion", async ({ page }) => {
  await mock(page, { user: { ...member, id: "owner", role: "owner", status: "approved" } });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar na área Geral" }).click();
  await page.getByRole("button", { name: "Gerenciar membros", exact: true }).click();
  await expect(page.getByRole("button", { name: "Excluir membro Principal" })).toBeDisabled();
  await page.getByRole("button", { name: "Editar membro Principal" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Cargo", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("E-mail", { exact: true })).toHaveAttribute("readonly", "");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Editar membro Ana Silva" }).click();
  await dialog.getByLabel("Nome completo").fill("Ana Administradora");
  await dialog.getByLabel("E-mail", { exact: true }).fill("updated@example.com");
  await dialog.getByLabel("Cargo", { exact: true }).click();
  await page.getByRole("option", { name: "Administrador" }).click();
  await dialog.getByRole("button", { name: "Salvar membro" }).click();
  await expect(page.getByText("Membro atualizado.")).toBeVisible();
  await expect(page.getByText("updated@example.com")).toBeVisible();
  await expect(page.getByRole("main").getByText("Administrador", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../../test-results/members-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Excluir membro Ana Administradora" }).click();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("updated@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Excluir membro Ana Administradora" }).click();
  await dialog.getByRole("button", { name: "Confirmar exclusão do membro" }).click();
  await expect(page.getByText("Membro excluído. Os clientes e documentos foram preservados.")).toBeVisible();
  await expect(page.getByText("updated@example.com")).toHaveCount(0);
});

test("approved regular member cannot see member management", async ({ page }) => {
  await mock(page, { user: { ...member, status: "approved" } });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerenciar membros", exact: true })).toHaveCount(0);
});


test("mobile sheet navigates to shared directory without revealing contact details", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mock(page, { user: { ...member, status: "approved" } });
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "Membros", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir menu do painel" }).click();
  const menu = page.getByRole("dialog", { name: "Menu do painel" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("heading", { name: "Menu do painel" })).toHaveCSS("font-size", "16px");
  await expect(menu.getByRole("button", { name: "Gerenciar membros" })).toHaveCount(0);
  await page.screenshot({ path: "../../test-results/admin-mobile-sidebar.png", fullPage: true, animations: "disabled" });
  await menu.getByRole("button", { name: "Membros", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByText("Ana Silva", { exact: true })).toBeVisible();
  await expect(page.getByText("Principal", { exact: true })).toBeVisible();
  await expect(page.getByText(member.email, { exact: true })).toHaveCount(0);
  await expect(page.getByText("owner@example.com", { exact: true })).toHaveCount(0);
  await expect(page.getByText(member.phone, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../../test-results/directory-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Abrir menu do painel" }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Abrir menu do painel" })).toBeFocused();
});

test("profile pencil saves chosen photo automatically and rejects invalid uploads", async ({ page }) => {
  await mock(page, { user: member });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await expect(page.getByRole("button", { name: "Alterar foto de perfil" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar foto" })).toHaveCount(0);
  let uploads = 0;
  page.on("request", request => { if (request.url().endsWith("/auth/profile/photo") && request.method() === "PUT") uploads++; });
  await page.getByLabel("Escolher foto").setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await expect(page.getByText("Escolha JPEG, PNG ou WebP de até 2 MB.")).toBeVisible();
  expect(uploads).toBe(0);
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Alterar foto de perfil" }).click();
  await (await picker).setFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGNsYGhgIAUwkaR6VMOohiGlAQBCPQEgiSD+iQAAAABJRU5ErkJggg==", "base64") });
  await expect(page.getByText("Foto atualizada.")).toBeVisible();
  expect(uploads).toBe(1);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.screenshot({ path: "../../test-results/profile-pencil-mobile.png", fullPage: true });
});


test("signup requires matching passwords and enters panel without another login", async ({ page }) => {
  await mock(page);
  let registrations = 0, logins = 0;
  page.on("request", req => { if (req.url().endsWith("/auth/register")) registrations++; if (req.url().endsWith("/auth/login")) logins++; });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Ainda não tem conta? Cadastre-se" }).click();
  await page.getByLabel("Nome completo").fill("Ana Silva");
  await page.getByLabel("Celular").fill("11999999999");
  await page.getByLabel("E-mail", { exact: true }).fill(member.email);
  await page.getByLabel("Nova senha", { exact: true }).fill("new-password-123");
  await page.getByLabel("Confirmar senha", { exact: true }).fill("different-password-123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByText("As senhas não coincidem.")).toBeVisible();
  expect(registrations).toBe(0);
  await page.getByLabel("Confirmar senha", { exact: true }).fill("new-password-123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Código recebido por e-mail").fill("12345678");
  await page.getByRole("button", { name: "Confirmar cadastro" }).click();
  await page.getByRole("button", { name: "Pular por enquanto" }).click();
  await expect(page.getByText("Seu acesso está em análise")).toBeVisible();
  expect(registrations).toBe(1); expect(logins).toBe(0);
});

test("own account deletion requires explicit confirmation and valid email code", async ({ page }) => {
  await mock(page, { user: member });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await page.getByRole("button", { name: "Apagar minha conta" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Código de exclusão recebido por e-mail")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Enviar código de exclusão" }).click();
  await dialog.getByLabel("Código de exclusão recebido por e-mail").fill("00000000");
  await dialog.getByRole("button", { name: "Confirmar exclusão da minha conta" }).click();
  await expect(dialog.getByText("Código de exclusão inválido ou expirado.")).toBeVisible();
  await dialog.getByLabel("Código de exclusão recebido por e-mail").fill("12345678");
  await dialog.getByRole("button", { name: "Confirmar exclusão da minha conta" }).click();
  await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeVisible();
});

test("deletion SMTP failure keeps account and does not advance to code entry", async ({ page }) => {
  await mock(page, { user: member });
  await page.route("**/api/auth/account/deletion/request", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.goto("/admin");
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await page.getByRole("button", { name: "Apagar minha conta" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Enviar código de exclusão" }).click();
  await expect(dialog.getByText("Não foi possível enviar o código de exclusão. Tente novamente mais tarde.")).toBeVisible();
  await expect(dialog.getByLabel("Código de exclusão recebido por e-mail")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("heading", { name: "Perfil e segurança" })).toBeVisible();
});


test("chat shows a clear error when microphone access is denied", async ({ page }) => {
  await mock(page, { user: { ...member, status: "approved" } });
  await page.addInitScript(() => { Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => { throw new DOMException("Denied", "NotAllowedError"); } }); });
  await page.route("**/api/chat/*/messages?*", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/admin");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByRole("button", { name: "Conversar com Principal", exact: true }).click();
  await page.getByRole("button", { name: "Gravar áudio", exact: true }).click();
  await expect(page.getByText("Não foi possível acessar o microfone. Autorize no navegador ou envie um arquivo de áudio.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gravar áudio", exact: true })).toBeEnabled();
});

test("chat lists members and switches private conversations on desktop and mobile", async ({ page }) => {
  await mock(page, { user: { ...member, status: "approved" } });
  await page.route("**/api/members?*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { id: member.id, name: member.name, role: "member", has_photo: false },
    { id: "owner", name: "Principal", role: "admin", has_photo: false },
    { id: "other", name: "Joana", role: "member", has_photo: false },
  ]) }));
  await page.route("**/api/chat/*/messages?*", route => {
    const sender = new URL(route.request().url()).pathname.split("/")[3];
    const name = sender === "owner" ? "Principal" : "Joana";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: sender + "-message", sequence: 1, sender_id: sender, recipient_id: member.id, sender_name: name, kind: "text", text: "Mensagem de " + name, created_at: "2026-10-06T12:00:00Z" },
    ]) });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  const directory = page.getByRole("navigation", { name: "Membros para conversar" });
  await expect(directory.getByRole("button", { name: "Conversar com Principal", exact: true })).toBeVisible();
  await expect(directory.getByRole("button", { name: "Conversar com Joana", exact: true })).toBeVisible();
  await expect(directory.getByRole("button", { name: "Conversar com Ana Silva", exact: true })).toHaveCount(0);
  await directory.getByRole("button", { name: "Conversar com Principal", exact: true }).click();
  await expect(page.getByText("Mensagem de Principal", { exact: true })).toBeVisible();
  await expect(directory.getByRole("button", { name: "Conversar com Principal", exact: true })).toHaveAttribute("aria-current", "true");
  await directory.getByRole("button", { name: "Conversar com Joana", exact: true }).click();
  await expect(page.getByText("Mensagem de Joana", { exact: true })).toBeVisible();
  await expect(page.getByText("Mensagem de Principal", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(directory).toBeHidden();
  await page.getByRole("button", { name: "Voltar aos membros", exact: true }).click();
  await expect(directory).toBeVisible();
  await directory.getByRole("button", { name: "Conversar com Principal", exact: true }).click();
  await expect(page.getByText("Mensagem de Principal", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
