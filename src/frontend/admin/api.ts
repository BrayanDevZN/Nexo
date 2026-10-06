export type User = {
  id: string; name: string; email: string; phone: string | null;
  profile_photo: string | null; status: "pending" | "approved" | "rejected";
  role: "member" | "admin";
};
export type Member = User & { is_principal: boolean };
export type ClientRecord = {
  id: string; name: string; niche: string; phone: string | null; email: string | null;
  notes: string | null; contract_closed: boolean; contract_value: number | null;
  pipeline_stage: PipelineStage; next_follow_up: string | null;
  created_by_id: string; created_by_name: string;
  created_at: string; updated_at: string;
};
export type PipelineStage = "lead" | "contacted" | "diagnosis" | "proposal" | "negotiation" | "won" | "lost";
export const PIPELINE_STAGES: { value: PipelineStage; label: string }[] = [
  { value: "lead", label: "Lead" }, { value: "contacted", label: "Contato feito" },
  { value: "diagnosis", label: "Diagnóstico" }, { value: "proposal", label: "Proposta" },
  { value: "negotiation", label: "Negociação" }, { value: "won", label: "Fechado" },
  { value: "lost", label: "Perdido" },
];
export type ClientInput = Pick<ClientRecord, "name" | "niche" | "phone" | "email" | "notes" | "contract_closed" | "contract_value" | "pipeline_stage" | "next_follow_up">;
export type Approval = {
  id: string; requested_user_id: string; read_at: string | null; created_at: string;
};
export type GoogleProfile = { name: string; email: string; csrf_token: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function apiBase(value: string): string {
  const base = value.trim().replace(/\/+$/, "");
  if (!base || base === "/api") return "/api";
  const url = new URL(base);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("VITE_API_URL deve ser uma URL HTTP(S) do backend.");
  }
  return base;
}

export function createApi(base: string, fetcher: typeof fetch = fetch) {
  const getCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();
  let csrfToken = "";
  const getCacheTtlMs = 15_000;
  function clearReadCache() { getCache.clear(); }
  function resetSession() { csrfToken = ""; clearReadCache(); }
  async function perform<T>(path: string, init: RequestInit, format: "json" | "blob"): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const headers = new Headers(init.headers);
      if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
      const response = await fetcher(base + path, {
        ...init, headers, credentials: "include", signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = typeof body.detail === "string" ? body.detail : "";
        const messages: Record<number, string> = {
          401: path === "/auth/login" ? "E-mail ou senha inválidos." : "Sua sessão expirou. Entre novamente.",
          403: "Você não tem permissão para esta ação. Atualize a página e tente novamente.",
          404: "Registro não encontrado.",
          409: detail.includes("Principal administrator") ? "A conta do administrador principal é protegida."
            : detail.includes("Only approved") ? "Aprove o acesso antes de alterar o cargo."
            : detail.includes("own") ? "Você não pode excluir ou retirar seu próprio acesso de administrador."
            : detail.includes("Email") || detail.includes("email")
            ? "Este e-mail já está cadastrado. Use a forma de acesso original."
            : "Este registro foi alterado. Atualize a lista.",
          413: path.startsWith("/chat") ? "O arquivo ultrapassa o tamanho permitido para o chat." : path.startsWith("/documents") ? "O documento ultrapassa o tamanho permitido." : "A foto ultrapassa o tamanho ou a resolução permitidos.",
          422: "Confira os campos. Senhas novas exigem 12 caracteres e até 72 bytes; celular, 10 a 15 dígitos.",
          429: "Muitas tentativas. Aguarde " + (response.headers.get("Retry-After") || "alguns") + " segundos.",
          503: path === "/auth/account/deletion/request" ? "Não foi possível enviar o código de exclusão. Tente novamente mais tarde."
            : path === "/auth/register" ? "Não foi possível enviar o código por e-mail. O serviço de envio está indisponível."
            : "Serviço temporariamente indisponível. Tente novamente em instantes.",
        };
        if (response.status === 401 && !["/auth/login", "/auth/google/profile", "/auth/password/recovery/confirm"].includes(path)) {
          if (typeof window !== "undefined") window.dispatchEvent(new Event("nexo:session-expired"));
        }
        throw new ApiError(response.status, messages[response.status] ||
          (path.includes("account/deletion") ? "Código de exclusão inválido ou expirado." : path.includes("register") ? "Código de cadastro inválido ou expirado." : path.includes("password") ? "Senha atual ou código inválido/expirado." : "Não foi possível concluir a ação."));
      }
      if (response.status === 204) return undefined as T;
      return await (format === "blob" ? response.blob() : response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, "Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.");
    } finally { clearTimeout(timeout); }
  }
  function request<T>(path: string, init: RequestInit = {}, format: "json" | "blob" = "json"): Promise<T> {
    const method = (init.method || "GET").toUpperCase();
    const cacheable = method === "GET" && format === "json" && !init.body && path !== "/auth/csrf";
    if (!cacheable) return perform<T>(path, init, format);
    const key = base + path;
    const existing = getCache.get(key);
    if (existing && existing.expiresAt > Date.now()) return existing.value as Promise<T>;
    const value = perform<T>(path, init, format);
    getCache.set(key, { expiresAt: Date.now() + getCacheTtlMs, value });
    void value.catch(() => { if (getCache.get(key)?.value === value) getCache.delete(key); });
    return value;
  }
  async function mutate<T>(path: string, method: string, body?: unknown, csrf?: string): Promise<T> {
    let token = csrf ?? csrfToken;
    if (!token) {
      token = (await request<{ csrf_token: string }>("/auth/csrf")).csrf_token;
      csrfToken = token;
    }
    const result = await request<T>(path, {
      method, headers: { "X-CSRF-Token": token },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    clearReadCache();
    if (["/auth/logout", "/auth/password/change", "/auth/account/deletion/confirm"].includes(path)) csrfToken = "";
    return result;
  }
  function publicPost<T>(path: string, body: unknown) {
    return request<T>(path, { method: "POST", body: JSON.stringify(body) });
  }
  function prefetch(path: string) { return request(path).catch(() => undefined); }
  return { request, mutate, publicPost, prefetch, invalidate: clearReadCache, resetSession,
    file: (path: string) => request<Blob>(path, {}, "blob"),
    photo: () => request<Blob>("/auth/profile/photo", {}, "blob"),
    googleLogin: base + "/auth/google/login", photoUrl: base + "/auth/profile/photo" };
}
