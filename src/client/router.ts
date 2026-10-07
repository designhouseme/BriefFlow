import { useEffect, useState } from "react";

// Mały router bez zależności: kilka ścieżek, nawigacja przez history API.
// Przejście ze strony startowej do aplikacji idzie przez View Transitions, gdy przeglądarka je ma.

const EVENT = "dh:navigate";

export function navigate(to: string, options: { replace?: boolean; transition?: boolean } = {}) {
  const go = () => {
    const samePage = to.split("#")[0] === location.pathname + location.search;
    if (options.replace) history.replaceState(null, "", to);
    else history.pushState(null, "", to);
    window.dispatchEvent(new Event(EVENT));
    // Nowa strona zaczyna się od góry (dokumenty, powrót na stronę startową).
    if (!samePage) window.scrollTo(0, 0);
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (options.transition && !reduced && "startViewTransition" in document) {
    document.startViewTransition(go);
  } else {
    go();
  }
}

export function useLocation() {
  const read = () => ({ path: location.pathname, search: location.search });
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const update = () => setLoc(read());
    window.addEventListener("popstate", update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return loc;
}

/** Link wewnątrz aplikacji: zwykłe <a>, ale bez przeładowania strony. */
export function onLinkClick(event: React.MouseEvent<HTMLAnchorElement>, to: string) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(to);
}
