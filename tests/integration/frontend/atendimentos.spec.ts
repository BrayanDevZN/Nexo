import { test, expect, type Page } from "../../../src/frontend/test-kit";

const user = { id: "u1", name: "Ana Silva", email: "ana@example.com", phone: "+5511999999999", has_photo: false, access_status: "approved", access_expires_at: null };
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
    else if (path === "/realtime/ticket" && method === "POST") { csrf(); body = { ticket: "t".repeat(43), expires_in: 30 }; }
    else if (path === "/push/public-key") status = 503;
    else if (path === "/businesses/b1/invitations" && method === "GET") body = [];
    else if (path === "/businesses/b1/invitations" && method === "POST") {
      csrf();
      const data = request.postDataJSON();
      body = { id: "i1", business_id: "b1", email: data.email, role: data.role, created_by_id: user.id, expires_at: "2026-11-23T00:00:00Z", created_at: "2026-11-16T00:00:00Z", url: "http://localhost/atendimentos?invite=tok123", email_sent: !!data.email };
      status = 201;
    }
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
      expect(data.service_ids).toEqual(["s1"]); expect(data.starts_at).toMatch(/Z$/);
      const row = { ...data, id: "a1", business_id: "b1", service_name: "Corte", staff_name: null, ends_at: new Date(new Date(data.starts_at).getTime() + 30 * 60000).toISOString(), status: "scheduled", price: 45, created_by_id: user.id, created_at: "2026-11-16", updated_at: "2026-11-16" };
      appointments.push(row); body = row; status = 201;
    }
    else if (path === "/businesses/b1/appointments/a1" && method === "DELETE") { csrf(); appointments.splice(0, appointments.length); status = 204; }
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
  await expect(page.getByText("30 min", { exact: true })).toBeVisible();
  await expect(page.getByText("R$ 45,00", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Agenda" }).click();
  await page.getByRole("button", { name: "Marcar atendimento" }).click();
  await page.getByLabel("Nome do cliente").fill("João");
  // The start is already now, the duration and the price follow the chosen services.
  await expect(page.getByLabel("Início")).not.toHaveValue("");
  await page.getByRole("button", { name: /Corte/ }).click();
  await expect(page.getByLabel("Duração (minutos)")).toHaveValue("30");
  await expect(page.getByLabel("Preço (R$)")).toHaveValue("45,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  const item = page.getByRole("button", { name: /João/ });
  await expect(item).toHaveAttribute("aria-label", /Marcado/);
  await item.click();
  await page.getByRole("button", { name: "Concluído", exact: true }).click();
  await expect(page.getByRole("button", { name: /João/ })).toHaveAttribute("aria-label", /Concluído/);
  // Deleting it closes the form and takes it off the calendar at once.
  await page.getByRole("button", { name: /João/ }).click();
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Apagar", exact: true }).click();
  await expect(page.getByRole("button", { name: /João/ })).toHaveCount(0);
  await expect(page.getByLabel("Nome do cliente")).toHaveCount(0);
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

test("inviting is a choice: by e-mail (address required) or by link (no address), and the invitation survives a trip through Google", async ({ page }) => {
  await mock(page, { signedIn: true });
  await page.goto("/atendimentos");
  await page.getByRole("button", { name: "Criar negócio" }).first().click();
  await page.getByLabel("Nome do negócio").fill("Barbearia do Zé");
  await page.getByRole("button", { name: "Criar negócio" }).last().click();
  await page.getByRole("button", { name: "Equipe" }).click();
  await expect(page.getByRole("radio", { name: "Por e-mail" })).toBeChecked();
  await expect(page.getByLabel("E-mail da pessoa")).toBeVisible();
  await page.getByRole("radio", { name: "Por link" }).click();
  await expect(page.getByLabel("E-mail da pessoa")).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar link" }).click();
  await expect(page.getByText("http://localhost/atendimentos?invite=tok123")).toBeVisible();
  await page.getByRole("radio", { name: "Por e-mail" }).click();
  await page.getByLabel("E-mail da pessoa").fill("bia@example.com");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("Convite enviado para bia@example.com")).toBeVisible();
});

test("the invitation survives a trip through Google: the token is kept and used when the person comes back without it in the URL", async ({ page }) => {
  await mock(page);
  await page.route("**/api/atendimentos/invitations/tok", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ business_name: "Barbearia do Zé", role: "staff", email: null, expires_at: "2026-11-23T00:00:00Z" }) }));
  await page.goto("/atendimentos?invite=tok");
  await expect(page.getByText("Você foi convidado para Barbearia do Zé como atendente.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nexo:atendimentos:invite"))).toBe("tok");
  await page.goto("/atendimentos");
  await expect(page.getByText("Você foi convidado para Barbearia do Zé como atendente.")).toBeVisible();
});

test("an appointment needs only the customer's name; several services add up their time and price, and both can be overwritten", async ({ page }) => {
  await mock(page, { signedIn: true });
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/atendimentos/businesses/b1/services*", route => route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "s1", business_id: "b1", name: "Corte", description: null, duration_minutes: 40, price: 55, active: true, created_at: "x", updated_at: "x" },
      { id: "s2", business_id: "b1", name: "Barba", description: null, duration_minutes: 30, price: 40, active: true, created_at: "x", updated_at: "x" }]) })
    : route.fallback());
  await page.route("**/api/atendimentos/businesses/b1/appointments", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "a9", business_id: "b1", service_id: null, service_ids: [], service_name: "Atendimento", staff_user_id: null, staff_name: null, customer_name: "Zé", customer_phone: null, customer_email: null, starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 1800000).toISOString(), status: "scheduled", price: null, notes: null, created_by_id: user.id, created_at: "x", updated_at: "x" }) });
  });
  await page.goto("/atendimentos");
  await page.getByRole("button", { name: "Criar negócio" }).first().click();
  await page.getByLabel("Nome do negócio").fill("Barbearia do Zé");
  await page.getByRole("button", { name: "Criar negócio" }).last().click();
  await page.getByRole("button", { name: "Marcar atendimento" }).click();
  // Only the name: it is accepted as it is.
  await page.getByLabel("Nome do cliente").fill("Zé");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].service_ids).toEqual([]);
  expect(sent[0].ends_at).toBeUndefined();
  expect(sent[0].price).toBeUndefined();

  // Two services: 70 minutes and R$ 95,00, then overwritten by hand and back to automatic.
  await page.getByRole("button", { name: "Marcar atendimento" }).click();
  await page.getByLabel("Nome do cliente").fill("Ana");
  await page.getByRole("button", { name: /Corte/ }).click();
  await page.getByRole("button", { name: /Barba/ }).click();
  await expect(page.getByLabel("Duração (minutos)")).toHaveValue("70");
  await expect(page.getByLabel("Preço (R$)")).toHaveValue("95,00");
  await expect(page.getByText("70 min", { exact: true })).toBeVisible();
  await page.getByLabel("Duração (minutos)").fill("90");
  await page.getByLabel("Preço (R$)").fill("80,00");
  await page.getByRole("button", { name: /Voltar ao automático \(70 min\)/ }).click();
  await expect(page.getByLabel("Duração (minutos)")).toHaveValue("70");
  await page.getByLabel("Preço (R$)").fill("80,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].service_ids).toEqual(["s1", "s2"]);
  expect(sent[1].price).toBe("80.00");
  expect(sent[1].ends_at).toBeUndefined();
});

test("appointments show up in real time for everyone, with a notice titled with the business, and notifications can be turned on", async ({ page }) => {
  // A headless browser cannot be granted the permission; this stands in for the prompt: default until asked, then granted.
  await page.addInitScript(() => {
    let permission = "default";
    class FakeNotification { static get permission() { return permission; } static async requestPermission() { permission = "granted"; return permission; } }
    Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
  });
  await mock(page, { signedIn: true });
  const sockets: { send: (message: string) => void }[] = [];
  await page.routeWebSocket("**/api/atendimentos/realtime", socket => { sockets.push(socket); socket.send(JSON.stringify({ type: "ready", business_id: "b1" })); });
  let loads = 0;
  page.on("request", request => { if (request.method() === "GET" && /\/businesses\/b1\/appointments\?/.test(request.url())) loads += 1; });
  await page.goto("/atendimentos");
  await page.getByRole("button", { name: "Criar negócio" }).first().click();
  await page.getByLabel("Nome do negócio").fill("Barbearia do Zé");
  await page.getByRole("button", { name: "Criar negócio" }).last().click();
  await expect(page.getByText("Ao vivo")).toBeVisible();
  // The account socket opens first (signed in, no business yet); opening the business swaps it for the business socket.
  await expect.poll(() => sockets.length).toBeGreaterThanOrEqual(2);
  const live = () => sockets[sockets.length - 1];
  const before = loads;

  // Someone else books: the notice names the business and the person, and the agenda reloads by itself.
  live().send(JSON.stringify({ type: "appointment.changed", action: "created", business_id: "b1", appointment_id: "a77", customer_name: "Zé", service_name: "Corte", starts_at: "2026-12-01T13:00:00Z", status: "scheduled", by_id: "u9", by_name: "Camila", business_name: "Barbearia do Zé" }));
  const notice = page.getByRole("status").filter({ hasText: "Camila marcou Zé" });
  await expect(notice).toBeVisible();
  await expect(notice.getByText("Barbearia do Zé")).toBeVisible();
  await expect.poll(() => loads).toBeGreaterThan(before);
  // Your own change is not announced to you.
  live().send(JSON.stringify({ type: "appointment.changed", action: "created", business_id: "b1", appointment_id: "a78", customer_name: "Eu mesma", service_name: "Corte", starts_at: "2026-12-01T14:00:00Z", status: "scheduled", by_id: "u1", by_name: "Ana Silva", business_name: "Barbearia do Zé" }));
  await page.waitForTimeout(300);
  await expect(page.getByText("Eu mesma marcou")).toHaveCount(0);

  // Notifications: off until asked, then on.
  const bell = page.getByRole("button", { name: /Ativar notificações/ });
  await expect(bell).toHaveAttribute("aria-pressed", "false");
  await bell.click();
  await expect(page.getByRole("button", { name: /Desativar notificações/ })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("nexo:atendimentos:notify"))).toBe("on");
});

test("someone without permission sees the waiting screen, and it opens by itself when the team approves, live", async ({ page }) => {
  await mock(page, { signedIn: true });
  let status = "pending";
  await page.route("**/api/atendimentos/auth/me", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...user, access_status: status, access_expires_at: status === "approved" ? "2027-01-01T00:00:00Z" : null }) }));
  const sockets: { send: (message: string) => void }[] = [];
  await page.routeWebSocket("**/api/atendimentos/realtime", socket => { sockets.push(socket); socket.send(JSON.stringify({ type: "ready", business_id: null })); });
  await page.goto("/atendimentos");
  await expect(page.getByRole("heading", { name: "Aguardando liberação" })).toBeVisible();
  await expect(page.getByText("Atualiza sozinha", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar negócio" })).toHaveCount(0);
  // The team approves: the screen is told, reads the account again and opens the product.
  status = "approved";
  await expect.poll(() => sockets.length).toBeGreaterThan(0);
  sockets[sockets.length - 1].send(JSON.stringify({ type: "access.changed", status: "approved", access_expires_at: "2027-01-01T00:00:00Z" }));
  await expect(page.getByRole("button", { name: "Criar negócio" }).first()).toBeVisible();
  // Taking it away is as quick, and an ended permission says so.
  status = "expired";
  // The socket may be swapped around the approval; keep telling the newest one until the screen has heard it.
  await expect(async () => {
    sockets[sockets.length - 1].send(JSON.stringify({ type: "access.changed", status: "expired", access_expires_at: "2026-11-01T00:00:00Z" }));
    await expect(page.getByRole("heading", { name: "Seu acesso expirou" })).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
});

test("an access link is read before signing up and is sent with the account that is created", async ({ page }) => {
  await mock(page);
  await page.route("**/api/atendimentos/access/tok", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_days: 30 }) }));
  await page.goto("/atendimentos?access=tok");
  await expect(page.getByText("Você recebeu um acesso de 30 dias ao Atendimentos.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nexo:atendimentos:access"))).toBe("tok");
  // It survives the trip through Google, where the address loses its query.
  await page.goto("/atendimentos");
  await expect(page.getByText("Você recebeu um acesso de 30 dias ao Atendimentos.")).toBeVisible();
});
