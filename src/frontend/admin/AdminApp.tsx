import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Bell, Database, BellOff, MapPin, KeyRound, Megaphone, MessageCircle, FileText, Building2, ChartNoAxesColumn, Clock3, LogOut, ArrowRightLeft, ShieldCheck, UserRound, Users, Menu, Settings2, Workflow, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiBase, ApiError, createApi, hasDeveloperAccess, hasSalesAccess, ROLE_LABELS, type Approval, type User } from "./api";
import { Auth } from "./Auth";
import { Chat } from "./Chat";
import { useRealtime, type RealtimeEvent, type ChatMessage } from "./realtime";
import { Documents } from "./Documents";
import { Clients } from "./Clients";
import { Approvals } from "./Approvals";
import { Announcements } from "./Announcements";
import { Home } from "./Home";
import { DevHome } from "./DevHome";
import { GeneralHome } from "./GeneralHome";
import { MyKeys } from "./MyKeys";
import { BusinessDashboard } from "./BusinessDashboard";
import { Funnel } from "./Funnel";
import { AutomationRequests } from "./AutomationRequests";
import { AutomationsLibrary } from "./AutomationsLibrary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Directory } from "./Directory";
import { Members } from "./Members";
import { Profile } from "./Profile";
import { ApiKeys } from "./ApiKeys";
import { Databases } from "./Databases";
import { Maps } from "./Maps";
import { AREAS, AreaGateway, type Area } from "./AreaGateway";
import { useAdminReveal } from "@/hooks/useAdminReveal";
import { Feedback, Loading, message } from "./shared";
import { disablePush, enablePush, hasActivePush, pushNeedsInstall, registerGrantedPush } from "./push";

const api = createApi(apiBase(import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "")));
type Page = "home" | "dev-home" | "general-home" | "my-keys" | "business" | "funnel" | "chat" | "documents" | "clients" | "approvals" | "announcements" | "members" | "directory" | "profile" | "api-keys" | "databases" | "maps" | "automations";
export default function AdminApp() {
  const generation = useRef(0);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapsJobId] = useState(() => new URLSearchParams(window.location.search).get("maps") || "");
  const [selectedPage, setPage] = useState<Page>(mapsJobId ? "maps" : "clients");
  const canSell = user?.status === "approved" && hasSalesAccess(user.role);
  const canDevelop = user?.status === "approved" && hasDeveloperAccess(user.role);
  const isOwner = user?.status === "approved" && user.role === "owner";
  // The areas come from the role the server just reported, so a stale choice (or another account's) is dropped.
  const allowedAreas: Area[] = user?.status === "approved"
    ? ["general", ...(canSell ? ["commercial" as const] : []), ...(canDevelop ? ["dev" as const] : [])] : [];
  const [areaChoice, setAreaChoice] = useState<Area | null>(() => {
    if (new URLSearchParams(window.location.search).get("maps")) return "commercial";
    try { const saved = sessionStorage.getItem("nexo:area"); return saved === "general" || saved === "commercial" || saved === "dev" ? saved : null; } catch { return null; }
  });
  const area: Area | null = allowedAreas.length === 1 ? allowedAreas[0]
    : areaChoice && allowedAreas.includes(areaChoice) ? areaChoice : null;
  // Which pages belong to each area; anything else is sent back to the area's start page.
  const AREA_PAGES: Record<Area, Page[]> = {
    general: ["general-home", "documents", "chat", "approvals", "announcements", "directory", "members", "profile"],
    commercial: ["home", "business", "funnel", "clients", "maps", "my-keys", "announcements"],
    dev: ["dev-home", "automations", "api-keys", "databases", "announcements", "directory"],
  };
  const defaultPage = (target: Area | null): Page => target === "dev" ? "dev-home" : target === "commercial" ? "clients" : "general-home";
  const page: Page = user?.status === "approved" && (
    (area !== null && !AREA_PAGES[area].includes(selectedPage)) ||
    (!isOwner && ["members", "approvals"].includes(selectedPage))
  ) ? defaultPage(area) : selectedPage;
  // The panel entrance animation is skipped on the chat, whose list updates live.
  const revealRef = useAdminReveal(page !== "chat", page + ":" + (user?.id ?? "") + ":" + (area ?? ""));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("nexo:sidebar-collapsed") === "true");
  const [incoming, setIncoming] = useState<ChatMessage | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatMember, setChatMember] = useState<string>();
  const [hasRequests, setHasRequests] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({ total: 0, notices: 0, chat_messages: 0 });
  const refreshUnreadCounts = useCallback(async () => {
    try { setUnreadCounts(await api.request<{ total: number; notices: number; chat_messages: number }>("/notifications/unread-count")); }
    catch (e) { if (e instanceof ApiError && e.status === 401) setUnreadCounts({ total: 0, notices: 0, chat_messages: 0 }); }
  }, []);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const complete = window.location.pathname.replace(/\/$/, "") === "/admin/complete-profile";
  const inviteToken = new URLSearchParams(window.location.search).get("invite") || undefined;
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
    if (user && inviteToken) window.history.replaceState(null, "", "/admin");
  }, [user, inviteToken]);
  useEffect(() => {
    const expired = () => { api.resetSession(); generation.current++; setUser(null); setPage("clients"); setHasRequests(false); setUnreadCounts({ total: 0, notices: 0, chat_messages: 0 }); setIncoming(null); setChatMember(undefined); setMobileOpen(false); setPushEnabled(false); };
    window.addEventListener("nexo:session-expired", expired);
    return () => window.removeEventListener("nexo:session-expired", expired);
  }, []);
  const event = useCallback((value: RealtimeEvent) => {
    if (["notifications.changed", "clients.changed", "account.changed", "chat.message"].includes(value.type)) api.invalidate();
    window.dispatchEvent(new CustomEvent("nexo:realtime", { detail: value }));
    if (["ready", "account.changed"].includes(value.type)) void refresh();
    if (["ready", "notifications.changed", "chat.message"].includes(value.type)) void refreshUnreadCounts();
    if (["ready", "notifications.changed"].includes(value.type) && user?.role === "owner" && user.status === "approved") void requests();
    if (value.type === "chat.message" && value.message && value.message.recipient_id === user?.id && (page !== "chat" || activeChat !== value.message.sender_id)) setIncoming(value.message);
  }, [refresh, requests, refreshUnreadCounts, user?.id, user?.role, user?.status, page, activeChat]);
  const realtime = useRealtime(api, user, event);
  useEffect(() => { if (user?.role === "owner" && user.status === "approved") void requests(); }, [user?.id, user?.role, user?.status, requests]);
  useEffect(() => {
    if (user?.status === "approved") void refreshUnreadCounts();
    else setUnreadCounts({ total: 0, notices: 0, chat_messages: 0 });
  }, [user?.id, user?.status, refreshUnreadCounts]);
  useEffect(() => {
    if (user?.status !== "approved" || !hasSalesAccess(user.role)) return;
    // Warm the overview while Clientes is visible. Navigation to Início can
    // then reuse the short-lived client cache instead of waiting on the API.
    const timer = window.setTimeout(() => { void api.prefetch("/dashboard"); }, 150);
    return () => window.clearTimeout(timer);
  }, [user?.id, user?.status, user?.role]);
  useEffect(() => {
    if (!user || user.status !== "approved") { setPushEnabled(false); return; }
    let cancelled = false;
    void (async () => {
      try {
        await registerGrantedPush(api, user);
        const enabled = await hasActivePush();
        if (!cancelled) setPushEnabled(enabled);
      } catch {
        if (!cancelled) setPushEnabled(await hasActivePush());
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.status]);
  async function activatePush() {
    setPushBusy(true); setError("");
    try {
      await enablePush(api);
      setPushEnabled(await hasActivePush());
    } catch (e) { setError(message(e)); }
    finally { setPushBusy(false); }
  }
  async function deactivatePush() {
    setPushBusy(true); setError("");
    try {
      await disablePush(api);
      setPushEnabled(false);
    } catch (e) { setError(message(e)); }
    finally { setPushBusy(false); }
  }
  function onLogin(person: User) {
    generation.current++;
    if (complete || inviteToken) window.history.replaceState(null, "", "/admin");
    api.resetSession(); setUser(person); setError(""); setPage("general-home");
    setAreaChoice(null); try { sessionStorage.removeItem("nexo:area"); } catch { /* sem armazenamento */ }
  }
  function pickArea(next: Area) {
    setAreaChoice(next); setPage(defaultPage(next)); setMobileOpen(false);
    try { sessionStorage.setItem("nexo:area", next); } catch { /* sem armazenamento */ }
  }
  function switchArea() {
    setAreaChoice(null); setMobileOpen(false);
    try { sessionStorage.removeItem("nexo:area"); } catch { /* sem armazenamento */ }
  }
  async function logout() {
    setLoggingOut(true); setError("");
    try { await api.mutate("/auth/logout", "POST"); api.resetSession(); generation.current++; setUser(null); setHasRequests(false); setUnreadCounts({ total: 0, notices: 0, chat_messages: 0 }); setIncoming(null); setChatMember(undefined); setPage("clients"); setAreaChoice(null); setMobileOpen(false); setPushEnabled(false); }
    catch (e) { setError(message(e)); } finally { setLoggingOut(false); }
  }
  if (loading) return <main className="admin-loading"><Loading /></main>;
  if (!user && error) return <main className="admin-loading"><Feedback error={error} /><Button onClick={() => { setLoading(true); void refresh(); }}>Tentar novamente</Button><Button variant="link" asChild><a href="/">Voltar ao site</a></Button></main>;
  if (!user) return <Auth api={api} complete={complete} inviteToken={inviteToken} onLogin={onLogin} />;
  if (allowedAreas.length > 1 && area === null) return <AreaGateway user={user} areas={allowedAreas} loggingOut={loggingOut} onPick={pickArea} onLogout={() => void logout()} />;
  function navigate(next: Page) { setPage(next); setMobileOpen(false); }
  function toggleSidebar() { setSidebarCollapsed(value => { const next = !value; localStorage.setItem("nexo:sidebar-collapsed", String(next)); return next; }); }
  const navigation = (
      <nav className="admin-panel-nav" aria-label="Navegação do painel">
        {area && <div className="flex items-center justify-between gap-2 px-1 pb-1"><Badge variant="secondary">{AREAS[area].label}</Badge>
          {allowedAreas.length > 1 && <Button variant="ghost" size="sm" onClick={switchArea} aria-label="Trocar de área"><ArrowRightLeft data-icon="inline-start" /> Trocar</Button>}</div>}
        {area === "general" && <Button variant={page === "general-home" ? "secondary" : "ghost"} onClick={() => navigate("general-home")} aria-current={page === "general-home" ? "page" : undefined}><Activity data-icon="inline-start" /> Início</Button>}
        {area === "dev" && <Button variant={page === "dev-home" ? "secondary" : "ghost"} onClick={() => navigate("dev-home")} aria-current={page === "dev-home" ? "page" : undefined}><Activity data-icon="inline-start" /> Início</Button>}
        {area === "commercial" && <Button variant={page === "home" ? "secondary" : "ghost"} onClick={() => navigate("home")} aria-current={page === "home" ? "page" : undefined}><Activity data-icon="inline-start" /> Início</Button>}
        {area === "commercial" && <Button variant={page === "business" ? "secondary" : "ghost"} onClick={() => navigate("business")} aria-current={page === "business" ? "page" : undefined}><ChartNoAxesColumn data-icon="inline-start" /> Dashboard do negócio</Button>}
        {area === "commercial" && <Button variant={page === "funnel" ? "secondary" : "ghost"} onClick={() => navigate("funnel")} aria-current={page === "funnel" ? "page" : undefined}><ChartNoAxesColumn data-icon="inline-start" /> Funil comercial</Button>}
        {area === "commercial" && <Button variant={page === "clients" ? "secondary" : "ghost"} onClick={() => navigate("clients")} aria-current={page === "clients" ? "page" : undefined}><Building2 data-icon="inline-start" /> Clientes</Button>}
        {area === "commercial" && <Button variant={page === "maps" ? "secondary" : "ghost"} onClick={() => navigate("maps")} aria-current={page === "maps" ? "page" : undefined}><MapPin data-icon="inline-start" /> Maps</Button>}
        {area === "commercial" && <Button variant={page === "my-keys" ? "secondary" : "ghost"} onClick={() => navigate("my-keys")} aria-current={page === "my-keys" ? "page" : undefined}><KeyRound data-icon="inline-start" /> Chaves</Button>}
        {area === "dev" && <Button variant={page === "automations" ? "secondary" : "ghost"} onClick={() => navigate("automations")} aria-current={page === "automations" ? "page" : undefined}><Workflow data-icon="inline-start" /> Automações</Button>}
        {area === "general" && <Button variant={page === "documents" ? "secondary" : "ghost"} onClick={() => navigate("documents")} aria-current={page === "documents" ? "page" : undefined}><FileText data-icon="inline-start" /> Documentos</Button>}
        {area === "general" && <Button variant={page === "chat" ? "secondary" : "ghost"} onClick={() => { setIncoming(null); navigate("chat"); }} aria-current={page === "chat" ? "page" : undefined}><MessageCircle data-icon="inline-start" /> Chat {unreadCounts.chat_messages > 0 && <Badge>{unreadCounts.chat_messages}</Badge>}</Button>}
        {isOwner && area === "general" && <Button variant={page === "approvals" ? "secondary" : "ghost"} onClick={() => navigate("approvals")} aria-current={page === "approvals" ? "page" : undefined}><Bell data-icon="inline-start" /> Solicitações {hasRequests && <Badge variant="default">Novas</Badge>}</Button>}
        {user.status === "approved" && <Button variant={page === "announcements" ? "secondary" : "ghost"} onClick={() => navigate("announcements")} aria-current={page === "announcements" ? "page" : undefined}><Megaphone data-icon="inline-start" /> Avisos {unreadCounts.notices > 0 && <Badge aria-label={`${unreadCounts.notices} avisos novos`}>{unreadCounts.notices}</Badge>}</Button>}
        {(area === "general" || area === "dev") && <Button variant={page === "directory" ? "secondary" : "ghost"} onClick={() => navigate("directory")} aria-current={page === "directory" ? "page" : undefined}><Users data-icon="inline-start" /> Membros</Button>}
        {isOwner && area === "general" && <Button variant={page === "members" ? "secondary" : "ghost"} onClick={() => navigate("members")} aria-current={page === "members" ? "page" : undefined}><Settings2 data-icon="inline-start" /> Gerenciar membros</Button>}
        {area === "dev" && <Button variant={page === "api-keys" ? "secondary" : "ghost"} onClick={() => navigate("api-keys")} aria-current={page === "api-keys" ? "page" : undefined}><KeyRound data-icon="inline-start" /> API</Button>}
        {area === "dev" && <Button variant={page === "databases" ? "secondary" : "ghost"} onClick={() => navigate("databases")} aria-current={page === "databases" ? "page" : undefined}><Database data-icon="inline-start" /> Bancos de dados</Button>}
        {(area === "general" || user.status !== "approved") && <Button variant={page === "profile" ? "secondary" : "ghost"} onClick={() => navigate("profile")} aria-current={page === "profile" ? "page" : undefined}><UserRound data-icon="inline-start" /> Meu perfil</Button>}
      </nav>
  );
  const account = (
      <div className="admin-sidebar-bottom"><Badge variant="outline"><ShieldCheck className="size-3" />{user.status === "pending" ? "Aguardando aprovação" : ROLE_LABELS[user.role]}</Badge><Button variant="ghost" disabled={loggingOut} onClick={() => void logout()}><LogOut data-icon="inline-start" /> Sair</Button></div>
  );
  const sidebarHeader = (
    <div className="admin-sidebar-header">
      <a href="/" aria-label="Nexo, voltar ao site"><Brand /></a>
      <Button variant="ghost" size="icon-sm" className="admin-sidebar-toggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"} title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}>
        {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>
    </div>
  );
  return <div className={`admin-layout${sidebarCollapsed ? " admin-layout-collapsed" : ""}`}>
    <aside className="admin-sidebar">
      {sidebarHeader}
      <p className="admin-eyebrow">PAINEL ADMINISTRATIVO</p>
      {navigation}
      {account}
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><div className="flex min-w-0 items-center gap-3"><Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild><Button variant="outline" size="icon-lg" className="admin-mobile-menu" aria-label="Abrir menu do painel"><Menu /></Button></SheetTrigger>
        <SheetContent side="left" className="overflow-y-auto"><SheetHeader><SheetTitle>Menu do painel</SheetTitle><SheetDescription>Navegue pelo seu espaço na Nexo.</SheetDescription></SheetHeader><div className="px-4"><a href="/" aria-label="Nexo, voltar ao site"><Brand /></a></div><div className="px-4">{navigation}</div><SheetFooter>{account}</SheetFooter></SheetContent>
      </Sheet><p className="truncate">Olá, <strong>{user.name.split(" ")[0]}</strong>.</p></div><div className="flex items-center gap-2">{user.status === "approved" && <Button variant="outline" size="sm" disabled={pushBusy} onClick={() => void (pushEnabled ? deactivatePush() : activatePush())}>{pushEnabled ? <BellOff data-icon="inline-start" /> : <Bell data-icon="inline-start" />}{pushBusy ? (pushEnabled ? "Desativando…" : "Ativando…") : pushEnabled ? "Desativar notificações" : pushNeedsInstall() ? "Instalar Nexo" : "Ativar notificações"}</Button>}<Button variant="outline" size="sm" asChild><a href="/">Visitar site</a></Button></div></header>
      <main className="admin-content" id="painel" ref={revealRef}>
        <Feedback error={error} />
        {incoming && area === "general" && <Alert role="status"><AlertTitle>Nova mensagem de {incoming.sender_name}</AlertTitle><AlertDescription><span>{incoming.kind === "text" ? incoming.text : incoming.kind === "image" ? "Enviou uma foto." : "Enviou um áudio."}</span><Button variant="link" onClick={() => { setChatMember(incoming.sender_id); setIncoming(null); navigate("chat"); }}>Abrir conversa</Button></AlertDescription></Alert>}
        {hasRequests && user.role === "owner" && area === "general" && page !== "approvals" && <Alert role="status"><AlertTitle>Há solicitações de acesso aguardando sua decisão.</AlertTitle><AlertDescription><Button variant="link" onClick={() => setPage("approvals")}>Ver solicitações</Button></AlertDescription></Alert>}
        {page === "profile" ? <Profile api={api} user={user} onUpdate={setUser} onLoggedOut={() => { api.resetSession(); setUser(null); setError(""); }} /> :
          user.status !== "approved" ? <Card className="admin-pending"><CardHeader><Clock3 className="size-10 text-primary" /><CardTitle>Seu acesso está em análise</CardTitle><CardDescription>O administrador recebeu sua solicitação. Quando ele autorizar, os dados serão liberados aqui automaticamente.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-sm text-muted-foreground">Enquanto isso, você pode completar seu perfil e adicionar uma foto.</p><div className="flex flex-wrap gap-2"><Button onClick={() => setPage("profile")}>Completar meu perfil</Button><Button variant="outline" onClick={() => void refresh()}>Verificar aprovação</Button></div></CardContent></Card> :
          page === "general-home" ? <GeneralHome api={api} user={user} onOpen={navigate} /> :
          page === "my-keys" && canSell ? <MyKeys api={api} onOpenMaps={() => navigate("maps")} /> :
          page === "home" ? <Home api={api} user={user} /> :
          page === "dev-home" && canDevelop ? <DevHome api={api} user={user} onOpen={navigate} /> :
          page === "business" ? <BusinessDashboard api={api} /> :
          page === "funnel" ? <Funnel api={api} /> :
          page === "automations" ? <section className="flex flex-col gap-5"><Tabs defaultValue="library"><TabsList><TabsTrigger value="library"><Workflow data-icon="inline-start" /> Biblioteca</TabsTrigger>{canDevelop && <TabsTrigger value="n8n"><Workflow data-icon="inline-start" /> Acesso ao n8n</TabsTrigger>}</TabsList><TabsContent value="library"><AutomationsLibrary api={api} user={user} /></TabsContent>{canDevelop && <TabsContent value="n8n"><AutomationRequests api={api} user={user} /></TabsContent>}</Tabs></section> :
          page === "chat" ? <Chat key={chatMember} api={api} actor={user} realtime={realtime} initialMember={chatMember} onSelect={setActiveChat} onNotificationsRead={refreshUnreadCounts} /> :
          page === "announcements" ? <Announcements api={api} user={user} onNotificationsRead={refreshUnreadCounts} /> :
          page === "documents" ? <Documents api={api} actor={user} /> :
          page === "maps" && canSell ? <Maps api={api} canManageKey initialJobId={mapsJobId} /> :
          page === "directory" ? <Directory api={api} /> :
          page === "api-keys" ? <ApiKeys api={api} user={user} /> :
          page === "databases" && canDevelop ? <Databases api={api} /> :
          page === "members" && isOwner ? <Members api={api} actor={user} onUpdate={setUser} /> :
          page === "approvals" && isOwner ? <Approvals api={api} onChanged={() => void requests()} /> : <Clients api={api} />}
      </main>
    </div>
  </div>;
}

