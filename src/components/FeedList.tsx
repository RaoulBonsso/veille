import type { FeedItem } from "@/lib/sources/types";
import { RelativeTime } from "./Time";

/** Couleur de pastille par source — repère visuel rapide, pas une info critique. */
const SOURCE_TONE: Record<string, string> = {
  "Hacker News": "text-orange-300/90 border-orange-400/25 bg-orange-400/10",
  "dev.to": "text-violet-300/90 border-violet-400/25 bg-violet-400/10",
  "GitHub Trending": "text-emerald-300/90 border-emerald-400/25 bg-emerald-400/10",
  "GitHub Blog": "text-sky-300/90 border-sky-400/25 bg-sky-400/10",
  "Ars Technica": "text-amber-300/90 border-amber-400/25 bg-amber-400/10",
  "Le Monde": "text-rose-300/90 border-rose-400/25 bg-rose-400/10",
};

function tone(source: string) {
  return SOURCE_TONE[source] ?? "text-muted border-line bg-white/5";
}

export function FeedList({ items, empty }: { items: FeedItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="rounded-xl border border-line bg-surface/60 px-4 py-6 text-sm text-muted">{empty}</p>;
  }

  return (
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card-link flex h-full flex-col gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 transition-colors"
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-none">
              <span className={`rounded-full border px-2 py-0.5 ${tone(item.source)}`}>{item.source}</span>
              <RelativeTime iso={item.publishedAt} className="text-muted" />
              {typeof item.score === "number" && (
                <span className="text-muted tabular-nums">
                  · {item.score} {item.scoreLabel ?? ""}
                </span>
              )}
            </div>

            <h3 className="text-[15px] font-medium leading-snug text-text">{item.title}</h3>

            {item.summary && <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">{item.summary}</p>}

            <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[11px] text-muted">
              {item.author && <span className="truncate">{item.author}</span>}
              {item.tags?.slice(0, 3).map((t) => (
                <span key={t} className="rounded bg-white/5 px-1.5 py-0.5">
                  {t}
                </span>
              ))}
            </div>
          </a>

          {/* Lien de discussion sorti de la carte : imbriquer un <a> dans un <a>
              est invalide en HTML et casse la navigation clavier. */}
          {item.discussionUrl && item.discussionUrl !== item.url && (
            <a
              href={item.discussionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block px-3.5 text-[11px] text-muted underline-offset-2 hover:text-accent hover:underline"
            >
              {item.comments ?? 0} commentaires
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
