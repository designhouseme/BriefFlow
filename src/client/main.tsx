import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./AppShell";
import { AgencyBrief, ClientBriefPage } from "./BriefPage";
import { Home } from "./Home";
import { Landing } from "./Landing";
import { useLocation } from "./router";
import { applyStoredTheme } from "./theme";
import "@fontsource-variable/atkinson-hyperlegible-next/index.css";
import "./styles.css";

applyStoredTheme();

function App() {
  const { path, search } = useLocation();
  // Skala 90% dotyczy aplikacji i widoku klienta, nie strony startowej (styles.css, „Skala”).
  const surface = path === "/app" || path.startsWith("/app/") || path.startsWith("/b/") ? "app" : "site";
  useLayoutEffect(() => {
    document.documentElement.dataset.surface = surface;
  }, [surface]);

  // Link klienta: publiczny, z tokenem w ?k=.
  const client = path.match(/^\/b\/([^/]+)\/?$/);
  if (client) return <ClientBriefPage id={client[1]} token={new URLSearchParams(search).get("k") ?? ""} />;

  // Aplikacja agencji: wymaga logowania (AppShell odsyła na stronę startową bez sesji).
  if (path === "/app" || path.startsWith("/app/")) {
    const brief = path.match(/^\/app\/b\/([A-Za-z0-9]{12})\/?$/);
    return (
      <AppShell activeId={brief?.[1] ?? null}>
        {brief ? <AgencyBrief key={brief[1]} id={brief[1]} search={search} /> : <Home search={search} />}
      </AppShell>
    );
  }

  return <Landing />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
