import type { JobItem } from "./sources/types";

/**
 * Pertinence des offres pour « dev full-stack junior en France ».
 *
 * Pourquoi cette couche existe : aucune des sources gratuites branchées ne
 * filtre correctement sur la France ni sur le niveau junior (testé — `geo=france`
 * chez Jobicy renvoie de l'EMEA, Arbeitnow est très germanophone). Plutôt que de
 * faire confiance aux filtres serveur, on récupère large et on classe ici.
 * Avantage : la logique de tri est pure, testable, et se corrige sans toucher
 * aux adaptateurs.
 */

const TECH_TERMS = [
  "developer", "développeur", "developpeur", "engineer", "ingénieur", "ingenieur",
  "software", "fullstack", "full-stack", "full stack", "frontend", "front-end",
  "backend", "back-end", "web", "devops", "sre", "programmer", "programmeur",
  "javascript", "typescript", "react", "next.js", "nextjs", "node", "python",
  "golang", " go ", "rust", "php", "java", "ruby", "django", "laravel", "vue",
  "angular", "mobile", "android", "ios", "cloud", "platform", "infrastructure",
  "machine learning", "ml ", "ai ", "qa", "test",
];

/**
 * Termes qui trahissent un poste non technique malgré un intitulé vague.
 * Évalués sur le TITRE seul, et prioritaires sur TECH_TERMS.
 * Cette liste s'est étoffée après confrontation aux données réelles : les
 * intitulés commerciaux (« Business Development Representative ») et les postes
 * d'analyste remontaient dans le top 5 alors qu'ils sont hors cible.
 */
const NON_TECH_TERMS = [
  "cleaner", "nanny", "voice over", "driver", "chauffeur", "sales manager",
  "account executive", "recruiter", "nurse", "teacher", "barista", "waiter",
  "receptionist", "cashier", "security guard", "warehouse", "attendant",
  "journalist", "graphic designer", "administrative assistant", "hr generalist",
  "business development", "sales development", "representative", "analyst",
  "customer success", "project manager", "product manager", "accountant",
];

// « french » volontairement absent : il matchait « (French Language) » sur des
// offres canadiennes, qui se classaient alors devant de vraies offres parisiennes.
const FRANCE_TERMS = [
  "france", "paris", "lyon", "marseille", "toulouse", "bordeaux",
  "nantes", "lille", "montpellier", "strasbourg", "rennes", "nice", "grenoble",
  "île-de-france", "ile-de-france",
];

const EUROPE_TERMS = ["europe", "emea", "european", "eu ", "worldwide", "anywhere", "remote"];

const JUNIOR_TERMS = [
  "junior", "alternance", "alternant", "apprenti", "apprentice", "apprenticeship",
  "stage", "stagiaire", "intern", "internship", "graduate", "entry level",
  "entry-level", "débutant", "debutant", "jeune diplômé",
];

/** Postes hors de portée d'un profil junior — pénalisés, pas exclus. */
const SENIOR_TERMS = [
  "senior", "sénior", "staff", "principal", "lead", "head of", "director",
  "vp ", "chief", "architect", "manager", "expert", "confirmé", "confirme",
];

/** Stack de Joyboy — une offre qui la mentionne vaut plus qu'une autre. */
const STACK_TERMS = [
  "react", "next", "typescript", "javascript", "node", "python", "go", "golang",
  "rust", "php", "expo", "react native", "firebase", "tailwind", "supabase",
  "postgres", "sql",
];

function haystack(job: Pick<JobItem, "title" | "location" | "tags">): string {
  return [job.title, job.location, ...(job.tags ?? [])].join(" ").toLowerCase();
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((t) => text.includes(t));
}

function countAny(text: string, terms: string[]): number {
  return terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
}

/**
 * Une offre est-elle technique ?
 * C'est ce filtre qui a disqualifié RemoteOK : son flux gratuit ne renvoyait
 * que du « Cleaner », « Nanny », « Voice Over Artist ».
 */
export function isTechJob(job: Pick<JobItem, "title" | "location" | "tags">): boolean {
  const title = (job.title ?? "").toLowerCase();
  const all = haystack(job);
  if (hasAny(title, NON_TECH_TERMS)) return false;
  return hasAny(all, TECH_TERMS);
}

/**
 * Score de pertinence, jamais négatif.
 * Pondérations : géographie France > junior/alternance > stack > remote >
 * fraîcheur, avec malus séniorité.
 */
export function scoreJob(job: Pick<JobItem, "title" | "location" | "tags" | "remote" | "publishedAt">, now = Date.now()): number {
  const text = haystack(job);
  let score = 10;

  if (hasAny(text, FRANCE_TERMS)) score += 40;
  else if (hasAny(text, EUROPE_TERMS)) score += 15;

  if (hasAny(text, JUNIOR_TERMS)) score += 30;
  if (hasAny(text, SENIOR_TERMS)) score -= 18;

  score += Math.min(countAny(text, STACK_TERMS) * 6, 18);

  if (job.remote) score += 8;

  // Fraîcheur : bonus dégressif sur 30 jours.
  if (job.publishedAt) {
    const ageDays = (now - new Date(job.publishedAt).getTime()) / 864e5;
    if (Number.isFinite(ageDays) && ageDays >= 0) {
      score += Math.max(0, 15 - ageDays * 0.5);
    }
  }

  return Math.max(0, Math.round(score));
}

/**
 * Filtre le non-tech, déduplique, calcule le score et trie.
 * Dédup sur titre+entreprise : Arbeitnow republie littéralement la même offre
 * plusieurs fois dans un même lot (observé sur « Senior Android Developer »).
 */
export function rankJobs(jobs: JobItem[], limit = 24, now = Date.now()): JobItem[] {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];

  const seen = new Set<string>();
  const out: JobItem[] = [];

  for (const job of jobs) {
    if (!job?.title || !job?.url) continue;
    if (!isTechJob(job)) continue;

    const fingerprint = `${job.title}|${job.company}`.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    out.push({ ...job, relevance: scoreJob(job, now) });
  }

  return out.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
}
