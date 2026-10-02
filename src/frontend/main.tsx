import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { MotionProvider } from "./components/MotionProvider";
import "./styles/globals.css";

const AdminApp = lazy(() => import("./admin/AdminApp"));
const adminRoute = /^\/admin(?:\/|$)/.test(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionProvider>
      <AnimatedBackground />
      {adminRoute ? <Suspense fallback={<main className="admin-loading" role="status">Carregando painel…</main>}><AdminApp /></Suspense> : <App />}
    </MotionProvider>
  </StrictMode>,
);
