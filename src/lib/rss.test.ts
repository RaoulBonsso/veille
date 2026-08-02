import { describe, it, expect } from "vitest";
import { parseRss, stripHtml, toIsoDate } from "./rss";

describe("stripHtml", () => {
  it("retire les balises et décode les entités", () => {
    expect(stripHtml("<p>Bonjour <strong>toi</strong></p>")).toBe("Bonjour toi");
    expect(stripHtml("Don&#8217;t stop &amp; go")).toBe("Don’t stop & go");
    expect(stripHtml("a &lt;tag&gt; b")).toBe("a <tag> b");
  });

  it("supprime les blocs script/style au lieu d'en garder le contenu", () => {
    expect(stripHtml("<style>.a{color:red}</style>Texte")).toBe("Texte");
    expect(stripHtml("<script>alert(1)</script>Texte")).toBe("Texte");
  });

  it("normalise les espaces et gère le vide", () => {
    expect(stripHtml("  a\n\n   b  ")).toBe("a b");
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml("")).toBe("");
  });
});

describe("toIsoDate", () => {
  it("convertit une date RFC 822 en ISO UTC", () => {
    expect(toIsoDate("Fri, 31 Jul 2026 16:00:00 +0000")).toBe("2026-07-31T16:00:00.000Z");
  });

  it("gère le décalage horaire de Le Monde (+0200)", () => {
    expect(toIsoDate("Sat, 01 Aug 2026 20:24:03 +0200")).toBe("2026-08-01T18:24:03.000Z");
  });

  it("renvoie null sur une date absente ou illisible", () => {
    expect(toIsoDate(undefined)).toBeNull();
    expect(toIsoDate("pas une date")).toBeNull();
    expect(toIsoDate("")).toBeNull();
  });
});

describe("parseRss", () => {
  // Extrait fidèle du flux GitHub Blog : CDATA, entités HTML, catégories multiples.
  const githubish = `<?xml version="1.0"?><rss version="2.0"><channel>
    <title>The GitHub Blog</title>
    <item>
      <title>Don&#8217;t stop early: Case-folding source code</title>
      <link>https://github.blog/engineering/dont-stop-early/</link>
      <dc:creator><![CDATA[Alexander Neubeck]]></dc:creator>
      <pubDate>Fri, 31 Jul 2026 16:00:00 +0000</pubDate>
      <category><![CDATA[Engineering]]></category>
      <category><![CDATA[Rust]]></category>
      <guid isPermaLink="false">https://github.blog/?p=1</guid>
      <description><![CDATA[<p>Un <b>résumé</b> riche.</p>]]></description>
    </item>
  </channel></rss>`;

  it("extrait les champs d'un item", () => {
    const items = parseRss(githubish);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Don’t stop early: Case-folding source code");
    expect(items[0].link).toBe("https://github.blog/engineering/dont-stop-early/");
    expect(items[0].author).toBe("Alexander Neubeck");
    expect(items[0].isoDate).toBe("2026-07-31T16:00:00.000Z");
    expect(items[0].description).toBe("Un résumé riche.");
    expect(items[0].categories).toEqual(["Engineering", "Rust"]);
  });

  it("gère le dc:creator multi-ligne d'Ars Technica", () => {
    const ars = `<rss><channel><item>
      <title>Claude published malicious code</title>
      <link>https://arstechnica.com/security/2026/07/x/</link>
      <dc:creator>
          <![CDATA[Dan Goodin]]>
      </dc:creator>
      <pubDate>Thu, 31 Jul 2026 12:00:00 +0000</pubDate>
    </item></channel></rss>`;
    const items = parseRss(ars);
    expect(items[0].author).toBe("Dan Goodin");
  });

  it("retombe sur le guid quand <link> est absent (cas Le Monde)", () => {
    const lemonde = `<rss><channel><item>
      <title><![CDATA[EN DIRECT, incendies dans le Var]]></title>
      <pubDate>Sat, 01 Aug 2026 20:24:03 +0200</pubDate>
      <guid isPermaLink="true">https://www.lemonde.fr/planete/live/2026/08/01/var</guid>
    </item></channel></rss>`;
    const items = parseRss(lemonde);
    expect(items[0].link).toBe("https://www.lemonde.fr/planete/live/2026/08/01/var");
    expect(items[0].title).toBe("EN DIRECT, incendies dans le Var");
  });

  it("ignore les items sans titre ou sans lien exploitable", () => {
    const bad = `<rss><channel>
      <item><title>Sans lien</title></item>
      <item><link>https://ok.example/a</link></item>
      <item><title>Bon</title><link>https://ok.example/b</link></item>
    </channel></rss>`;
    expect(parseRss(bad)).toHaveLength(1);
    expect(parseRss(bad)[0].title).toBe("Bon");
  });

  it("gère le format Atom (<entry> + <link href>)", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Un billet Atom</title>
        <link href="https://exemple.dev/atom-1" rel="alternate"/>
        <updated>2026-08-01T10:00:00Z</updated>
      </entry>
    </feed>`;
    const items = parseRss(atom);
    expect(items[0].title).toBe("Un billet Atom");
    expect(items[0].link).toBe("https://exemple.dev/atom-1");
    expect(items[0].isoDate).toBe("2026-08-01T10:00:00.000Z");
  });

  it("ne jette pas sur du XML vide ou malformé — renvoie []", () => {
    expect(parseRss("")).toEqual([]);
    expect(parseRss("<rss><channel></channel></rss>")).toEqual([]);
    expect(parseRss("<<<pas du xml>>>")).toEqual([]);
  });

  it("respecte la limite demandée", () => {
    const many = `<rss><channel>${Array.from({ length: 30 }, (_, i) => `<item><title>T${i}</title><link>https://e.dev/${i}</link></item>`).join("")}</channel></rss>`;
    expect(parseRss(many, 8)).toHaveLength(8);
  });
});
