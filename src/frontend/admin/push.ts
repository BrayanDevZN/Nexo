import type { User, createApi } from "./api";

type ApiClient = ReturnType<typeof createApi>;

type PushPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function pushNeedsInstall(): boolean {
  return isIosDevice() && !isInstalledApp();
}

function pushSupported(): boolean {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!pushSupported()) throw new Error("Este navegador não oferece suporte a notificações push.");
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

function payload(subscription: PushSubscription): PushPayload {
  const serialized = subscription.toJSON();
  const endpoint = serialized.endpoint || subscription.endpoint;
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error("O navegador não forneceu uma inscrição de notificações válida.");
  return { endpoint, keys: { p256dh, auth } };
}

export async function hasActivePush(): Promise<boolean> {
  if (!pushSupported() || pushNeedsInstall()) return false;
  try {
    const registration = await serviceWorkerRegistration();
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function registerGrantedPush(api: ApiClient, _user?: User): Promise<boolean> {
  if (!pushSupported() || pushNeedsInstall() || Notification.permission !== "granted") return false;
  const registration = await serviceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  await api.mutate("/push/subscribe", "POST", payload(subscription));
  return true;
}

export async function enablePush(api: ApiClient): Promise<void> {
  if (!pushSupported()) throw new Error("Este navegador não oferece suporte a notificações push.");
  if (pushNeedsInstall()) {
    throw new Error("No iPhone, adicione a Nexo à Tela de Início e abra o app instalado para ativar as notificações.");
  }

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "As notificações estão bloqueadas nas permissões deste navegador. Libere-as nas configurações do site e tente novamente."
      : "A permissão para notificações não foi concedida.");
  }

  const registration = await serviceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { public_key } = await api.request<{ public_key: string }>("/push/public-key");
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(public_key),
    });
  }

  await api.mutate("/push/subscribe", "POST", payload(subscription));
}

export async function disablePush(api: ApiClient): Promise<void> {
  if (!pushSupported()) return;
  const registration = await serviceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  try {
    await api.mutate("/push/subscribe", "DELETE", { endpoint });
  } finally {
    await subscription.unsubscribe();
  }
}
