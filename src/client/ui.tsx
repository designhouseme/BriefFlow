import { IconDots } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";

// Drobne elementy wspólne dla aplikacji: wysuwany panel przy przycisku i menu akcji.

function useDismiss(open: boolean, close: () => void, root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        root.current?.querySelector<HTMLButtonElement>("[aria-expanded]")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, root]);
}

/** Przycisk, który otwiera panel pod sobą (udostępnianie, zmiana nazwy). */
export function Popover({
  trigger,
  triggerClass = "btn",
  label,
  align = "end",
  side = "bottom",
  children,
}: {
  trigger: React.ReactNode;
  triggerClass?: string;
  label?: string;
  align?: "start" | "end";
  /** Pod przyciskiem albo z prawej, wyrównany do dołu (awatar w pasku ikon). */
  side?: "bottom" | "right";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => setOpen(false);
  useDismiss(open, close, root);
  return (
    <div className="pop" ref={root}>
      <button
        className={triggerClass}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`pop-panel is-${side === "right" ? "right" : align}`} id={id} role="dialog" aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** Menu „…” przy elemencie listy. Strzałki przechodzą między pozycjami. */
export function Menu({ label, items, className = "" }: { label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, close, root);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div className={`menu ${className} ${open ? "is-open" : ""}`} ref={root}>
      <button className="icon-btn menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconDots size={17} aria-hidden />
      </button>
      {open && (
        <ul className="menu-list" role="menu" ref={list} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                role="menuitem"
                className={item.danger ? "is-danger" : ""}
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Kopiowanie do schowka z krótkim potwierdzeniem na przycisku. */
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return true;
    } catch {
      return false;
    }
  };
  return { copied, copy };
}

/**
 * Płynne przewinięcie do elementu w jego najbliższym przewijanym kontenerze. Zwykłe
 * scrollIntoView({ behavior: "smooth" }) przerywa się, gdy po drodze są kontenery z overflow: hidden.
 */
export function scrollToElement(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  let box = target.parentElement;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  const container = box ?? document.scrollingElement ?? document.documentElement;
  const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  container.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
}
