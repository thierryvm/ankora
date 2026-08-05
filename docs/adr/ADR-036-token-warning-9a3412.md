# ADR-036 — `--color-warning` à `#9a3412` : AA **et** séparation du laiton

- **Statut** : Accepted
- **Date** : 2026-07-29
- **Accepté le** : 2026-07-29 par @thierry — arbitrage rendu sur la question 1 de [`docs/prs/PR-chantier1-report.md`](../prs/PR-chantier1-report.md) §7
- **Proposé par** : @cc-ankora (mesure des ratios) — alternative déjà calculée et documentée en [ADR-035](ADR-035-vocabulaire-des-quatre-chiffres.md) §« Conséquences négatives »
- **Deciders** : @thierry, @cc-ankora
- **Tags** : `design-system`, `a11y`, `tokens`
- **Portée** : Chantier 2
- **Amende** : [ADR-035](ADR-035-vocabulaire-des-quatre-chiffres.md) (valeur du seul token `--color-warning`, mode clair)

---

## Contexte & problème

Le chantier 1 a appliqué `--color-warning: #a35a06`, valeur prescrite par
`DECISIONS-ANKORA.md` §3.6, et a **signalé le coût dans le même mouvement** : cette
valeur atteint AA (5,22:1 sur blanc) mais s'effondre sur le pigment laiton de l'admin
(`--color-accent-600`, `#8b6914`) — **1,03 de séparation de luminance**, c'est-à-dire
deux couleurs de clarté pratiquement identique.

Ce n'est pas un détail esthétique. Une **décision @cowork du 2026-04-25** avait épinglé
`#d97706` précisément pour éviter cette confusion sémantique (avertissement vs pigment
admin). Cette décision n'était adossée à **aucun ADR** et surtout à **aucun test** : elle
ne survivait que dans un commentaire de `globals-tokens.test.ts`, ce qui explique
qu'elle ait pu être renversée pour atteindre AA sans que rien ne proteste.

Les trois candidats, tous **mesurés** (WCAG 2.1, calcul et non appréciation) :

| Valeur                 | AA sur blanc | Séparation vs laiton `#8b6914` |
| ---------------------- | -----------: | -----------------------------: |
| `#d97706` (historique) |      3,19 ❌ |                        1,60 ✅ |
| `#a35a06` (prescrit)   |      5,22 ✅ |                        1,03 ❌ |
| **`#9a3412` (retenu)** |  **7,31 ✅** |                    **1,44 ✅** |

## Decision

**`--color-warning: #9a3412` en mode clair.** Le mode sombre (`#fbbf24`) est inchangé :
il passe AA à 10,39:1 et conserve 1,42 de séparation du laiton sombre `#d4a017`.

**Pourquoi cette valeur plutôt que la valeur prescrite.** Le document de décisions fait
foi, et le chantier 1 a eu raison d'appliquer sa valeur plutôt que de trancher seul.
Mais la raison d'être de la prescription était **le contraste** — et `#9a3412` sert cette
raison **mieux** (7,31 contre 5,22) tout en préservant le critère que la prescription
avait ignoré. Ce n'est pas un compromis entre deux valeurs : c'est la seule des trois
qui passe les deux critères.

`#9a3412` reste franchement ambré-orangé (28° d'écart de teinte avec le laiton, contre
11° pour les deux autres). Il ne vire pas au rouge, ce qui aurait collisionné avec
`--color-danger`.

## Le vrai correctif : le second critère devient un test

Le renversement de 2026-04-25 a été possible parce que la séparation du laiton n'était
écrite nulle part sous forme exécutable. Répéter la décision dans un commentaire
reproduirait exactement la même fragilité.

`src/app/__tests__/contrast-ratios.test.ts` **calcule** désormais la séparation depuis
`globals.css` dans les deux thèmes et échoue sous **1,30**. Ce seuil est placé entre les
deux mesures qui ont fait jurisprudence — `#d97706` à 1,60 jugé distinct, `#a35a06` à
1,03 jugé confus — du côté du plus exigeant.

Le test de contraste AA existant est réutilisé tel quel : aucun ratio n'est recopié dans
une assertion, les deux critères sont recalculés depuis le fichier CSS à chaque exécution.

## Conséquences

- ✅ AA passe de 5,22 à 7,31 sur blanc — la valeur retenue est **plus** accessible que
  celle qu'elle remplace.
- ✅ La décision @cowork du 2026-04-25 cesse d'être une convention orale : elle est
  exécutable.
- ⚠️ `--color-warning` est utilisé par le bloc d'alertes de l'accueil (C5) et par les
  badges de retard de facture. Le changement est visible ; il assombrit légèrement
  l'ambre vers un orange brûlé.
- ⚠️ `DECISIONS-ANKORA.md` §3.6 porte encore `#a35a06`. Le document n'est pas réécrit —
  cet ADR est la trace de l'écart, conformément à la façon dont ADR-035 a traité les
  siens.

## Refs

- [ADR-035](ADR-035-vocabulaire-des-quatre-chiffres.md) — a mesuré la collision et proposé cette alternative
- [`docs/prs/PR-chantier1-report.md`](../prs/PR-chantier1-report.md) §4.4 et §7.1 — la question posée
- `src/app/__tests__/contrast-ratios.test.ts` — les deux critères, calculés
