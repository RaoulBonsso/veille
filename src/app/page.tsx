import { getDashboard } from "@/lib/dashboard";
import { mergeFeeds, sectionFetchedAt } from "@/lib/merge";
import { FeedList } from "@/components/FeedList";
import { JobList } from "@/components/JobList";
import { SectionTimestamp, SourceStatus } from "@/components/SourceStatus";
import { RelativeTime } from "@/components/Time";

/**
 * ISR au niveau de la route : la page est régénérée au plus toutes les 10 min,
 * en arrière-plan (stale-while-revalidate). Le premier visiteur après expiration
 * reçoit encore l'ancienne page — il n'attend jamais les 6 API.
 *
 * Chaque `fetch` porte en plus SON propre `revalidate` (600 s pour l'actu qui
 * bouge vite, 900 s pour les flux plus lents). Next retient la valeur la plus
 * basse pour la route : 600 s. Les deux réglages sont donc cohérents.
 */
export const revalidate = 600;

export default async function Page() {
  const data = await getDashboard();

  const tech = mergeFeeds(data.tech, 24);
  const world = mergeFeeds(data.world, 12);

  const allResults = [...data.tech, ...data.world, ...data.jobs.results];
  const liveSources = allResults.filter((r) => !r.failed).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <header className="mb-10">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Veille personnelle</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Le brief du matin</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Actus tech, offres pour dev full-stack junior et actualité générale, agrégées en direct depuis des sources
          publiques. Aucune donnée simulée : ce qui s&apos;affiche vient d&apos;être récupéré.
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>
            page générée <RelativeTime iso={data.generatedAt} className="text-text/70" />
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {liveSources}/{allResults.length} sources en ligne
          </span>
          <span aria-hidden>·</span>
          <span>rafraîchissement automatique toutes les 10 min</span>
        </p>
      </header>

      <div className="flex flex-col gap-12">
        <Section
          title="Ce qui bouge dans le dev"
          count={tech.length}
          fetchedAt={sectionFetchedAt(data.tech)}
          status={<SourceStatus results={data.tech} />}
        >
          <FeedList items={tech} empty="Toutes les sources tech sont injoignables pour le moment." />
        </Section>

        <Section
          title="Emploi & alternance"
          count={data.jobs.ranked.length}
          fetchedAt={sectionFetchedAt(data.jobs.results)}
          status={<SourceStatus results={data.jobs.results} pending={data.pending} />}
          note="Offres filtrées sur les postes techniques puis classées par pertinence pour un profil full-stack junior en France. Les sources accessibles sans clé sont surtout remote et européennes — le badge « France » signale les offres qui touchent le pays."
        >
          <JobList jobs={data.jobs.ranked} />
        </Section>

        <Section
          title="Le monde"
          count={world.length}
          fetchedAt={sectionFetchedAt(data.world)}
          status={<SourceStatus results={data.world} />}
        >
          <FeedList items={world} empty="Le flux d'actualité générale est injoignable pour le moment." />
        </Section>
      </div>

      <footer className="mt-16 border-t border-line pt-6 text-[11px] leading-relaxed text-muted">
        <p>
          Agrégateur en lecture seule : chaque titre renvoie à sa source d&apos;origine. Sources : Hacker News, dev.to,
          GitHub, Ars Technica, Le Monde, Remotive, Jobicy, Arbeitnow, We Work Remotely.
        </p>
        <p className="mt-1">Construit par Joyboy · Next.js · déployé sur Vercel</p>
      </footer>
    </div>
  );
}

function Section({
  title,
  count,
  fetchedAt,
  status,
  note,
  children,
}: {
  title: string;
  count: number;
  fetchedAt: string | null;
  status: React.ReactNode;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <span className="text-[11px] tabular-nums text-muted">{count} entrées</span>
        <SectionTimestamp iso={fetchedAt} />
      </div>

      <div className="mb-4">{status}</div>

      {note && <p className="mb-4 max-w-3xl text-[12px] leading-relaxed text-muted">{note}</p>}

      {children}
    </section>
  );
}
