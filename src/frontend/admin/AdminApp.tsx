import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Bell, Megaphone, MessageCircle, FileText, Building2, ChartNoAxesColumn, Clock3, LogOut, ShieldCheck, UserRound, Users, Menu, Settings2 } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiBase, ApiError, createApi, type Approval, type User } from "./api";
import { Auth } from "./Auth";
import { Chat } from "./Chat";
import { useRealtime, type RealtimeEvent, type ChatMessage } from "./realtime";
import { Documents } from "./Documents";
import { Clients } from "./Clients";
import { Approvals } from "./Approvals";
import { Announcements } from "./Announcements";
import { Home } from "./Home";
import { Funnel } from "./Funnel";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Directory } from "./Directory";
import { Members } from "./Members";
import { Profile } from "./Profile";
import { Feedback, Loading, message } from "./shared";

const api = createApi(apiBase(import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "")));
type Page = "home" | "funnel" | "chat" | "documents" | "clients" | "approvals" | "announcements" | "members" | "directory" | "profile";
export default function AdminApp() {
  const generation = useRef(0);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState<Page>("clients");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [incoming, setIncoming] = useState<ChatMessage | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatMember, setChatMember] = useState<string>();
  const [hasRequests, setHasRequests] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const complete = window.location.pathname.replace(/\/$/, "") === "/admin/complete-profile";
  const refresh = useCallback(async () => {
    const current = generation.current;
    try { const person = await api.request<User>("/auth/me"); if (current === generation.current) { setUser(person); setError(""); } }
    catch (e) { if (current !== generation.current) return; if (e instanceof ApiError && e.status === 401) setUser(null); else setError(message(e)); }
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
    const expired = () => { api.resetSession(); generation.current++; setUser(null); setPage("clients"); setHasRequests(false); setIncoming(null); setChatMember(undefined); setMobileOpen(false); };
    window.addEventListener("nexo:session-expired", expired);
    return () => window.removeEventListener("nexo:session-expired", expired);
  }, []);
  const event = useCallback((value: RealtimeEvent) => {
    if (["notifications.changed", "account.changed"].includes(value.type)) api.invalidate();
    window.dispatchEvent(new CustomEvent("nexo:realtime", { detail: value }));
    if (["ready", "account.changed"].includes(value.type)) void refresh();
    if (["ready", "notifications.changed"].includes(value.type) && user?.role === "admin" && user.status === "approved") void requests();
    if (value.type === "chat.message" && value.message && value.message.recipient_id === user?.id && (page !== "chat" || activeChat !== value.message.sender_id)) setIncoming(value.message);
  }, [refresh, requests, user?.id, user?.role, user?.status, page, activeChat]);
  const realtime = useRealtime(api, user, event);
  useEffect(() => { if (user?.role === "admin" && user.status === "approved") void requests(); }, [user?.id, user?.role, user?.status, requests]);
  useEffect(() => {
    if (user?.status !== "approved") return;
    // Warm the overview while Clientes is visible.  Navigation to Início can
    // then reuse the short-lived client cache instead of waiting on the API.
    const timer = window.setTimeout(() => { void api.prefetch("/dashboard"); }, 150);
    return () => window.clearTimeout(timer);
  }, [user?.id, user?.status]);
  function onLogin(person: User) {
    generation.current++;
    if (complete) window.history.replaceState(null, "", "/admin");
    api.resetSession(); setUser(person); setError(""); setPage("clients");
  }
  async function logout() {
    setLoggingOut(true); setError("");
    try { await api.mutate("/auth/logout", "POST"); api.resetSession(); generation.current++; setUser(null); setHasRequests(false); setIncoming(null); setChatMember(undefined); setPage("clients"); setMobileOpen(false); }
    catch (e) { setError(message(e)); } finally { setLoggingOut(false); }
  }
  if (loading) return <main className="admin-loading"><Loading /></main>;
  if (!user && error) return <main className="admin-loading"><Feedback error={error} /><Button onClick={() => { setLoading(true); void refresh(); }}>Tentar novamente</Button><Button variant="link" asChild><a href="/">Voltar ao site</a></Button></main>;
  if (!user) return <Auth api={api} complete={complete} onLogin={onLogin} />;
  function navigate(next: Page) { setPage(next); setMobileOpen(false); }
  const navigation = (
      <nav className="admin-panel-nav" aria-label="Navegação do painel">
        {user.status === "approved" && <Button variant={page === "home" ? "secondary" : "ghost"} onClick={() => navigate("home")} aria-current={page === "home" ? "page" : undefined}><Activity data-icon="inline-start" /> Início</Button>}
        {user.status === "approved" && <Button variant={page === "funnel" ? "secondary" : "ghost"} onClick={() => navigate("funnel")} aria-current={page === "funnel" ? "page" : undefined}><ChartNoAxesColumn data-icon="inline-start" /> Funil comercial</Button>}
        {user.status === "approved" && <Button variant={page === "clients" ? "secondary" : "ghost"} onClick={() => navigate("clients")} aria-current={page === "clients" ? "page" : undefined}><Building2 data-icon="inline-start" /> Clientes</Button>}
        {user.status === "approved" && <Button variant={page === "documents" ? "secondary" : "ghost"} onClick={() => navigate("documents")} aria-current={page === "documents" ? "page" : undefined}><FileText data-icon="inline-start" /> Documentos</Button>}
        {user.status === "approved" && <Button variant={page === "chat" ? "secondary" : "ghost"} onClick={() => { setIncoming(null); navigate("chat"); }} aria-current={page === "chat" ? "page" : undefined}><MessageCircle data-icon="inline-start" /> Chat {incoming && <Badge>Nova</Badge>}</Button>}
        {user.role === "admin" && user.status === "approved" && <Button variant={page === "approvals" ? "secondary" : "ghost"} onClick={() => navigate("approvals")} aria-current={page === "approvals" ? "page" : undefined}><Bell data-icon="inline-start" /> Solicitações {hasRequests && <Badge variant="default">Novas</Badge>}</Button>}
        {user.status === "approved" && <Button variant={page === "announcements" ? "secondary" : "ghost"} onClick={() => navigate("announcements")} aria-current={page === "announcements" ? "page" : undefined}><Megaphone data-icon="inline-start" /> Avisos</Button>}
        {user.role === "admin" && user.status === "approved" && <Button variant={page === "members" ? "secondary" : "ghost"} onClick={() => navigate("members")} aria-current={page === "members" ? "page" : undefined}><Settings2 data-icon="inline-start" /> Gerenciar membros</Button>}
        {user.status === "approved" && <Button variant={page === "directory" ? "secondary" : "ghost"} onClick={() => navigate("directory")} aria-current={page === "directory" ? "page" : undefined}><Users data-icon="inline-start" /> Membros</Button>}
        <Button variant={page === "profile" ? "secondary" : "ghost"} onClick={() => navigate("profile")} aria-current={page === "profile" ? "page" : undefined}><UserRound data-icon="inline-start" /> Meu perfil</Button>
      </nav>
  );
  const account = (
      <div className="admin-sidebar-bottom"><Badge variant="outline"><ShieldCheck className="size-3" />{user.role === "admin" ? "Administrador" : user.status === "pending" ? "Aguardando aprovação" : "Membro"}</Badge><Button variant="ghost" disabled={loggingOut} onClick={() => void logout()}><LogOut data-icon="inline-start" /> Sair</Button></div>
  );
  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <a href="/" aria-label="Nexo, voltar ao site"><Brand /></a>
      <p className="admin-eyebrow">PAINEL ADMINISTRATIVO</p>
      {navigation}
      {account}
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><div className="flex min-w-0 items-center gap-3"><Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild><Button variant="outline" size="icon-lg" className="admin-mobile-menu" aria-label="Abrir menu do painel"><Menu /></Button></SheetTrigger>
        <SheetContent side="left" className="overflow-y-auto"><SheetHeader><SheetTitle>Menu do painel</SheetTitle><SheetDescription>Navegue pelo seu espaço na Nexo.</SheetDescription></SheetHeader><div className="px-4"><a href="/" aria-label="Nexo, voltar ao site"><Brand /></a></div><div className="px-4">{navigation}</div><SheetFooter>{account}</SheetFooter></SheetContent>
      </Sheet><p className="truncate">Olá, <strong>{user.name.split(" ")[0]}</strong>.</p></div><Button variant="outline" size="sm" asChild><a href="/">Visitar site</a></Button></header>
      <main className="admin-content" id="painel">
        <Feedback error={error} />
        {incoming && <Alert role="status"><AlertTitle>Nova mensagem de {incoming.sender_name}</AlertTitle><AlertDescription><Button variant="link" onClick={() => { setChatMember(incoming.sender_id); setIncoming(null); navigate("chat"); }}>Abrir conversa</Button></AlertDescription></Alert>}
        {hasRequests && user.role === "admin" && page !== "approvals" && <Alert role="status"><AlertTitle>Há solicitações de acesso aguardando sua decisão.</AlertTitle><AlertDescription><Button variant="link" onClick={() => setPage("approvals")}>Ver solicitações</Button></AlertDescription></Alert>}
        {page === "profile" ? <Profile api={api} user={user} onUpdate={setUser} onLoggedOut={() => { api.resetSession(); setUser(null); setError(""); }} /> :
          user.status !== "approved" ? <Card className="admin-pending"><CardHeader><Clock3 className="size-10 text-primary" /><CardTitle>Seu acesso está em análise</CardTitle><CardDescription>O administrador recebeu sua solicitação. Quando ele autorizar, os dados serão liberados aqui automaticamente.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-sm text-muted-foreground">Enquanto isso, você pode completar seu perfil e adicionar uma foto.</p><div className="flex flex-wrap gap-2"><Button onClick={() => setPage("profile")}>Completar meu perfil</Button><Button variant="outline" onClick={() => void refresh()}>Verificar aprovação</Button></div></CardContent></Card> :
          page === "home" ? <Home api={api} user={user} /> :
          page === "funnel" ? <Funnel api={api} /> :
          page === "chat" ? <Chat key={chatMember} api={api} actor={user} realtime={realtime} initialMember={chatMember} onSelect={setActiveChat} /> :
          page === "announcements" ? <Announcements api={api} user={user} /> :
          page === "documents" ? <Documents api={api} actor={user} /> :
          page === "directory" ? <Directory api={api} /> :
          page === "members" && user.role === "admin" ? <Members api={api} actor={user} onUpdate={setUser} /> :
          page === "approvals" && user.role === "admin" ? <Approvals api={api} onChanged={() => void requests()} /> : <Clients api={api} />}
      </main>
    </div>
  </div>;
}
