import { test, expect, type Page } from "../../../src/frontend/test-kit";

const member = { id: "member", name: "Ana Silva", email: "ana@example.com", phone: "+5511999999999", status: "pending", role: "member", profile_photo: null };
async function mock(page: Page, options: { user?: typeof member; requests?: boolean } = {}) {
  let user = options.user;
  const rows: Record<string, unknown>[] = [];
  const members = [{ ...member, status: "approved", is_principal: false }, { ...member, id: "owner", name: "Principal", email: "owner@example.com", role: "admin", status: "approved", is_principal: true }];
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
  await dialog.getByLabel("Situação do contrato").selectOption("true");
  await dialog.getByRole("button", { name: "Salvar cliente" }).click();
  await expect(page.locator("[data-slot=badge]").filter({ hasText: "Fechado" })).toBeVisible();
  await page.getByRole("button", { name: "Excluir Loja Nexo" }).click();
  await expect(page.getByText("Excluir cliente?")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page.getByText("Cliente removido.")).toBeVisible();
});

test("principal admin sees notification and approves request", async ({ page }) => {
  await mock(page, { user: { ...member, id: "owner", role: "admin", status: "approved" }, requests: true });
  await page.goto("/admin");
  await expect(page.getByText("Há solicitações de acesso aguardando sua decisão.")).toBeVisible();
  await page.getByRole("button", { name: "Ver solicitações" }).click();
  await page.getByRole("button", { name: "Autorizar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar decisão" }).click();
  await expect(page.getByText("Acesso autorizado.")).toBeVisible();
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
  await page.route("**/api/clients?**", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await page.getByRole("button", { name: "Atualizar clientes" }).click();
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
  await mock(page, { user: { ...member, id: "owner", role: "admin", status: "approved" } });
  await page.goto("/admin");
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
  await dialog.getByLabel("Cargo", { exact: true }).selectOption("admin");
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
  await page.getByLabel("Membro", { exact: true }).selectOption({ label: "Principal" });
  await page.getByRole("button", { name: "Gravar áudio", exact: true }).click();
  await expect(page.getByText("Não foi possível acessar o microfone. Autorize no navegador ou envie um arquivo de áudio.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gravar áudio", exact: true })).toBeEnabled();
});
