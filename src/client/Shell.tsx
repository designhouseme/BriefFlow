import type { ReactNode } from "react";

/**
 * Górny pasek: nazwa briefu i klient z lewej, stan z prawej.
 * `fill` przypina stronę do wysokości okna (rozmowa przewija się w środku, panel odpowiedzi zostaje na dole).
 */
export function Shell({
  title,
  subtitle,
  right,
  home,
  fill,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Czy tytuł prowadzi na stronę startową (tylko agencja). */
  home?: boolean;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`shell ${fill ? "is-fill" : ""}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-text">
            {home ? (
              <a className="topbar-title" href="/">
                {title}
              </a>
            ) : (
              <span className="topbar-title">{title}</span>
            )}
            {subtitle && <span className="topbar-sub">{subtitle}</span>}
          </div>
          {right && <div className="topbar-right">{right}</div>}
        </div>
      </header>
      <div className="shell-body">{children}</div>
    </div>
  );
}

/** Pasek postępu z procentem. Procent jest zawsze widoczny, pasek chowa się na wąskim ekranie. */
export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <span className="progress">
      {label && <span className="progress-label">{label}</span>}
      <span className="meter" aria-hidden>
        <span style={{ width: `${value}%` }} />
      </span>
      <span className="pct">{value}%</span>
    </span>
  );
}

export const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
