import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type createApi } from "./api";
import { MemberPhoto } from "./MemberPhoto";
import { Feedback, Loading, message } from "./shared";

export type DirectoryMember = { id: string; name: string; role: "member" | "admin"; has_photo: boolean };
export function Directory({ api }: { api: ReturnType<typeof createApi> }) {
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const serial = useRef(0);
  const load = useCallback(async () => {
    const current = ++serial.current; setLoading(true); setError("");
    try { const rows = await api.request<DirectoryMember[]>("/members?limit=20&offset=" + offset); if (current === serial.current) setMembers(rows); }
    catch (e) { if (current === serial.current) setError(message(e)); }
    finally { if (current === serial.current) setLoading(false); }
  }, [api, offset]);
  useEffect(() => { void load(); return () => { serial.current++; }; }, [load]);
  return <section className="flex flex-col gap-6" aria-labelledby="directory-title">
    <div className="admin-section-head"><div><span className="admin-eyebrow">NOSSA EQUIPE</span><h1 id="directory-title">Membros</h1><p>Conheça quem faz parte da Nexo.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw data-icon="inline-start" /> Atualizar equipe</Button></div>
    <Feedback error={error} />
    {loading ? <Loading /> : !members.length && !error ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Users /></EmptyMedia><EmptyTitle>Nenhum membro nesta página</EmptyTitle><EmptyDescription>Volte para a página anterior.</EmptyDescription></EmptyHeader></Empty> : <div className="admin-client-grid">{members.map(person => <Card key={person.id}>
      <CardHeader className="flex flex-row items-center gap-3"><MemberPhoto api={api} id={person.id} name={person.name} hasPhoto={person.has_photo} /><CardTitle>{person.name}</CardTitle></CardHeader><CardContent><Badge variant={person.role === "admin" ? "default" : "secondary"}>{person.role === "admin" ? "Administrador" : "Membro"}</Badge></CardContent>
    </Card>)}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {offset / 20 + 1}</p><div className="flex gap-2"><Button variant="outline" disabled={loading || !offset} onClick={() => setOffset(offset - 20)}>Anterior</Button><Button variant="outline" disabled={loading || members.length < 20} onClick={() => setOffset(offset + 20)}>Próxima</Button></div></div>
  </section>;
}
