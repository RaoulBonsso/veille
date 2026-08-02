import type { JobItem } from "@/lib/sources/types";
import { RelativeTime } from "./Time";

/**
 * Repère « France » : les sources gratuites branchées sont majoritairement
 * remote/européennes. On signale visuellement les offres qui touchent la France
 * plutôt que de prétendre que tout le lot est français.
 */
const FRANCE = /(france|paris|lyon|marseille|toulouse|bordeaux|nantes|lille|montpellier|strasbourg|rennes|nice|grenoble)/i;
const JUNIOR = /(junior|alternance|alternant|apprenti|graduate|entry.?level|intern|stage|débutant)/i;

export function JobList({ jobs }: { jobs: JobItem[] }) {
  if (jobs.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface/60 px-4 py-6 text-sm text-muted">
        Aucune offre exploitable pour l&apos;instant. Les sources d&apos;emploi gratuites sont irrégulières — reviens
        plus tard, ou renseigne les identifiants France Travail pour un flux français dense.
      </p>
    );
  }

  return (
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {jobs.map((job) => {
        const isFrance = FRANCE.test(`${job.title} ${job.location} ${job.tags.join(" ")}`);
        const isJunior = JUNIOR.test(`${job.title} ${job.tags.join(" ")}`);

        return (
          <li key={job.id} className="min-w-0">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card-link flex h-full flex-col gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-none">
                {isFrance && (
                  <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-blue-200">
                    France
                  </span>
                )}
                {isJunior && (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">
                    junior / alternance
                  </span>
                )}
                {job.remote && <span className="rounded-full bg-white/5 px-2 py-0.5 text-muted">remote</span>}
                <RelativeTime iso={job.publishedAt} className="text-muted" />
              </div>

              <h3 className="text-[15px] font-medium leading-snug text-text">{job.title}</h3>

              <p className="text-[13px] text-muted">
                <span className="text-text/80">{job.company}</span>
                {job.location && <> · {job.location}</>}
                {job.contract && <> · {job.contract}</>}
              </p>

              <div className="mt-auto flex flex-wrap items-center gap-1 pt-1 text-[11px] text-muted">
                <span className="rounded bg-white/5 px-1.5 py-0.5">{job.source}</span>
                {job.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded bg-white/5 px-1.5 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
