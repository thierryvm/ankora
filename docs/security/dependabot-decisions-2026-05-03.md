# Dependabot Decisions — 3 mai 2026

> Traçabilité des décisions de gestion des alertes Dependabot pour le repo `thierryvm/ankora`. Audit @cowork du 3 mai 2026, validé par @thierry.

## Contexte

Le 2 mai 2026 soir, GitHub Dependabot a remonté **2 alertes Moderate** sur la branche `main` du repo Ankora. Après diagnostic technique, les 2 alertes étaient **bloquées en upgrade** par des dépendances upstream (`@lhci/cli` et `next.js`) qui pinnent des versions vulnérables de leurs sub-deps.

Le 3 mai 2026 (~11h00 CEST), @cowork + @thierry ont arbitré la stratégie de gestion sécurité de ces 2 alertes en regard du contexte Ankora :

- Threat model : pas de CSS user-controlled, pas d'API externe non-validée
- Scope dépendances vulnérables : 1 en DEV (Lighthouse CI isolé), 1 en build-time uniquement
- Budget 0 € : pas de remplacement payant possible
- Priorité absolue : livrer Voie C avant 10 mai (deadline abonnement Pro Max x5)

**Décision** : dismiss les 2 alertes avec motif documenté + ré-évaluation périodique trimestrielle.

## Alerte #2 — uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided

| Champ             | Valeur                                              |
| ----------------- | --------------------------------------------------- |
| Severity          | Moderate (CVSS 4.0 base 6.3)                        |
| Affected versions | `< 14.0.0`                                          |
| Patched version   | `14.0.0`                                            |
| Package           | `uuid` (npm)                                        |
| Scope             | **Development** (transitive via `@lhci/cli@0.15.1`) |
| Manifest          | `package-lock.json`                                 |
| Status            | **Dismissed** 3 mai 2026                            |
| Dismiss reason    | Vulnerable code is not actually used                |

### Justification

`uuid` est une dépendance transitive **dev-only** introduite via `@lhci/cli@0.15.1` (Lighthouse CI). Les chemins de code vulnérables (v3/v5/v6) requièrent un paramètre `buf` user-controlled, qui n'est **jamais invoqué depuis le codebase Ankora**. Lighthouse CI tourne dans un runner GitHub Actions isolé, sans exposition au trafic runtime de l'application.

**Threat model Ankora** : aucun chemin d'exploitation réaliste vers les utilisateurs finaux. Le risque résiduel est limité au CI Lighthouse, qui ne traite que des URLs Vercel preview internes.

### Pourquoi ne pas upgrade ?

`@lhci/cli@0.15.1` est la dernière version stable de Lighthouse CI au 3 mai 2026 et pinne `uuid@^8.3.1`. Pas d'override possible sans forker la dépendance, ce qui dépasse largement le bénéfice sécurité (faible).

### Re-evaluation

Trimestrielle. Re-évaluer dès qu'une nouvelle version `@lhci/cli` ship avec `uuid >= 14.0.0`. Set un reminder à 3 mai 2026 + 90j (= 1 août 2026).

---

## Alerte #3 — PostCSS has XSS via Unescaped </style> in its CSS Stringify Output

| Champ             | Valeur                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Severity          | Moderate (CVSS v3 base 6.1)                                                                            |
| Affected versions | `< 8.5.10`                                                                                             |
| Patched version   | `8.5.10`                                                                                               |
| Package           | `postcss` (npm)                                                                                        |
| Scope             | Build-time (transitive via `next@16.2.4` + `@vercel/analytics`, `@vercel/speed-insights`, `next-intl`) |
| Manifest          | `package-lock.json`                                                                                    |
| Status            | **Dismissed** 3 mai 2026                                                                               |
| Dismiss reason    | Risk is tolerable to this project                                                                      |

### Justification

L'attaque XSS via Unescaped `</style>` requiert que `postcss` **stringify du CSS user-controlled** au runtime. Le codebase Ankora n'a **aucun chemin d'entrée CSS user-controlled** :

- Tous les styles sont compile-time via Tailwind 4 + CSS variables dans `globals.css`
- Pas de feature "thème custom utilisateur", pas d'éditeur CSS, pas d'import CSS dynamique
- `postcss` est invoqué uniquement par Next.js et Tailwind au moment du build, jamais contre des données runtime user

**Threat model Ankora** : zéro vecteur d'attaque XSS via cette CVE. Le risque résiduel est nul dans notre architecture.

### Pourquoi ne pas upgrade ?

`next@16.2.4` (et la suite Vercel `@vercel/analytics@2.0.1` + `@vercel/speed-insights@2.0.0` + `next-intl@4.9.1`) pinnent tous `postcss@8.4.31`. Upgrade nécessite Next 16.3+ (à valider quand release stable) qui peut potentiellement bumper postcss vers >=8.5.10.

### Re-evaluation

Trimestrielle. Re-évaluer à chaque release majeure Next.js. Set un reminder à 3 mai 2026 + 90j (= 1 août 2026).

---

## Convention `gh api` pour dismiss Dependabot alert

Pour bypasser le bug récurrent du redirect 404 sur `/security/dependabot/dismiss?ids%5B%5D=...&redirect_to_alert_number=N` côté GitHub UI, utiliser directement l'API REST :

```pwsh
gh api -X PATCH /repos/thierryvm/ankora/dependabot/alerts/<N> `
  -f state=dismissed `
  -f dismissed_reason=<reason> `
  -f dismissed_comment="<comment max 280 chars>"
```

**Reasons valides** :

- `fix_started` — A fix has already been started
- `no_bandwidth` — No bandwidth to fix this
- `tolerable_risk` — Risk is tolerable to this project
- `inaccurate` — This alert is inaccurate or incorrect
- `not_used` — Vulnerable code is not actually used

**Limite** : `dismissed_comment` est limité à **280 caractères** par GitHub (rejection HTTP 422 si dépassé).

**Référence** : <https://docs.github.com/rest/dependabot/alerts#update-a-dependabot-alert>

---

## Process général gestion alertes Dependabot

Pour toute future alerte :

1. **Diagnostic** : lire la CVE, identifier le scope (dev / build / runtime), évaluer le threat model Ankora.
2. **Décision** :
   - Si exploitable dans notre threat model → upgrade ou patch immédiat (P0 sécurité)
   - Si non-exploitable + upgrade possible → upgrade dans une PR `chore/security-deps-fix-YYYY-MM-DD`
   - Si non-exploitable + upgrade bloquée → dismiss avec motif documenté
3. **Documentation** : ajouter une entrée dans ce fichier `docs/security/dependabot-decisions-YYYY-MM-DD.md` (un fichier par batch de décisions).
4. **Reminder** : tracer la date de re-évaluation (J + 90 jours par défaut pour les dismiss).

## Reminders actifs

- **2026-08-01** : re-évaluer alertes #2 (uuid) et #3 (postcss). Vérifier upstream releases.

---

**Auteurs** : @cowork (analyse + rédaction), @thierry (validation décision sécurité).
**Status** : verrouillé — toute modification de décision = nouveau fichier `dependabot-decisions-YYYY-MM-DD.md` + référence à celui-ci dans le frontmatter.
