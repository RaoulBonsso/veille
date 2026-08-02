/**
 * Parseur RSS/Atom minimaliste, sans dépendance.
 *
 * Décision d'archi : ne PAS embarquer `rss-parser` (+ xml2js, ~1 Mo) pour lire
 * cinq champs sur quatre flux dont on connaît la forme exacte — on les a
 * inspectés à la main avant d'écrire ce fichier. On garde un module pur,
 * testable, sans surface de dépendance. Le prix à payer : ce parseur est
 * tolérant, pas conforme XML. C'est un choix assumé pour un agrégateur en
 * lecture seule — si un flux devient exotique, la bonne réponse est un test
 * qui reproduit son XML, pas une dépendance de plus.
 */

export interface RssItem {
  title: string;
  link: string;
  isoDate: string | null;
  author: string | null;
  description: string | null;
  categories: string[];
  /**
   * Le XML brut de l'item.
   *
   * Pourquoi : certains flux portent des balises maison hors standard (We Work
   * Remotely expose `<region>`). Plutôt que d'ajouter un champ par flux exotique
   * dans ce parseur générique — qui finirait en sac fourre-tout — on rend le
   * bloc source disponible, et l'adaptateur concerné y lit ce qui le regarde
   * via `readTag`. La connaissance d'un flux reste dans son adaptateur.
   */
  raw: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ugrave: "ù",
  ocirc: "ô",
  icirc: "î",
  ecirc: "ê",
  acirc: "â",
  euro: "€",
};

/** Décode les entités numériques (&#8217;) et nommées (&amp;). */
function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeFromCodePoint(cp: number): string {
  try {
    return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  } catch {
    return "";
  }
}

/**
 * Retire le balisage HTML et normalise les espaces.
 * Les blocs <script>/<style> sont supprimés AVEC leur contenu — sinon on
 * afficherait du CSS dans les résumés.
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return decodeEntities(
    String(input)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Convertit une date de flux (RFC 822, ISO…) en ISO 8601 UTC, ou null. */
export function toIsoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = new Date(String(input).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Lit une balise arbitraire dans un fragment XML et renvoie son texte nettoyé.
 * Destiné aux adaptateurs qui doivent lire une balise non standard sur
 * `RssItem.raw` (ex. `<region>` chez We Work Remotely).
 */
export function readTag(xml: string, name: string): string | null {
  return firstNonEmpty(tag(xml, name));
}

/** Contenu du premier <tag> rencontré, CDATA compris. */
function tag(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = re.exec(xml);
  return m ? m[1] : null;
}

/** Contenu de tous les <tag> rencontrés. */
function tagAll(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

/** Valeur d'un attribut, ex. <link href="..."/> */
function attr(xml: string, tagName: string, attrName: string): string | null {
  const re = new RegExp(`<${tagName}\\b[^>]*\\b${attrName}\\s*=\\s*["']([^"']+)["'][^>]*>`, "i");
  const m = re.exec(xml);
  return m ? m[1] : null;
}

function firstNonEmpty(...vals: (string | null)[]): string | null {
  for (const v of vals) {
    const s = stripHtml(v);
    if (s) return s;
  }
  return null;
}

/**
 * Parse un flux RSS 2.0 ou Atom.
 * Ne jette jamais : renvoie [] si le contenu est illisible. Les items sans
 * titre OU sans lien exploitable sont écartés (ils seraient inaffichables).
 */
export function parseRss(xml: string, limit = 20): RssItem[] {
  if (!xml || typeof xml !== "string") return [];

  try {
    const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
    const items: RssItem[] = [];

    for (const block of blocks) {
      if (items.length >= limit) break;

      const title = firstNonEmpty(tag(block, "title"));

      // <link> classique, sinon href Atom, sinon guid permalink (cas Le Monde).
      const rawLink = tag(block, "link");
      const linkText = rawLink && !/^\s*<?\s*$/.test(rawLink) ? stripHtml(rawLink) : "";
      const guid = stripHtml(tag(block, "guid"));
      const link =
        (linkText.startsWith("http") ? linkText : "") ||
        attr(block, "link", "href") ||
        (guid.startsWith("http") ? guid : "");

      if (!title || !link) continue;

      items.push({
        title,
        link,
        isoDate: toIsoDate(
          stripHtml(tag(block, "pubDate")) || stripHtml(tag(block, "updated")) || stripHtml(tag(block, "published")),
        ),
        author: firstNonEmpty(tag(block, "dc:creator"), tag(block, "author"), tag(block, "name")),
        description: firstNonEmpty(tag(block, "description"), tag(block, "summary")),
        categories: tagAll(block, "category")
          .map((c) => stripHtml(c))
          .filter(Boolean)
          .slice(0, 4),
        raw: block,
      });
    }

    return items;
  } catch {
    return [];
  }
}
