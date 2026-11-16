import { useCallback, useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
const PAGES: { id: Page; label: string }[] = [
  { id: "agenda", label: "Agenda" }, { id: "services", label: "Serviços" }, { id: "team", label: "Equipe" },
  { id: "business", label: "Negócio" }, { id: "account", label: "Conta" },
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
    setBusiness(next); setPage("agenda"); setCreating(false);
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
  if (!business) return <main className="bk-page">
    <div className="bk-top"><a href="/" aria-label="Nexo, voltar ao site"><Brand /></a><Button variant="ghost" onClick={() => void api.mutate("/auth/logout", "POST").then(signOut, signOut)}>Sair</Button></div>
    <div><h1>Olá, {user.name.split(" ")[0]}</h1><p className="bk-muted">Escolha um negócio ou crie o seu.</p></div>
    <Feedback error={error || inviteError} />
    {creating ? <BusinessForm api={api} onSaved={saved => { void loadBusinesses(); pick(saved); }} />
      : !businesses ? <Busy /> : <>
        {businesses.length === 0 && <p className="bk-empty">Você ainda não tem nenhum negócio.</p>}
        <div className="bk-businesses">{businesses.map(row => <button type="button" className="bk-item bk-business" key={row.id} onClick={() => pick(row)}>
          <div className="bk-item-body"><strong>{row.name}</strong><span>{[row.city, row.state].filter(Boolean).join(" / ") || row.phone || "Sem endereço"}</span></div>
          <Badge variant={row.my_role === "owner" ? "default" : "secondary"}>{ROLE_LABELS[row.my_role]}</Badge>
        </button>)}</div>
        <Button size="lg" onClick={() => setCreating(true)}>Criar negócio</Button>
      </>}
    {creating && <Button variant="outline" onClick={() => setCreating(false)}>Voltar</Button>}
    <Card><CardContent className="flex flex-col gap-2 pt-4"><strong>Minha conta</strong><span className="bk-muted">{user.email}</span><Button variant="link" className="self-start" onClick={() => { setBusiness({ id: "", my_role: "viewer" } as Business); setPage("account"); }}>Editar dados e senha</Button></CardContent></Card>
  </main>;
  const accountOnly = !business.id;
  return <main className="bk-page">
    <div className="bk-top">
      <div className="bk-title"><strong>{accountOnly ? "Minha conta" : business.name}</strong>{!accountOnly && <small>{ROLE_LABELS[business.my_role]}{businesses && businesses.length > 1 ? " · " + businesses.length + " negócios" : ""}</small>}</div>
      <Button variant="outline" size="sm" onClick={() => pick(undefined)}>{accountOnly ? "Voltar" : "Trocar negócio"}</Button>
    </div>
    <Feedback error={error} />
    {!accountOnly && <nav className="bk-nav" aria-label="Seções">
      {PAGES.map(item => <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}>{item.label}</button>)}
    </nav>}
    {accountOnly || page === "account" ? <Account api={api} user={user} onUpdate={setUser} onLoggedOut={signOut} />
      : page === "services" ? <Services api={api} business={business} />
      : page === "team" ? <Team api={api} business={business} me={user} onLeft={() => { pick(undefined); void loadBusinesses(); }} />
      : page === "business" ? (can.editBusiness(business.my_role)
        ? <BusinessForm api={api} business={business} canDelete={can.deleteBusiness(business.my_role)} onSaved={saved => { setBusiness(saved); void loadBusinesses(); }} onDeleted={() => { pick(undefined); void loadBusinesses(); }} />
        : <Card><CardContent className="flex flex-col gap-1 pt-4"><strong>{business.name}</strong>{business.address && <span>{business.address}</span>}{business.phone && <span>{business.phone}</span>}<span className="bk-muted">Só o dono ou um gerente altera estes dados.</span></CardContent></Card>)
      : <Agenda api={api} business={business} />}
  </main>;
}
