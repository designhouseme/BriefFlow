import {
  IconChevronDown,
  IconCircleCheck,
  IconCopy,
  IconExternalLink,
  IconFile,
  IconLogout,
  IconMenu2,
  IconMessages,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconTrash,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { BriefSummary, Me } from "../shared/account";
import { TEMPLATE_LIST } from "../shared/templates";
import { ApiError, clientUrl, deleteBrief, getMe, listBriefs, logout, takePrimedMe } from "./api";
import { DhTile } from "./Brand";
import { navigate, onLinkClick } from "./router";
import { useTheme } from "./theme";
import { Menu, Popover } from "./ui";

// Aplikacja agencji jak w czacie: wąski pasek ikon, lista briefów pogrupowana po dniach, główny panel.

interface AppState {
  me: Me;
  briefs: BriefSummary[] | null;
  refresh: () => void;
  /** Otwarty brief zmienił się na żywo: odświeżamy jego wiersz bez pytania serwera. */
  patchBrief: (id: string, patch: Partial<BriefSummary>) => void;
  notify: (message: string) => void;
  openNav: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp poza AppShell");
  return app;
}

export const briefName = (b: Pick<BriefSummary, "title" | "clientName">) => b.clientName || b.title;

/** „anna.kowalska@…” → „Anna”. */
export function firstName(email: string) {
  const part = email.split("@")[0].split(/[._+-]/)[0];
  return part ? part[0].toUpperCase() + part.slice(1) : email;
}

export function AppShell({ activeId, children }: { activeId: string | null; children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(takePrimedMe);
  const [briefs, setBriefs] = useState<BriefSummary[] | null>(null);
  const [toast, setToast] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    getMe().then(setMe, (e) => {
      if (e instanceof ApiError && e.status === 401) navigate("/", { replace: true });
      else setToast((e as Error).message);
    });
  }, []);

  const refresh = useCallback(() => {
    listBriefs().then(setBriefs, (e) => {
      if (e instanceof ApiError && e.status === 401) navigate("/", { replace: true });
    });
  }, []);

  // Lista żyje: klienci odpowiadają w innych briefach, więc odświeżamy co chwilę i po powrocie do karty.
  useEffect(() => {
    if (!me) return;
    refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), 20_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [me, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Na telefonie lista zamyka się po wyborze briefu.
  useEffect(() => setNavOpen(false), [activeId]);

  const patchBrief = useCallback((id: string, patch: Partial<BriefSummary>) => {
    setBriefs((list) => list?.map((b) => (b.id === id ? { ...b, ...patch } : b)) ?? list);
  }, []);

  const value = useMemo<AppState | null>(
    () => (me ? { me, briefs, refresh, patchBrief, notify: setToast, openNav: () => setNavOpen(true) } : null),
    [me, briefs, refresh, patchBrief],
  );

  if (!value) {
    return (
      <div className="app is-loading">
        <DhTile size={48} className="pulse-soft" />
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <div className={`app ${navOpen ? "nav-open" : ""}`}>
        <Rail onBriefs={() => setNavOpen((o) => !o)} />
        <Sidebar activeId={activeId} onClose={() => setNavOpen(false)} />
        <button className="nav-scrim" aria-label="Zamknij listę" tabIndex={-1} onClick={() => setNavOpen(false)} />
        <main className="main">{children}</main>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}

/** Przełącznik motywu w nagłówku panelu. Domyślnie jasny. */
function ThemeButton({ className, size }: { className: string; size: number }) {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Jasny motyw" : "Ciemny motyw";
  return (
    <button className={className} onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <IconSun size={size} stroke={1.7} /> : <IconMoon size={size} stroke={1.7} />}
    </button>
  );
}

function Rail({ onBriefs }: { onBriefs: () => void }) {
  return (
    <nav className="rail" aria-label="Aplikacja">
      <a className="rail-home" href="/app" onClick={(e) => onLinkClick(e, "/app")} aria-label="Design House BriefFlow, nowy brief">
        <DhTile size={40} />
      </a>
      <button className="rail-btn is-active" onClick={onBriefs} aria-label="Briefy" title="Briefy">
        <IconMessages size={21} stroke={1.7} />
      </button>
      <a className="rail-btn" href="/app" onClick={(e) => onLinkClick(e, "/app")} aria-label="Nowy brief" title="Nowy brief">
        <IconPlus size={21} stroke={1.7} />
      </a>
      <span className="rail-gap" />
      <AccountButton />
    </nav>
  );
}

/** Awatar na dole paska ikon: konto i akcje w panelu obok. */
function AccountButton() {
  const { me } = useApp();
  const name = firstName(me.email);
  return (
    <Popover
      side="right"
      triggerClass="rail-avatar"
      label={`Konto: ${me.email}`}
      trigger={<span aria-hidden>{name[0]}</span>}
    >
      {(close) => (
        <div className="account-pop">
          <div className="account-head">
            <span className="account-avatar" aria-hidden>
              {name[0]}
            </span>
            <span className="account-text">
              <strong>{name}</strong>
              <span>{me.email}</span>
            </span>
          </div>
          <div className="pop-items">
            <a className="pop-item" href="/" onClick={close}>
              <IconWorld size={17} aria-hidden /> Strona startowa
            </a>
            <button
              className="pop-item is-danger"
              onClick={async () => {
                close();
                await logout().catch(() => undefined);
                navigate("/", { replace: true });
              }}
            >
              <IconLogout size={17} aria-hidden /> Wyloguj
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

type Group = { label: string; items: BriefSummary[] };

function groupByDay(briefs: BriefSummary[]): Group[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const day = 24 * 3600_000;
  const groups: Group[] = [
    { label: "Dziś", items: [] },
    { label: "Wczoraj", items: [] },
    { label: "Ostatnie 7 dni", items: [] },
    { label: "Wcześniej", items: [] },
  ];
  for (const brief of briefs) {
    const at = brief.updatedAt;
    const index = at >= today ? 0 : at >= today - day ? 1 : at >= today - 7 * day ? 2 : 3;
    groups[index].items.push(brief);
  }
  return groups.filter((g) => g.items.length > 0);
}

const TEMPLATE_ICON: Record<string, typeof IconWorld> = { www: IconWorld, empty: IconFile };

function Sidebar({ activeId, onClose }: { activeId: string | null; onClose: () => void }) {
  const { briefs, refresh, notify } = useApp();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!briefs || !q) return briefs ?? [];
    return briefs.filter((b) => `${b.clientName} ${b.title}`.toLowerCase().includes(q));
  }, [briefs, query]);

  async function remove(brief: BriefSummary) {
    if (!confirm(`Usunąć brief „${briefName(brief)}” razem z odpowiedziami? Link klienta przestanie działać.`)) return;
    try {
      await deleteBrief(brief.id);
      if (brief.id === activeId) navigate("/app", { replace: true });
      refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function copyLink(brief: BriefSummary) {
    try {
      await navigator.clipboard.writeText(clientUrl(brief.id, brief.clientToken));
      notify("Skopiowano link dla klienta.");
    } catch {
      notify("Nie udało się skopiować. Otwórz brief i skopiuj link stamtąd.");
    }
  }

  return (
    <aside className="sidebar" aria-label="Briefy">
      <div className="sidebar-head">
        <h2>Briefy</h2>
        <button
          className="icon-btn"
          aria-label={searching ? "Zamknij wyszukiwanie" : "Szukaj briefu"}
          aria-pressed={searching}
          onClick={() => {
            setSearching((s) => !s);
            setQuery("");
          }}
        >
          {searching ? <IconX size={18} /> : <IconSearch size={18} />}
        </button>
        <button className="icon-btn sidebar-close" aria-label="Zamknij listę" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>

      {searching && (
        <input
          className="input sidebar-search"
          type="search"
          placeholder="Klient albo nazwa briefu"
          aria-label="Szukaj briefu"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      )}

      <a className="btn btn-primary btn-block" href="/app" onClick={(e) => onLinkClick(e, "/app")}>
        <IconPlus size={17} stroke={2.2} aria-hidden /> Nowy brief
      </a>

      <div className="sidebar-scroll">
        {!searching && (
          <div className="side-group">
            <p className="side-label">Szablony</p>
            <ul className="side-list">
              {TEMPLATE_LIST.map((t, i) => {
                const Icon = TEMPLATE_ICON[t.id] ?? IconFile;
                return (
                  <li key={t.id}>
                    <a
                      className="side-item"
                      href={`/app?szablon=${t.id}`}
                      onClick={(e) => onLinkClick(e, `/app?szablon=${t.id}`)}
                      title={t.description}
                    >
                      <span className={`side-mark tone-${i + 1}`} aria-hidden>
                        <Icon size={15} stroke={1.9} />
                      </span>
                      <span className="side-text">{t.title}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {briefs === null ? (
          <p className="side-empty">Wczytuję…</p>
        ) : filtered.length === 0 ? (
          <p className="side-empty">{query ? "Nic nie pasuje." : "Tu pojawią się Twoje briefy."}</p>
        ) : (
          groupByDay(filtered).map((group) => (
            <div className="side-group" key={group.label}>
              <button
                className="side-label side-toggle"
                aria-expanded={!collapsed[group.label]}
                onClick={() => setCollapsed((c) => ({ ...c, [group.label]: !c[group.label] }))}
              >
                {group.label}
                <IconChevronDown size={15} aria-hidden />
              </button>
              {!collapsed[group.label] && (
                <ul className="side-list">
                  {group.items.map((brief) => (
                    <li key={brief.id} className={`side-row ${brief.id === activeId ? "is-active" : ""}`}>
                      <a
                        className="side-item"
                        href={`/app/b/${brief.id}`}
                        onClick={(e) => onLinkClick(e, `/app/b/${brief.id}`)}
                        aria-current={brief.id === activeId ? "page" : undefined}
                        title={brief.clientName && brief.title !== brief.clientName ? `${brief.clientName}, ${brief.title}` : undefined}
                      >
                        <span className="side-text">{briefName(brief)}</span>
                        <span className="side-meta">
                          {brief.completedAt ? (
                            <IconCircleCheck size={16} stroke={2} aria-label="Klient wysłał brief" />
                          ) : (
                            `${brief.total ? Math.round((brief.settled / brief.total) * 100) : 0}%`
                          )}
                        </span>
                      </a>
                      <Menu
                        className="side-menu"
                        label={`Akcje: ${briefName(brief)}`}
                        items={[
                          { label: "Kopiuj link dla klienta", icon: <IconCopy size={16} />, onSelect: () => copyLink(brief) },
                          {
                            label: "Otwórz jako klient",
                            icon: <IconExternalLink size={16} />,
                            onSelect: () => window.open(clientUrl(brief.id, brief.clientToken), "_blank", "noopener"),
                          },
                          { label: "Usuń brief", icon: <IconTrash size={16} />, danger: true, onSelect: () => remove(brief) },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

    </aside>
  );
}

/** Nagłówek głównego panelu: tytuł z lewej, akcje z prawej. Na telefonie także przycisk listy. */
export function MainHead({
  title,
  titleAction,
  badge,
  actions,
}: {
  title: string;
  titleAction?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { openNav } = useApp();
  return (
    <header className="main-head">
      <button className="icon-btn nav-btn" aria-label="Lista briefów" onClick={openNav}>
        <IconMenu2 size={20} />
      </button>
      <div className="main-title">
        <h1>{title}</h1>
        {titleAction}
        {badge}
      </div>
      <div className="main-actions">
        {actions}
        <ThemeButton className="btn btn-icon" size={18} />
      </div>
    </header>
  );
}
