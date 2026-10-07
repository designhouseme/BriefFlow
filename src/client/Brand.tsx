// Marka Design House: znak i logotyp DH (pliki w public/brand/dh).
// DH Briefing to produkt Design House: w nagłówkach stoi znak i logotyp DH, a niebieska kula zostaje
// postacią Briefingu (awatar w rozmowie, powitania).

/** Znak: trzy zaokrąglone kwadraty stykające się narożnikami, promień stały niezależnie od wielkości. */
export function DhMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 151 106" className={className} fill="currentColor" aria-hidden>
      <rect x="73.18" y="0" width="31.73" height="31.73" rx="5.88" />
      <rect x="0" y="31.82" width="73.39" height="73.39" rx="5.88" />
      <rect x="104.8" y="31.81" width="45.5" height="45.5" rx="5.88" />
    </svg>
  );
}

/** Znak w kafelku jak favicon DH: ciemny kwadrat, limonkowy znak. */
export function DhTile({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`dh-tile ${className}`} style={{ width: size, height: size }} aria-hidden>
      <DhMark />
    </span>
  );
}

/** Pełny logotyp z designhouse.me. Plik ciemny na jasnym tle, biały w ciemnym motywie. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      <img className="wordmark-dark" src="/brand/dh/logo-dark.svg" alt="Design House" width={945} height={118} />
      <img className="wordmark-light" src="/brand/dh/logo-light.svg" alt="" aria-hidden width={945} height={118} />
    </span>
  );
}

/** Logotyp Design House i nazwa produktu obok. */
export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <span className={`lockup ${className}`}>
      <Wordmark />
      <span className="lockup-product">Briefing</span>
    </span>
  );
}
