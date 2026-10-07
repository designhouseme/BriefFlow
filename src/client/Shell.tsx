import type { ReactNode } from "react";
import { DhTile, Wordmark } from "./Brand";

/**
 * Widok klienta (link z tokenem): biały pasek z nazwą briefu i postępem, pod nim szary panel z rozmową.
 * Bez logowania i bez listy briefów: klient widzi tylko swój brief.
 */
export function ClientShell({
  title,
  subtitle,
  value,
  children,
}: {
  title?: string;
  subtitle?: string;
  value?: number;
  children: ReactNode;
}) {
  return (
    <div className="client-app">
      <header className="client-head">
        <a className="client-brand" href="https://designhouse.me" target="_blank" rel="noreferrer" aria-label="Design House">
          <Wordmark className="client-wordmark" />
          <DhTile size={32} className="client-tile" />
        </a>
        <div className="client-head-text">
          <span className="client-head-title">{title ?? "BriefFlow"}</span>
          {subtitle && <span className="client-head-sub">{subtitle}</span>}
        </div>
        {value !== undefined && <Progress value={value} />}
      </header>
      <div className="panel client-panel">{children}</div>
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
      <span className="pct">
        {value}%<span className="visually-hidden"> gotowe</span>
      </span>
    </span>
  );
}

export const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
