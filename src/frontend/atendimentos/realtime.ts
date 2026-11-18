import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/admin/api";
import { websocketUrl } from "@/admin/realtime";
import type { BookingApi } from "./api";

export type AppointmentEvent = {
  type: "appointment.changed"; action: "created" | "updated" | "deleted"; business_id: string; appointment_id: string;
  customer_name: string; service_name: string; starts_at: string; status: string | null; by_id: string | null; by_name: string | null; business_name: string;
};
type Message = AppointmentEvent | { type: "ready" | "heartbeat" | "error" };

/** The socket of the Atendimentos sockets sits next to the panel's: the same host, its own path. */
function socketAddress() {
  const configured = import.meta.env.VITE_WS_URL || (import.meta.env.PROD ? "wss://nexo-production-60a0.up.railway.app/realtime" : "/api/realtime");
  return websocketUrl(configured.replace(/\/realtime\/?$/, "/atendimentos/realtime"));
}

/**
 * Keeps one socket open for the business on screen and calls `onEvent` for each appointment that anyone creates, changes or
 * removes. A one-time ticket opens it; it reconnects by itself with a growing pause and gives up when the session is gone.
 */
export function useBusinessEvents(api: BookingApi, businessId: string | undefined, onEvent: (event: AppointmentEvent) => void, onResync?: () => void) {
  const [online, setOnline] = useState(false);
  const callback = useRef(onEvent);
  callback.current = onEvent;
  const resync = useRef(onResync);
  resync.current = onResync;
  useEffect(() => {
    if (!businessId) { setOnline(false); return; }
    let active = true; let retry = 0; let opened = false; let reconnect: ReturnType<typeof setTimeout>; let watchdog: ReturnType<typeof setTimeout>; let socket: WebSocket | undefined;
    const later = () => { reconnect = setTimeout(() => void connect(), Math.min(30000, 1000 * 2 ** retry++) + Math.random() * 500); };
    async function connect() {
      if (!active) return;
      try {
        const { ticket } = await api.mutate<{ ticket: string }>("/realtime/ticket?business_id=" + encodeURIComponent(businessId!), "POST");
        if (!active) return;
        const ws = new WebSocket(socketAddress(), ["nexo.v1", ticket]);
        socket = ws;
        const beat = () => { clearTimeout(watchdog); watchdog = setTimeout(() => ws.close(), 40000); };
        beat();
        ws.onmessage = event => {
          if (!active) return;
          beat();
          let value: Message;
          try { value = JSON.parse(event.data); } catch { return; }
          if (value.type === "ready") { retry = 0; setOnline(true); if (opened) resync.current?.(); opened = true; }
          if (value.type === "appointment.changed" && value.business_id === businessId) callback.current(value);
        };
        ws.onclose = event => {
          clearTimeout(watchdog);
          if (!active) return;
          setOnline(false);
          if (event.code === 4401) { window.dispatchEvent(new Event("nexo:session-expired")); return; }
          if (event.code === 4403) return;
          later();
        };
        ws.onerror = () => ws.close();
      } catch (e) {
        if (!active) return;
        setOnline(false);
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) return;
        later();
      }
    }
    void connect();
    // After a reconnection the pause may have cost events, so the screen is asked to reload once (onResync).
    return () => { active = false; clearTimeout(reconnect); clearTimeout(watchdog); socket?.close(); setOnline(false); };
  }, [api, businessId]);
  return online;
}
