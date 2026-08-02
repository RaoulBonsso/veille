import type { JobItem, JobSource } from "../types";
import { parseRss, readTag, toIsoDate } from "../../rss";

/**
 * We Work Remotely — flux RSS « remote programming jobs ».
 *
 * Testé le 2026-08-02 : HTTP 200, 25 offres réelles, dont des postes
 * explicitement « Remote in Europe ». Sans clé d'API, sans quota.
 *
 * Deux particularités du flux, couvertes par les tests :
 *   1. le titre encode « Entreprise: Poste » ;
 *   2. la localisation vit dans une balise maison `<region>`, hors RSS 2.0 —
 *      d'où `RssItem.raw` + `readTag` plutôt qu'un champ ad hoc dans le parseur.
 */

const FEED_URL = "https://weworkremotely.com/categories/remote-programming-jobs.rss";
const UA = "Mozilla/5.0 (compatible; VeilleBot/1.0; +https://github.com/RaoulBonsso/veille)";

/**
 * Parse le XML WWR vers des JobItem. Fonction PURE et exportée : c'est elle
 * qu'on teste, sans réseau. La classe ne fait plus que le fetch.
 */
export function parseWeWorkRemotely(xml: string, limit = 25): JobItem[] {
  return parseRss(xml, limit).map((item) => {
    // « MapTiler: Location Services Engineer » → entreprise + poste.
    // On coupe au PREMIER « : » seulement : « Acme: Engineer: Platform »
    // doit garder « Engineer: Platform » comme intitulé.
    const sep = item.title.indexOf(": ");
    const company = sep > 0 ? item.title.slice(0, sep).trim() : "We Work Remotely";
    const title = sep > 0 ? item.title.slice(sep + 2).trim() : item.title.trim();

    return {
      id: `wwr:${item.link}`,
      title,
      company,
      location: readTag(item.raw, "region") ?? "Remote",
      remote: true, // WWR ne publie que du remote, par construction.
      url: item.link,
      source: "We Work Remotely",
      publishedAt: item.isoDate ?? toIsoDate(readTag(item.raw, "pubDate")),
      tags: item.categories.slice(0, 3),
      contract: null,
      relevance: 0, // le scoring appartient à rankJobs, jamais à l'adaptateur.
    };
  });
}

export class WeWorkRemotelySource implements JobSource {
  key = "wwr";
  label = "We Work Remotely";
  homepage = "https://weworkremotely.com";
  revalidate = 900;

  isEnabled() {
    return true;
  }

  async fetchJobs(): Promise<JobItem[]> {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml, */*" },
      next: { revalidate: this.revalidate, tags: ["jobs", this.key] },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur weworkremotely.com`);

    const jobs = parseWeWorkRemotely(await res.text());
    if (jobs.length === 0) throw new Error("Flux vide ou illisible");
    return jobs;
  }
}
