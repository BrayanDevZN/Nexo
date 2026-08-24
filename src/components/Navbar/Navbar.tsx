import logo from "../../../public/images/Nexo_name.png";

function Navbar() {
  return (
    <header className="navbar" data-navbar>
      <a
        href="/"
        className="navbar__logo"
        aria-label="Nexo - início"
      >
        <img
          src={logo}
          alt="Nexo"
        />
      </a>

      <nav className="navbar__links">
        <a href="#analise">
          Análise
        </a>

        <a href="#desenvolvimento">
          Desenvolvimento
        </a>

        <a href="#sobre">
          Sobre
        </a>

        <a href="#contato">
          Contato
        </a>
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