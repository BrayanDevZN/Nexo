import { useCallback, useEffect, useRef, useState } from "react";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import { ArrowLeftRight, Building2, CalendarDays, ChevronRight, LogOut, Plus, Scissors, Settings2, TrendingUp, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useNTransition } from "./NTransition";
import { Agenda } from "./Agenda";
import { Auth } from "./Auth";
import { BusinessForm } from "./BusinessForm";
import { Performance } from "./Performance";
import { AccessGate } from "./AccessGate";
import { LiveBar, LiveToast, type Flash } from "./LiveBar";
import { useBusinessEvents, type AppointmentEvent } from "./realtime";
import { showBookingNotification } from "./notifications";
import { Services } from "./Services";
import { Team } from "./Team";
import { can, createBookingApi, ROLE_LABELS, type AccessInfo, type BookingUser, type Business, type InvitationInfo } from "./api";

const api = createBookingApi();
type Page = "agenda" | "services" | "team" | "performance" | "business" | "account";
const PAGES: { id: Page; label: string; icon: typeof CalendarDays; group: "work" | "settings" }[] = [
  { id: "agenda", label: "Agenda", icon: CalendarDays, group: "work" }, { id: "services", label: "Serviços", icon: Scissors, group: "work" }, { id: "team", label: "Equipe", icon: Users, group: "work" },
  { id: "performance", label: "Desempenho", icon: TrendingUp, group: "work" },
  { id: "business", label: "Negócio", icon: Settings2, group: "settings" }, { id: "account", label: "Conta", icon: UserRound, group: "settings" },
];
const BUSINESS_KEY = "nexo:atendimentos:business";
const INVITE_KEY = "nexo:atendimentos:invite";
const ACCESS_KEY = "nexo:atendimentos:access";
/** The platform access link (/atendimentos?access=...) is kept the same way while the person signs up or goes through Google. */
const storedAccess = {
  read() { try { return localStorage.getItem(ACCESS_KEY) || ""; } catch { return ""; } },
  write(token: string) { try { localStorage.setItem(ACCESS_KEY, token); } catch { /* sem armazenamento */ } },
  clear() { try { localStorage.removeItem(ACCESS_KEY); } catch { /* sem armazenamento */ } },
};
/** The invitation token is kept while the person signs in, creates an account or goes through Google and comes back. */
const storedInvite = {
  read() { try { return localStorage.getItem(INVITE_KEY) || ""; } catch { return ""; } },
  write(token: string) { try { localStorage.setItem(INVITE_KEY, token); } catch { /* sem armazenamento */ } },
  clear() { try { localStorage.removeItem(INVITE_KEY); } catch { /* sem armazenamento */ } },
};

/** Nexo Atendimentos at /atendimentos: sign in, pick a business, work in it. No effects, just screens. */
type Play = (change: () => void, quick?: boolean) => void;

/** The N transition lives above every screen, so it survives the swap between sign-in and the app. */
export default function BookingApp() {
  const { play, overlay } = useNTransition();
  return <>{overlay}<BookingScreens play={play} /></>;
}

function BookingScreens({ play }: { play: Play }) {
  const [user, setUser] = useState<BookingUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>();
  const [business, setBusiness] = useState<Business>();
  const [creating, setCreating] = useState(false);
  const [accountOnly, setAccountOnly] = useState(false);
  const [page, setPage] = useState<Page>("agenda");
  const [liveTick, setLiveTick] = useState(0);
  const [flash, setFlash] = useState<Flash>();
  const [inviteToken, setInviteToken] = useState(() => { const fromUrl = new URLSearchParams(window.location.search).get("invite") || ""; if (fromUrl) storedInvite.write(fromUrl); return fromUrl || storedInvite.read(); });
  const [accessToken, setAccessToken] = useState(() => { const fromUrl = new URLSearchParams(window.location.search).get("access") || ""; if (fromUrl) storedAccess.write(fromUrl); return fromUrl || storedAccess.read(); });
  const [access, setAccess] = useState<AccessInfo>();
  const [invite, setInvite] = useState<InvitationInfo>();
  const [inviteError, setInviteError] = useState("");
  const complete = window.location.pathname.replace(/\/$/, "") === "/atendimentos/completar-perfil";
  const userRef = useRef<BookingUser | null>(null);
  userRef.current = user;
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
      .catch(() => { if (active) { setInviteError("Este convite não existe mais ou já venceu."); storedInvite.clear(); setInviteToken(""); } });
    return () => { active = false; };
  }, [inviteToken]);
  // The access link: what it grants is shown before signing up; a signed-in account that is waiting (or ended) redeems it at once.
  useEffect(() => {
    if (!accessToken || user) return;
    let active = true;
    api.request<AccessInfo>("/access/" + encodeURIComponent(accessToken))
      .then(info => { if (active) setAccess(info); })
      .catch(() => { if (active) { storedAccess.clear(); setAccessToken(""); setInviteError("Este link de acesso não existe mais ou já foi usado."); } });
    return () => { active = false; };
  }, [accessToken, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user || !accessToken) return;
    if (user.access_status === "approved" && !user.access_expires_at) { storedAccess.clear(); setAccessToken(""); return; }
    let active = true;
    api.mutate<BookingUser>("/access/redeem", "POST", { token: accessToken })
      .then(person => { if (active) { setUser(person); window.history.replaceState(null, "", "/atendimentos"); } })
      .catch(() => undefined)
      .finally(() => { if (active) { storedAccess.clear(); setAccessToken(""); } });
    return () => { active = false; };
  }, [user?.id, user?.access_status, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
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
  useEffect(() => { if (user?.access_status === "approved") void loadBusinesses(); }, [user?.id, user?.access_status, loadBusinesses]); // eslint-disable-line react-hooks/exhaustive-deps
  // The permission can end while the app is open: read the account again exactly then.
  useEffect(() => {
    if (user?.access_status !== "approved" || !user.access_expires_at) return;
    const at = new Date(user.access_expires_at.endsWith("Z") ? user.access_expires_at : user.access_expires_at + "Z").getTime();
    const wait = Math.min(at - Date.now() + 500, 2 ** 31 - 1);
    const timer = setTimeout(() => void refresh(), Math.max(wait, 0));
    return () => clearTimeout(timer);
  }, [user?.access_status, user?.access_expires_at, refresh]);
  // A permission granted while waiting is announced once.
  const lastStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastStatus.current && lastStatus.current !== "approved" && user?.access_status === "approved") setFlash({ id: Date.now(), title: "Acesso liberado", text: "A equipe da Nexo liberou o seu acesso ao Atendimentos." });
    lastStatus.current = user?.access_status;
  }, [user?.access_status]);
  // An invitation opened while signed in is accepted right away and the business opens.
  useEffect(() => {
    if (!user || !invite || !inviteToken) return;
    let active = true;
    api.mutate<Business>("/invitations/" + encodeURIComponent(inviteToken) + "/accept", "POST")
      .then(joined => { if (active) { storedInvite.clear(); setInviteToken(""); setInvite(undefined); window.history.replaceState(null, "", "/atendimentos"); void refresh(); pick(joined); void loadBusinesses(); } })
      .catch(e => { if (active) { storedInvite.clear(); setInviteToken(""); setInviteError(message(e)); setInvite(undefined); } });
    return () => { active = false; };
  }, [user?.id, invite, inviteToken]); // eslint-disable-line react-hooks/exhaustive-deps
  // Appointments arrive in real time: anyone's change in the open business reloads the screens that show them.
  const onLive = useCallback((event: AppointmentEvent) => {
    api.invalidate();   // the client keeps GET answers for a moment; a live change must be read fresh
    setLiveTick(tick => tick + 1);
    if (event.by_id && event.by_id === userRef.current?.id) return;   // your own change is already on screen
    const when = new Date(event.starts_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
    const who = event.by_name || "Alguém";
    const text = event.action === "created" ? `${who} marcou ${event.customer_name} · ${when}`
      : event.action === "deleted" ? `${who} apagou o horário de ${event.customer_name}` : `${who} alterou o horário de ${event.customer_name} · ${when}`;
    setFlash({ id: Date.now(), title: event.business_name, text });
    if (event.action === "created" && document.hidden) void showBookingNotification(event.business_name, text, "appointment-" + event.appointment_id);
  }, []);
  const allowed = user?.access_status === "approved";
  const online = useBusinessEvents(api, !!user, allowed && business ? business.id : undefined, onLive,
    () => { api.invalidate(); setLiveTick(tick => tick + 1); }, () => { api.invalidate(); void refresh(); });
  function pick(next: Business | undefined) {
    setBusiness(next); setPage("agenda"); setCreating(false); setAccountOnly(false);
    try { if (next) sessionStorage.setItem(BUSINESS_KEY, next.id); else sessionStorage.removeItem(BUSINESS_KEY); } catch { /* sem armazenamento */ }
  }
  function onLogin(person: BookingUser) {
    // The N assembles and dissolves; the signed-in screen appears under it.
    play(() => { api.resetSession(); setUser(person); setError(""); });
    if (complete) window.history.replaceState(null, "", "/atendimentos" + (inviteToken ? "?invite=" + encodeURIComponent(inviteToken) : ""));
  }
  function signOut() { api.resetSession(); setUser(null); setBusinesses(undefined); pick(undefined); }

  if (loading) return <main className="bk-page"><Busy /></main>;
  if (!user && error) return <main className="bk-page"><Feedback error={error} /><Button onClick={() => { setLoading(true); void refresh(); }}>Tentar de novo</Button></main>;
  if (!user) return <Auth api={api} complete={complete} invite={invite} access={access} accessToken={accessToken} accessNote={inviteError} onLogin={onLogin} />;
  if (user.access_status !== "approved" && !invite) return <AccessGate user={user} online={online} onSignOut={() => void api.mutate("/auth/logout", "POST").then(signOut, signOut)} />;
  if (accountOnly) return <main className="bk-picker">
    <div className="bk-picker-bar"><a href="/" aria-label="Nexo, voltar ao site"><img src="/images/nexo-symbol-purple.png" alt="" width="28" height="28" />Nexo Atendimentos</a><Button variant="outline" size="sm" onClick={() => setAccountOnly(false)}>Voltar</Button></div>
    <div className="bk-picker-sheet"><Account api={api} user={user} onUpdate={setUser} onLoggedOut={signOut} /></div>
  </main>;
  if (!business) return <main className="bk-picker bk-fade" key={creating ? "new" : "list"}>
    <div className="bk-picker-bar"><a href="/" aria-label="Nexo, voltar ao site"><img src="/images/nexo-symbol-purple.png" alt="" width="28" height="28" />Nexo Atendimentos</a><Button variant="ghost" size="sm" onClick={() => void api.mutate("/auth/logout", "POST").then(signOut, signOut)}><LogOut data-icon="inline-start" />Sair</Button></div>
    <div className="bk-picker-sheet">
      <div className="bk-hello">
        <Picture api={api} path="/auth/profile/photo" name={user.name} hasPhoto={user.has_photo} />
        <div><h1>Olá, {user.name.split(" ")[0]}</h1><p className="bk-muted">{creating ? "Conte o básico do seu negócio. Só o nome é obrigatório." : businesses && businesses.length > 0 ? "Escolha o negócio que você quer abrir." : "Crie o seu primeiro negócio para começar."}</p></div>
      </div>
      <Feedback error={error || inviteError} />
      {creating ? <BusinessForm api={api} onSaved={saved => { void loadBusinesses(); pick(saved); }} />
        : !businesses ? <Busy /> : <>
          {businesses.length === 0 && <Empty><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Você ainda não tem nenhum negócio</EmptyTitle><EmptyDescription>Crie o seu em um minuto: só o nome é obrigatório. Se alguém te convidou, abra o link do convite.</EmptyDescription></EmptyHeader></Empty>}
          {businesses.length > 0 && <div className="bk-businesses">{businesses.map(row => <button type="button" className="bk-item" key={row.id} onClick={() => play(() => pick(row))}>
            <Picture api={api} path={"/businesses/" + row.id + "/photo"} name={row.name} hasPhoto={row.has_photo} className="size-10" />
            <div className="bk-item-body"><strong>{row.name}</strong><span>{[row.city, row.state].filter(Boolean).join(" / ") || row.phone || "Sem endereço"}</span></div>
            <span className="bk-role" data-owner={row.my_role === "owner" || undefined}>{ROLE_LABELS[row.my_role]}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>)}</div>}
          <Button size="lg" variant={businesses.length ? "outline" : "default"} onClick={() => setCreating(true)}><Plus data-icon="inline-start" />Criar negócio</Button>
        </>}
      {creating && <Button variant="outline" onClick={() => setCreating(false)}>Voltar</Button>}
      <div className="bk-account-row"><div><strong>{user.name}</strong><span className="bk-muted">{user.email}</span></div><Button variant="outline" size="sm" onClick={() => setAccountOnly(true)}><UserRound data-icon="inline-start" />Foto, dados e senha</Button></div>
    </div>
  </main>;
  const current = PAGES.find(item => item.id === page) || PAGES[0];
  return <TooltipProvider delayDuration={200}><SidebarProvider className="bk-shell">
    <Sidebar variant="inset" collapsible="icon" className="bk-sidebar" aria-label="Menu do Atendimentos">
      <SidebarHeader>
        <a className="bk-brand" href="/" aria-label="Nexo, voltar ao site"><img src="/images/nexo-symbol-purple.png" alt="" width="28" height="28" decoding="async" /><span>Nexo <b>Atendimentos</b></span></a>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="bk-switcher" tooltip="Trocar de negócio" onClick={() => play(() => pick(undefined))}>
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
        <LiveBar api={api} online={online} />
      </header>
      <LiveToast flash={flash} onClose={() => setFlash(undefined)} />
      <div className="bk-sheet"><div className="bk-content" data-wide={page === "agenda" || undefined}>
        <Feedback error={error} />
        <div key={page + ":" + business.id} className="bk-fade">
        {page === "account" ? <Account api={api} user={user} onUpdate={setUser} onLoggedOut={signOut} />
          : page === "services" ? <Services api={api} business={business} />
          : page === "performance" ? <Performance api={api} business={business} liveTick={liveTick} />
          : page === "team" ? <Team api={api} business={business} me={user} onLeft={() => { pick(undefined); void loadBusinesses(); }} />
          : page === "business" ? (can.editBusiness(business.my_role)
            ? <BusinessForm api={api} business={business} canDelete={can.deleteBusiness(business.my_role)} onSaved={saved => { setBusiness(saved); void loadBusinesses(); }} onDeleted={() => { pick(undefined); void loadBusinesses(); }} />
            : <Card><CardContent className="flex flex-col gap-1 pt-4"><strong>{business.name}</strong>{business.address && <span>{business.address}</span>}{business.phone && <span>{business.phone}</span>}<span className="bk-muted">Só o dono ou um gerente altera estes dados.</span></CardContent></Card>)
          : <Agenda api={api} business={business} liveTick={liveTick} />}
        </div>
      </div></div>
    </SidebarInset>
  </SidebarProvider></TooltipProvider>;
}
