---
project: ankora
type: cc-handoff
session: 2026-08-11-1915
agent: cc-fable
---

# Handoff — PR L3 « sections au relevé », mergée (#376) : le programme landing est TERMINÉ

> Session @cc-fable (Fable 5, exception @thierry du 8 août — périmètre visuel
> L2/L3), worktree `F:\PROJECTS\Apps\ankora-landing`, port 3200.
> Merge exécuté par l'agent sur délégation permanente de @thierry (mémoire
> « carte blanche » du 10/08 + précédent explicite L2).

## 1. État git brut

```text
origin/main : e74a499 feat(landing): L3 — les sections passent au relevé… (#376)
              299386e (#348 — consentement, +6 cas e2e, planchers 241→247)
              b0d634e (base de la branche L3)

worktree    : docs/handoff-l3-roadmap (cette passation)
              feat/landing-l3-sections supprimée côté remote après squash
```

## 2. PR — état final

**#376, MERGED** le 11 août 2026 à 17:06Z, squash `e74a499`. DoD 5/5 au
commentaire `issuecomment-5256326853` :

- CI toute verte (15 checks) ; Vitest **2269/2269**.
- **Planchers relevés sur le run de PR `31506385973`** : public
  **241 passed / 221 skipped, 0 failed, 0 flaky** ; authentifié
  **50 passed / 5 skipped**. Delta **0/0** — A/B `--list` : 462 cas identiques
  avec et sans le diff. ⚠️ Piège de lecture journalisé : la branche est partie
  de `b0d634e`, AVANT le +6 de #348 — la PR affiche 241 quand le tableau du
  jour dit 247, et les deux sont vrais (cf. §8).
- **Sourcery ET Codex : muets par ÉPUISEMENT DE QUOTA** (Sourcery : cap hebdo
  500 k caractères de diff ; Codex : limite d'usage). Zéro fil, consigné en
  toutes lettres au commentaire DoD. La couverture de revue = plan-reviewer ×2
  AVANT le code (21 éditions) + 5 agents QA. S'ils repassent après coup,
  traiter leurs remarques au fil du dépôt.
- `mergeStateStatus` CLEAN, 0 fil.
- **Prod vérifiée** : ankora.be sert « Vois ce qui est déjà engagé · Ankora »
  (marque unique — le doublement préexistant est corrigé), la cascade-relevé,
  la 5ᵉ question FAQ.

## 3. Ce que L3 a livré

Cascade Feature en grammaire relevé (carte, filets, filet double, montants
encre neutre — le signe est l'unique porteur, gardé par bundle) ; h3 orphelin →
h2 ; migration `landing.hero.waterfall.*` → `landing.feature.waterfall.*` ×5
avec NBSP/U+2212 épinglés par `textContent` brut + `provisionsDefinition`
(neuve) ; `FEATURE_WATERFALL_DEMO` renommé, `HERO_BROWSER_DOTS` supprimé
(zéro consommateur) ; FAQ ×5 avec l'objection banque (anti-PSD2 dans la
réponse) ; FooterCTA « déjà engagé. » ; metadata home réécrites (3 pièges
Next.js mesurés : remplacement `openGraph`, perte d'`og:image` malgré la
« priorité fichier » de la doc, perte de `twitter:image` — parades via le
parent résolu, preuves `<head>` avant/après au rapport) ; `llms-full.txt`
committé régénéré (sa source change) ; sonde 375 px durcie `body.scrollWidth`
(#344 rétréci, pas fermé) ; glossaire i18n 1.6. Rapport complet :
`docs/prs/PR-L3-report.md`.

## 4. Décisions prises cette session

- **Plan validé en 2 tours plan-reviewer** (17 + 4 éditions) — dont 2 défauts
  SEO trouvés AVANT le code ; 2 autres pièges metadata trouvés PAR LA MESURE
  après (og:image, twitter:image).
- **Lighthouse 🔴 ne bloque pas la PR** : desktop 98/100/93/100, mobile
  68/100/93/100 — les deux échecs vivent dans des composants hors diff
  (`ConsentBanner` candidat LCP mobile, style runtime `sonner` sans nonce).
  Sortis en tickets **#377** et **#378** avec l'analyse ; élargir L3 aurait été
  le scope creep banni. Ce que L3 pouvait dégrader (a11y, SEO, TBT) est à
  100/100/0 ms.
- **Pas de scission malgré 450/269** : le précédent L2 (717/455 en une PR)
  fixe l'ordre de grandeur réel du seuil « 600 » du plan-cadre.
- Retouches agents QA appliquées avant push : `break-words` derrière
  `min-w-0` (Feature + Hero), JSDoc FAQ, commentaire NBSP de `constants.ts`,
  glossaire 1.6, 8 mots cspell insérés EN PLACE.
- Suite publique locale : 239/2 — les 2 échecs sont la famille d'environnement
  L2 (`consent-first-visit` post-submit sur le vrai backend), reproduits en
  solo, spec hors diff ; la CI a arbitré (0 échec).

## 5. En attente @thierry

- **Contrôles iPhone réel** — liste L2 (5 points) PLUS les 5 de L3 (rapport
  §Agents QA) : filet double sur LES DEUX cartes, carte Feature à 320 px,
  ombres Principles/FAQ, tap des CTA Feature, 5ᵉ carte FAQ sur SE.
- Intention du CTA « Comment ça marche ? » (pointe `#principles`, au-DESSUS de
  Feature dans le DOM — préexistant, relevé par ui-auditor).
- Ratification d'ADR-039 (statut `Proposed` → `Accepted`, un commit d'une
  ligne le jour où il le dit).

## 6. Garde-fous activés

Préflight GO avant chaque commande sortante (aucun NO-GO) ; staging par
chemins explicites + `git diff --cached --stat` relu (21 fichiers, zéro
orphelin) ; jamais de `gh` depuis bash (monitors CI en curl API publique) ;
agents QA read-only sauf lighthouse (artefacts hors dépôt) ; corps `gh`
toujours par `--body-file`.

## 7. Next action concrète

**Le programme landing est clos.** Rien d'engagé. Les suites vivent au
ROADMAP §Programme parallèle : réconciliation vocabulaire (@thierry + session
cockpit), passe `i18n-translator` nl/de/es (6 items FR-verbatim, dont la dette
NEUVE `provisionsDefinition`), tickets #377/#378, contrôles iPhone.

## 8. Anti-pièges (sessions suivantes)

- **Un plancher se compare au niveau de la BASE de la branche**, jamais au
  tableau du jour : la PR L3 affichait 241 pendant que main disait 247 (+6 de
  #348 postérieur à la base) — les deux vrais. Journalisé dans
  `planchers-e2e-historique.md`.
- **La métadonnée fichier (`opengraph-image.tsx`) ne survit PAS à un
  `openGraph` déclaré par la page** — malgré la doc. Parade : 2ᵉ argument
  `parent` de `generateMetadata`, images reportées explicitement ; et
  `twitter.images` du parent est VIDE (repli twitter→og seulement quand la
  page ne déclare rien) — reporter les urls og.
- Sourcery ET Codex peuvent être à court de quota le même jour : le DoD se
  fait alors sur plan-reviewer + agents QA, en le disant en toutes lettres.
- Les duplications og layout↔page et la clause FSMA absente de la meta
  description sont des dettes NOMMÉES (rapport L3) — ne pas les « corriger »
  en douce dans une PR autre.
- `.lighthouserc.json` pointe `:3000` — pour mesurer localement, binaire
  `lighthouse` de `@lhci/cli` directement contre `:3200`.

---

**Signé** : @cc-fable · Session 2026-08-11-1915
