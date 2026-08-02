/**
 * Contrats partagés par toutes les sources.
 *
 * Décision d'archi : on normalise TOUT vers deux formes (`FeedItem` pour la
 * lecture, `JobItem` pour l'emploi) le plus tôt possible, dans l'adaptateur.
 * L'UI ne connaît jamais la forme brute d'une API tierce. Conséquence : ajouter
 * une source = écrire un adaptateur, zéro ligne touchée dans les composants.
 */

/** Catégorie d'affichage — pilote la section dans laquelle l'item atterrit. */
export type Section = "tech" | "jobs" | "world";

/** Un article / lien de veille, normalisé. */
export interface FeedItem {
  /** Identifiant stable, unique au sein d'une source (sert de clé React). */
  id: string;
  title: string;
  url: string;
  /** Nom lisible de la source, affiché dans l'UI. */
  source: string;
  /** Date de publication en ISO 8601 UTC, ou null si la source n'en fournit pas. */
  publishedAt: string | null;
  /** Auteur, si connu. */
  author?: string | null;
  /** Résumé court, déjà nettoyé du HTML. */
  summary?: string | null;
  /**
   * Métrique de popularité (points HN, réactions dev.to, étoiles GitHub).
   * Uniquement à titre indicatif dans l'UI — jamais comparée entre sources.
   */
  score?: number | null;
  /** Libellé de la métrique ci-dessus ("points", "étoiles"…). */
  scoreLabel?: string | null;
  /** Nombre de commentaires, si la source l'expose. */
  comments?: number | null;
  /** URL de la page de discussion, si différente de `url`. */
  discussionUrl?: string | null;
  tags?: string[];
}

/** Une offre d'emploi, normalisée. */
export interface JobItem {
  id: string;
  title: string;
  company: string;
  /** Localisation brute telle qu'annoncée par la source. */
  location: string;
  /** true si l'offre est explicitement remote. */
  remote: boolean;
  url: string;
  source: string;
  publishedAt: string | null;
  tags: string[];
  /** Type de contrat si exposé (full_time, alternance…). */
  contract?: string | null;
  /**
   * Score de pertinence pour « dev full-stack junior en France ».
   * Calculé par `scoreJob`, pas par la source. Voir relevance.ts.
   */
  relevance: number;
}

/**
 * Résultat d'une source. C'est le coeur de la résilience : une source ne jette
 * JAMAIS vers l'appelant, elle renvoie un résultat en échec. La page peut donc
 * toujours se rendre, avec un état d'erreur lisible pour la source fautive.
 */
export interface SourceResult<T> {
  /** Identifiant technique de la source (slug). */
  key: string;
  /** Nom affiché à l'utilisateur. */
  label: string;
  /** Lien vers la source, pour attribution. */
  homepage: string;
  items: T[];
  /** true si la récupération a échoué — `items` vaut alors []. */
  failed: boolean;
  /** Message d'erreur court, affichable tel quel dans l'UI. */
  error: string | null;
  /** Horodatage ISO de la tentative de récupération. */
  fetchedAt: string;
  /** Durée de validité du cache appliquée, en secondes (pour l'affichage). */
  revalidate: number;
}

/**
 * Interface que doit implémenter toute source d'emploi.
 * L'adaptateur France Travail l'implémente comme les autres : le jour où les
 * identifiants arrivent, il se branche sans qu'aucun appelant ne change.
 */
export interface JobSource {
  key: string;
  label: string;
  homepage: string;
  /** Secondes de revalidation ISR souhaitées pour cette source. */
  revalidate: number;
  /**
   * false => la source est ignorée silencieusement (pas d'erreur affichée).
   * Sert aux sources qui exigent des identifiants absents de l'environnement.
   */
  isEnabled(): boolean;
  /** Récupère et normalise. Peut jeter : l'appelant encapsule via `runSource`. */
  fetchJobs(): Promise<JobItem[]>;
}
