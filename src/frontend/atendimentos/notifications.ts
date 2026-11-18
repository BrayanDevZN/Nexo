import type { BookingApi } from "./api";

const KEY = "nexo:atendimentos:notify";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}
const pushSupported = () => notificationsSupported() && "PushManager" in window;
const iosNeedsInstall = () => typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  && !(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

export const readPreference = (): boolean => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } };
const writePreference = (on: boolean) => { try { if (on) localStorage.setItem(KEY, "on"); else localStorage.removeItem(KEY); } catch { /* sem armazenamento */ } };

export type NotificationState = "unsupported" | "blocked" | "off" | "on";
export function notificationState(): NotificationState {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && readPreference() ? "on" : "off";
}

function key(value: string): Uint8Array<ArrayBuffer> {
  const raw = window.atob((value + "=".repeat((4 - value.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
async function worker() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}
function body(subscription: PushSubscription) {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error("O navegador não forneceu uma inscrição de notificações válida.");
  return { endpoint: subscription.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** Asks for permission and, when the server has Web Push, subscribes too, so bookings arrive even with the app closed. */
export async function enableNotifications(api: BookingApi): Promise<"push" | "open-app"> {
  if (!notificationsSupported()) throw new Error("Este navegador não oferece suporte a notificações.");
  if (iosNeedsInstall()) throw new Error("No iPhone, adicione o Atendimentos à Tela de Início e abra o app instalado para ativar as notificações.");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error(permission === "denied" ? "As notificações estão bloqueadas nas permissões deste navegador. Libere-as nas configurações do site e tente de novo." : "A permissão para notificações não foi concedida.");
  writePreference(true);
  if (!pushSupported()) return "open-app";
  try {
    const registration = await worker();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const { public_key } = await api.request<{ public_key: string }>("/push/public-key");
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(public_key) });
    }
    await api.mutate("/push/subscribe", "POST", body(subscription));
    return "push";
  } catch {
    // The server without Web Push (or a browser that refuses it) still gets notifications while the app is open.
    return "open-app";
  }
}

export async function disableNotifications(api: BookingApi): Promise<void> {
  writePreference(false);
  if (!pushSupported()) return;
  try {
    const registration = await worker();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    try { await api.mutate("/push/subscribe", "DELETE", { endpoint: subscription.endpoint }); } finally { await subscription.unsubscribe(); }
  } catch { /* nada a desfazer */ }
}

/** A notification from the open app, titled with the business. The same tag as the server's push, so one booking never shows twice. */
export async function showBookingNotification(title: string, text: string, tag: string): Promise<void> {
  if (notificationState() !== "on") return;
  try {
    const registration = await worker();
    await registration.showNotification(title, { body: text, tag, icon: "/images/nexo-symbol-purple.png", badge: "/images/nexo-symbol-purple.png", data: { url: "/atendimentos" } });
  } catch { /* o aviso na tela continua */ }
}
