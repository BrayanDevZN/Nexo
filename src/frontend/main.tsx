import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { CookieNotice } from "./components/CookieNotice";
import { MotionProvider } from "./components/MotionProvider";
import { setCanonical, setNoIndex } from "./lib/seo";
import "./styles/globals.css";
import "./styles/site.css";

const AdminApp = lazy(() => import("./admin/AdminApp"));
const AccountingLanding = lazy(() => import("./AccountingLanding"));
const PrivacyPage = lazy(() => import("./PrivacyPage"));
const adminRoute = /^\/admin(?:\/|$)/.test(window.location.pathname);
const privacyRoute = /^\/privacidade\/?$/.test(window.location.pathname);
const landingRoute = /^\/contabilidade\/?$/.test(window.location.pathname);

if (adminRoute) setNoIndex();
else setCanonical(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionProvider>
      <AnimatedBackground />
      {adminRoute ? <Suspense fallback={<main className="admin-loading" role="status">Carregando painel…</main>}><AdminApp /></Suspense> : privacyRoute ? <Suspense fallback={null}><PrivacyPage /></Suspense> : landingRoute ? <Suspense fallback={null}><AccountingLanding /></Suspense> : <App />}
      {adminRoute ? null : <CookieNotice />}
    </MotionProvider>
  </StrictMode>,
);
