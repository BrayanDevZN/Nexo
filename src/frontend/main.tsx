import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { Scene3D } from "./components/Scene3D";
import { Backdrop } from "./components/rp/Backdrop";
import { Particles } from "./components/rp/Particles";
import { CookieNotice } from "./components/CookieNotice";
import { MotionProvider } from "./components/MotionProvider";
import { applyAdminTheme, readAdminTheme } from "./admin/theme";
import { setCanonical, setNoIndex } from "./lib/seo";
import { startPageEntrance, startSiteEffects } from "./lib/siteEffects";
import "@fontsource-variable/geist-mono";
import "@fontsource/barlow-semi-condensed/600.css";
import "@fontsource/lato/300.css";
import "@fontsource/lato/300-italic.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "./styles/globals.css";
import "./styles/site.css";
import "./styles/robin.css";
import "./styles/lelab.css";
import "./styles/admin.css";
import "./styles/atendimentos.css";
import "./styles/scene3d.css";

const AdminApp = lazy(() => import("./admin/AdminApp"));
const BookingApp = lazy(() => import("./atendimentos/BookingApp"));
const PrivacyPage = lazy(() => import("./PrivacyPage"));
const adminRoute = /^\/admin(?:\/|$)/.test(window.location.pathname);
const bookingRoute = /^\/atendimentos(?:\/|$)/.test(window.location.pathname);
const privacyRoute = /^\/privacidade\/?$/.test(window.location.pathname);

if (adminRoute) { setNoIndex(); applyAdminTheme(readAdminTheme()); document.documentElement.classList.add("admin-theme"); }
else if (bookingRoute) { setNoIndex(); document.documentElement.classList.add("booking-theme"); document.title = "Nexo Atendimentos"; }
else {
  setCanonical(window.location.pathname);
  startSiteEffects(startPageEntrance());
}

// The scheduling screens skip the backdrop, the particles and the motion probe (they must run on a weak phone). They get
// only the light 3D scene (transform-only, a handful of elements, fewer on a phone). The site and the panel do not.
createRoot(document.getElementById("root")!).render(bookingRoute
  ? <StrictMode><Scene3D /><Suspense fallback={<main className="bk-page" role="status">Carregando…</main>}><BookingApp /></Suspense></StrictMode>
  : <StrictMode>
    <MotionProvider>
      <Backdrop />
      {adminRoute ? <Particles /> : null}
      {privacyRoute ? <AnimatedBackground /> : null}
      {adminRoute ? <Suspense fallback={<main className="admin-loading" role="status">Carregando painel…</main>}><AdminApp /></Suspense> : privacyRoute ? <Suspense fallback={null}><PrivacyPage /></Suspense> : <App />}
      {adminRoute ? null : <CookieNotice />}
    </MotionProvider>
  </StrictMode>,
);
