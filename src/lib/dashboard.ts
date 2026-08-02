import type { FeedItem, JobItem, JobSource, SourceResult } from "./sources/types";
import { runSource } from "./runSource";
import { rankJobs } from "./relevance";
import {
  fetchArsTechnica,
  fetchDevto,
  fetchGithubBlog,
  fetchGithubTrending,
  fetchHackerNews,
  fetchLeMonde,
} from "./sources/tech";
import { ArbeitnowSource, JobicySource, RemotiveSource } from "./sources/jobs/publicSources";
import { WeWorkRemotelySource } from "./sources/jobs/weWorkRemotely";
import { FranceTravailSource } from "./sources/jobs/franceTravail";

/**
 * Composition du tableau de bord.
 *
 * Toutes les sources partent EN PARALLÈLE (Promise.all sur des runSource, qui
 * ne rejettent jamais). Conséquence : le temps de rendu est celui de la source
 * la plus lente, pas la somme ; et une source morte laisse simplement une carte
 * en erreur au milieu d'une page qui s'affiche normalement.
 */

/** Instanciées une fois au niveau module : le cache token FT survit entre requêtes chaudes. */
const JOB_SOURCES: JobSource[] = [
  new FranceTravailSource(),
  new RemotiveSource(),
  new JobicySource(),
  new ArbeitnowSource(),
  new WeWorkRemotelySource(),
];

export interface DashboardSection<T> {
  title: string;
  results: SourceResult<T>[];
}

export interface Dashboard {
  tech: SourceResult<FeedItem>[];
  world: SourceResult<FeedItem>[];
  jobs: {
    results: SourceResult<JobItem>[];
    /** Offres fusionnées, filtrées et triées par pertinence. */
    ranked: JobItem[];
  };
  generatedAt: string;
  /** Sources désactivées faute d'identifiants — affichées comme « en attente ». */
  pending: { key: string; label: string }[];
}

export async function getDashboard(): Promise<Dashboard> {
  const [tech, world, jobResults] = await Promise.all([
    Promise.all([
      runSource(
        { key: "hn", label: "Hacker News", homepage: "https://news.ycombinator.com", revalidate: 600 },
        () => fetchHackerNews(12),
      ),
      runSource({ key: "devto", label: "dev.to", homepage: "https://dev.to", revalidate: 600 }, () => fetchDevto(12)),
      runSource(
        { key: "ghtrending", label: "GitHub Trending", homepage: "https://github.com", revalidate: 900 },
        () => fetchGithubTrending(10),
      ),
      runSource(
        { key: "ghblog", label: "GitHub Blog", homepage: "https://github.blog", revalidate: 900 },
        () => fetchGithubBlog(8),
      ),
      runSource(
        { key: "ars", label: "Ars Technica", homepage: "https://arstechnica.com", revalidate: 900 },
        () => fetchArsTechnica(10),
      ),
    ]),
    Promise.all([
      runSource({ key: "lemonde", label: "Le Monde", homepage: "https://www.lemonde.fr", revalidate: 600 }, () =>
        fetchLeMonde(12),
      ),
    ]),
    Promise.all(
      JOB_SOURCES.filter((s) => s.isEnabled()).map((s) =>
        runSource({ key: s.key, label: s.label, homepage: s.homepage, revalidate: s.revalidate }, () => s.fetchJobs()),
      ),
    ),
  ]);

  return {
    tech,
    world,
    jobs: {
      results: jobResults,
      ranked: rankJobs(jobResults.flatMap((r) => r.items), 30),
    },
    generatedAt: new Date().toISOString(),
    pending: JOB_SOURCES.filter((s) => !s.isEnabled()).map((s) => ({ key: s.key, label: s.label })),
  };
}
