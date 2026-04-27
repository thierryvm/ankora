# Cowork ↔ CC Ankora Handoff Conventions

> **Source canonique** des conventions de collaboration entre @cowork (Cowork desktop, Opus 4.7), @cc-ankora (Claude Code terminal, Opus 4.7 pinné) et @thierry (humain validateur). Tout prompt CC Ankora doit référencer ce document plutôt que de répéter ces conventions inline.

**Verrouillé** : 2026-04-27. Modification = PR dédiée + ADR si changement structurel.

---

## 1. Rôles trio agents

- **@cowork** : tranche les arbitrages techniques, rédige les prompts CC Ankora prêts-à-coller, valide les rapports, met à jour docs design / ADR / stratégie. Autonomie maximale sauf escalades @thierry pour business.
- **@cc-ankora** : exécute le code, ouvre les PR, gère Sourcery, remonte les blocages structurels à @cowork.
- **@thierry** : valide les décisions business (budget, scope, FSMA, design), clique les merges, supervise sans intervenir techniquement sauf demande explicite.

**Escalade @thierry** uniquement pour :

- Ajout dépendance payante (budget 0 € à respecter)
- Modification scope feature
- Conflit FSMA
- Choix architecturaux majeurs
- Faille sécurité détectée
- Décision design visuelle non triviale

---

## 2. Definition of Done canonique (5-step)

Un push, un commit ou une PR ouverte ne signifie PAS "terminé". Une tâche n'est DONE qu'après TOUS ces critères satisfaits :

1. **CI verts** : Lint, Typecheck, Tests, E2E, Security audit, Build, Lighthouse CI (si configuré sur le scope).
2. **Sourcery silencieux** sur le DERNIER commit de la PR (aucun commentaire inline actif, aucune review non résolue). Vérification :
   ```bash
   gh api repos/thierryvm/ankora/pulls/<N>/comments \
     --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'
   ```
   Si Sourcery est en skip rate limit hebdo → c'est bénin si le bot publie le skip avec raison explicite (ex: "weekly rate limit"). Documenter dans le rapport final.
3. **Reviews humaines approuvées et résolues** (si reviewers ajoutés à la PR).
4. **Pas de conflit avec main** : `mergeStateStatus = CLEAN`, `mergeable = MERGEABLE`.
5. **Rapport final livré à @thierry** avec preuve de chaque critère.

**Règle de refus** : ne JAMAIS déclarer une tâche terminée sans avoir explicitement vérifié les 5 critères ci-dessus. Un push sans vérif Sourcery = tâche incomplète, point.

---

## 3. Format rapport intermédiaire (checkpoint @cowork)

À utiliser quand un prompt CC Ankora demande explicitement un checkpoint @cowork avant de continuer :

```markdown
## [Nom de la PR / Étape] — Rapport intermédiaire

### Confirmation prérequis

[tableau ou liste confirmant chaque prérequis du brief]

### Livraisons

[Liste structurée des fichiers/composants livrés avec path, lignes, tests]

### Tokens / classes utilisés

[Inventaire grep-friendly]

### URL preview Vercel

[URL pour validation visuelle @cowork]

### Questions ouvertes pour @cowork

[Liste si applicable, sinon "aucune"]

### Risques identifiés

[Techniques, visuels, a11y, FSMA]

### STOP — Attente validation @cowork
```

---

## 4. Format rapport final (post-DoD)

À livrer après que les 5 critères DoD soient satisfaits :

```markdown
## [Nom de la PR] — Rapport final DoD

**PR** : #XX
**Branche** : <name>
**Commits** : N atomiques
**Lignes** : +XXXX / -YYY

### Confirmation prérequis

[tableau confirmant chaque prérequis]

### DoD 5-step

1. ✅ CI : [liste checks verts avec durée]
2. ✅ Sourcery : 0 commentaire actif (preuve via gh api ou skip rate limit documenté)
3. ✅ Reviews : N/A ou résolues
4. ✅ mergeStateStatus : CLEAN
5. ✅ Rapport livré (ce document)

### Livrables

[Récapitulatif structuré par livrable]

### Métriques

- Tests : N pass (+M vs main)
- Coverage : XX% sur nouveaux fichiers
- Lighthouse : perf XX, a11y XX, BP XX, SEO XX (si applicable)
- axe-core violations : 0

### Clean code grep results

[Tableau zéro tolérance — voir §7]

### Issues touchées / créées

[Liste avec numéros]

### Closes

- Closes #XX (si applicable)

### Préface PR suivante

[Description courte de la prochaine PR si séquence en cours]
```

---

## 5. Garde-fous transverses (non négociables)

Ces règles s'appliquent à TOUTE PR Ankora sauf override explicite @cowork :

- **ZÉRO touch sur `src/lib/domain/simulation.ts`** sans validation @cowork (logique métier testée T1, hors scope par défaut).
- **ZÉRO touch sur Atomic UI mergée** (Glass, Eyebrow, Num, Row, Button enrichi) sans validation @cowork.
- **ZÉRO ajout de dépendance** sans validation @cowork. Toute dep doit être : MIT/Apache compatible, pas de SaaS gratuite avec compte requis, pas de payante en prod tant qu'Ankora n'a pas de revenus (cf. budget 0 € NORTH_STAR.md).
- **ZÉRO modification de tokens CSS prod** sans audit (cf. `docs/design/token-usage.md`).
- **ZÉRO modification de migration Supabase** sans validation @cowork + agent `rls-flow-tester`.
- **ZÉRO modification de policy RLS** sans validation @cowork.
- **ZÉRO copy FSMA-douteuse** : toute formulation suggérant conseil en placement → STOP, remontée @cowork.
- **ZÉRO scope creep** : si un besoin émergent apparaît hors brief → STOP, remontée @cowork. Ne jamais "tant qu'on y est" sans validation.

Si pendant l'exécution un bloquant équivalent est détecté → **STOP**, rapport intermédiaire à @cowork avec faits + recommandation, pas d'auto-décision.

---

## 6. Posture "push done ≠ task done"

Référence canonique : `CLAUDE.md` projet ligne "Définition de DONE".

Principes :

- Un commit = un changement atomique et descriptif
- Un push = signal d'activité, **pas** de complétion
- Un PR ouverte = invitation à review, **pas** de complétion
- Une PR mergée = task complète **uniquement** si les 5 critères DoD sont vérifiés ET le rapport final livré

**Discipline** : avant de déclarer DONE, exécuter le check Sourcery (cf. §2 critère 2) **et** confirmer mergeStateStatus = CLEAN. Pas d'exception.

---

## 7. Clean code directives @thierry

Vérifications grep zéro tolérance avant push final :

```bash
# Sur les fichiers ajoutés/modifiés dans la PR
grep -r "#[0-9a-fA-F]\{6\}" <scope>     # 0 hardcoded color
grep -r "rgb(" <scope>                  # 0 inline rgb (hors fichiers .css globaux)
grep -r "console.log" <scope>           # 0 debug oublié
grep -r ": any" <scope>                 # 0 TypeScript any
grep -r "hover:bg-muted" <scope>        # 0 violation token-usage doctrine
```

Quality checks :

```bash
npm run lint              # 0 erreur
npm run lint:use-server   # 0 erreur (async-only enforcement)
npm run typecheck         # 0 erreur (strict + noUncheckedIndexedAccess)
npm run test              # 100% pass
npm run e2e               # 100% pass sur parcours critiques
```

Code review au sens large :

- Pas de duplication : si une logique existe déjà dans le repo, la réutiliser
- Pas de classes ou composants dupliqués : factoriser dans Atomic UI maximum
- Tous les imports utilisés (eslint no-unused-imports passe)
- Conventions de nommage cohérentes avec le repo existant
- Audit Sourcery digéré sérieusement (pas juste "fix automatique")
- **Relire son propre diff complet avant push final, comme si on le reviewait pour quelqu'un d'autre**

---

## 8. Convention des prompts CC Ankora

Tout prompt @cowork → @cc-ankora doit :

1. Tenir dans **un seul codeblock copiable** d'un seul geste par @thierry (pas de fragmentation texte + bloc + texte + bloc).
2. Référencer ce document : _"Cf. `docs/cowork-handoff-conventions.md` §X pour [DoD / format rapport / garde-fous / posture / clean code]"_.
3. Inclure les éléments **spécifiques** au scope :
   - Contexte + objectif
   - Prérequis vérifiables explicitement
   - Branche à créer
   - Décisions techniques verrouillées par @cowork
   - Scope précis (livrables numérotés)
   - Format rapport attendu (intermédiaire si checkpoint, sinon final)
4. Indiquer les **checkpoints @cowork** OBLIGATOIRES s'il y en a, avec STOP explicite.
5. Préciser la **durée estimée** CC Ankora pour le scope.

Le contexte explicatif @cowork (récap, raisonnement, arbitrages) reste **autour** du codeblock, jamais à l'intérieur.

---

## 9. Convention de tags

À utiliser dans TOUT rapport, commit message, commentaire PR, ou note inter-agents :

- `@cowork — …` pour l'agent Cowork
- `@cc-ankora — …` pour l'agent Claude Code terminal
- `@cc-design — …` pour l'agent Claude Design (claude.ai/design)
- `@thierry — …` pour Thierry (validation, décision, merge)

Utilité : traçabilité des décisions et auditabilité des contributions par agent.

---

## 10. Cleanup branches locales (squash merge stratégie)

Ankora utilise **squash merge** comme stratégie GitHub. Procédure cleanup canonique (cf. `CLAUDE.md` §"Cleanup branches locales") :

1. `git fetch --prune origin`
2. `git branch -d <branche>` (tente la version safe d'abord)
3. Si refus → cross-check via `gh pr list --state merged --limit 100 --json headRefName --jq '.[] | .headRefName' | grep <branche>`
4. Si une PR mergée correspond exactement → `git branch -D <branche>` safe
5. Si aucune PR mergée trouvée → STOP, investiguer avec @cowork

Branches `[gone]` après prune sont 100% safe à supprimer avec `-D` (remote déjà supprimée par GitHub).

---

## 11. Évolution du document

Ce document est versionné dans `docs/`. Toute modification :

- Doit être proposée via PR dédiée (pas glissée dans une PR métier)
- Doit citer la session @cowork qui a tranché le changement
- Doit être validée par @thierry avant merge

Modifications structurelles (ex : changement DoD) → ADR associé dans `docs/adr/`.

---

## Référence rapide

| Besoin                              | Section |
| ----------------------------------- | ------- |
| Rédiger un prompt CC Ankora         | §8      |
| Format rapport checkpoint           | §3      |
| Format rapport final                | §4      |
| Vérifier les 5 critères DoD         | §2      |
| Lister les garde-fous transverses   | §5      |
| Checklist pré-PR                    | §7      |
| Cleanup branches mergées via squash | §10     |
