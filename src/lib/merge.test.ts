import { describe, it, expect } from "vitest";
import { mergeFeeds } from "./merge";
import type { FeedItem, SourceResult } from "./sources/types";

function result(key: string, items: Partial<FeedItem>[], failed = false): SourceResult<FeedItem> {
  return {
    key,
    label: key,
    homepage: `https://${key}.example`,
    items: items.map((it, i) => ({
      id: it.id ?? `${key}:${i}`,
      title: it.title ?? `Titre ${i}`,
      url: it.url ?? `https://${key}.example/${i}`,
      source: key,
      publishedAt: it.publishedAt ?? null,
      ...it,
    })) as FeedItem[],
    failed,
    error: failed ? "boom" : null,
    fetchedAt: "2026-08-02T08:00:00.000Z",
    revalidate: 600,
  };
}

describe("mergeFeeds", () => {
  it("fusionne plusieurs sources et trie du plus récent au plus ancien", () => {
    const merged = mergeFeeds([
      result("a", [{ title: "Vieux", publishedAt: "2026-08-01T06:00:00.000Z" }]),
      result("b", [{ title: "Récent", publishedAt: "2026-08-02T07:00:00.000Z" }]),
      result("c", [{ title: "Milieu", publishedAt: "2026-08-01T20:00:00.000Z" }]),
    ]);
    expect(merged.map((i) => i.title)).toEqual(["Récent", "Milieu", "Vieux"]);
  });

  it("place les items sans date en fin de liste plutôt que de les perdre", () => {
    const merged = mergeFeeds([
      result("a", [{ title: "Sans date", publishedAt: null }]),
      result("b", [{ title: "Daté", publishedAt: "2026-08-01T06:00:00.000Z" }]),
    ]);
    expect(merged.map((i) => i.title)).toEqual(["Daté", "Sans date"]);
  });

  it("déduplique sur l'URL — le même lien remonte souvent sur HN et dev.to", () => {
    const merged = mergeFeeds([
      result("a", [{ title: "Depuis A", url: "https://exemple.dev/article" }]),
      result("b", [{ title: "Depuis B", url: "https://exemple.dev/article" }]),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Depuis A"); // la première source déclarée gagne
  });

  it("ignore les sources en échec sans faire tomber la fusion", () => {
    const merged = mergeFeeds([result("mort", [], true), result("vivant", [{ title: "Debout" }])]);
    expect(merged.map((i) => i.title)).toEqual(["Debout"]);
  });

  it("écarte les items inexploitables (sans titre ou sans url)", () => {
    const merged = mergeFeeds([result("a", [{ title: "", url: "https://x.dev/1" }, { title: "Bon", url: "" }])]);
    expect(merged).toEqual([]);
  });

  it("respecte la limite demandée", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ title: `T${i}`, url: `https://e.dev/${i}` }));
    expect(mergeFeeds([result("a", many)], 12)).toHaveLength(12);
  });

  it("renvoie [] quand toutes les sources sont mortes — jamais d'exception", () => {
    expect(mergeFeeds([result("x", [], true), result("y", [], true)])).toEqual([]);
    expect(mergeFeeds([])).toEqual([]);
  });
});

describe("mergeFeeds — fraîcheur", () => {
  it("expose la date la plus récente en tête, ce qui pilote l'horodatage de section", () => {
    const merged = mergeFeeds([
      result("a", [
        { title: "A1", publishedAt: "2026-08-02T05:00:00.000Z" },
        { title: "A2", publishedAt: "2026-08-02T09:00:00.000Z" },
      ]),
    ]);
    expect(merged[0].publishedAt).toBe("2026-08-02T09:00:00.000Z");
  });
});
