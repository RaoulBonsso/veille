import { describe, it, expect } from "vitest";
import { parseWeWorkRemotely } from "./weWorkRemotely";

/**
 * Fixture : extrait FIDÈLE du flux réel récupéré le 2026-08-02 sur
 * https://weworkremotely.com/categories/remote-programming-jobs.rss
 * (titre « Entreprise: Poste », balise <region> maison, description en HTML échappé).
 * On teste sur du vrai XML, pas sur une idée de ce à quoi il ressemble.
 */
const WWR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>We Work Remotely: Remote jobs</title>
  <item>
    <media:content url="https://wwr-pro.s3.amazonaws.com/logos/0144/3523/logo.gif" type="image/png"/>
    <title>MapTiler: Location Services Engineer | Maps Platform (Remote in Europe)</title>
    <region>Anywhere in the World</region>
    <category>Back-End Programming</category>
    <description>&lt;p&gt;&lt;strong&gt;Headquarters:&lt;/strong&gt; Zug, Switzerland&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Full-time&lt;/li&gt;&lt;li&gt;Remote in Europe&lt;/li&gt;&lt;/ul&gt;</description>
    <pubDate>Fri, 01 Aug 2026 09:12:00 +0000</pubDate>
    <link>https://weworkremotely.com/remote-jobs/maptiler-location-services-engineer</link>
  </item>
  <item>
    <title>Proxify AB: Senior Fullstack Developer (Python)</title>
    <region>Europe</region>
    <category>Full-Stack Programming</category>
    <description>&lt;p&gt;Rejoignez-nous&lt;/p&gt;</description>
    <pubDate>Thu, 31 Jul 2026 18:00:00 +0000</pubDate>
    <link>https://weworkremotely.com/remote-jobs/proxify-ab-senior-fullstack-developer</link>
  </item>
</channel>
</rss>`;

describe("parseWeWorkRemotely", () => {
  it("sépare l'entreprise du poste — WWR encode « Entreprise: Poste » dans le titre", () => {
    const [first, second] = parseWeWorkRemotely(WWR_XML);
    expect(first.company).toBe("MapTiler");
    expect(first.title).toBe("Location Services Engineer | Maps Platform (Remote in Europe)");
    expect(second.company).toBe("Proxify AB");
    expect(second.title).toBe("Senior Fullstack Developer (Python)");
  });

  it("lit la balise <region> propre à WWR comme localisation", () => {
    const [first, second] = parseWeWorkRemotely(WWR_XML);
    expect(first.location).toBe("Anywhere in the World");
    expect(second.location).toBe("Europe");
  });

  it("normalise les champs communs de JobItem", () => {
    const [first] = parseWeWorkRemotely(WWR_XML);
    expect(first.id).toBe("wwr:https://weworkremotely.com/remote-jobs/maptiler-location-services-engineer");
    expect(first.url).toBe("https://weworkremotely.com/remote-jobs/maptiler-location-services-engineer");
    expect(first.source).toBe("We Work Remotely");
    expect(first.publishedAt).toBe("2026-08-01T09:12:00.000Z");
    expect(first.remote).toBe(true); // WWR est 100 % remote par construction
    expect(first.tags).toContain("Back-End Programming");
    expect(first.relevance).toBe(0); // le scoring est le travail de rankJobs, pas de l'adaptateur
  });

  it("garde le titre entier quand il n'y a pas de séparateur entreprise", () => {
    const xml = `<rss><channel><item>
      <title>Développeur Full-Stack junior</title>
      <region>France</region>
      <link>https://weworkremotely.com/remote-jobs/x</link>
    </item></channel></rss>`;
    const [job] = parseWeWorkRemotely(xml);
    expect(job.title).toBe("Développeur Full-Stack junior");
    expect(job.company).toBe("We Work Remotely");
  });

  it("ne coupe pas sur un « : » qui appartient au poste", () => {
    const xml = `<rss><channel><item>
      <title>Acme: Engineer: Platform</title>
      <region>Europe</region>
      <link>https://weworkremotely.com/remote-jobs/y</link>
    </item></channel></rss>`;
    const [job] = parseWeWorkRemotely(xml);
    expect(job.company).toBe("Acme");
    expect(job.title).toBe("Engineer: Platform");
  });

  it("ne jette jamais sur une entrée illisible", () => {
    expect(parseWeWorkRemotely("")).toEqual([]);
    expect(parseWeWorkRemotely("<rss><channel></channel></rss>")).toEqual([]);
    expect(parseWeWorkRemotely("pas du xml du tout")).toEqual([]);
  });
});
