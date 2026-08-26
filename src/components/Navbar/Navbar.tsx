import { useEffect, useState } from "react";
import "../../styles/navbar.css";

const navigationItems = [
  { href: "#inicio", label: "Início", sectionId: "inicio" },
  { href: "#analise", label: "Análise", sectionId: "analise" },
  { href: "#desenvolvimento", label: "Desenvolvimento", sectionId: "desenvolvimento" },
  { href: "#sobre", label: "Sobre", sectionId: "sobre" },
  { href: "#contato", label: "Contato", sectionId: "contato" },
];

function Navbar() {
  const [activeSection, setActiveSection] = useState("inicio");

  useEffect(() => {
    const sections = navigationItems
      .map((item) => document.getElementById(item.sectionId))
      .filter((section): section is HTMLElement => Boolean(section));
    let animationFrame = 0;

    const updateActiveSection = () => {
      const navbarHeight =
        document.querySelector<HTMLElement>("[data-navbar]")?.offsetHeight ?? 0;
      const scrollPosition = window.scrollY + navbarHeight + 2;
      let currentSection = sections[0];

      if (
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2
      ) {
        setActiveSection(sections.at(-1)?.id ?? "contato");
        return;
      }

      for (const section of sections) {
        const sectionTop =
          section.getBoundingClientRect().top + window.scrollY;

        if (sectionTop <= scrollPosition) {
          currentSection = section;
        } else {
          break;
        }
      }

      if (currentSection) {
        setActiveSection(currentSection.id);
      }
    };

    const scheduleUpdate = () => {
      if (animationFrame) return;

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateActiveSection();
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.cancelAnimationFrame(animationFrame);
    };
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
