# Veille — le brief du matin

Tableau de bord de veille personnelle. En un coup d'œil au réveil : **ce qui bouge dans le dev**,
**les offres d'emploi/alternance**, et **l'actualité générale** — agrégés en direct depuis des
sources publiques.

> **Aucune donnée simulée.** Chaque source a été testée à la main (HTTP 200 **et** charge utile
> exploitable) avant intégration. Celles qui ne renvoyaient rien d'utile ont été retirées et
> documentées dans [`docs/architecture/ADR-001-sources.md`](docs/architecture/ADR-001-sources.md).

## Démarrer

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 71 tests
npm run build
```

Aucune variable d'environnement n'est **requise** : le site fonctionne entièrement sans clé.

## Sources branchées

**Tech** — Hacker News · dev.to · GitHub Trending · GitHub Blog · Ars Technica
**Emploi** — Remotive · Jobicy · Arbeitnow · We Work Remotely
**Monde** — Le Monde

Détail des endpoints, revalidations et **sources écartées avec leur motif** :
[ADR-001](docs/architecture/ADR-001-sources.md).

### Limite connue, assumée

Aucune API d'emploi gratuite **sans clé** ne couvre correctement l'alternance junior **en France**.
Les sources branchées sont majoritairement remote/européennes. L'interface le dit au lieu de le
masquer : un badge « France » signale les offres qui touchent réellement le pays.

Le déblocage, c'est **France Travail** — l'adaptateur est déjà écrit et testé, il attend seulement
ses identifiants. Voir [ADR-002](docs/architecture/ADR-002-france-travail.md).

## Variables d'environnement (toutes optionnelles)

| Variable | Effet si absente |
| --- | --- |
| `GITHUB_TOKEN` | Quota GitHub à 60 req/h au lieu de 5000. Rien ne casse. |
| `FRANCE_TRAVAIL_CLIENT_ID` | Source France Travail inactive, affichée « en attente de clé ». |
| `FRANCE_TRAVAIL_CLIENT_SECRET` | idem |

Copier [`.env.example`](.env.example) vers `.env.local` pour du local. **Aucun secret n'est
committé** : `.gitignore` couvre `.env*`.

## Architecture

Diagrammes Mermaid et parti pris techniques :
[`docs/architecture/architecture.md`](docs/architecture/architecture.md).

Trois idées portent tout le reste :

1. **Un contrat, pas des cas particuliers.** Chaque source est normalisée dans son adaptateur vers
   `FeedItem` ou `JobItem`. L'UI ne voit jamais la forme brute d'une API tierce. Ajouter une source
   = un adaptateur + une ligne dans le registre.
2. **Aucune source ne peut faire tomber la page.** Tout passe par `runSource()`, qui convertit une
   exception ou un dépassement de délai en résultat en échec. Une source morte = une pastille
   rouge, jamais une page blanche.
3. **La fraîcheur est visible.** ISR à 10 min sur la route, revalidation par source (600–900 s), et
   chaque section affiche l'horodatage des sources qui ont réellement répondu.

## Pile

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS 4 · Vitest · Vercel.
Zéro dépendance runtime au-delà de React/Next — le parseur RSS fait 130 lignes testées plutôt
qu'une dépendance d'un mégaoctet.
