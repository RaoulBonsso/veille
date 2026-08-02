"use client";

import { useEffect, useState } from "react";

/**
 * Affichage d'horodatage.
 *
 * Piège évité : rendre « il y a 3 min » côté serveur ET côté client produit deux
 * chaînes différentes (le temps a passé entre les deux) → erreur d'hydratation
 * React. La parade : le serveur rend une date ABSOLUE, déterministe, forcée sur
 * le fuseau Europe/Paris ; le relatif n'apparaît qu'après montage côté client.
 */

const ABS = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function formatAbsolute(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : ABS.format(d);
}

function relative(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} j`;
}

/** Date absolue au rendu serveur, relative vivante une fois monté. */
export function RelativeTime({ iso, className }: { iso: string | null; className?: string }) {
  const [rel, setRel] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) return;
    const tick = () => setRel(relative(iso));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [iso]);

  if (!iso) return <span className={className}>—</span>;

  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("fr-FR")} className={className}>
      {rel ?? formatAbsolute(iso)}
    </time>
  );
}
