import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { MotionProvider } from "./components/MotionProvider";
import "./styles/globals.css";
import "./styles/site.css";

const AdminApp = lazy(() => import("./admin/AdminApp"));
const AccountingLanding = lazy(() => import("./AccountingLanding"));
const adminRoute = /^\/admin(?:\/|$)/.test(window.location.pathname);
const landingRoute = /^\/contabilidade\/?$/.test(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionProvider>
      <AnimatedBackground />
      {adminRoute ? <Suspense fallback={<main className="admin-loading" role="status">Carregando painel…</main>}><AdminApp /></Suspense> : landingRoute ? <Suspense fallback={null}><AccountingLanding /></Suspense> : <App />}
    </MotionProvider>
  </StrictMode>,
);
