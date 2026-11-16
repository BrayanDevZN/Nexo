import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Building2, CalendarDays, LogOut, Plus, Scissors, Settings2, UserRound, Users } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Picture } from "./Photo";
import { ApiError } from "@/admin/api";
import { Busy, Feedback, message } from "@/admin/shared";
import { Account } from "./Account";
import { Agenda } from "./Agenda";
import { Auth } from "./Auth";
import { BusinessForm } from "./BusinessForm";
import { Services } from "./Services";
import { Team } from "./Team";
import { can, createBookingApi, ROLE_LABELS, type BookingUser, type Business, type InvitationInfo } from "./api";

const api = createBookingApi();
type Page = "agenda" | "services" | "team" | "business" | "account";
const PAGES: { id: Page; label: string; icon: typeof CalendarDays; group: "work" | "settings" }[] = [
  { id: "agenda", label: "Agenda", icon: CalendarDays, group: "work" }, { id: "services", label: "Serviços", icon: Scissors, group: "work" }, { id: "team", label: "Equipe", icon: Users, group: "work" },
  { id: "business", label: "Negócio", icon: Settings2, group: "settings" }, { id: "account", label: "Conta", icon: UserRound, group: "settings" },
];
const BUSINESS_KEY = "nexo:atendimentos:business";

/** Nexo Atendimentos at /atendimentos: sign in, pick a business, work in it. No effects, just screens. */
export default function BookingApp() {
  const [user, setUser] = useState<BookingUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>();
  const [business, setBusiness] = useState<Business>();
  const [creating, setCreating] = useState(false);
  const [accountOnly, setAccountOnly] = useState(false);
  const [page, setPage] = useState<Page>("agenda");
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite") || "");
  const [invite, setInvite] = useState<InvitationInfo>();
  const [inviteError, setInviteError] = useState("");
  const complete = window.location.pathname.replace(/\/$/, "") === "/atendimentos/completar-perfil";
  const refresh = useCallback(async () => {
    try { setUser(await api.request<BookingUser>("/auth/me")); setError(""); }
    catch (e) { if (e instanceof ApiError && e.status === 401) setUser(null); else setError(message(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (complete) setLoading(false); else void refresh(); }, [complete, refresh]);
  useEffect(() => {
    if (!inviteToken) return;
    let active = true;
    api.request<InvitationInfo>("/invitations/" + encodeURIComponent(inviteToken))
      .then(info => { if (active) setInvite(info); })
      .catch(() => { if (active) setInviteError("Este convite não existe mais ou já venceu."); });
    return () => { active = false; };
  }, [inviteToken]);
  useEffect(() => {
    const expired = () => { api.resetSession(); setUser(null); setBusinesses(undefined); setBusiness(undefined); };
    window.addEventListener("nexo:session-expired", expired);
    return () => window.removeEventListener("nexo:session-expired", expired);
  }, []);
  const loadBusinesses = useCallback(async () => {
    try {
      const rows = await api.request<Business[]>("/businesses");
      setBusinesses(rows);
      let saved = "";
      try { saved = sessionStorage.getItem(BUSINESS_KEY) || ""; } catch { /* sem armazenamento */ }
      setBusiness(current => rows.find(row => row.id === (current?.id || saved)) || (rows.length === 1 ? rows[0] : undefined));
    } catch (e) { setError(message(e)); }
  }, []);
  useEffect(() => { if (user) void loadBusinesses(); }, [user?.id, loadBusinesses]); // eslint-disable-line react-hooks/exhaustive-deps
  // An invitation opened while signed in is accepted right away and the business opens.
  useEffect(() => {
    if (!user || !invite || !inviteToken) return;
    let active = true;
    api.mutate<Business>("/invitations/" + encodeURIComponent(inviteToken) + "/accept", "POST")
      .then(joined => { if (active) { setInvite(undefined); window.history.replaceState(null, "", "/atendimentos"); pick(joined); void loadBusinesses(); } })
      .catch(e => { if (active) { setInviteError(message(e)); setInvite(undefined); } });
    return () => { active = false; };
  }, [user?.id, invite, inviteToken]); // eslint-disable-line react-hooks/exhaustive-deps
  function pick(next: Business | undefined) {
    setBusiness(next); setPage("agenda"); setCreating(false); setAccountOnly(false);
    try { if (next) sessionStorage.setItem(BUSINESS_KEY, next.id); else sessionStorage.removeItem(BUSINESS_KEY); } catch { /* sem armazenamento */ }
  }
  function onLogin(person: BookingUser) {
    api.resetSession(); setUser(person); setError("");
    if (complete) window.history.replaceState(null, "", "/atendimentos" + (inviteToken ? "?invite=" + encodeURIComponent(inviteToken) : ""));
  }
  function signOut() { api.resetSession(); setUser(null); setBusinesses(undefined); pick(undefined); }

  if (loading) return <main className="bk-page"><Busy /></main>;
  if (!user && error) return <main className="bk-page"><Feedback error={error} /><Button onClick={() => { setLoading(true); void refresh(); }}>Tentar de novo</Button></main>;
  if (!user) return <Auth api={api} complete={complete} invite={invite} onLogin={onLogin} />;
  if (accountOnly) return <main className="bk-page">
    <div className="bk-top"><a href="/" aria-label="Nexo, voltar ao site"><Brand /></a><Button variant="outline" size="sm" onClick={() => setAccountOnly(false)}>Voltar</Button></div>
    <Account api={api} user={user} onUpdate={setUser} onLoggedOut={signOut} />
  </main>;
  if (!business) return <main className="bk-page">
    <div className="bk-top"><a href="/" aria-label="Nexo, voltar ao site"><Brand /></a><Button variant="ghost" onClick={() => void api.mutate("/auth/logout", "POST").then(signOut, signOut)}><LogOut data-icon="inline-start" />Sair</Button></div>
    <div className="bk-hello">
      <Picture api={api} path="/auth/profile/photo" name={user.name} hasPhoto={user.has_photo} />
      <div><h1>Olá, {user.name.split(" ")[0]}</h1><p className="bk-muted">Escolha um negócio ou crie o seu.</p></div>
    </div>
    <Feedback error={error || inviteError} />
    {creating ? <BusinessForm api={api} onSaved={saved => { void loadBusinesses(); pick(saved); }} />
      : !businesses ? <Busy /> : <>
        {businesses.length === 0 && <Empty><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Você ainda não tem nenhum negócio</EmptyTitle><EmptyDescription>Crie o seu em um minuto: só o nome é obrigatório. Se alguém te convidou, abra o link do convite.</EmptyDescription></EmptyHeader></Empty>}
        <div className="bk-businesses">{businesses.map(row => <button type="button" className="bk-item" key={row.id} onClick={() => pick(row)}>
          <Picture api={api} path={"/businesses/" + row.id + "/photo"} name={row.name} hasPhoto={row.has_photo} className="size-12" />
          <div className="bk-item-body"><strong>{row.name}</strong><span>{[row.city, row.state].filter(Boolean).join(" / ") || row.phone || "Sem endereço"}</span></div>
          <Badge variant={row.my_role === "owner" ? "default" : "secondary"}>{ROLE_LABELS[row.my_role]}</Badge>
        </button>)}</div>
        <Button size="lg" onClick={() => setCreating(true)}><Plus data-icon="inline-start" />Criar negócio</Button>
      </>}
    {creating && <Button variant="outline" onClick={() => setCreating(false)}>Voltar</Button>}
    <Card><CardHeader><CardTitle>Minha conta</CardTitle><CardDescription>{user.email}</CardDescription></CardHeader><CardContent><Button variant="outline" size="sm" onClick={() => setAccountOnly(true)}><UserRound data-icon="inline-start" />Foto, dados e senha</Button></CardContent></Card>
  </main>;
  const current = PAGES.find(item => item.id === page) || PAGES[0];
  return <TooltipProvider delayDuration={200}><SidebarProvider className="bk-shell">
    <Sidebar collapsible="icon" className="bk-sidebar" aria-label="Menu do Atendimentos">
      <SidebarHeader>
        <a className="bk-brand" href="/" aria-label="Nexo, voltar ao site"><img src="/images/nexo-symbol-purple.png" alt="" width="28" height="28" decoding="async" /><span>Nexo <b>Atendimentos</b></span></a>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="bk-switcher" tooltip="Trocar de negócio" onClick={() => pick(undefined)}>
              <Picture api={api} path={"/businesses/" + business.id + "/photo"} name={business.name} hasPhoto={business.has_photo} className="size-8 rounded-lg" version={business.updated_at.length} />
              <div className="grid flex-1 text-left leading-tight"><span className="truncate font-semibold">{business.name}</span><span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[business.my_role]}{businesses && businesses.length > 1 ? " · " + businesses.length + " negócios" : ""}</span></div>
              <ArrowLeftRight className="ml-auto" aria-hidden="true" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Seções" className="flex flex-col gap-2">
          <SidebarGroup>
            <SidebarGroupLabel>Atendimento</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>
              {PAGES.filter(item => item.group === "work").map(item => <SidebarMenuItem key={item.id}>
                <SidebarMenuButton isActive={page === item.id} tooltip={item.label} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}><item.icon aria-hidden="true" /><span>{item.label}</span></SidebarMenuButton>
              </SidebarMenuItem>)}
            </SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Configurações</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>
              {PAGES.filter(item => item.group === "settings").map(item => <SidebarMenuItem key={item.id}>
                <SidebarMenuButton isActive={page === item.id} tooltip={item.label} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}><item.icon aria-hidden="true" /><span>{item.label}</span></SidebarMenuButton>
              </SidebarMenuItem>)}
            </SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Minha conta" onClick={() => setPage("account")}>
              <Picture api={api} path="/auth/profile/photo" name={user.name} hasPhoto={user.has_photo} className="size-8 rounded-lg" />
              <div className="grid flex-1 text-left leading-tight"><span className="truncate font-semibold">{user.name}</span><span className="truncate text-xs text-muted-foreground">{user.email}</span></div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sair" onClick={() => void api.mutate("/auth/logout", "POST").then(signOut, signOut)}><LogOut aria-hidden="true" /><span>Sair</span></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset className="bk-inset">
      <header className="bk-header">
        <SidebarTrigger aria-label="Abrir ou fechar o menu" />
        <Breadcrumb><BreadcrumbList>
          <BreadcrumbItem className="hidden sm:block">{business.name}</BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem><BreadcrumbPage>{current.label}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList></Breadcrumb>
      </header>
      <div className="bk-content" data-wide={page === "agenda" || undefined}>
        <Feedback error={error} />
        {page === "account" ? <Account api={api} user={user} onUpdate={setUser} onLoggedOut={signOut} />
          : page === "services" ? <Services api={api} business={business} />
          : page === "team" ? <Team api={api} business={business} me={user} onLeft={() => { pick(undefined); void loadBusinesses(); }} />
          : page === "business" ? (can.editBusiness(business.my_role)
            ? <BusinessForm api={api} business={business} canDelete={can.deleteBusiness(business.my_role)} onSaved={saved => { setBusiness(saved); void loadBusinesses(); }} onDeleted={() => { pick(undefined); void loadBusinesses(); }} />
            : <Card><CardContent className="flex flex-col gap-1 pt-4"><strong>{business.name}</strong>{business.address && <span>{business.address}</span>}{business.phone && <span>{business.phone}</span>}<span className="bk-muted">Só o dono ou um gerente altera estes dados.</span></CardContent></Card>)
          : <Agenda api={api} business={business} />}
      </div>
    </SidebarInset>
  </SidebarProvider></TooltipProvider>;
}
