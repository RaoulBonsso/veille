import type { JobItem, JobSource } from "../types";

/**
 * Adaptateur France Travail (ex-Pôle emploi) — API « Offres d'emploi v2 ».
 *
 * ÉTAT AU 2026-08-01 : INACTIF. Les variables FRANCE_TRAVAIL_CLIENT_ID /
 * _CLIENT_SECRET sont vides sur la machine, et l'authentification a été testée
 * ce soir : elle renvoie HTTP 400 {"error":"invalid_client"}. L'adaptateur est
 * néanmoins écrit et couvert par des tests (franceTravail.test.ts), et
 * `isEnabled()` le rebranche AUTOMATIQUEMENT dès que les deux variables sont
 * renseignées — sans modification de code.
 *
 * Sécurité : les identifiants ne sont lus que depuis process.env, jamais
 * écrits en dur, et le secret transite dans le CORPS du POST (jamais en query
 * string, où il finirait dans les logs d'accès). Un test verrouille ce point.
 *
 * Doc : https://francetravail.io/produits-partages/catalogue/offres-emploi/documentation
 */

const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
const SCOPE = "api_offresdemploiv2 o2dsoffre";

/** Codes ROME pertinents : études et développement informatique. */
const ROME_CODES = ["M1805", "M1802", "M1806"];

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Forme brute d'une offre telle que renvoyée par l'API, décrite en `unknown`.
 *
 * Pourquoi pas `any` : une réponse d'API tierce n'est PAS de confiance. `any`
 * désactiverait le compilateur exactement là où on en a le plus besoin — à la
 * frontière du système. En typant les champs en `unknown`, TypeScript nous
 * FORCE à vérifier chaque valeur avant usage, ce qui est précisément le
 * comportement voulu ici.
 */
interface RawOffer {
  id?: unknown;
  intitule?: unknown;
  origineOffre?: { urlOrigine?: unknown };
  alternance?: unknown;
  typeContrat?: unknown;
  typeContratLibelle?: unknown;
  competences?: unknown;
  lieuTravail?: { libelle?: unknown };
  entreprise?: { nom?: unknown };
  dureeTravailLibelle?: unknown;
  dateCreation?: unknown;
}

/** Renvoie la chaîne si c'en est une et qu'elle n'est pas vide, sinon null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Normalise une offre France Travail vers JobItem. Renvoie null si inexploitable. */
export function normalizeFranceTravailOffer(raw: unknown): JobItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as RawOffer;

  const id = str(o.id);
  const title = str(o.intitule);
  if (!id || !title) return null;

  const url =
    str(o.origineOffre?.urlOrigine) ??
    `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(id)}`;

  // L'alternance est portée par un booléen dédié, pas par le type de contrat :
  // c'est le cas qui nous intéresse le plus, on le remonte en clair.
  //
  // Ordre voulu : `typeContrat` donne le CODE court ("CDI", "CDD"), qui tient
  // dans une carte ; `typeContratLibelle` donne la phrase complète
  // ("Contrat à durée indéterminée"), gardée en repli seulement. Inverser les
  // deux casse l'affichage — un test verrouille ce point.
  const contract =
    o.alternance === true ? "Alternance" : str(o.typeContrat) ?? str(o.typeContratLibelle) ?? null;

  const tags = Array.isArray(o.competences)
    ? o.competences
        .map((c) => (c && typeof c === "object" ? str((c as { libelle?: unknown }).libelle) : null))
        .filter((v): v is string => v !== null)
        .slice(0, 6)
    : [];

  const location = str(o.lieuTravail?.libelle) ?? "France";
  const duree = str(o.dureeTravailLibelle) ?? "";
  const publishedAt = str(o.dateCreation);

  return {
    id: `france-travail:${id}`,
    title,
    company: str(o.entreprise?.nom) ?? "Entreprise non communiquée",
    location,
    remote: /t[ée]l[ée]travail/i.test(`${duree} ${location}`),
    url,
    source: "France Travail",
    publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
    tags,
    contract,
    relevance: 0,
  };
}

export class FranceTravailSource implements JobSource {
  key = "france-travail";
  label = "France Travail";
  homepage = "https://candidat.francetravail.fr";
  revalidate = 900;

  /**
   * Cache du token, porté par l'INSTANCE et non par le module.
   * Le registre n'instancie la source qu'une fois, donc le token est bien
   * réutilisé entre requêtes d'un même lambda chaud — mais chaque test part
   * d'une instance neuve, donc d'un cache vide. Un cache au niveau module
   * rendait les tests dépendants de leur ordre : c'est ce qu'ils ont révélé.
   */
  private cachedToken: { value: string; expiresAt: number } | null = null;

  /**
   * L'interrupteur. Les deux identifiants doivent être présents ET non vides.
   * Tant que ce n'est pas le cas, la source est ignorée silencieusement — pas
   * d'erreur rouge dans l'UI pour une intégration simplement pas encore active.
   */
  isEnabled(): boolean {
    return Boolean(env("FRANCE_TRAVAIL_CLIENT_ID") && env("FRANCE_TRAVAIL_CLIENT_SECRET"));
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) {
      return this.cachedToken.value;
    }

    // Le secret passe dans le corps, jamais dans l'URL.
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env("FRANCE_TRAVAIL_CLIENT_ID"),
      client_secret: env("FRANCE_TRAVAIL_CLIENT_SECRET"),
      scope: SCOPE,
    });

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => ({}))) as TokenResponse;

    if (!res.ok || !data.access_token) {
      const code = data.error ?? `HTTP ${res.status}`;
      throw new Error(
        `Authentification France Travail refusée (${code}) — vérifier les identifiants FRANCE_TRAVAIL_CLIENT_ID / _CLIENT_SECRET`,
      );
    }

    this.cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 1499) * 1000,
    };
    return this.cachedToken.value;
  }

  async fetchJobs(): Promise<JobItem[]> {
    if (!this.isEnabled()) return [];

    const token = await this.getAccessToken();

    const params = new URLSearchParams({
      motsCles: "developpeur web",
      codeROME: ROME_CODES.join(","),
      range: "0-49",
      sort: "1", // tri par date de création décroissante
    });

    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      next: { revalidate: this.revalidate, tags: ["jobs", this.key] },
    });

    // 204 = requête valide, aucune offre. Ce n'est pas une erreur.
    if (res.status === 204) return [];
    if (!res.ok) throw new Error(`France Travail HTTP ${res.status}`);

    const data = (await res.json().catch(() => ({}))) as { resultats?: unknown[] };
    const results = Array.isArray(data.resultats) ? data.resultats : [];

    return results
      .map(normalizeFranceTravailOffer)
      .filter((j): j is JobItem => j !== null);
  }
}
