import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyAdminTheme, saveAdminTheme } from "./theme";

/** Turns the admin panel's night mode on and off. The class on <html> is the source of truth. */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  function toggle() {
    const next = dark ? "light" : "dark";
    applyAdminTheme(next);
    saveAdminTheme(next);
    setDark(!dark);
  }
  return (
    <Button variant="outline" size="icon-sm" className={className} aria-pressed={dark} aria-label={dark ? "Desativar modo noturno" : "Ativar modo noturno"} title={dark ? "Desativar modo noturno" : "Ativar modo noturno"} onClick={toggle}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
