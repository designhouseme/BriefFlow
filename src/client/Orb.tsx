// Znak BriefFlow: niebieska kula. Obraz z /brand, mniejsze rozmiary z mniejszego pliku.

export function Orb({ size = 40, className = "", glow }: { size?: number; className?: string; glow?: boolean }) {
  const src = size > 96 ? "/brand/orb-512.webp" : "/brand/orb-160.webp";
  return (
    <span className={`orb ${glow ? "has-glow" : ""} ${className}`} style={{ width: size, height: size }} aria-hidden>
      <img src={src} width={size} height={size} alt="" decoding="async" draggable={false} />
    </span>
  );
}
