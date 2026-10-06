import { test, expect } from "../../../src/frontend/test-kit";

test("WebSocket: live approval, private chat, photos, audio and reconnect history", async ({ browser }) => {
  test.setTimeout(60000);
  const adminContext = await browser.newContext({ reducedMotion: "reduce" });
  const memberContext = await browser.newContext({ reducedMotion: "reduce", permissions: ["microphone"] });
  const admin = await adminContext.newPage(); const member = await memberContext.newPage();
  await member.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      const context = new AudioContext(); const source = context.createOscillator(); const destination = context.createMediaStreamDestination();
      source.connect(destination); source.start(); await context.resume();
      const track = destination.stream.getAudioTracks()[0]; const stop = track.stop.bind(track);
      track.stop = () => { stop(); source.stop(); void context.close(); };
      return destination.stream;
    } });
  });
  const origin = "http://127.0.0.1:4173";
  try {
    await admin.goto(origin + "/admin");
    await admin.getByLabel("E-mail", { exact: true }).fill("owner@example.com");
    await admin.getByLabel("Senha", { exact: true }).fill("initial-admin-password");
    await admin.getByRole("button", { name: "Entrar no painel" }).click();
    await expect(admin.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(admin.getByText("Conectado", { exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "Clientes", exact: true }).click();
    const email = "chat-" + Date.now() + "@example.com";
    expect((await memberContext.request.post(origin + "/api/auth/register", { headers: { Origin: origin }, data: { name: "Chat Realtime", email, phone: "11999999999", password: "chat-member-password" } })).status()).toBe(202);
    expect((await memberContext.request.post(origin + "/api/auth/register/confirm", { headers: { Origin: origin }, data: { email, code: "12345678" } })).status()).toBe(201);
    await member.goto(origin + "/admin");
    await expect(member.getByText("Seu acesso está em análise")).toBeVisible();
    await expect(admin.getByRole("button", { name: "Ver solicitações" })).toBeVisible();
    await admin.getByRole("button", { name: "Ver solicitações" }).click();
    await admin.getByRole("button", { name: "Autorizar", exact: true }).click();
    await admin.getByRole("button", { name: "Confirmar decisão" }).click();
    await expect(member.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
    await member.getByRole("button", { name: "Chat", exact: true }).click();
    await member.getByLabel("Membro", { exact: true }).selectOption({ label: "Brayan" });
    await expect(member.getByText("Conectado", { exact: true })).toBeVisible();
    await member.getByLabel("Mensagem", { exact: true }).fill("Mensagem ao vivo");
    await member.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(admin.getByText("Nova mensagem de Chat Realtime")).toBeVisible();
    await admin.getByRole("button", { name: "Abrir conversa" }).click();
    await expect(admin.getByText("Mensagem ao vivo", { exact: true })).toBeVisible();
    await admin.getByLabel("Mensagem", { exact: true }).fill("Resposta ao vivo");
    await admin.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(member.getByText("Resposta ao vivo", { exact: true })).toBeVisible();
    await member.getByLabel("Escolher foto para conversa").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGNsYGhgIAUwkaR6VMOohiGlAQBCPQEgiSD+iQAAAABJRU5ErkJggg==", "base64") });
    await expect(admin.getByRole("img", { name: "Foto enviada por Chat Realtime" })).toBeVisible();
    const wav = Buffer.alloc(1644); wav.write("RIFF"); wav.writeUInt32LE(1636, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(1600, 40);
    await member.getByLabel("Escolher áudio para conversa").setInputFiles({ name: "audio.wav", mimeType: "audio/wav", buffer: wav });
    await expect(admin.locator("audio")).toBeVisible();
    await member.getByRole("button", { name: "Gravar áudio", exact: true }).click();
    await expect(member.getByRole("button", { name: "Parar e enviar" })).toBeVisible();
    await member.waitForTimeout(300); // Capture a short clip from Web Audio's synthetic microphone.
    await member.getByRole("button", { name: "Parar e enviar" }).click();
    await expect(admin.locator("audio")).toHaveCount(2);
    await admin.reload();
    await admin.getByRole("button", { name: "Chat", exact: true }).click();
    await admin.getByLabel("Membro", { exact: true }).selectOption({ label: "Chat Realtime" });
    await expect(admin.getByText("Mensagem ao vivo", { exact: true })).toBeVisible();
    await expect(admin.locator("audio")).toHaveCount(2);
    await member.setViewportSize({ width: 360, height: 780 });
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await member.screenshot({ path: "../../test-results/chat-mobile.png", fullPage: true });
  } finally { await adminContext.close(); await memberContext.close(); }
});
