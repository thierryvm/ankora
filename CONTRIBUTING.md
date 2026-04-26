# Contributing to Ankora

Merci pour ton intérêt. Ce document décrit le workflow attendu pour toute contribution.

## Code of conduct

En participant à ce projet, tu acceptes [notre code de conduite](CODE_OF_CONDUCT.md). Sois respectueux·se, inclusif·ve, et concentre-toi sur ce qui est le mieux pour le projet.

## Avant d'ouvrir une PR

1. **Ouvre une issue** pour discuter du changement (sauf typo / correctif trivial).
2. Attends un `approved` sur l'issue avant d'écrire du code — ça évite de travailler sur un angle qu'on n'accepterait pas.
3. Un PR qui ferme une issue sans discussion préalable sera fermé.

## Branches

- `main` — production (protégée, merge via PR uniquement, 1 reviewer requis)
- `develop` — intégration continue
- `feature/<kebab-case>` — nouvelle fonctionnalité
- `fix/<kebab-case>` — correctif bug
- `hotfix/<kebab-case>` — correctif critique (branch depuis `main`)
- `chore/<kebab-case>` — maintenance (deps, CI, docs)
- `release/vX.Y.Z` — préparation release

## Commits

Format [Conventional Commits](https://www.conventionalcommits.org/fr/v1.0.0/) :

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types autorisés

| Type       | Usage                                           |
| ---------- | ----------------------------------------------- |
| `feat`     | Nouvelle fonctionnalité utilisateur             |
| `fix`      | Correctif de bug                                |
| `refactor` | Réorganisation sans changement de comportement  |
| `perf`     | Amélioration de performance                     |
| `test`     | Ajout/modification de tests uniquement          |
| `docs`     | Documentation uniquement                        |
| `chore`    | Maintenance (deps, CI, tooling)                 |
| `security` | Correctif sécurité (peut être couplé à un avis) |
| `style`    | Formatage (jamais de logique)                   |

### Exemples

```
feat(auth): add MFA TOTP enrollment flow
fix(budget): clamp simulation delta to 2 decimals
refactor(domain): extract provision month-match logic
security(middleware): tighten CSP nonce propagation
docs(readme): update RGPD compliance table
chore(deps): bump @supabase/ssr to 0.8.0
```

## Portes de qualité (bloquantes)

Avant de pousser ta PR :

```bash
npm run lint           # 0 erreur
npm run typecheck      # 0 erreur
npm run test           # 100 % pass
npm run e2e            # 100 % pass sur parcours critiques
```

Le pipeline CI refait tous ces checks + :

- `npm audit --audit-level=high`
- Lighthouse CI (≥ 95 perf, 100 a11y/BP/SEO)
- Couverture domaine ≥ 90 % lignes+fonctions, ≥ 85 % branches

## Règles de code

1. **Domaine pur** : `src/lib/domain/` n'importe **jamais** depuis `@supabase` ou `next/*`. Que du TS pur + `decimal.js`.
2. **Validation en entrée** : tout Server Action / Route Handler parse avec Zod **avant** toute logique métier.
3. **Authz serveur** : ne jamais trust un `userId` / `workspaceId` du client — toujours vérifier via la session Supabase.
4. **Audit** : toute action sensible (auth, RGPD, delete workspace) émet `logAuditEvent()`.
5. **Rate limit** : endpoints publics, mutations et exports passent par `rateLimit()`.
6. **Nonce CSP** : jamais de `<script>` / `<style>` inline sans `nonce={nonce}`.
7. **Messages UI en français**, code / commits / commentaires en **anglais**.
8. **Décimaux** : utilise `Decimal` pour tout montant EUR. Jamais de `number` natif.
9. **Tests domaine** : ≥ 90 % lignes + fonctions, ≥ 85 % branches.

## Revue de code

- Chaque PR requiert **au moins 1 reviewer** (ou le CODEOWNERS).
- Les reviews Sourcery et Vercel Preview sont **informatives** — tu dois y répondre mais elles ne bloquent pas le merge.
- Un reviewer humain peut demander des changements qui bloquent le merge.
- Un PR **ne peut pas être auto-mergé** — même par l'auteur.

## Signalement d'une vulnérabilité

**Ne pas ouvrir d'issue publique.** Voir [SECURITY.md](SECURITY.md). Email : **security@ankora.be**.

## Questions ?

Ouvre une [Discussion](https://github.com/thierryvm/ankora/discussions) ou envoie un mail à **hello@ankora.be**.
