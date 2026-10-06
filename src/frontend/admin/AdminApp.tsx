import { useCallback, useEffect, useState } from "react";
import { Bell, Building2, Clock3, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiBase, ApiError, createApi, type Approval, type User } from "./api";
import { Auth } from "./Auth";
import { Clients } from "./Clients";
import { Approvals } from "./Approvals";
import { Profile } from "./Profile";
import { Feedback, Loading, message } from "./shared";

const api = createApi(apiBase(import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "")));
type Page = "clients" | "approvals" | "profile";
export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState<Page>("clients");
  const [hasRequests, setHasRequests] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const complete = window.location.pathname.replace(/\/$/, "") === "/admin/complete-profile";
  const refresh = useCallback(async () => {
    try { setUser(await api.request<User>("/auth/me")); setError(""); }
    catch (e) { if (e instanceof ApiError && e.status === 401) setUser(null); else setError(message(e)); }
    finally { setLoading(false); }
  }, []);
  const requests = useCallback(async () => {
    try {
      const notes = await api.request<Approval[]>("/admin/notifications?unresolved_only=true&limit=1");
      setHasRequests(notes.length > 0);
    } catch (e) { if (!(e instanceof ApiError && e.status === 401)) setError(message(e)); }
  }, []);
  useEffect(() => { if (complete) setLoading(false); else void refresh(); }, [complete, refresh]);
  useEffect(() => {
    const expired = () => { setUser(null); setPage("clients"); setHasRequests(false); };
    window.addEventListener("nexo:session-expired", expired);
    return () => window.removeEventListener("nexo:session-expired", expired);
  }, []);
  useEffect(() => {
    if (!user) return;
    if (user.status === "pending") {
      const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
      return () => clearInterval(timer);
    }
    if (user.role === "admin") {
      void requests();
      const timer = setInterval(() => { if (!document.hidden) void requests(); }, 30000);
      return () => clearInterval(timer);
    }
  }, [user?.id, user?.status, user?.role, refresh, requests]);
  function onLogin(person: User) {
    if (complete) window.history.replaceState(null, "", "/admin");
    setUser(person); setError(""); setPage("clients");
  }
  async function logout() {
    setLoggingOut(true); setError("");
    try { await api.mutate("/auth/logout", "POST"); setUser(null); setHasRequests(false); setPage("clients"); }
    catch (e) { setError(message(e)); } finally { setLoggingOut(false); }
  }
  if (loading) return <main className="admin-loading"><Loading /></main>;
  if (!user && error) return <main className="admin-loading"><Feedback error={error} /><Button onClick={() => { setLoading(true); void refresh(); }}>Tentar novamente</Button><Button variant="link" asChild><a href="/">Voltar ao site</a></Button></main>;
  if (!user) return <Auth api={api} complete={complete} onLogin={onLogin} />;
  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <a href="/" aria-label="Nexo, voltar ao site"><Brand /></a>
      <p className="admin-eyebrow">PAINEL ADMINISTRATIVO</p>
      <nav aria-label="Navegação do painel">
        {user.status === "approved" && <Button variant={page === "clients" ? "secondary" : "ghost"} onClick={() => setPage("clients")} aria-current={page === "clients" ? "page" : undefined}><Building2 data-icon="inline-start" /> Clientes</Button>}
        {user.role === "admin" && user.status === "approved" && <Button variant={page === "approvals" ? "secondary" : "ghost"} onClick={() => setPage("approvals")} aria-current={page === "approvals" ? "page" : undefined}><Bell data-icon="inline-start" /> Solicitações {hasRequests && <Badge variant="default">Novas</Badge>}</Button>}
        <Button variant={page === "profile" ? "secondary" : "ghost"} onClick={() => setPage("profile")} aria-current={page === "profile" ? "page" : undefined}><UserRound data-icon="inline-start" /> Meu perfil</Button>
      </nav>
      <div className="admin-sidebar-bottom"><Badge variant="outline"><ShieldCheck className="size-3" />{user.role === "admin" ? "Administrador" : user.status === "pending" ? "Aguardando aprovação" : "Membro"}</Badge><Button variant="ghost" disabled={loggingOut} onClick={() => void logout()}><LogOut data-icon="inline-start" /> Sair</Button></div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><p>Olá, <strong>{user.name.split(" ")[0]}</strong>.</p><Button variant="outline" size="sm" asChild><a href="/">Visitar site</a></Button></header>
      <main className="admin-content" id="painel">
        <Feedback error={error} />
        {hasRequests && user.role === "admin" && page !== "approvals" && <Alert role="status"><AlertTitle>Há solicitações de acesso aguardando sua decisão.</AlertTitle><AlertDescription><Button variant="link" onClick={() => setPage("approvals")}>Ver solicitações</Button></AlertDescription></Alert>}
        {page === "profile" ? <Profile api={api} user={user} onUpdate={setUser} onLoggedOut={() => { setUser(null); setError(""); }} /> :
          user.status !== "approved" ? <Card className="admin-pending"><CardHeader><Clock3 className="size-10 text-primary" /><CardTitle>Seu acesso está em análise</CardTitle><CardDescription>O administrador recebeu sua solicitação. Quando ele autorizar, os dados serão liberados aqui automaticamente.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-sm text-muted-foreground">Enquanto isso, você pode completar seu perfil e adicionar uma foto.</p><div className="flex flex-wrap gap-2"><Button onClick={() => setPage("profile")}>Completar meu perfil</Button><Button variant="outline" onClick={() => void refresh()}>Verificar aprovação</Button></div></CardContent></Card> :
          page === "approvals" && user.role === "admin" ? <Approvals api={api} onChanged={() => void requests()} /> : <Clients api={api} />}
      </main>
    </div>
  </div>;
}
