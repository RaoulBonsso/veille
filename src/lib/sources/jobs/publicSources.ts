import type { JobItem, JobSource } from "../types";

/**
 * Sources d'emploi publiques, sans clé d'API.
 *
 * Toutes ont été testées à la main le 2026-08-01 avant intégration.
 * Écartées après test (voir docs/architecture/ADR-001-sources.md) :
 *   - RemoteOK        : le flux gratuit ne renvoie plus que du non-tech
 *                       (« Cleaner », « Nanny », « Voice Over Artist »).
 *   - La Bonne Alternance v1 : HTTP 404 (retirée).
 *   - La Bonne Alternance v2 : HTTP 401, exige désormais une clé.
 *   - The Muse        : `results: []` — renvoie une enveloppe vide.
 *
 * Aucune de ces sources ne filtre correctement sur la France ni sur le niveau
 * junior : c'est `rankJobs` (relevance.ts) qui s'en charge en aval.
 */

const UA = "Mozilla/5.0 (compatible; VeilleBot/1.0; +https://github.com/RaoulBonsso/veille)";

async function getJson<T>(url: string, revalidate: number, tag: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate, tags: ["jobs", tag] },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${new URL(url).hostname}`);
  return (await res.json()) as T;
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(typeof v === "number" ? v * 1000 : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ─────────────────────────── Remotive ───────────────────────────
// https://remotive.com/api/remote-jobs — catégorie software-dev.
// Vérifié : renvoie des offres dev réelles, dont explicitement France/Europe.

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location: string;
  job_type?: string;
  publication_date: string;
  url: string;
  tags?: string[];
}

export class RemotiveSource implements JobSource {
  key = "remotive";
  label = "Remotive";
  homepage = "https://remotive.com";
  revalidate = 900;
  isEnabled() {
    return true;
  }

  async fetchJobs(): Promise<JobItem[]> {
    const data = await getJson<{ jobs?: RemotiveJob[] }>(
      "https://remotive.com/api/remote-jobs?category=software-dev&limit=60",
      this.revalidate,
      this.key,
    );
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    if (jobs.length === 0) throw new Error("Aucune offre renvoyée");

    return jobs.map((j) => ({
      id: `remotive:${j.id}`,
      title: j.title,
      company: j.company_name || "—",
      location: j.candidate_required_location || "Remote",
      remote: true, // Remotive est 100 % remote par construction.
      url: j.url,
      source: "Remotive",
      publishedAt: iso(j.publication_date),
      tags: (j.tags ?? []).slice(0, 5),
      contract: j.job_type ?? null,
      relevance: 0,
    }));
  }
}

// ─────────────────────────── Jobicy ───────────────────────────
// https://jobicy.com/api/v2/remote-jobs — industrie « dev », géo EMEA.
// Vérifié : offres tech réelles, champ jobLevel exploitable.

interface JobicyJob {
  id: number | string;
  jobTitle: string;
  companyName: string;
  jobGeo: string;
  jobLevel?: string;
  jobType?: string[];
  pubDate: string;
  url: string;
  jobIndustry?: string[];
}

export class JobicySource implements JobSource {
  key = "jobicy";
  label = "Jobicy";
  homepage = "https://jobicy.com";
  revalidate = 900;
  isEnabled() {
    return true;
  }

  async fetchJobs(): Promise<JobItem[]> {
    const data = await getJson<{ jobs?: JobicyJob[] }>(
      "https://jobicy.com/api/v2/remote-jobs?count=50&industry=dev&geo=emea",
      this.revalidate,
      this.key,
    );
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    if (jobs.length === 0) throw new Error("Aucune offre renvoyée");

    return jobs.map((j) => ({
      id: `jobicy:${j.id}`,
      title: j.jobTitle,
      company: j.companyName || "—",
      location: j.jobGeo || "Remote",
      remote: true,
      url: j.url,
      source: "Jobicy",
      publishedAt: iso(j.pubDate),
      tags: [j.jobLevel, ...(j.jobIndustry ?? [])].filter((t): t is string => Boolean(t)).slice(0, 4),
      contract: j.jobType?.[0] ?? null,
      relevance: 0,
    }));
  }
}

// ─────────────────────────── Arbeitnow ───────────────────────────
// https://www.arbeitnow.com/api/job-board-api — Europe (surtout DE/UK).
// Vérifié : 175 offres, ~53 techniques. Peu de France, d'où un poids faible
// après scoring — mais ce sont de vraies offres européennes fraîches.

interface ArbeitnowJob {
  slug: string;
  title: string;
  company_name: string;
  location: string;
  remote: boolean;
  job_types?: string[];
  tags?: string[];
  created_at: number;
  url: string;
}

export class ArbeitnowSource implements JobSource {
  key = "arbeitnow";
  label = "Arbeitnow";
  homepage = "https://www.arbeitnow.com";
  revalidate = 900;
  isEnabled() {
    return true;
  }

  async fetchJobs(): Promise<JobItem[]> {
    const data = await getJson<{ data?: ArbeitnowJob[] }>(
      "https://www.arbeitnow.com/api/job-board-api",
      this.revalidate,
      this.key,
    );
    const jobs = Array.isArray(data.data) ? data.data : [];
    if (jobs.length === 0) throw new Error("Aucune offre renvoyée");

    return jobs.map((j) => ({
      id: `arbeitnow:${j.slug}`,
      title: j.title,
      company: j.company_name || "—",
      location: j.location || "Europe",
      remote: Boolean(j.remote),
      url: j.url,
      source: "Arbeitnow",
      publishedAt: iso(j.created_at),
      tags: (j.tags ?? []).slice(0, 4),
      contract: j.job_types?.[0] ?? null,
      relevance: 0,
    }));
  }
}
