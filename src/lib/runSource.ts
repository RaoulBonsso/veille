import type { SourceResult } from "./sources/types";

/**
 * Enveloppe de résilience.
 *
 * Règle du projet : AUCUNE source ne doit pouvoir faire tomber la page.
 * Toute récupération passe par ici, qui convertit une exception en
 * `SourceResult` en échec. La page compose ensuite des résultats qui sont tous
 * valides — elle n'a pas de chemin « erreur globale ».
 */

const DEFAULT_TIMEOUT_MS = 8000;

export interface SourceMeta {
  key: string;
  label: string;
  homepage: string;
  revalidate: number;
  timeoutMs?: number;
}

/** Traduit une exception en message court, affichable tel quel dans l'UI. */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError" || /abort/i.test(err.message)) {
      return "Délai de réponse dépassé";
    }
    if (err instanceof TypeError || /fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(err.message)) {
      return "Source injoignable (réseau)";
    }
    return err.message.slice(0, 160);
  }
  if (typeof err === "string" && err.trim()) return err.slice(0, 160);
  return "Erreur inconnue";
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new DOMException("La source n'a pas répondu à temps", "AbortError")), ms),
  );
}

/**
 * Exécute `load` et renvoie TOUJOURS un SourceResult résolu.
 * Un `load` qui jette, qui dépasse le délai, ou qui renvoie autre chose qu'un
 * tableau, produit un résultat en échec avec `items: []`.
 */
export async function runSource<T>(meta: SourceMeta, load: () => Promise<T[]> | T[]): Promise<SourceResult<T>> {
  const fetchedAt = new Date().toISOString();
  const base = {
    key: meta.key,
    label: meta.label,
    homepage: meta.homepage,
    fetchedAt,
    revalidate: meta.revalidate,
  };

  try {
    const items = await Promise.race([Promise.resolve().then(load), timeout(meta.timeoutMs ?? DEFAULT_TIMEOUT_MS)]);

    if (!Array.isArray(items)) {
      return { ...base, items: [], failed: true, error: "Réponse inattendue de la source" };
    }
    return { ...base, items, failed: false, error: null };
  } catch (err) {
    return { ...base, items: [], failed: true, error: describeError(err) };
  }
}
