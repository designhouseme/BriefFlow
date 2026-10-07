import { useEffect, useState } from "react";

// Jasny motyw jest podstawowy. Ciemny tylko z przełącznika w nagłówku; wybór zapamiętuje przeglądarka.

export type Theme = "light" | "dark";
const KEY = "dh-theme";

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function applyStoredTheme() {
  const theme = stored();
  if (theme) document.documentElement.dataset.theme = theme;
}

export function useTheme() {
  const [choice, setChoice] = useState<Theme | null>(stored);
  const theme = choice ?? "light";

  // Przełącznik jest w nagłówku każdego widoku; wszystkie egzemplarze trzymają ten sam wybór.
  useEffect(() => {
    const onChoice = (e: Event) => setChoice((e as CustomEvent<Theme>).detail);
    window.addEventListener("dh:theme", onChoice);
    return () => window.removeEventListener("dh:theme", onChoice);
  }, []);

  useEffect(() => {
    if (choice) document.documentElement.dataset.theme = choice;
    else delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0f1115" : "#ffffff");
  }, [choice, theme]);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* bez pamięci przeglądarki wybór zniknie po odświeżeniu */
    }
    window.dispatchEvent(new CustomEvent<Theme>("dh:theme", { detail: next }));
  };

  return { theme, toggle };
}
