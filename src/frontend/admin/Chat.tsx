import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MessageScroller } from "@shadcn/react/message-scroller";
import { ArrowLeft, ArrowDown, ImagePlus, Mic, Send, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Attachment, AttachmentMedia, AttachmentDescription } from "@/components/ui/attachment";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { type createApi, type User } from "./api";
import { type DirectoryMember } from "./Directory";
import { MemberPhoto } from "./MemberPhoto";
import { type ChatMessage, type useRealtime } from "./realtime";
import { Busy, Feedback, Field, FieldGroup, FieldLabel, Loading, message } from "./shared";
function merge(old: ChatMessage[], incoming: ChatMessage[]) { return [...new Map([...old, ...incoming].map(row => [row.id, row])).values()].sort((a, b) => a.sequence - b.sequence); }
function Media({ api, row }: { api: ReturnType<typeof createApi>; row: ChatMessage }) {
  const [url, setUrl] = useState(""); const [error, setError] = useState(false);
  useEffect(() => { let active = true; let objectUrl = ""; void api.file("/chat/media/" + row.id).then(blob => { if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => { if (active) setError(true); }); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [api, row.id]);
  return <Attachment state={error ? "error" : url ? "done" : "uploading"}><AttachmentMedia>{url ? row.kind === "image" ? <img src={url} alt={"Foto enviada por " + row.sender_name} className="max-h-72 max-w-full object-contain" /> : <audio src={url} controls preload="metadata" className="max-w-full" aria-label={"Áudio enviado por " + row.sender_name} /> : <AttachmentDescription>{error ? "Não foi possível carregar o arquivo." : "Carregando arquivo…"}</AttachmentDescription>}</AttachmentMedia></Attachment>;
}
export function Chat({ api, actor, realtime, initialMember, onSelect, onNotificationsRead }: { api: ReturnType<typeof createApi>; actor: User; realtime: ReturnType<typeof useRealtime>; initialMember?: string; onSelect: (id: string | null) => void; onNotificationsRead?: () => Promise<void> }) {
  const [members, setMembers] = useState<DirectoryMember[]>([]); const [membersLoading, setMembersLoading] = useState(true); const [selected, setSelected] = useState(initialMember || "");
  const [rows, setRows] = useState<ChatMessage[]>([]); const [text, setText] = useState(""); const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [hasOlder, setHasOlder] = useState(false); const [recording, setRecording] = useState(false); const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [unreadByMember, setUnreadByMember] = useState<Record<string, number>>({});
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({});
  const refreshConversationMeta = useCallback(async () => {
    try {
      const [counts, activity] = await Promise.all([
        api.request<{ chat_by_sender?: Record<string, number> }>("/notifications/unread-count"),
        api.request<{ member_id: string; last_message_at: string }[]>("/chat/conversations"),
      ]);
      setUnreadByMember(counts.chat_by_sender || {});
      setLastActivity(Object.fromEntries(activity.map(row => [row.member_id, row.last_message_at])));
    } catch { /* Keep conversations usable while metadata refreshes. */ }
  }, [api]);
  useEffect(() => {
    void refreshConversationMeta();
    const event = (value: Event) => {
      const type = (value as CustomEvent).detail.type;
      if (type === "ready" || type === "notifications.changed") void refreshConversationMeta();
    };
    window.addEventListener("nexo:realtime", event);
    return () => window.removeEventListener("nexo:realtime", event);
  }, [refreshConversationMeta]);
  const active = useRef(true);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const recordingClock = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const serial = useRef(0); const attempt = useRef({ member: "", text: "", id: "" }); const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null); const photo = useRef<HTMLInputElement>(null); const audio = useRef<HTMLInputElement>(null);
  useEffect(() => { let active = true; setMembersLoading(true); void (async () => { const all: DirectoryMember[] = []; for (let offset = 0; active; offset += 100) { const page = await api.request<DirectoryMember[]>("/members?limit=100&offset=" + offset); all.push(...page); if (page.length < 100) break; } if (active) setMembers(all.filter(row => row.id !== actor.id)); })().catch(e => { if (active) setError(message(e)); }).finally(() => { if (active) setMembersLoading(false); }); return () => { active = false; }; }, [api, actor.id]);
  const load = useCallback(async (older = false, reset = false) => {
    if (!selected) return; const current = ++serial.current; setLoading(true); setError("");
    try { const params = new URLSearchParams({ limit: "50" }); if (older && rows.length) params.set("before", String(rows[0].sequence)); const history = await api.request<ChatMessage[]>("/chat/" + selected + "/messages?" + params); if (current === serial.current) { setRows(old => reset ? history : merge(old, history)); if (older || reset || !rows.length) setHasOlder(history.length === 50); if (!older) { try { await api.mutate("/notifications/chat/" + selected + "/read", "PATCH"); setUnreadByMember(old => ({ ...old, [selected]: 0 })); await onNotificationsRead?.(); } catch { /* keep the conversation available if its read marker fails */ } } } }
    catch (e) { if (current === serial.current) setError(message(e)); } finally { if (current === serial.current) setLoading(false); }
  }, [api, selected, rows, onNotificationsRead]);
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => { onSelect(selected); return () => onSelect(null); }, [selected, onSelect]);
  useEffect(() => { setRows([]); setText(""); setHasOlder(false); setError(""); void loadRef.current(); return () => { serial.current++; }; }, [selected]);
  useEffect(() => { const event = (event: Event) => { const value = (event as CustomEvent).detail; if (value.type === "ready") void loadRef.current(false, true); if (value.type === "presence.changed" && value.user_id) setMembers(old => old.map(member => member.id === value.user_id ? { ...member, online: value.online } : member)); const row: ChatMessage | undefined = value.message; if (row) { const peer = row.sender_id === actor.id ? row.recipient_id : row.sender_id; setLastActivity(old => ({ ...old, [peer]: row.created_at })); if (row.sender_id !== actor.id && row.recipient_id === actor.id && selected !== row.sender_id) setUnreadByMember(old => ({ ...old, [row.sender_id]: (old[row.sender_id] || 0) + 1 })); } if (row && ((row.sender_id === actor.id && row.recipient_id === selected) || (row.sender_id === selected && row.recipient_id === actor.id))) { setRows(old => merge(old, [row])); if (row.sender_id === selected && row.recipient_id === actor.id) void api.mutate("/notifications/chat/" + selected + "/read", "PATCH").then(() => { setUnreadByMember(old => ({ ...old, [selected]: 0 })); return onNotificationsRead?.(); }).catch(() => {}); } }; window.addEventListener("nexo:realtime", event); return () => window.removeEventListener("nexo:realtime", event); }, [actor.id, selected, api, onNotificationsRead]);
  useEffect(() => { active.current = true; return () => { active.current = false; clearTimeout(recordingTimer.current); clearInterval(recordingClock.current); if (recorder.current?.state === "recording") { recorder.current.onstop = null; recorder.current.stop(); } stream.current?.getTracks().forEach(track => track.stop()); }; }, []);
  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (text.trim() && !busy && realtime.status === "online") void send(event);
    }
  }
  async function send(event: FormEvent | React.KeyboardEvent<HTMLTextAreaElement>) {
    event.preventDefault(); if (!selected || !text.trim() || busy) return;
    if (!attempt.current.id || attempt.current.member !== selected || attempt.current.text !== text) attempt.current = { member: selected, text, id: crypto.randomUUID() };
    setBusy(true); setError(""); try { const row = await realtime.send(selected, text, attempt.current.id); setRows(old => merge(old, [row])); setText(""); attempt.current.id = ""; } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function upload(file: File | Blob, kind: "image" | "audio", target = selected) {
    if (!target) return; setBusy(true); setError(""); try { const body = new FormData(); body.set("file", file, kind === "image" ? "foto" : "audio"); body.set("kind", kind); body.set("client_id", crypto.randomUUID()); const row = await api.mutate<ChatMessage>("/chat/" + target + "/media", "POST", body); if (target === selected) setRows(old => merge(old, [row])); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function record() {
    if (recording) { recorder.current?.stop(); setRecording(false); clearInterval(recordingClock.current); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError("Este navegador não permite gravar. Use Enviar áudio para escolher um arquivo."); return; }
    setBusy(true);
    try { const captured = await navigator.mediaDevices.getUserMedia({ audio: true }); if (!active.current) { captured.getTracks().forEach(track => track.stop()); return; } stream.current = captured; const mimeType = ["audio/webm", "audio/ogg", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type)); const device = new MediaRecorder(captured, mimeType ? { mimeType } : undefined); recorder.current = device; const chunks: BlobPart[] = []; const target = selected; let size = 0;
      device.ondataavailable = event => { chunks.push(event.data); size += event.data.size; if (size > 10 * 1024 * 1024 && device.state === "recording") device.stop(); };
      device.onstop = () => { clearTimeout(recordingTimer.current); clearInterval(recordingClock.current); captured.getTracks().forEach(track => track.stop()); setRecording(false); setRecordingSeconds(0); void upload(new Blob(chunks, { type: device.mimeType }), "audio", target); };
      device.start(1000); setRecordingSeconds(0); recordingClock.current = setInterval(() => setRecordingSeconds(seconds => seconds + 1), 1000); recordingTimer.current = setTimeout(() => { if (device.state === "recording") device.stop(); }, 120000); setRecording(true); setError("");
    } catch { stream.current?.getTracks().forEach(track => track.stop()); setError("Não foi possível acessar o microfone. Autorize no navegador ou envie um arquivo de áudio."); } finally { if (active.current) setBusy(false); }
  }
  const orderedMembers = [...members].sort((a, b) =>
    (lastActivity[b.id] || "").localeCompare(lastActivity[a.id] || ""));
  const person = members.find(row => row.id === selected);
  return <section className="flex min-w-0 flex-col gap-6" aria-labelledby="chat-title"><div className="admin-section-head"><div><span className="admin-eyebrow">CONVERSAS DA EQUIPE</span><h1 id="chat-title">Chat</h1><p>Converse com os membros e compartilhe fotos e áudios.</p></div><Badge variant={realtime.status === "online" ? "default" : "secondary"}>{realtime.status === "online" ? "Conectado" : realtime.status === "connecting" ? "Conectando…" : "Reconectando…"}</Badge></div><Feedback error={error} />
    <div className="grid h-[calc(100dvh-11rem)] min-h-[30rem] min-w-0 items-stretch gap-6 md:h-[calc(100dvh-13rem)] md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <Card className={cn("flex h-full min-h-0 min-w-0 flex-col", selected && "hidden md:flex")}>
        <CardHeader><CardTitle>Membros</CardTitle><CardDescription>Clique em alguém para abrir a conversa.</CardDescription></CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          {membersLoading ? <Loading /> : members.length ? <nav aria-label="Membros para conversar" className="flex flex-col gap-2">
            {orderedMembers.map(member => <Button key={member.id} type="button" variant={selected === member.id ? "secondary" : "ghost"} className="h-auto min-h-16 w-full justify-start gap-3 py-3" disabled={busy || recording} aria-label={"Conversar com " + member.name} aria-current={selected === member.id ? "true" : undefined} onClick={() => setSelected(member.id)}>
              <MemberPhoto api={api} id={member.id} name={member.name} hasPhoto={member.has_photo} />{(unreadByMember[member.id] || 0) > 0 && <Badge aria-label={unreadByMember[member.id] + " mensagens novas"}>{unreadByMember[member.id]}</Badge>}<span className="min-w-0 flex-1 truncate text-left">{member.name}</span><Badge variant={member.online ? "default" : "outline"}>{member.online ? "Online" : "Offline"}</Badge>
            </Button>)}
          </nav> : <Empty><EmptyHeader><EmptyTitle>Nenhum membro disponível</EmptyTitle><EmptyDescription>Os outros membros aprovados aparecem aqui.</EmptyDescription></EmptyHeader></Empty>}
        </CardContent>
      </Card>
      {selected ? <Card className="flex h-full min-h-0 min-w-0 flex-col"><CardHeader className="shrink-0">
        <Button type="button" variant="ghost" className="w-fit md:hidden" disabled={busy || recording} aria-label="Voltar aos membros" onClick={() => setSelected("")}><ArrowLeft data-icon="inline-start" /> Membros</Button>
        <div className="flex items-center gap-3">{person && <MemberPhoto api={api} id={person.id} name={person.name} hasPhoto={person.has_photo} />}<div className="min-w-0"><CardTitle className="truncate">{person?.name || "Conversa"}</CardTitle><CardDescription>{person?.online ? "Online agora" : "Offline"}</CardDescription></div></div>
      </CardHeader><CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 md:min-h-0">
      <MessageScroller.Provider key={selected} autoScroll defaultScrollPosition="end"><MessageScroller.Root className="relative flex min-h-0 flex-1 flex-col"><MessageScroller.Viewport className="min-h-0 flex-1 overflow-y-auto" aria-label="Histórico da conversa"><MessageScroller.Content className="flex flex-col gap-4 py-2 pr-2">
        {hasOlder && <Button variant="outline" disabled={loading} onClick={() => void load(true)}>Carregar mensagens anteriores</Button>}{loading && !rows.length ? <Loading /> : !rows.length ? <Empty><EmptyHeader><EmptyTitle>A conversa começa aqui</EmptyTitle><EmptyDescription>Envie a primeira mensagem.</EmptyDescription></EmptyHeader></Empty> : rows.map(row => <MessageScroller.Item key={row.id} messageId={row.id}><Message align={row.sender_id === actor.id ? "end" : "start"}><MessageContent className="max-w-[85%]">{row.kind === "text" ? <Bubble variant={row.sender_id === actor.id ? "default" : "muted"}><BubbleContent>{row.text}</BubbleContent></Bubble> : <Media api={api} row={row} />}<MessageFooter>{row.sender_name} · {new Date(row.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</MessageFooter></MessageContent></Message></MessageScroller.Item>)}
      </MessageScroller.Content></MessageScroller.Viewport><MessageScroller.Button render={<Button variant="outline" size="icon" className="absolute right-4 bottom-4" aria-label="Ir para última mensagem" />}><ArrowDown /></MessageScroller.Button></MessageScroller.Root></MessageScroller.Provider>
      <form onSubmit={send} className="shrink-0 rounded-xl border bg-card p-2 shadow-sm">
        {!recording && <FieldGroup><Field><FieldLabel className="sr-only" htmlFor="chat-text">Mensagem</FieldLabel><Textarea id="chat-text" className="min-h-12 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" value={text} onChange={event => setText(event.target.value)} onKeyDown={onComposerKeyDown} maxLength={4000} disabled={busy} placeholder="Escreva uma mensagem…" /></Field></FieldGroup>}
        {recording ? <div className="flex items-center gap-3 rounded-xl border bg-muted/50 px-3 py-2" role="status" aria-label="Gravando áudio"><span className="size-2.5 shrink-0 animate-pulse rounded-full bg-destructive" /><span className="min-w-0 flex-1 text-sm font-medium">Gravando áudio <span className="font-mono text-muted-foreground">{String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}</span></span><Button type="button" variant="destructive" size="sm" onClick={() => void record()}><Square data-icon="inline-start" /> Parar e enviar</Button></div> : <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" disabled={busy || !text.trim() || realtime.status !== "online"}>{busy ? <Busy /> : <><Send data-icon="inline-start" /> Enviar</>}</Button><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => photo.current?.click()}><ImagePlus data-icon="inline-start" /> Foto</Button><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => audio.current?.click()}><Mic data-icon="inline-start" /> Áudio</Button><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void record()}><Timer data-icon="inline-start" /> Gravar áudio</Button></div>} <input ref={photo} aria-label="Escolher foto para conversa" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file, "image"); }} /><input ref={audio} aria-label="Escolher áudio para conversa" type="file" accept="audio/webm,audio/ogg,audio/wav,audio/mpeg,audio/mp4" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file, "audio"); }} /></form>
    </CardContent></Card> : <Empty className="hidden md:flex"><EmptyHeader><EmptyTitle>Escolha alguém da equipe</EmptyTitle><EmptyDescription>Suas conversas ficam salvas e disponíveis quando você voltar.</EmptyDescription></EmptyHeader></Empty>}
    </div>
  </section>;
}
