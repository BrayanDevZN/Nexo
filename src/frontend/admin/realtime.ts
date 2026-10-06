import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type createApi, type User } from "./api";
export type ChatMessage = { id: string; sequence: number; sender_id: string; recipient_id: string; sender_name: string; client_id: string; kind: "text" | "image" | "audio"; text: string | null; media_type: string | null; size: number | null; created_at: string };
export type RealtimeEvent = { type: string; message?: ChatMessage; code?: string };
export function websocketUrl(value: string): string {
  const url = new URL(value, window.location.origin);
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("URL de tempo real inválida.");
  url.protocol = ["https:", "wss:"].includes(url.protocol) ? "wss:" : "ws:";
  return url.toString();
}
export function useRealtime(api: ReturnType<typeof createApi>, user: User | null, onEvent: (event: RealtimeEvent) => void) {
  const [status, setStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const socket = useRef<WebSocket | null>(null);
  const callback = useRef(onEvent); callback.current = onEvent;
  const pending = useRef(new Map<string, { resolve: (row: ChatMessage) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  useEffect(() => {
    if (!user) { setStatus("offline"); return; }
    let active = true; let retry = 0; let reconnect: ReturnType<typeof setTimeout>; let watchdog: ReturnType<typeof setTimeout>;
    function rejectPending() { for (const request of pending.current.values()) { clearTimeout(request.timer); request.reject(new Error("Conexão interrompida. Tente enviar novamente.")); } pending.current.clear(); }
    async function connect() {
      if (!active) return; setStatus("connecting");
      try {
        const { ticket } = await api.mutate<{ ticket: string }>("/realtime/ticket", "POST");
        if (!active) return;
        const configured = import.meta.env.VITE_WS_URL || (import.meta.env.PROD ? "wss://nexo-production-60a0.up.railway.app/realtime" : "/api/realtime");
        const ws = new WebSocket(websocketUrl(configured), ["nexo.v1", ticket]); socket.current = ws;
        function heartbeat() { clearTimeout(watchdog); watchdog = setTimeout(() => ws.close(), 40000); }
        heartbeat();
        ws.onmessage = event => {
          if (!active) return; heartbeat(); let value: RealtimeEvent;
          try { value = JSON.parse(event.data); } catch { return; }
          if (value.type === "ready") { retry = 0; setStatus("online"); }
          if (value.type === "chat.ack" && value.message) { const request = pending.current.get(value.message.client_id); if (request) { clearTimeout(request.timer); pending.current.delete(value.message.client_id); request.resolve(value.message); } }
          if (value.type === "error") rejectPending();
          callback.current(value);
        };
        ws.onclose = event => { clearTimeout(watchdog); if (!active) return; rejectPending(); if (socket.current === ws) socket.current = null; setStatus("offline"); if (event.code === 4401) { window.dispatchEvent(new Event("nexo:session-expired")); return; } if (event.code === 4403) return; reconnect = setTimeout(() => void connect(), Math.min(30000, 1000 * 2 ** retry++) + Math.random() * 500); };
        ws.onerror = () => ws.close();
      } catch (e) { if (!active) return; setStatus("offline"); if (e instanceof ApiError && [401, 403].includes(e.status)) return; reconnect = setTimeout(() => void connect(), Math.min(30000, 1000 * 2 ** retry++) + Math.random() * 500); }
    }
    void connect();
    return () => { active = false; clearTimeout(reconnect); clearTimeout(watchdog); socket.current?.close(); socket.current = null; rejectPending(); };
  }, [api, user?.id]);
  const send = useCallback((memberId: string, text: string, clientId: string): Promise<ChatMessage> => new Promise((resolve, reject) => {
    if (!socket.current || socket.current.readyState !== WebSocket.OPEN) { reject(new Error("O chat está reconectando. Aguarde para enviar.")); return; }
    const timer = setTimeout(() => { pending.current.delete(clientId); reject(new Error("Confirmação não recebida. Tente novamente; sua mensagem não será duplicada.")); }, 10000);
    pending.current.set(clientId, { resolve, reject, timer });
    socket.current.send(JSON.stringify({ type: "chat.send", member_id: memberId, client_id: clientId, text }));
  }), []);
  return { status, send };
}
