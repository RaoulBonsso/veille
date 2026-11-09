import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDevto, fetchGithubTrending, fetchHackerNews } from "./tech";

/**
 * Les sources tech mêlent réseau et normalisation. Les commentaires du
 * module promettent des comportements précis — « un item qui tombe ne doit
 * pas faire tomber toute la source », « le token est optionnel » — mais
 * rien ne les vérifiait : une régression sur l'un d'eux se serait vue en
 * production, sous la forme d'un panneau vide ou d'une source en erreur.
 *
 * On remplace fetch pour piloter les réponses et observer les requêtes
 * réellement émises.
 */

type Reponse = { ok?: boolean; status?: number; json?: unknown; text?: string };

/** Construit un faux fetch qui répond selon l'URL demandée. */
function faireFetch(routes: Array<[RegExp, Reponse]>) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url.toString();
    const trouve = routes.find(([motif]) => motif.test(href));
    const r: Reponse = trouve ? trouve[1] : { ok: false, status: 404 };
    appels.push({ href, init });
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json,
      text: async () => r.text ?? "",
    } as Response;
  });
}

let appels: Array<{ href: string; init?: RequestInit }> = [];

beforeEach(() => {
  appels = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ─────────────────────────── Hacker News ───────────────────────────

const HISTOIRE = {
  id: 42,
  title: "Un titre depuis Hacker News",
  url: "https://exemple.fr/article",
  score: 315,
  by: "auteur_hn",
  time: 1_784_000_000,
  descendants: 87,
};

describe("fetchHackerNews", () => {
  it("normalise une histoire complète", async () => {
    vi.stubGlobal(
      "fetch",
      faireFetch([
        [/topstories/, { json: [42] }],
        [/item\/42/, { json: HISTOIRE }],
      ]),
    );

    const [item] = await fetchHackerNews(1);

    expect(item.id).toBe("hn:42");
    expect(item.title).toBe("Un titre depuis Hacker News");
    expect(item.url).toBe("https://exemple.fr/article");
    expect(item.source).toBe("Hacker News");
    expect(item.author).toBe("auteur_hn");
    expect(item.score).toBe(315);
    expect(item.scoreLabel).toBe("points");
    expect(item.comments).toBe(87);
    expect(item.publishedAt).toBe(new Date(1_784_000_000 * 1000).toISOString());
    expect(item.discussionUrl).toBe("https://news.ycombinator.com/item?id=42");
  });

  it("renvoie vers la discussion quand l'histoire n'a pas de lien externe", async () => {
    // Cas courant : les « Ask HN » n'ont pas d'URL.
    vi.stubGlobal(
      "fetch",
      faireFetch([
        [/topstories/, { json: [42] }],
        [/item\/42/, { json: { ...HISTOIRE, url: undefined } }],
      ]),
    );

    const [item] = await fetchHackerNews(1);
    expect(item.url).toBe("https://news.ycombinator.com/item?id=42");
  });

  it("survit à un item en échec sans perdre les autres", async () => {
    // La promesse du module : un item qui tombe ne fait pas tomber la source.
    vi.stubGlobal(
      "fetch",
      faireFetch([
        [/topstories/, { json: [1, 2] }],
        [/item\/1/, { ok: false, status: 500 }],
        [/item\/2/, { json: { ...HISTOIRE, id: 2 } }],
      ]),
    );

    const items = await fetchHackerNews(2);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("hn:2");
  });

  it("écarte les items sans titre", async () => {
    vi.stubGlobal(
      "fetch",
      faireFetch([
        [/topstories/, { json: [1] }],
        [/item\/1/, { json: { id: 1, url: "https://exemple.fr" } }],
      ]),
    );

    expect(await fetchHackerNews(1)).toEqual([]);
  });

  it("respecte la limite demandée plutôt que la taille de la liste", async () => {
    vi.stubGlobal(
      "fetch",
      faireFetch([
        [/topstories/, { json: [1, 2, 3, 4, 5] }],
        [/item\/\d/, { json: HISTOIRE }],
      ]),
    );

    await fetchHackerNews(2);
    const appelsItems = appels.filter((a) => /item\//.test(a.href));
    expect(appelsItems).toHaveLength(2);
  });

  it("rejette une réponse qui n'est pas une liste d'identifiants", async () => {
    vi.stubGlobal("fetch", faireFetch([[/topstories/, { json: { erreur: true } }]]));
    await expect(fetchHackerNews()).rejects.toThrow(/inattendue/);
  });

  it("nomme le domaine fautif quand la requête échoue", async () => {
    vi.stubGlobal("fetch", faireFetch([[/topstories/, { ok: false, status: 503 }]]));
    await expect(fetchHackerNews()).rejects.toThrow(/503.*hacker-news\.firebaseio\.com/);
  });
});

// ─────────────────────────── dev.to ───────────────────────────

const ARTICLE = {
  id: 7,
  title: "Un article dev.to",
  url: "https://dev.to/quelquun/un-article",
  published_at: "2026-08-01T10:00:00.000Z",
  positive_reactions_count: 120,
  comments_count: 14,
  tag_list: ["react", "typescript", "testing", "node", "web"],
  description: "<p>Un résumé <b>avec</b> du HTML.</p>",
  user: { name: "Quelqu'un" },
};

describe("fetchDevto", () => {
  it("normalise un article et nettoie le HTML du résumé", async () => {
    vi.stubGlobal("fetch", faireFetch([[/dev\.to/, { json: [ARTICLE] }]]));

    const [item] = await fetchDevto(1);

    expect(item.id).toBe("devto:7");
    expect(item.source).toBe("dev.to");
    expect(item.author).toBe("Quelqu'un");
    expect(item.score).toBe(120);
    expect(item.scoreLabel).toBe("réactions");
    expect(item.summary).not.toContain("<");
    expect(item.summary).toContain("Un résumé");
  });

  it("ne garde que quatre étiquettes", async () => {
    vi.stubGlobal("fetch", faireFetch([[/dev\.to/, { json: [ARTICLE] }]]));
    const [item] = await fetchDevto(1);
    expect(item.tags).toHaveLength(4);
  });

  it("tronque la liste à la limite demandée", async () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) => ({ ...ARTICLE, id: i }));
    vi.stubGlobal("fetch", faireFetch([[/dev\.to/, { json: beaucoup }]]));
    expect(await fetchDevto(5)).toHaveLength(5);
  });

  it("rejette une réponse qui n'est pas une liste", async () => {
    vi.stubGlobal("fetch", faireFetch([[/dev\.to/, { json: { erreur: true } }]]));
    await expect(fetchDevto()).rejects.toThrow(/inattendue/);
  });
});

// ─────────────────────── Tendances GitHub ───────────────────────

const DEPOT = {
  id: 900,
  full_name: "quelquun/projet",
  html_url: "https://github.com/quelquun/projet",
  description: "Une description",
  stargazers_count: 1234,
  language: "Rust",
  created_at: "2026-07-28T08:00:00.000Z",
  owner: { login: "quelquun" },
  topics: ["cli", "async", "parser"],
};

describe("fetchGithubTrending", () => {
  it("normalise un dépôt", async () => {
    vi.stubGlobal("fetch", faireFetch([[/api\.github\.com/, { json: { items: [DEPOT] } }]]));

    const [item] = await fetchGithubTrending(1);

    expect(item.id).toBe("gh:900");
    expect(item.title).toBe("quelquun/projet");
    expect(item.author).toBe("quelquun");
    expect(item.score).toBe(1234);
    expect(item.scoreLabel).toBe("étoiles");
    expect(item.tags[0]).toBe("Rust");
    expect(item.tags).toHaveLength(3);
  });

  it("n'envoie pas d'en-tête d'autorisation sans jeton", async () => {
    // Le module annonce un jeton optionnel : sans lui, la requête doit
    // partir quand même, en anonyme.
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubGlobal("fetch", faireFetch([[/api\.github\.com/, { json: { items: [DEPOT] } }]]));

    await fetchGithubTrending(1);

    const entetes = appels[0].init?.headers as Record<string, string>;
    expect(entetes.Authorization).toBeUndefined();
  });

  it("joint le jeton quand il est présent", async () => {
    vi.stubEnv("GITHUB_TOKEN", "  jeton-de-test  ");
    vi.stubGlobal("fetch", faireFetch([[/api\.github\.com/, { json: { items: [DEPOT] } }]]));

    await fetchGithubTrending(1);

    const entetes = appels[0].init?.headers as Record<string, string>;
    // Les espaces autour du jeton sont retirés : un .env mal collé ne doit
    // pas produire un en-tête invalide.
    expect(entetes.Authorization).toBe("Bearer jeton-de-test");
  });

  it("échoue explicitement quand la recherche ne renvoie rien", async () => {
    vi.stubGlobal("fetch", faireFetch([[/api\.github\.com/, { json: { items: [] } }]]));
    await expect(fetchGithubTrending()).rejects.toThrow(/Aucun dépôt/);
  });

  it("ne cherche que des dépôts récents et déjà remarqués", async () => {
    vi.stubGlobal("fetch", faireFetch([[/api\.github\.com/, { json: { items: [DEPOT] } }]]));
    await fetchGithubTrending(1);
    const requete = decodeURIComponent(appels[0].href);
    expect(requete).toMatch(/created:>\d{4}-\d{2}-\d{2}/);
    expect(requete).toContain("stars:>30");
    expect(requete).toContain("sort=stars");
  });
});
