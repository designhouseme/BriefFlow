import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BriefPage } from "./BriefPage";
import { Landing } from "./Landing";
import "@fontsource-variable/atkinson-hyperlegible-next/index.css";
import "./styles.css";

function App() {
  const match = location.pathname.match(/^\/b\/([^/]+)\/?$/);
  if (match) {
    const token = new URLSearchParams(location.search).get("k") ?? "";
    return <BriefPage id={match[1]} token={token} />;
  }
  return <Landing />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
