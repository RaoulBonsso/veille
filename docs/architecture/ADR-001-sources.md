# ADR-001 — Choix des sources de données

- **Statut :** accepté
- **Date :** 2026-08-02
- **Contexte :** tableau de bord de veille personnelle, déployé sur Vercel, sans budget d'API.

## Décision

N'intégrer **que des sources testées à la main (HTTP 200 + charge utile exploitable)** avant
d'écrire la moindre ligne d'adaptateur. Toute source qui ne renvoie pas de données réellement
utilisables est **retirée** et documentée ici — jamais remplacée par des données simulées.

## Sources retenues

| Source | Endpoint | Section | Revalidation | Vérifié |
| --- | --- | --- | --- | --- |
| Hacker News | `hacker-news.firebaseio.com/v0/topstories.json` + `/v0/item/{id}.json` | tech | 600 s | 2026-08-02 |
| dev.to | `dev.to/api/articles?per_page=30&top=1` | tech | 600 s | 2026-08-02 |
| GitHub Trending | `api.github.com/search/repositories` (`created:>J-14 stars:>30`, tri étoiles) | tech | 900 s | 2026-08-02 |
| GitHub Blog | `github.blog/feed/` | tech | 900 s | 2026-08-02 |
| Ars Technica | `feeds.arstechnica.com/arstechnica/technology-lab` | tech | 900 s | 2026-08-02 |
| Le Monde | `lemonde.fr/rss/une.xml` | monde | 600 s | 2026-08-02 |
| Remotive | `remotive.com/api/remote-jobs?category=software-dev` | emploi | 900 s | 2026-08-02 |
| Jobicy | `jobicy.com/api/v2/remote-jobs?industry=dev&geo=emea` | emploi | 900 s | 2026-08-02 |
| Arbeitnow | `arbeitnow.com/api/job-board-api` | emploi | 900 s | 2026-08-02 |
| We Work Remotely | `weworkremotely.com/categories/remote-programming-jobs.rss` | emploi | 900 s | 2026-08-02 |

**Pas de « trending » officiel chez GitHub.** L'API de recherche triée par étoiles sur les dépôts
récents en est l'approximation la plus proche et la plus stable. `GITHUB_TOKEN` est **optionnel** :
son absence fait passer le quota de 5000 à 60 requêtes/h, elle ne casse rien.

## Sources écartées, et pourquoi

| Source | Verdict | Détail |
| --- | --- | --- |
| **France Travail** | inactif, code prêt | `invalid_client` : `FRANCE_TRAVAIL_CLIENT_ID/_SECRET` vides sur la machine. Adaptateur écrit et testé, se rebranche seul (voir ADR-002). |
| **RemoteOK** | écarté | HTTP 200 mais charge utile hors sujet : « Labourer », « Cleaning Assistant », « Housekeeper », « test ». Re-testé le 2026-08-02, toujours le cas. |
| **La Bonne Alternance** (v1 et v3) | écarté | HTTP 404 sur les deux versions. L'API publique historique n'est plus servie. |
| **The Muse** | écarté | HTTP 200 mais `"results": []` sur un filtre France — enveloppe vide. |
| **Adzuna** | écarté | HTTP 400 sans `app_id`/`app_key`. Exige une inscription. |
| **Welcome to the Jungle** | écarté | HTTP 403 sur le flux RSS. |
| **HelloWork** | écarté | Renvoie du HTML, pas du RSS, quel que soit le paramètre `format`. Et ses CGU (art. 8.2) interdisent explicitement l'extraction automatisée. Non négociable. |
| **Hacker News « jobstories »** | écarté | Réel et fonctionnel, mais 100 % startups YC américaines, aucun poste junior France. Hors cible. |
| **Jobicy `geo=france`** | écarté (le filtre) | Le filtre pays est ignoré côté serveur : renvoie de l'EMEA. On interroge donc `geo=emea` et on classe en aval. |

## Conséquence assumée

**Aucune source gratuite sans clé ne couvre correctement l'alternance/junior en France.** Les
sources d'emploi branchées sont majoritairement remote et européennes. Plutôt que de le masquer,
l'interface l'affiche : un badge « France » signale les offres qui touchent réellement le pays, et
la carte France Travail est visible en « en attente de clé ».

Le tri de pertinence (`src/lib/relevance.ts`) compense partiellement en pondérant géographie,
niveau junior et stack — mais il ne peut pas inventer des offres qui ne sont pas dans le flux.
Le vrai déblocage, c'est France Travail : voir ADR-002.
