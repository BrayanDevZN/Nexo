import { useEffect, useState } from "react";
import "../../styles/navbar.css";

const navigationItems = [
  { href: "#analise", label: "Análise", sectionId: "analise" },
  { href: "#desenvolvimento", label: "Desenvolvimento", sectionId: "desenvolvimento" },
  { href: "#sobre", label: "Sobre", sectionId: "sobre" },
  { href: "#contato", label: "Contato", sectionId: "contato" },
];

function Navbar() {
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const sections = navigationItems
      .map((item) => document.getElementById(item.sectionId))
      .filter((section): section is HTMLElement => Boolean(section));

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSection = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleSection) {
          setActiveSection(visibleSection.target.id);
        }
      },
      {
        rootMargin: "-28% 0px -58% 0px",
        threshold: [0, 0.15, 0.35],
      }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <header className="navbar" data-navbar>
      <a
        href="/"
        className="navbar__logo"
        aria-label="Nexo - início"
      >
        <img
          className="navbar__logo-image"
          src="/images/Nexo_name_gold.png"
          alt="Nexo"
        />
      </a>

      <nav className="navbar__links" aria-label="Navegação principal">
        {navigationItems.map((item) => (
          <a
            key={item.sectionId}
            href={item.href}
            className={activeSection === item.sectionId ? "active" : ""}
            aria-current={activeSection === item.sectionId ? "page" : undefined}
            onClick={() => setActiveSection(item.sectionId)}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <a
        href="#contato"
        className="navbar__cta"
      >
        Falar com a Nexo
      </a>
    </header>
  );
}

export default Navbar;
