import { describe, it, expect } from "vitest";
import { scoreJob, isTechJob, rankJobs } from "./relevance";

const base = {
  id: "1",
  company: "Acme",
  url: "https://e.dev/1",
  source: "Test",
  publishedAt: "2026-08-01T00:00:00.000Z",
  tags: [] as string[],
  remote: false,
  relevance: 0,
};

describe("isTechJob", () => {
  it("reconnaît les intitulés de dev", () => {
    expect(isTechJob({ ...base, title: "Senior Fullstack Engineer", location: "Berlin" })).toBe(true);
    expect(isTechJob({ ...base, title: "Développeur web React", location: "Paris" })).toBe(true);
    expect(isTechJob({ ...base, title: "Backend Developer (Node.js)", location: "" })).toBe(true);
  });

  it("écarte le non-tech — c'est ce qui a disqualifié RemoteOK", () => {
    expect(isTechJob({ ...base, title: "Nanny Camp Hill", location: "" })).toBe(false);
    expect(isTechJob({ ...base, title: "Voice Over Artist", location: "" })).toBe(false);
    expect(isTechJob({ ...base, title: "Cleaner", location: "" })).toBe(false);
    expect(isTechJob({ ...base, title: "Join Our Team", location: "" })).toBe(false);
  });

  it("rattrape via les tags quand le titre est ambigu", () => {
    expect(isTechJob({ ...base, title: "Product Engineer", location: "", tags: ["react", "typescript"] })).toBe(true);
  });

  // Régressions observées sur données réelles lors du smoke test du 2026-08-01.
  it("écarte les rôles commerciaux qui remontaient dans le top 5", () => {
    expect(isTechJob({ ...base, title: "Business Development Representative", location: "Europe, France" })).toBe(false);
    expect(isTechJob({ ...base, title: "Sales Development Representative", location: "Remote" })).toBe(false);
  });

  it("écarte les postes d'analyste, hors cible pour un dev full-stack", () => {
    expect(isTechJob({ ...base, title: "Online Data Analyst Canada (French Language)", location: "Canada" })).toBe(false);
  });

  it("garde malgré tout les rôles d'ingénierie data", () => {
    expect(isTechJob({ ...base, title: "(Junior) Data Engineer - Data Platform", location: "Remote" })).toBe(true);
    expect(isTechJob({ ...base, title: "Analytics Engineer", location: "France" })).toBe(true);
  });
});

describe("scoreJob", () => {
  it("classe la France au-dessus du reste de l'Europe", () => {
    const fr = scoreJob({ ...base, title: "Fullstack Developer", location: "Paris, France" });
    const de = scoreJob({ ...base, title: "Fullstack Developer", location: "Berlin, Germany" });
    expect(fr).toBeGreaterThan(de);
  });

  it("valorise l'alternance et le niveau junior", () => {
    const alt = scoreJob({ ...base, title: "Alternance Développeur Full-Stack", location: "Lyon, France" });
    const senior = scoreJob({ ...base, title: "Senior Staff Engineer", location: "Lyon, France" });
    expect(alt).toBeGreaterThan(senior);
  });

  it("pénalise les postes très séniors, hors de portée d'un junior", () => {
    const junior = scoreJob({ ...base, title: "Junior Developer", location: "Remote, Europe" });
    const principal = scoreJob({ ...base, title: "Principal Engineer", location: "Remote, Europe" });
    expect(junior).toBeGreaterThan(principal);
  });

  it("bonifie le remote, accessible depuis la France", () => {
    const remote = scoreJob({ ...base, title: "Fullstack Developer", location: "EMEA", remote: true });
    const onsite = scoreJob({ ...base, title: "Fullstack Developer", location: "EMEA", remote: false });
    expect(remote).toBeGreaterThan(onsite);
  });

  it("ne confond pas « French Language » avec un poste en France", () => {
    // Observé en vrai : une offre canadienne « (French Language) » se classait 3e.
    const canada = scoreJob({ ...base, title: "Data Engineer (French Language)", location: "Canada" });
    const paris = scoreJob({ ...base, title: "Data Engineer", location: "Paris, France" });
    expect(paris).toBeGreaterThan(canada);
  });

  it("valorise la stack de Joyboy (React, Next, Node, Python, Go)", () => {
    const stack = scoreJob({ ...base, title: "Developer", location: "France", tags: ["react", "nextjs", "node"] });
    const other = scoreJob({ ...base, title: "Developer", location: "France", tags: ["cobol", "as400"] });
    expect(stack).toBeGreaterThan(other);
  });

  it("favorise une offre récente sur une offre ancienne", () => {
    const now = Date.now();
    const fresh = scoreJob(
      { ...base, title: "Fullstack Developer", location: "France", publishedAt: new Date(now - 3600_000).toISOString() },
      now,
    );
    const old = scoreJob(
      { ...base, title: "Fullstack Developer", location: "France", publishedAt: new Date(now - 40 * 864e5).toISOString() },
      now,
    );
    expect(fresh).toBeGreaterThan(old);
  });

  it("ne renvoie jamais un score négatif", () => {
    expect(scoreJob({ ...base, title: "Principal VP of Sales", location: "Tokyo" })).toBeGreaterThanOrEqual(0);
  });
});

describe("rankJobs", () => {
  const jobs = [
    { ...base, id: "a", title: "Cleaner", location: "Paris, France" },
    { ...base, id: "b", title: "Senior Backend Engineer", location: "Berlin" },
    { ...base, id: "c", title: "Alternance Développeur Full-Stack React", location: "Paris, France" },
  ];

  it("filtre le non-tech et trie par pertinence décroissante", () => {
    const out = rankJobs(jobs);
    expect(out.map((j) => j.id)).toEqual(["c", "b"]);
    expect(out[0].relevance).toBeGreaterThan(out[1].relevance);
  });

  it("déduplique sur titre+entreprise (Arbeitnow republie les mêmes offres)", () => {
    const dupes = [
      { ...base, id: "x", title: "Senior Android Developer (Remote)", company: "Foo", location: "Germany" },
      { ...base, id: "y", title: "Senior Android Developer (Remote)", company: "Foo", location: "Germany" },
    ];
    expect(rankJobs(dupes)).toHaveLength(1);
  });

  it("respecte la limite", () => {
    expect(rankJobs(jobs, 1)).toHaveLength(1);
  });

  it("ne jette pas sur une liste vide", () => {
    expect(rankJobs([])).toEqual([]);
  });
});
