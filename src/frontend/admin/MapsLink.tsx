import { Button } from "@/components/ui/button";

/** Pin do Google Maps (versão simplificada nas cores da marca). */
export function GoogleMapsIcon({ className = "size-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
    <defs><clipPath id="gmaps-pin"><path d="M12 1.5C7.86 1.5 4.5 4.86 4.5 9c0 5.6 7.5 13.5 7.5 13.5s7.5-7.9 7.5-13.5c0-4.14-3.36-7.5-7.5-7.5z" /></clipPath></defs>
    <g clipPath="url(#gmaps-pin)">
      <rect x="0" y="0" width="12" height="12" fill="#4285F4" />
      <rect x="12" y="0" width="12" height="12" fill="#EA4335" />
      <rect x="12" y="9" width="12" height="16" fill="#FBBC04" />
      <rect x="0" y="9" width="12" height="16" fill="#34A853" />
    </g>
    <circle cx="12" cy="9" r="3" fill="#fff" />
  </svg>;
}

export function MapsButton({ href, label }: { href: string; label: string }) {
  return <Button asChild size="sm" variant="outline">
    <a href={href} target="_blank" rel="noopener noreferrer" draggable={false} onClick={event => event.stopPropagation()} aria-label={label}>
      <GoogleMapsIcon /> Ver no mapa
    </a>
  </Button>;
}
