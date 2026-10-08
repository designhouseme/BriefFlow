import {
  IconChevronDown,
  IconCircleCheck,
  IconCopy,
  IconExternalLink,
  IconFile,
  IconPhoto,
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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AccountUsage, BriefSummary, Me } from "../shared/account";
import { TEMPLATE_LIST } from "../shared/templates";
import { ApiError, clientUrl, deleteBrief, deleteTemplate, getAccountUsage, getMe, listBriefs, listSavedTemplates, logout, primeMe, takePrimedMe, type SavedTemplate } from "./api";
import { AccountLogoSettings } from "./AccountLogoSettings";
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
  templates: SavedTemplate[];
  templatesLoaded: boolean;
  templatesError: string;
  refreshTemplates: () => void;
  updateMe: (patch: Partial<Me>) => void;
  usage: AccountUsage | null;
  usageError: string;
  refreshUsage: () => Promise<void>;
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

/** The server resets monthly limits according to the calendar in Poland. */
export const usageResetDate = (at: number) =>
  new Date(at).toLocaleDateString("pl-PL", { day: "numeric", month: "long", timeZone: "Europe/Warsaw" });

export function AppShell({ activeId, children }: { activeId: string | null; children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(takePrimedMe);
  const [briefs, setBriefs] = useState<BriefSummary[] | null>(null);
  const [toast, setToast] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const templatesRequest = useRef(0);
  const [usage, setUsage] = useState<AccountUsage | null>(() => takePrimedMe()?.usage ?? null);
  const [usageError, setUsageError] = useState("");
  const usageRequest = useRef(0);
  const [accountError, setAccountError] = useState("");
  const [accountLoading, setAccountLoading] = useState(true);
  const accountRequest = useRef(0);

  const loadMe = useCallback(async () => {
    const request = ++accountRequest.current;
    setAccountError("");
    setToast("");
    setAccountLoading(true);
    try {
      const next = await getMe();
      if (request !== accountRequest.current) return;
      setMe(next);
      if (usageRequest.current === 0) setUsage(next.usage);
    } catch (e) {
      if (request !== accountRequest.current) return;
      if (e instanceof ApiError && e.status === 401) navigate("/", { replace: true });
      else {
        const message = (e as Error).message || "Nie udało się wczytać konta. Spróbuj ponownie.";
        setAccountError(message);
        setToast(message);
      }
    } finally {
      if (request === accountRequest.current) setAccountLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadMe();
    return () => { accountRequest.current++; };
  }, [loadMe]);

  const refreshUsage = useCallback(async () => {
    const request = ++usageRequest.current;
    setUsageError("");
    try {
      const next = await getAccountUsage();
      if (request !== usageRequest.current) return;
      setUsage(next);
    } catch (e) {
      if (request !== usageRequest.current) return;
      if (e instanceof ApiError && e.status === 401) navigate("/", { replace: true });
      else setUsageError((e as Error).message);
    }
  }, []);

  const refresh = useCallback(() => {
    void refreshUsage();
    listBriefs().then(setBriefs, (e) => {
      if (e instanceof ApiError && e.status === 401) navigate("/", { replace: true });
    });
  }, [refreshUsage]);

  const refreshTemplates = useCallback(() => {
    const request = ++templatesRequest.current;
    setTemplatesLoaded(false);
    setTemplatesError("");
    listSavedTemplates().then((list) => {
      if (request !== templatesRequest.current) return;
      setTemplates(list);
      setTemplatesLoaded(true);
    }, (e) => {
      if (request !== templatesRequest.current) return;
      const message = (e as Error).message;
      setTemplatesError(message);
      setTemplatesLoaded(true);
      setToast(message);
    });
  }, []);
  useEffect(() => {
    if (me) refreshTemplates();
  }, [me?.email, refreshTemplates]);

  const updateMe = useCallback((patch: Partial<Me>) => {
    setMe((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      primeMe(next);
      return next;
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
  }, [me?.email, refresh]);

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
    () => (me ? { me, briefs, refresh, patchBrief, templates, templatesLoaded, templatesError, refreshTemplates, updateMe, usage, usageError, refreshUsage, notify: setToast, openNav: () => setNavOpen(true) } : null),
    [me, briefs, refresh, patchBrief, templates, templatesLoaded, templatesError, refreshTemplates, updateMe, usage, usageError, refreshUsage],
  );

  if (!value) {
    return (
      <div className="app is-loading" aria-busy={accountLoading}>
        {accountError && !accountLoading ? <div className="empty">
          <DhTile size={48} />
          <h2>Nie udało się wczytać konta</h2>
          <p role="alert">{accountError}</p>
          <button className="btn btn-primary" onClick={() => void loadMe()}>Spróbuj ponownie</button>
        </div> : <div role="status">
          <DhTile size={48} className="pulse-soft" />
          <span className="visually-hidden">Wczytuję konto…</span>
        </div>}
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
      <a className="rail-home" href="/app" onClick={(e) => onLinkClick(e, "/app")} aria-label="BriefFlow, nowy brief">
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
  const { me, updateMe, notify, usage } = useApp();
  const [logoOpen, setLogoOpen] = useState(false);
  const name = firstName(me.email);
  return (
    <>
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
          {usage && <div className="account-usage">
            <strong>Wersja darmowa</strong>
            <span>Aktywne briefy: {usage.briefs.used}/{usage.briefs.limit}</span>
            {usage.smartBriefs && <span>SmartBrief Free: {usage.smartBriefs.used}/{usage.smartBriefs.limit} wykorzystanych łącznie</span>}
            <span>AI: {Math.max(0, usage.ai.limit - usage.ai.used)} z {usage.ai.limit} dostępnych poleceń</span>
            <small>Limit AI odnawia się {usageResetDate(usage.ai.resetsAt)}.</small>
          </div>}
          <div className="pop-items">
            <button className="pop-item" onClick={(event) => { event.currentTarget.closest(".pop")?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus(); close(); setLogoOpen(true); }}>
              <IconPhoto size={17} aria-hidden /> Twoje logo
            </button>
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
    {logoOpen && <AccountLogoSettings logoUrl={me.logoUrl} onSaved={(logoUrl) => updateMe({ logoUrl })} onClose={() => setLogoOpen(false)} notify={notify} />}
    </>
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
  const { briefs, refresh, notify, templates, refreshTemplates, usage } = useApp();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [removingTemplate, setRemovingTemplate] = useState<string | null>(null);
  const newBriefRef = useRef<HTMLAnchorElement>(null);

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

  async function removeTemplate(template: SavedTemplate) {
    if (removingTemplate || !confirm(`Usunąć szablon „${template.title}”? Utworzone z niego briefy zostaną.`)) return;
    setRemovingTemplate(template.id);
    try {
      await deleteTemplate(template.id);
      if (/^\/app\/?$/.test(location.pathname) && new URLSearchParams(location.search).get("szablon") === template.id) {
        navigate("/app", { replace: true });
      }
      if (document.activeElement?.closest("[data-template-id]")?.getAttribute("data-template-id") === template.id) {
        newBriefRef.current?.focus({ preventScroll: true });
      }
      refreshTemplates();
      notify("Usunięto szablon. Utworzone briefy zostają.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setRemovingTemplate(null);
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

      <a ref={newBriefRef} className="btn btn-primary btn-block" href="/app" onClick={(e) => onLinkClick(e, "/app")}>
        <IconPlus size={17} stroke={2.2} aria-hidden /> Nowy brief
      </a>
      <p className="sidebar-usage" aria-live="polite">
        {usage ? <>Aktywne briefy <strong>{usage.briefs.used}/{usage.briefs.limit}</strong></> : "Wczytuję limit briefów…"}
      </p>

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
              {templates.map((t) => (
                <li key={t.id} className="side-row" data-template-id={t.id}>
                  <a className="side-item" href={`/app?szablon=${encodeURIComponent(t.id)}`} onClick={(e) => onLinkClick(e, `/app?szablon=${encodeURIComponent(t.id)}`)} title={t.description}>
                    <span className="side-mark tone-3" aria-hidden><IconFile size={15} stroke={1.9} /></span>
                    <span className="side-text">{t.title}</span>
                  </a>
                  <Menu className="side-menu" label={`Akcje szablonu: ${t.title}`} items={[
                    { label: removingTemplate === t.id ? "Usuwam szablon…" : "Usuń szablon", icon: <IconTrash size={16} />, danger: true, disabled: Boolean(removingTemplate), onSelect: () => removeTemplate(t) },
                  ]} />
                </li>
              ))}
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
                            <IconCircleCheck size={16} stroke={2} aria-label="Brief zakończony" />
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
