# ADR-005 — PR-3a anticipée comme prérequis architectural (Design System socle)

- **Statut** : Accepted
- **Date** : 2026-04-25
- **Accepté le** : 2026-04-25 par Thierry vanmeeteren (via délégation @cowork)
- **Deciders** : Thierry vanmeeteren (Product Owner), @cowork (orchestration), @cc-ankora (exécution)
- **Tags** : `architecture`, `process`, `design-system`, `roadmap`
- **Portée** : ROADMAP Phase 1 (MVP). N'affecte ni le produit ni la sécurité ; modifie uniquement l'**ordre d'exécution** des PRs techniques.

---

## Contexte & problème

Le ROADMAP du 23 avril 2026 verrouillait l'ordre d'exécution suivant :

```
PR-1bis (mergée) → PR-2 (traductions) → PR-B1 (bug reporting) → PR-3 (port mockups React) → PR-F → PR-B2
```

Le 25 avril 2026, @cowork a piloté une session @cc-design (`claude.ai/design`, Opus 4.7 research preview) qui a livré un **Design System complet pour Ankora** (ZIP `Ankora Design System.zip`, 2.5 MB) :

- Tokens canoniques (`colors_and_type.css`)
- Fonts brand (Inter Variable, Fraunces Variable, JetBrains Mono Variable)
- SKILL `ankora-design-system` (5.6 KB)
- 4 UI kits HTML/JSX (landing, user dashboard, admin, onboarding)
- Components atomiques `_shared/` + previews HTML

Lecture du livrable + brief d'intégration ont révélé que **PR-3 dans sa forme monolithique** (port complet en une PR) :

1. dépasserait largement la limite de 600 lignes (estimation 2000+ lignes), nécessitant une justification scope creep ;
2. mélangerait des couches de risque très différentes (tokens CSS purs ↔ composants TSX ↔ pages App Router) ;
3. forcerait PR-2 et PR-B1 à travailler sur des **primitives UI obsolètes** qui seraient écrasées dès le merge de PR-3.

La question : **faut-il garder l'ordre verrouillé, ou anticiper une partie de PR-3 pour débloquer le reste proprement ?**

---

## Decision drivers

| Driver                                      | Pourquoi c'est décisif                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Limite PR < 600 lignes                      | Règle d'or `CLAUDE.md` projet (sauf justification explicite). Une PR-3 monolithique dépasserait 2000 lignes.                                               |
| Reviewability humaine                       | @thierry doit pouvoir reviewer chaque PR sans y passer 1h. Une PR splittée par couche est lisible.                                                         |
| Évitement du re-travail                     | Les traductions PR-2 et le widget PR-B1 doivent s'appuyer sur les **vrais** tokens et primitives, pas du provisoire.                                       |
| Risque par couche                           | Tokens CSS = 0 régression UI possible. Composants TSX = risque moyen. Pages = risque élevé (Landing fusion).                                               |
| Workflow trio @cowork/@cc-design/@cc-ankora | Le ZIP @cc-design est la source de vérité. Une intégration en plusieurs PRs respecte le rythme du trio (validation @thierry à chaque étape).               |
| Préservation de l'ossature actuelle         | La Landing actuelle (PR-1/PR-1bis) contient i18n next-intl, Server Components RSC, Schema.org SEO, copies FSMA validées par les agents — à NE PAS écraser. |

---

## Considered options

### Option 1 — Garder l'ordre verrouillé (PR-3 monolithique après PR-2 + PR-B1)

**Pour** :

- Respecte la doctrine "ordre verrouillé, pas de re-séquencement".
- 1 seule PR-3 = 1 seul cycle de review.

**Contre** :

- PR-3 ferait > 2000 lignes (violation CLAUDE.md règle <600).
- PR-2 traduit des chaînes UI qui changent visuellement en PR-3 (re-traduction probable des copies obsolètes).
- PR-B1 construit son widget bug-reporting sur des primitives `Button`/`Card`/`Modal` qu'il faudrait re-styler en PR-3.
- Review humaine très lourde (mélange CSS/TSX/Pages dans le même diff).
- Rollback impossible par couche (tout ou rien).

### Option 2 — Anticiper une PR-3a "Design System socle" avant PR-2/PR-B1, splitter le reste en PR-3b/c

**Pour** :

- PR-3a reste sous 400 lignes (tokens + fonts + SKILL, **0 composant, 0 page**) — 0 régression UI possible.
- Débloque proprement PR-2 (traductions sur tokens stables), PR-B1 (widget sur primitives stables), PR-3b (composants sur tokens canoniques), PR-3c (Landing fusion sur composants validés).
- Reviewable en une session par @thierry (chaque PR < 800 lignes).
- Permet la **fusion intelligente** Landing en PR-3c (analyse merge documentée avant écriture code) — préserve l'ossature actuelle.
- Aligné avec le workflow trio (validation @thierry à chaque étape).

**Contre** :

- 3 PRs au lieu d'1 = 3 cycles de review au lieu de 1.
- ROADMAP doit être mis à jour (re-séquencement).
- Nécessite un ADR (ce document) pour tracer la décision.

### Option 3 — Importer brutalement le ZIP @cc-design dans `src/`, écraser l'existant

**Pour** :

- Rapide.

**Contre** :

- Perte de l'i18n next-intl, des Server Components RSC, des copies FSMA validées (= violation CLAUDE.md règle 7 "Messages UI en français" + règle FSMA + scope creep majeur).
- Aucun garde-fou de revue.
- **Décision @thierry implicite (catégorie 4 irréversible) sans validation humaine.**
- Inacceptable.

---

## Decision

**Option 2 retenue** : PR-3 splittée en **PR-3a / PR-3b / PR-3c**, **PR-3a anticipée** comme prérequis architectural avant PR-2 et PR-B1.

**Nouvel ordre verrouillé (ROADMAP §"Ordre d'exécution des PR techniques")** :

```
PR-1 → PR-Q → PR-1bis → PR-3a → PR-2 → PR-B1 → PR-3b → PR-3c → PR-F → PR-B2
                         ↑NEW
```

### Scope de chaque sous-PR

| PR    | Scope                                                                                                                                                                                                                          | Cible lignes                 | Risque UI                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------- |
| PR-3a | SKILL `ankora-design-system` installé · `colors_and_type.css` mappé dans `globals.css` (diff documenté) · 3 fonts dans `public/fonts/` + `@font-face`                                                                          | ~200-400                     | 0 régression possible (pas de composant) |
| PR-3b | `src/components/ui/` migré (Button, Card, Input, Badge, Toast…) · tests Vitest co-located · convention shadcn-like                                                                                                             | ~500-700 (justifié si > 600) | Moyen                                    |
| PR-3c | Landing fusion intelligente : ossature TSX/RSC actuelle préservée, apports cc-design importés (hero waterfall, simulator, pricing) · `landing-merge-analysis.md` produit AVANT le code · Playwright multi-viewport · agents QA | ~500-800 (justifié)          | Élevé                                    |

### Garde-fous non négociables

1. **PR-3a ne touche aucun composant, aucune page, aucun test E2E.** Uniquement tokens, fonts, SKILL. Cela garantit qu'elle ne peut PAS casser l'UI existante.
2. **PR-3c sera précédée d'un `docs/design/landing-merge-analysis.md`** documentant le diff section par section entre la Landing actuelle (à GARDER) et l'apport cc-design (à IMPORTER). Pas de remplacement brutal.
3. **i18n** : les `messages/fr-BE.json` + `en.json` du ZIP cc-design sont **inspiration uniquement**, pas import direct (architecture next-intl + parité 5 locales trop sensible — cf. mémoire feedback `i18n-translator`).
4. **Validation @thierry à chaque étape** : merge PR-3a avant démarrage PR-3b ; merge PR-3b avant démarrage PR-3c.
5. **Agents QA pertinents** lancés à chaque PR (security-auditor, gdpr-compliance-auditor, ui-auditor pour PR-3b/c, lighthouse-auditor pour PR-3c).

---

## Consequences

### Positives

- Chaque PR reste reviewable par @thierry sans surcharge.
- Rollback possible par couche si une régression apparaît (rollback PR-3c sans toucher PR-3a/b).
- PR-2 et PR-B1 travaillent sur des fondations stables.
- Le re-séquencement est explicitement tracé (ce ADR + ROADMAP) — pas de dérive silencieuse.
- Le workflow trio @cowork/@cc-design/@cc-ankora est validé en conditions réelles avant les chantiers Dashboard/Onboarding/Admin (qui suivront le même pattern : ZIP @cc-design → branche dédiée → split en sous-PRs reviewable).

### Négatives ou neutres

- 3 PRs au lieu d'1 = 3 cycles de review (mais chacun beaucoup plus rapide qu'une review monolithique).
- Le nom "PR-3" devient ambigu — utiliser "PR-3a/b/c" partout pour éviter confusion.
- ROADMAP mis à jour à chaque merge intermédiaire (cohérent avec la règle "synchronisation ROADMAP ↔ repo").

### Risques résiduels

- **R1** : si PR-3a est mergée mais PR-3b/c traînent, on aura des tokens/fonts inutilisés en prod (poids ~1.5 MB de fonts non servies). **Mitigation** : timeline ≤ 2 semaines pour livrer PR-3b/c après PR-3a, sinon rollback PR-3a documenté.
- **R2** : la Landing actuelle (PR-1/PR-1bis) pourrait évoluer entre PR-3a et PR-3c (i18n, copies). **Mitigation** : `landing-merge-analysis.md` produit juste avant PR-3c sur la branche à jour.
- **R3** : un nouveau livrable @cc-design (Dashboard, Onboarding…) pourrait modifier les tokens pendant le cycle PR-3a/b/c. **Mitigation** : tokens versionnés via SKILL, toute évolution = nouvelle PR-3a' explicite.

---

## Sources & traces

- Brief @cowork d'origine : conversation du 25 avril 2026 (audit cross-project Haiku + handoff cc-design).
- Prompt d'intégration complet : `docs/design/cc-ankora-prompt-handoff-integration.md` (commité dans PR #55).
- Audit incident Haiku 4.5 (qui a renforcé la doctrine "PR splittée + reviewable") : `docs/audits/2026-04-25-haiku-incident-cross-project-lessons.md` (commité dans PR #56).
- Live ZIP @cc-design : `F:\PROJECTS\Apps\ankora-mockups\design-exports\Ankora Design System.zip` (2.5 MB).
- Décision tracée dans : ROADMAP §"Ordre d'exécution des PR techniques" + §"Pourquoi PR-3a avant PR-2 et PR-B1 ?".

---

## Lien avec le ROADMAP

Cet ADR est référencé dans `docs/ROADMAP.md` :

- En tête du fichier (date de mise à jour 25 avril 2026)
- Dans la table "Ordre d'exécution des PR techniques" (mention re-séquencement)
- Dans la section §"Pourquoi PR-3a avant PR-2 et PR-B1 ?" (justification courte avec lien vers cet ADR)
- Dans la section §"Prochaine feature majeure" (PR-3a comme prochaine)

Toute évolution du re-séquencement nécessitera **un nouvel ADR** (ADR-006+) qui supersedera celui-ci, conformément à la doctrine immutable des ADRs.
