import type { User } from "./api";

function decodeKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export async function enablePush(api: { request: <T>(path: string) => Promise<T>; mutate: <T>(path: string, method: string, body?: unknown) => Promise<T> }) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("Este navegador não oferece notificações push.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão para notificações não concedida.");
  const registration = await navigator.serviceWorker.register("/sw.js");
  const { public_key } = await api.request<{ public_key: string }>("/push/public-key");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeKey(public_key),
  });
  await api.mutate("/push/subscribe", "POST", subscription.toJSON());
}

export async function registerGrantedPush(api: Parameters<typeof enablePush>[0], user: User) {
  if (user.status !== "approved" || !("serviceWorker" in navigator) || !("PushManager" in window) || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  if (existing) await api.mutate("/push/subscribe", "POST", existing.toJSON());
}
