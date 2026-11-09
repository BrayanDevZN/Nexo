import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PREFERENCES_EVENT, readConsent, saveConsent } from "@/lib/consent";
import { initTracking, trackingConfigured } from "@/lib/tracking";

/** Asks before any measurement cookie is set. Renders nothing while no tag is configured. */
export function CookieNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!trackingConfigured()) return;
    if (readConsent() === null) setOpen(true);
    else initTracking();
    const reopen = () => setOpen(true);
    window.addEventListener(PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(PREFERENCES_EVENT, reopen);
  }, []);

  if (!open) return null;

  const choose = (value: "granted" | "denied") => {
    saveConsent(value);
    if (value === "granted") initTracking();
    else if (window.gtag) window.location.reload(); // the tag was already running; a reload stops it
    setOpen(false);
  };

  return (
    <div className="cookie-notice" role="dialog" aria-label="Aviso de cookies">
      <p>
        Usamos cookies de medição do Google para entender de onde vêm as visitas e melhorar nossos anúncios. Só
        ativamos se você aceitar. Veja a <a href="/privacidade">política de privacidade</a>.
      </p>
      <div className="cookie-actions">
        <Button variant="outline" onClick={() => choose("denied")}>Recusar</Button>
        <Button onClick={() => choose("granted")}>Aceitar</Button>
      </div>
    </div>
  );
}

/** Footer button that lets the visitor change the choice. Hidden while there is no tag. */
export function CookiePreferencesButton() {
  if (!trackingConfigured()) return null;
  return (
    <button
      type="button"
      className="nx-footer-toggle"
      onClick={() => window.dispatchEvent(new Event(PREFERENCES_EVENT))}
    >
      Preferências de cookies
    </button>
  );
}
