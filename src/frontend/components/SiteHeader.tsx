import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { contactUrl } from "@/lib/content";

const entries = [
  { href: "#inicio", label: "Início" },
  { href: "#estacao-1", label: "Agentes de IA" },
  { href: "#estacao-2", label: "Automação inteligente" },
  { href: "#estacao-3", label: "IA nos seus sistemas" },
  { href: "#estacao-4", label: "Software sob medida" },
  { href: "#processo", label: "Como funciona" },
  { href: "#sobre", label: "A Nexo" },
  { href: "#demonstracao", label: "Na prática" },
  { href: "#duvidas", label: "Dúvidas" },
  { href: "#contato", label: "Contato" },
];

/** Name on the left, a round Menu button on the right that opens the list of everything. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("rp-locked");
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => {
      document.documentElement.classList.remove("rp-locked");
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <header className="rp-header">
      <a className="rp-brand" href="#inicio" aria-label="Nexo: início">
        <Brand />
      </a>
      <button type="button" className="rp-menu-btn" aria-expanded={open} aria-controls="rp-menu" onClick={() => setOpen((value) => !value)}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="48" />
          <circle cx="50" cy="50" r="39" />
        </svg>
        <span>{open ? "Fechar" : "Menu"}</span>
      </button>
      {open ? (
        <div id="rp-menu" className="rp-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <ol>
            {entries.map((entry, index) => (
              <li key={entry.href} style={{ animationDelay: `${index * 0.05}s` }}>
                <a href={entry.href} onClick={() => setOpen(false)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {entry.label}
                </a>
              </li>
            ))}
          </ol>
          <a className="rp-menu-cta" href={contactUrl} target="_blank" rel="noopener noreferrer">
            Vamos conversar
          </a>
        </div>
      ) : null}
    </header>
  );
}
