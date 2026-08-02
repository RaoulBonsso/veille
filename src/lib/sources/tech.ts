import type { FeedItem } from "./types";
import { parseRss, stripHtml } from "../rss";

/**
 * Sources « tech ». Chaque fonction récupère + normalise, et peut jeter :
 * l'appelant (`runSource`) encapsule. Aucun try/catch ici — ce serait dupliquer
 * la résilience et masquer les erreurs qu'on veut afficher.
 */

const UA = "Mozilla/5.0 (compatible; VeilleBot/1.0; +https://github.com/RaoulBonsso/veille)";

/** fetch avec en-têtes communs et politique ISR par source. */
async function get(url: string, revalidate: number, tag: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: "application/json, text/xml, */*", ...(init.headers ?? {}) },
    next: { revalidate, tags: ["all", tag] },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${new URL(url).hostname}`);
  return res;
}

// ─────────────────────────── Hacker News ───────────────────────────
// API officielle Firebase. Deux étages : la liste d'IDs, puis un appel par
// item. On limite volontairement à 12 items pour ne pas faire 500 requêtes.

interface HnStory {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  by?: string;
  time?: number;
  descendants?: number;
  type?: string;
}

export async function fetchHackerNews(limit = 12): Promise<FeedItem[]> {
  const res = await get("https://hacker-news.firebaseio.com/v0/topstories.json", 600, "hn");
  const ids = (await res.json()) as number[];
  if (!Array.isArray(ids)) throw new Error("Réponse HN inattendue");

  const stories = await Promise.all(
    ids.slice(0, limit).map(async (id) => {
      try {
        const r = await get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 600, "hn");
        return (await r.json()) as HnStory;
      } catch {
        // Un item qui tombe ne doit pas faire tomber toute la source.
        return null;
      }
    }),
  );

  return stories
    .filter((s): s is HnStory => Boolean(s?.title))
    .map((s) => ({
      id: `hn:${s.id}`,
      title: s.title!,
      url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
      source: "Hacker News",
      publishedAt: s.time ? new Date(s.time * 1000).toISOString() : null,
      author: s.by ?? null,
      score: s.score ?? null,
      scoreLabel: "points",
      comments: s.descendants ?? null,
      discussionUrl: `https://news.ycombinator.com/item?id=${s.id}`,
    }));
}

// ─────────────────────────── dev.to ───────────────────────────

interface DevtoArticle {
  id: number;
  title: string;
  url: string;
  published_at: string;
  positive_reactions_count?: number;
  comments_count?: number;
  reading_time_minutes?: number;
  tag_list?: string[];
  description?: string;
  user?: { name?: string };
}

export async function fetchDevto(limit = 12): Promise<FeedItem[]> {
  const res = await get("https://dev.to/api/articles?per_page=30&top=1", 600, "devto");
  const data = (await res.json()) as DevtoArticle[];
  if (!Array.isArray(data)) throw new Error("Réponse dev.to inattendue");

  return data.slice(0, limit).map((a) => ({
    id: `devto:${a.id}`,
    title: a.title,
    url: a.url,
    source: "dev.to",
    publishedAt: a.published_at ? new Date(a.published_at).toISOString() : null,
    author: a.user?.name ?? null,
    summary: stripHtml(a.description).slice(0, 220) || null,
    score: a.positive_reactions_count ?? null,
    scoreLabel: "réactions",
    comments: a.comments_count ?? null,
    tags: (a.tag_list ?? []).slice(0, 4),
  }));
}

// ─────────────────────────── Flux RSS tech ───────────────────────────

async function fetchFeed(
  url: string,
  sourceName: string,
  prefix: string,
  revalidate: number,
  tag: string,
  limit: number,
): Promise<FeedItem[]> {
  const res = await get(url, revalidate, tag);
  const xml = await res.text();
  const items = parseRss(xml, limit);
  if (items.length === 0) throw new Error("Flux vide ou illisible");

  return items.map((it, i) => ({
    id: `${prefix}:${it.link || i}`,
    title: it.title,
    url: it.link,
    source: sourceName,
    publishedAt: it.isoDate,
    author: it.author,
    summary: it.description ? it.description.slice(0, 220) : null,
    tags: it.categories.slice(0, 3),
  }));
}

export function fetchGithubBlog(limit = 8): Promise<FeedItem[]> {
  return fetchFeed("https://github.blog/feed/", "GitHub Blog", "ghblog", 900, "ghblog", limit);
}

export function fetchArsTechnica(limit = 10): Promise<FeedItem[]> {
  return fetchFeed(
    "https://feeds.arstechnica.com/arstechnica/technology-lab",
    "Ars Technica",
    "ars",
    900,
    "ars",
    limit,
  );
}

// ─────────────────────── Tendances GitHub ───────────────────────
// Pas d'API officielle « trending ». On passe par l'API de recherche, filtrée
// sur les dépôts créés récemment et triés par étoiles : c'est l'approximation
// la plus proche, et elle est stable. Le token est optionnel (60 req/h sans,
// 5000 avec) — l'absence de token ne casse rien.

interface GhRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  created_at: string;
  owner?: { login?: string };
  topics?: string[];
}

export async function fetchGithubTrending(limit = 10): Promise<FeedItem[]> {
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const q = encodeURIComponent(`created:>${since} stars:>30`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`;

  const token = (process.env.GITHUB_TOKEN ?? "").trim();
  const res = await get(url, 900, "ghtrending", {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = (await res.json()) as { items?: GhRepo[] };
  const repos = Array.isArray(data.items) ? data.items : [];
  if (repos.length === 0) throw new Error("Aucun dépôt renvoyé");

  return repos.map((r) => ({
    id: `gh:${r.id}`,
    title: r.full_name,
    url: r.html_url,
    source: "GitHub Trending",
    publishedAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    author: r.owner?.login ?? null,
    summary: r.description ? stripHtml(r.description).slice(0, 200) : null,
    score: r.stargazers_count ?? null,
    scoreLabel: "étoiles",
    tags: [r.language, ...(r.topics ?? [])].filter((t): t is string => Boolean(t)).slice(0, 3),
  }));
}

// ─────────────────────────── Monde ───────────────────────────

export function fetchLeMonde(limit = 12): Promise<FeedItem[]> {
  return fetchFeed("https://www.lemonde.fr/rss/une.xml", "Le Monde", "lemonde", 600, "lemonde", limit);
}
