import { test, expect } from "../../../src/frontend/test-kit";
import { apiBase, ApiError, createApi } from "../../../src/frontend/admin/api";

test("validates public backend URLs", () => {
  expect(apiBase("")).toBe("/api");
  expect(apiBase("/api/")).toBe("/api");
  expect(apiBase("https://api.example.com/")).toBe("https://api.example.com");
  for (const url of ["javascript:alert(1)", "https://user:pass@example.com", "https://example.com?x=1"]) {
    expect(() => apiBase(url)).toThrow();
  }
});

test("credentials stay in cookies and CSRF precedes mutations", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init! });
    return String(input).endsWith("/auth/csrf")
      ? Response.json({ csrf_token: "test-csrf" }) : new Response(null, { status: 204 });
  };
  const api = createApi("/api", fake);
  await api.mutate("/clients/id", "DELETE");
  expect(calls.map(call => call.url)).toEqual(["/api/auth/csrf", "/api/clients/id"]);
  expect(calls.every(call => call.init.credentials === "include")).toBe(true);
  expect(new Headers(calls[1].init.headers).get("X-CSRF-Token")).toBe("test-csrf");
  expect(new Headers(calls[1].init.headers).has("Authorization")).toBe(false);
});

test("reuses GET and CSRF work briefly, then invalidates reads after a mutation", async () => {
  const calls: string[] = [];
  const fake: typeof fetch = async input => {
    const url = String(input); calls.push(url);
    if (url.endsWith("/auth/csrf")) return Response.json({ csrf_token: "csrf" });
    if (url.endsWith("/clients")) return Response.json([]);
    return new Response(null, { status: 204 });
  };
  const api = createApi("/api", fake);
  await Promise.all([api.request("/clients"), api.request("/clients")]);
  expect(calls.filter(url => url.endsWith("/clients"))).toHaveLength(1);
  await api.mutate("/clients/id", "DELETE");
  await api.mutate("/documents/id", "DELETE");
  expect(calls.filter(url => url.endsWith("/auth/csrf"))).toHaveLength(1);
  await api.request("/clients");
  expect(calls.filter(url => url.endsWith("/clients"))).toHaveLength(2);
});

test("OAuth completion uses its own CSRF and uploads preserve multipart", async () => {
  const calls: RequestInit[] = [];
  const fake: typeof fetch = async (_, init) => { calls.push(init!); return Response.json({}); };
  const api = createApi("/api", fake);
  const form = new FormData(); form.set("file", new Blob(["photo"]), "test.png");
  await api.mutate("/auth/google/complete", "POST", { name: "Ana" }, "google-csrf");
  await api.mutate("/auth/profile/photo", "PUT", form, "session-csrf");
  expect(calls).toHaveLength(2);
  expect(new Headers(calls[0].headers).get("X-CSRF-Token")).toBe("google-csrf");
  expect(new Headers(calls[1].headers).has("Content-Type")).toBe(false);
  expect(calls[1].body).toBe(form);
});

test("sanitizes server failures and translates retry delays", async () => {
  const fake: typeof fetch = async () => Response.json({ detail: "secret-sentinel" },
    { status: 429, headers: { "Retry-After": "42" } });
  await expect(createApi("/api", fake).request("/clients")).rejects.toThrow("42 segundos");
  const failed: typeof fetch = async () => { throw new Error("secret-sentinel"); };
  try { await createApi("/api", failed).request("/auth/me"); }
  catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(String(error)).not.toContain("secret-sentinel");
  }
});


test("profile image fetch includes cookies and returns a private blob", async () => {
  let credentials: RequestCredentials | undefined;
  const api = createApi("/api", async (_url, init) => {
    credentials = init?.credentials;
    return new Response("image-bytes", { headers: { "Content-Type": "image/jpeg" } });
  });
  const blob = await api.photo();
  expect(credentials).toBe("include");
  expect(blob.type).toBe("image/jpeg");
  expect(await blob.text()).toBe("image-bytes");
});
