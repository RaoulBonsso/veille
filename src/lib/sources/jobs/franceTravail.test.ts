import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FranceTravailSource, normalizeFranceTravailOffer } from "./franceTravail";

/**
 * L'adaptateur France Travail est écrit et testé À VIDE : les identifiants
 * n'existent pas sur cette machine. Ces tests garantissent deux choses :
 *  1. tant que les variables sont absentes, il se désactive sans rien casser ;
 *  2. le jour où elles arrivent, le flux OAuth + la normalisation sont corrects.
 */

const OFFER = {
  id: "190MKBT",
  intitule: "Développeur / Développeuse full-stack (H/F)",
  description: "Au sein de notre équipe, vous participerez au développement...",
  dateCreation: "2026-07-30T09:12:00.000Z",
  entreprise: { nom: "TECH SOLUTIONS" },
  lieuTravail: { libelle: "75 - PARIS 09" },
  typeContrat: "CDI",
  typeContratLibelle: "Contrat à durée indéterminée",
  origineOffre: { urlOrigine: "https://candidat.francetravail.fr/offres/recherche/detail/190MKBT" },
  competences: [{ libelle: "React" }, { libelle: "Node.js" }],
  alternance: false,
};

describe("normalizeFranceTravailOffer", () => {
  it("normalise une offre réelle vers JobItem", () => {
    const j = normalizeFranceTravailOffer(OFFER);
    expect(j).not.toBeNull();
    expect(j!.id).toBe("france-travail:190MKBT");
    expect(j!.title).toBe("Développeur / Développeuse full-stack (H/F)");
    expect(j!.company).toBe("TECH SOLUTIONS");
    expect(j!.location).toBe("75 - PARIS 09");
    expect(j!.url).toContain("candidat.francetravail.fr");
    expect(j!.publishedAt).toBe("2026-07-30T09:12:00.000Z");
    expect(j!.source).toBe("France Travail");
    expect(j!.tags).toContain("React");
    expect(j!.contract).toBe("CDI");
  });

  it("reconstruit l'URL quand origineOffre est absente", () => {
    const j = normalizeFranceTravailOffer({ ...OFFER, origineOffre: undefined });
    expect(j!.url).toContain("190MKBT");
  });

  it("tolère une entreprise anonyme — fréquent sur France Travail", () => {
    const j = normalizeFranceTravailOffer({ ...OFFER, entreprise: {} });
    expect(j!.company).toBeTruthy();
  });

  it("marque l'alternance comme contrat dédié", () => {
    const j = normalizeFranceTravailOffer({ ...OFFER, alternance: true, typeContrat: "CDD" });
    expect(j!.contract).toMatch(/alternance/i);
  });

  it("renvoie null sur une offre inexploitable au lieu de jeter", () => {
    expect(normalizeFranceTravailOffer({})).toBeNull();
    expect(normalizeFranceTravailOffer({ id: "x" })).toBeNull();
    expect(normalizeFranceTravailOffer(null)).toBeNull();
  });
});

describe("FranceTravailSource — activation", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    delete process.env.FRANCE_TRAVAIL_CLIENT_ID;
    delete process.env.FRANCE_TRAVAIL_CLIENT_SECRET;
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.restoreAllMocks();
  });

  it("est DÉSACTIVÉE quand les variables sont absentes (état actuel de la machine)", () => {
    expect(new FranceTravailSource().isEnabled()).toBe(false);
  });

  it("reste désactivée si les variables existent mais sont vides", () => {
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "";
    process.env.FRANCE_TRAVAIL_CLIENT_SECRET = "   ";
    expect(new FranceTravailSource().isEnabled()).toBe(false);
  });

  it("reste désactivée si une seule des deux variables est fournie", () => {
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "abc";
    expect(new FranceTravailSource().isEnabled()).toBe(false);
  });

  it("S'ACTIVE TOUTE SEULE dès que les deux variables sont renseignées", () => {
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "abc";
    process.env.FRANCE_TRAVAIL_CLIENT_SECRET = "def";
    expect(new FranceTravailSource().isEnabled()).toBe(true);
  });

  it("désactivée, fetchJobs renvoie [] sans appeler le réseau", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const jobs = await new FranceTravailSource().fetchJobs();
    expect(jobs).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("FranceTravailSource — flux OAuth + recherche", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "id-test";
    process.env.FRANCE_TRAVAIL_CLIENT_SECRET = "secret-test";
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.restoreAllMocks();
  });

  function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(((url: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(handler(String(url), init))) as typeof fetch);
  }

  it("demande un token client_credentials puis interroge les offres", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "TOK", expires_in: 1499 }), { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [OFFER] }), { status: 200 });
    });

    const jobs = await new FranceTravailSource().fetchJobs();
    expect(calls[0]).toContain("access_token");
    expect(calls[1]).toContain("offresdemploi");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].company).toBe("TECH SOLUTIONS");
  });

  it("envoie le Bearer token sur la requête de recherche", async () => {
    let auth: string | undefined;
    mockFetch((url, init) => {
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "TOK", expires_in: 1499 }), { status: 200 });
      }
      auth = new Headers(init?.headers).get("Authorization") ?? undefined;
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });
    await new FranceTravailSource().fetchJobs();
    expect(auth).toBe("Bearer TOK");
  });

  it("ne met JAMAIS le secret dans l'URL — il passe dans le corps du POST", async () => {
    let tokenUrl = "";
    let body = "";
    mockFetch((url, init) => {
      if (url.includes("access_token")) {
        tokenUrl = url;
        body = String(init?.body ?? "");
        return new Response(JSON.stringify({ access_token: "TOK", expires_in: 1499 }), { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });
    await new FranceTravailSource().fetchJobs();
    expect(tokenUrl).not.toContain("secret-test");
    expect(body).toContain("secret-test");
    expect(body).toContain("grant_type=client_credentials");
  });

  it("remonte une erreur explicite sur invalid_client — l'échec observé ce soir", async () => {
    mockFetch(() => new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 }));
    await expect(new FranceTravailSource().fetchJobs()).rejects.toThrow(/invalid_client|identifiants/i);
  });

  it("traite le HTTP 204 (aucune offre) comme une liste vide, pas une erreur", async () => {
    mockFetch((url) =>
      url.includes("access_token")
        ? new Response(JSON.stringify({ access_token: "TOK", expires_in: 1499 }), { status: 200 })
        : new Response(null, { status: 204 }),
    );
    await expect(new FranceTravailSource().fetchJobs()).resolves.toEqual([]);
  });

  it("écarte les offres inexploitables sans faire tomber le lot entier", async () => {
    mockFetch((url) =>
      url.includes("access_token")
        ? new Response(JSON.stringify({ access_token: "TOK", expires_in: 1499 }), { status: 200 })
        : new Response(JSON.stringify({ resultats: [OFFER, {}, null, { id: "z" }] }), { status: 200 }),
    );
    const jobs = await new FranceTravailSource().fetchJobs();
    expect(jobs).toHaveLength(1);
  });
});
