import type { FeedItem, SourceResult } from "./sources/types";

/**
 * Fusion des flux d'une section en un fil unique.
 *
 * Décision d'affichage : on présente un FIL CHRONOLOGIQUE unique plutôt qu'une
 * colonne par source. Au réveil, on veut « quoi de neuf », pas « qu'a publié
 * chaque site ». La provenance reste visible via une pastille sur chaque carte,
 * et l'état de santé de chaque source est affiché à part.
 *
 * Fonction PURE : aucune I/O, donc entièrement testable sans réseau.
 */
export function mergeFeeds(results: SourceResult<FeedItem>[], limit = 24): FeedItem[] {
  if (!Array.isArray(results) || results.length === 0) return [];

  const seen = new Set<string>();
  const out: FeedItem[] = [];

  // On parcourt les sources dans l'ordre de déclaration : en cas de doublon
  // d'URL, c'est la source déclarée en premier qui l'emporte (ordre de
  // confiance choisi dans dashboard.ts).
  for (const res of results) {
    if (!res || res.failed || !Array.isArray(res.items)) continue;

    for (const item of res.items) {
      if (!item?.title || !item?.url) continue;

      const key = normalizeUrl(item.url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }

  // Tri décroissant. Les items sans date valable partent en fin de liste :
  // les perdre serait pire (GitHub Trending n'a pas toujours de date utile).
  out.sort((a, b) => time(b.publishedAt) - time(a.publishedAt));

  return out.slice(0, limit);
}

function time(iso: string | null): number {
  if (!iso) return -Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/** Normalise l'URL pour la déduplication (protocole, www, slash final, casse). */
function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/**
 * Date de fraîcheur d'une section : la plus récente des `fetchedAt` réussis.
 * Si toutes les sources sont mortes, on renvoie null et l'UI affiche l'état
 * dégradé — plutôt qu'un horodatage qui mentirait sur la fraîcheur.
 */
export function sectionFetchedAt<T>(results: SourceResult<T>[]): string | null {
  const ok = results.filter((r) => !r.failed).map((r) => r.fetchedAt);
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
}
