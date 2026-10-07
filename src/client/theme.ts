import { useEffect, useState } from "react";

// Jasny i ciemny motyw. Domyślnie jak w systemie (także gdy system zmieni się w trakcie);
// wybór z przełącznika zapamiętuje przeglądarka i wtedy ma pierwszeństwo.

export type Theme = "light" | "dark";
const KEY = "dh-theme";
const DARK = "(prefers-color-scheme: dark)";

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

const system = (): Theme => (matchMedia(DARK).matches ? "dark" : "light");

export function applyStoredTheme() {
  const theme = stored();
  if (theme) document.documentElement.dataset.theme = theme;
}

export function useTheme() {
  const [choice, setChoice] = useState<Theme | null>(stored);
  const [fromSystem, setFromSystem] = useState<Theme>(system);
  const theme = choice ?? fromSystem;

  useEffect(() => {
    const media = matchMedia(DARK);
    const onSystem = () => setFromSystem(media.matches ? "dark" : "light");
    // Kilka przełączników (pasek ikon, szuflada na telefonie) trzyma ten sam wybór.
    const onChoice = (e: Event) => setChoice((e as CustomEvent<Theme>).detail);
    media.addEventListener("change", onSystem);
    window.addEventListener("dh:theme", onChoice);
    return () => {
      media.removeEventListener("change", onSystem);
      window.removeEventListener("dh:theme", onChoice);
    };
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
