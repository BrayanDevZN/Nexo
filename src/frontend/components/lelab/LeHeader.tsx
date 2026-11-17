import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Brand } from "@/components/Brand";
import { contactUrl } from "@/lib/content";

const links = [
  { href: "#inicio", label: "Início" },
  { href: "#solucoes", label: "Soluções" },
  { href: "#processo", label: "Como funciona" },
  { href: "#sobre", label: "A Nexo" },
  { href: "#demonstracao", label: "Na prática" },
  { href: "#duvidas", label: "Dúvidas" },
];

/** Logo on the left, links centred, WhatsApp pill on the right. Under 900px the links open as a full-screen list. */
export function LeHeader() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
    <header className="ll-header" data-solid={solid || open}>
      <a className="ll-logo" href="#inicio" aria-label="Nexo: início">
        <Brand />
      </a>
      <nav className="ll-nav" aria-label="Principal">
        {links.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <a className="ll-pill ll-pill-sm ll-header-cta" href={contactUrl} target="_blank" rel="noopener noreferrer">
        <MessageCircle aria-hidden="true" /> <span>WhatsApp</span>
      </a>
      <button
        type="button"
        className="ll-burger"
        aria-expanded={open}
        aria-controls="ll-menu"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden="true" /> : <><i /><i /></>}
      </button>
      {open ? (
        <div id="ll-menu" className="ll-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <ol>
            {links.map((link, index) => (
              <li key={link.href} style={{ animationDelay: `${index * 0.05}s` }}>
                <a href={link.href} onClick={() => setOpen(false)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {link.label}
                </a>
              </li>
            ))}
          </ol>
          <a className="ll-pill" href={contactUrl} target="_blank" rel="noopener noreferrer">
            Falar no WhatsApp
          </a>
        </div>
      ) : null}
    </header>
  );
}
