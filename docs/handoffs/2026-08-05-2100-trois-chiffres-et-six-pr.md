# Handoff — 5 août 2026, 21h00

**Session** : @cc-ankora (Opus 5) · **Branche de fin** : `fix/details-signales-par-thierry`

---

## 1. Livré et mergé

| PR       | Contenu                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#310** | Décomposition des trois postes du hero (règle 10). Les 50 € s'ouvrent et nomment chaque facture avec son échéance                                                                                             |
| **#311** | La PWA installée peut recevoir une mise à jour : `registration.update()` au retour de visibilité, `skipWaiting()` inconditionnel retiré, bandeau, entrée manuelle dans « Plus », **garde source sur `sw.js`** |
| **#312** | Le consentement gouverne les traceurs. **Vérifié en production** : `window.va` et `window.si` sont `undefined`, zéro script hors `_next`                                                                      |
| **#313** | Audit du parcours complet + corrections `CLAUDE.md` (Klaro jamais installé, `/app/settings/security` en 404, compte d'agents)                                                                                 |

**Branche poussée, non mergée** : `fix/details-signales-par-thierry` — erreurs VSCode (tsconfig cassé publié par `@vercel/analytics`, classes Tailwind non canoniques) et liens de pied de page remontés à 44 px.

---

## 2. Les trois chiffres signalés — établis par la preuve

Enquête `prod-bug-investigator`, mesures obtenues en exécutant les vraies fonctions du domaine. Montants ci-dessous **fictifs** (dépôt public), même arithmétique.

### « Après tes sorties · Août » = 366,10 € — arithmétique JUSTE, explication FAUSSE

`netPrincipalAfterPlan` (`transfer.ts:103-107`) :

```
2400 − 450 (Vie Courante) − 40 (Épargne) − 1378,90 (factures) − 165 (engagements) = 366,10
```

Le sous-titre ne nomme que **1 543,90 €** sur **2 033,90 €** soustraits. **490 € disparaissent sans être nommés.**

**La preuve qui tranche** : sur 12 mois le chiffre varie de **260 €** pendant que les deux montants énumérés par le sous-titre **ne bougent jamais**. En juillet — le mois de la plus grosse facture — la carte affiche **le plus d'argent restant** (626,10 €), parce que `epargneTransferNet` devient négatif et _ajoute_ de l'argent.

Deux défauts de plus, du même bloc :

- **« Sorties » est un mot faux.** Les 450 € et les 40 € restent son argent, sur ses comptes.
- **« Budget du mois » 816,10 € et « Après tes sorties » 366,10 € diffèrent d'exactement 450 €** — le virement Vie Courante — et rien ne le dit.

**Jalon ADR-035 rouge.** L'amendement accepté le jour même impose « À virer vers l'épargne » / « À reprendre sur l'épargne » ; le code affiche encore « Principal → Épargne ». Le `grep` de l'ADR rend **6** au lieu de **0**. Ce bloc est la seule surface du cockpit restée hors du chantier vocabulaire, et la seule sans décomposition ouvrable.

**Bug daté, silencieux.** `installmentAmountAt` — seule fonction qui sait que la dernière échéance diffère — **n'a aucun appelant en production**. En mars 2027, « Après tes sorties » retirera 165 € au lieu de 152,38 €. **12,62 € d'erreur, sans signal.**

### Solde « Compte Principal » 2 310 € — un nombre tapé à la main, jamais dérivé

Écrivain unique : `updateAccountBalanceAction`. Aucun trigger, aucun job. **Ce solde n'est pas devenu faux : il a cessé d'être vrai au premier euro qui a bougé.**

Deux constats aggravants :

1. **`accounts.updated_at` existe, est maintenue par trigger, et n'est JAMAIS lue** — `workspace-snapshot.ts:222` ne la sélectionne pas. L'interface écrit « Solde actuel » alors que la base sait depuis quand. C'est la règle 11 : _une date se vérifie, une coche se croit._
2. **Deux des trois soldes ne servent à rien.** Seul `provisions` alimente un calcul. Le sous-titre « pour qu'Ankora calcule précisément » est **faux pour deux cartes sur trois**.

Cause racine : **ADR-038 D6**, accepté aujourd'hui, zéro ligne implémentée.

### « Épargne estimée — » et l'épargne libre

Le tiret est **conforme** (jour 5 < 7, ADR-035). Il apparaîtra le 7 août.

Mais la question posée a déjà sa réponse dans l'app, **sous un nom qui ne la donne pas** : `surplusOverTarget = 1 180 − 112,50 = 1 067,50 €`, affiché « au-delà de la cible ».

**`detailParCharge` est calculé puis JETÉ** — zéro consommateur hors tests. Les cinq noms qui composent les 112,50 € existent et ne sont montrés nulle part. C'est exactement pourquoi le nombre lui paraît incohérent.

> **Piège si on l'affiche** : les parts arrondies somment à 112,**51**, le total affiche 112,**50**. La décomposition descend avec le total non arrondi — jamais re-sommée à l'affichage.

**Le montant évoqué ne se reconstituent depuis AUCUNE définition du code.** Candidats mesurés : 112,50 (cible), 570 (total annuel), 285 (six mois de lissage). Le plus proche est 285. **Question ouverte à lui poser — ne pas l'inventer.**

---

## 3. Reprise, dans cet ordre

1. **Merger `fix/details-signales-par-thierry`** (DoD 5 critères).
2. **Le bloc « Plan du mois »** : nommer les deux virements OU cesser de les appeler « sorties », appliquer le vocabulaire ADR-035 (jalon à 0), rendre la carte ouvrable. `MonthlyTransferPlan` porte déjà les cinq termes.
3. **`detailParCharge` sous « Cible théorique »** — ferme la règle 10 sans rien recalculer.
4. **`accounts.updated_at`** affiché en attendant ADR-038 D6.
5. `installmentAmountAt` sans appelant (12,62 € en mars 2027) — PR séparée.
6. Menu mobile (15 entrées, 717 px sur 844), `/security` (issue #79), NOTICE, CSP `style-src`, ADR-011 branche morte, CGU au signup, doublon de constante.
7. **Puis seulement** la refonte design + UX, landing en tête.

---

## 4. Décisions et corrections de la session

- **Trois fois la mesure m'a contredit** : le ⊕ n'est pas cassé (reproduction 10 surfaces × 5 largeurs), le 404 `/legal/*` venait de mon serveur local, ma première sonde de traceurs a répondu « aucun » à tort.
- **`plan-reviewer` a rejeté trois plans**, dont deux qui **introduisaient** le défaut qu'ils prétendaient fermer.
- **Correction à l'audit du jour** : « Voir Juillet » (17 px) n'est **pas** une non-conformité — lien inline dans une phrase, exempté par WCAG 2.5.8.
- **Badge de sécurité refusé**, avec les raisons : image tierce (rouvre la CSP), note qui se périme en silence, périmètre limité aux en-têtes, et une affirmation publique engage juridiquement. Proposé à la place : `/security` factuelle + liens vers les scans en direct + `security.txt`.

## 5. À surveiller

`public/llms-full.txt` diverge dans l'arbre de travail (régénéré par `prebuild`). Ne pas l'emporter par inadvertance dans un commit.
