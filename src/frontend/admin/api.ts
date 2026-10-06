export type User = {
  id: string; name: string; email: string; phone: string | null;
  profile_photo: string | null; status: "pending" | "approved" | "rejected";
  role: "member" | "admin";
};
export type ClientRecord = {
  id: string; name: string; niche: string; phone: string | null; email: string | null;
  notes: string | null; contract_closed: boolean; created_by_id: string;
  created_at: string; updated_at: string;
};
export type ClientInput = Pick<ClientRecord, "name" | "niche" | "phone" | "email" | "notes" | "contract_closed">;
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
  async function request<T>(path: string, init: RequestInit = {}, format: "json" | "blob" = "json"): Promise<T> {
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
          409: detail.includes("Email") || detail.includes("email")
            ? "Este e-mail já está cadastrado. Use a forma de acesso original."
            : "Este registro foi alterado. Atualize a lista.",
          413: "A foto ultrapassa o tamanho ou a resolução permitidos.",
          422: "Confira os campos. Senhas novas exigem 12 caracteres e até 72 bytes; celular, 10 a 15 dígitos.",
          429: "Muitas tentativas. Aguarde " + (response.headers.get("Retry-After") || "alguns") + " segundos.",
          503: path === "/auth/register" ? "Não foi possível enviar o código por e-mail. O serviço de envio está indisponível."
            : "Serviço temporariamente indisponível. Tente novamente em instantes.",
        };
        if (response.status === 401 && !["/auth/login", "/auth/google/profile", "/auth/password/recovery/confirm"].includes(path)) {
          if (typeof window !== "undefined") window.dispatchEvent(new Event("nexo:session-expired"));
        }
        throw new ApiError(response.status, messages[response.status] ||
          (path.includes("register") ? "Código de cadastro inválido ou expirado." : path.includes("password") ? "Senha atual ou código inválido/expirado." : "Não foi possível concluir a ação."));
      }
      if (response.status === 204) return undefined as T;
      return await (format === "blob" ? response.blob() : response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, "Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.");
    } finally { clearTimeout(timeout); }
  }
  async function mutate<T>(path: string, method: string, body?: unknown, csrf?: string): Promise<T> {
    const token = csrf ?? (await request<{ csrf_token: string }>("/auth/csrf")).csrf_token;
    return request<T>(path, {
      method, headers: { "X-CSRF-Token": token },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  }
  function publicPost<T>(path: string, body: unknown) {
    return request<T>(path, { method: "POST", body: JSON.stringify(body) });
  }
  return { request, mutate, publicPost, photo: () => request<Blob>("/auth/profile/photo", {}, "blob"), googleLogin: base + "/auth/google/login", photoUrl: base + "/auth/profile/photo" };
}
