/** Light or dark look of the admin panel. Only the panel uses it; the public site is always light. */
export type AdminTheme = "light" | "dark";

const KEY = "nexo:admin-theme";

export function readAdminTheme(): AdminTheme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function saveAdminTheme(theme: AdminTheme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* Storage blocked: the choice only lasts until the page closes. */
  }
}

/** The class goes on <html>, not on the panel, because dialogs and menus render outside of it. */
export function applyAdminTheme(theme: AdminTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
