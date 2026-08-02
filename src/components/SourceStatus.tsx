import type { SourceResult } from "@/lib/sources/types";
import { RelativeTime } from "./Time";

/**
 * Bandeau de santé des sources d'une section.
 *
 * Pourquoi l'afficher plutôt que de masquer les pannes : ce tableau de bord
 * agrège des API tierces gratuites, dont certaines tombent. Cacher une source
 * morte donnerait l'illusion d'une veille complète alors qu'il manque un pan.
 * Ici, on voit d'un coup d'œil ce qui a répondu, quand, et ce qui a échoué.
 */
export function SourceStatus<T>({ results, pending = [] }: { results: SourceResult<T>[]; pending?: { key: string; label: string }[] }) {
  if (results.length === 0 && pending.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] leading-none">
      {results.map((r) => (
        <li key={r.key}>
          <a
            href={r.homepage}
            target="_blank"
            rel="noopener noreferrer"
            title={
              r.failed
                ? `${r.label} — échec : ${r.error}`
                : `${r.label} — ${r.items.length} entrées, rafraîchi toutes les ${Math.round(r.revalidate / 60)} min`
            }
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
              r.failed
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-line bg-surface text-muted hover:text-text"
            }`}
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${r.failed ? "bg-red-400" : "bg-emerald-400"}`}
            />
            {r.label}
            {!r.failed && <span className="tabular-nums opacity-60">{r.items.length}</span>}
          </a>
        </li>
      ))}

      {pending.map((p) => (
        <li key={p.key}>
          <span
            title="Intégration écrite et testée, en attente d'identifiants d'API"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/5 px-2.5 py-1 text-amber-300/80"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-amber-400/70" />
            {p.label}
            <span className="opacity-70">en attente de clé</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Horodatage « mis à jour … » d'une section. */
export function SectionTimestamp({ iso }: { iso: string | null }) {
  if (!iso) {
    return <span className="text-[11px] text-red-300">aucune source disponible</span>;
  }
  return (
    <span className="text-[11px] text-muted">
      mis à jour <RelativeTime iso={iso} className="text-text/70" />
    </span>
  );
}
