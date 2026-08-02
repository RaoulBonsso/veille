# ADR-002 — France Travail derrière une interface `JobSource`

- **Statut :** accepté, intégration **inactive** en attente d'identifiants
- **Date :** 2026-08-02

## Problème

France Travail est la seule source dense en offres **alternance / junior / France** — exactement la
cible. Mais son API exige `client_id` + `client_secret`, absents de la machine : l'appel
d'authentification renvoie `HTTP 400 {"error":"invalid_client"}`.

Deux mauvaises réponses possibles : (a) ne rien écrire et remettre à plus tard ; (b) simuler des
offres. La première laisse une dette, la seconde est un mensonge.

## Décision

Écrire l'adaptateur **complet et testé**, derrière une interface commune `JobSource`, avec un
interrupteur qui lit l'environnement :

```ts
isEnabled(): boolean {
  return Boolean(env("FRANCE_TRAVAIL_CLIENT_ID") && env("FRANCE_TRAVAIL_CLIENT_SECRET"));
}
```

Le registre de `dashboard.ts` ne fait qu'`filter(s => s.isEnabled())`. Conséquence directe : **le
jour où les deux variables sont renseignées, la source se branche sans qu'une seule ligne de code
ne change.** Tant qu'elles sont vides, elle apparaît en « en attente de clé » — pas en erreur
rouge, parce qu'une intégration pas encore activée n'est pas une panne.

## Pourquoi une interface plutôt que des `if`

`JobSource` (`key`, `label`, `revalidate`, `isEnabled`, `fetchJobs`) permet d'ajouter, retirer ou
activer une source en touchant **une seule ligne du registre**. C'est le principe ouvert/fermé
appliqué à un cas concret : le code de composition est fermé à la modification, ouvert à
l'extension. We Work Remotely a été ajoutée après coup — une ligne dans `JOB_SOURCES`.

## Sécurité

- Les identifiants ne sont lus **que** via `process.env`, jamais écrits en dur, jamais commités.
- Le secret transite dans le **corps** du POST, jamais en query string — où il finirait en clair
  dans les journaux d'accès. **Un test verrouille ce point** pour empêcher une régression.
- `.gitignore` couvre `.env*`, ce qui inclut `.env` comme `.env.local`.

## Marche à suivre pour réactiver

1. Créer un compte sur <https://francetravail.io> puis une application ; demander l'accès à l'API
   **« Offres d'emploi v2 »**.
2. Récupérer le `client_id` et le `client_secret` de l'application.
3. Les déposer dans le Vault (`~/.THE_SYNDICATE/THE_VAULT.env`) — jamais dans le dépôt :
   ```
   FRANCE_TRAVAIL_CLIENT_ID=...
   FRANCE_TRAVAIL_CLIENT_SECRET=...
   ```
4. Les déclarer sur Vercel :
   ```bash
   vercel env add FRANCE_TRAVAIL_CLIENT_ID production
   vercel env add FRANCE_TRAVAIL_CLIENT_SECRET production
   ```
5. Redéployer : `vercel --prod`.

Aucune modification de code n'est nécessaire. La carte « France Travail » passe d'orange
(« en attente de clé ») à verte, et ses offres entrent automatiquement dans le classement.

## Détail d'implémentation à connaître

Le cache du jeton OAuth est porté par **l'instance**, pas par le module. Un cache au niveau module
rendait les tests dépendants de leur ordre d'exécution — ce sont les tests qui l'ont révélé. Chaque
test part d'une instance neuve, donc d'un cache vide ; en production le registre n'instancie la
source qu'une fois, le jeton est donc bien réutilisé entre requêtes.
