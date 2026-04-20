# ADR-001 — No-PSD2 : agrégation bancaire via import manuel

- **Statut** : Accepted
- **Date** : 2026-04-20
- **Accepté le** : 2026-04-20 par Thierry vanmeeteren
- **Deciders** : Thierry vanmeeteren (Product Owner), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `product`, `security`, `budget`, `regulation`
- **Portée** : Phase 1 (MVP) et Phase 2. Phase 3 possiblement révisée.

---

## Contexte & problème

Ankora est un cockpit financier personnel qui aide l'utilisateur à **lisser
ses charges annuelles en provisions mensuelles**. Pour que le produit
fonctionne, il doit connaître :

1. le **revenu mensuel net** de l'utilisateur,
2. ses **charges fixes** (loyer, assurances, abonnements, taxes),
3. optionnellement ses **dépenses variables** (pour calculer le budget restant).

La question est : **comment ces données arrivent-elles dans Ankora ?**

Trois grandes familles de solutions existent sur le marché européen en 2026 :

1. **Agrégation bancaire automatisée** via PSD2 (Open Banking) — Tink, Budget
   Insight/Powens, TrueLayer, GoCardless Bank Account Data, Nordigen.
2. **Import semi-automatique** via fichiers CSV/OFX/QIF exportés manuellement
   depuis la banque de l'utilisateur.
3. **Saisie manuelle** des charges + dépenses par l'utilisateur.

Le choix structure :

- le **modèle de sécurité** (scope OAuth, stockage de tokens bancaires, PII),
- le **modèle réglementaire** (agent PSD2, statut DSP2, supervision FSMA/BNB),
- le **modèle économique** (coût d'agrégateur à l'utilisateur ou à l'éditeur),
- l'**expérience utilisateur** (onboarding fluide vs friction de l'import
  manuel),
- la **stack technique** (webhooks bancaires, refresh tokens 90j, reconnexion
  régulière) et donc **la complexité de dev + maintenance**.

Il faut trancher **avant** la Phase 1 parce que la décision conditionne le
schéma DB (`accounts` hors ou dedans), la liste des Server Actions, le parcours
d'onboarding, les textes légaux (CGU, privacy), et toute la stratégie
marketing.

---

## Décision — drivers

Les critères décisifs, classés par poids :

1. **Budget 0 € strict** (contrainte transverse ROADMAP) — tant qu'Ankora n'a
   pas de revenus, **aucune dépendance payante** n'est tolérée. Les
   agrégateurs PSD2 facturent typiquement 0,30 € à 1,50 € par compte connecté
   par mois. Pour 100 users avec 3 comptes, on parle de 90 à 450 € / mois —
   incompatible avec Phase 1.
2. **Souveraineté réglementaire** — en UE, exploiter des données PSD2
   implique généralement un statut d'**AISP** (Account Information Service
   Provider) supervisé par l'autorité locale (BNB en Belgique, FSMA pour la
   conduite). C'est un projet juridique à ~18 mois, ~30-50 k€ de setup et une
   équipe de conformité. Incompatible avec un MVP perso.
3. **Surface d'attaque & PII** — stocker des tokens bancaires, même via un
   tiers, expose Ankora à des incidents très coûteux (RGPD Art. 33 +
   obligations DSP2 strong customer authentication). Repousser cette exposition
   à Phase 3 minimale réduit drastiquement le risque.
4. **Time-to-MVP** — un onboarding fluide mais légalement bloquant met le MVP
   à 18+ mois. Un onboarding un peu moins fluide mais livrable en 3 mois permet
   de valider le produit avant d'investir.
5. **Valeur différenciante** — Ankora ne se vend pas sur l'agrégation (déjà
   saturée par Bankin', Linxo, Yolt, Revolut, Lydia). Elle se vend sur le
   **lissage intelligent des charges fixes** — ce qui ne nécessite pas la vue
   transactionnelle temps réel.

---

## Options considérées

### Option A — Agrégation PSD2 via un agrégateur tiers

**Description** : intégrer Powens / Tink / TrueLayer. L'utilisateur autorise
la connexion OAuth, l'agrégateur pousse les transactions vers Ankora via
webhook ou polling.

| Critère              | Verdict                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| Coût récurrent       | **0,30-1,50 € / compte / mois** — incompatible budget 0 €              |
| Statut réglementaire | AISP requis (ou "distribution" d'un AISP) → setup juridique 6-18 mois  |
| Temps de dev         | 4-8 semaines (OAuth, webhooks, normalisation, reconnexion 90j)         |
| Qualité des données  | Excellente — temps réel, catégorisation, labels normalisés             |
| UX onboarding        | Excellente — 3 clics, zéro friction                                    |
| Surface PII          | Élevée (tokens bancaires, historique transactions)                     |
| Reconnexion 90j PSD2 | Friction régulière (règlement DSP2 : re-auth forte tous les 90 jours)  |
| Vendor lock-in       | Élevé — remplacer l'agrégateur implique refacto schéma + re-onboarding |

### Option B — Import manuel CSV / OFX / QIF

**Description** : l'utilisateur télécharge un export depuis son espace banque
en ligne (format .csv ou .ofx), puis glisse le fichier dans Ankora. Un parseur
mappe les colonnes vers le modèle Ankora.

| Critère              | Verdict                                                               |
| -------------------- | --------------------------------------------------------------------- |
| Coût récurrent       | **0 €** — aucun tiers                                                 |
| Statut réglementaire | Aucun requis — l'utilisateur fournit ses propres données              |
| Temps de dev         | 1-2 semaines (parseur + mapping + preview avant import)               |
| Qualité des données  | Bonne, dépend du format banque. OFX > CSV (structure standardisée)    |
| UX onboarding        | Moyenne — l'utilisateur doit connaître l'emplacement de l'export      |
| Surface PII          | Faible — pas de tokens, les fichiers peuvent être purgés après import |
| Reconnexion          | Aucune — rechargement manuel à la demande                             |
| Vendor lock-in       | Nul — parseurs internes, formats standards                            |

### Option C — Saisie manuelle uniquement

**Description** : pas d'import, tout est saisi à la main. Le simulateur
fonctionne sur les charges saisies + un revenu déclaré.

| Critère              | Verdict                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Coût récurrent       | **0 €**                                                                                    |
| Statut réglementaire | Aucun                                                                                      |
| Temps de dev         | Zéro — c'est le fallback natif                                                             |
| Qualité des données  | Bonne pour les charges fixes (stables dans le temps), mauvaise pour les dépenses variables |
| UX onboarding        | Friction initiale élevée (saisie des 10-15 charges du ménage)                              |
| Surface PII          | Minimale — uniquement les montants et libellés saisis                                      |
| Valeur produit       | Suffisante pour le cœur de valeur (lissage charges), insuffisante pour le budget variable  |

---

## Décision

**Option C retenue pour Phase 1 (MVP)**, avec **Option B ajoutée en Phase 2**.
**Option A rejetée définitivement** pour la feuille de route actuelle.

### Traduction concrète

**Phase 1 (MVP)** :

- L'utilisateur saisit manuellement :
  - son revenu mensuel net (1 valeur) ;
  - ses charges fixes (loyer, élec, assurances, abonnements — typiquement
    10-15 entrées, saisie one-shot à l'onboarding) ;
  - ponctuellement ses dépenses variables (feature optionnelle, pas bloquante).
- Le simulateur, le lissage, le rétro-planning fonctionnent sur ces seules
  données.
- **Aucun compte bancaire** n'est connecté. Le schéma DB prévoit une table
  `accounts` purement logique (compte courant, compte épargne, pot partagé) —
  ces comptes ne sont **pas** reliés à une banque réelle (voir ADR-002).

**Phase 2** :

- Ajout du parseur CSV/OFX pour **import assisté** des dépenses variables
  (import mensuel ou trimestriel à l'initiative de l'utilisateur).
- Pas de connexion persistante, pas de polling. L'utilisateur glisse le
  fichier → preview → confirmation → insertion.
- Les fichiers sources sont **purgés dans les 24 h** après import réussi
  (conservation limitée à l'audit).

**Phase 3 (post-revenus uniquement)** :

- Réévaluation éventuelle d'une intégration PSD2 si :
  - Ankora génère des revenus récurrents qui absorbent le coût agrégateur,
  - le produit a démontré un besoin fort d'agrégation temps réel (signal
    utilisateur),
  - le statut AISP peut être obtenu ou distribué via un partenaire.
- À défaut de ces 3 signaux, rester sur Option B durablement est **une
  réponse valide**.

---

## Conséquences

### Positives

- **Budget 0 € respecté** sans compromis sur la feature principale (lissage).
- **Pas de statut AISP/DSP2** à obtenir — Ankora reste un outil de gestion
  personnelle, pas un service de paiement.
- **Surface d'attaque minimale** — pas de tokens bancaires, pas de PII
  transactionnel sensible stocké durablement.
- **RGPD simplifié** — l'utilisateur reste maître de ses données sources,
  Ankora traite uniquement ce qu'il entre volontairement.
- **Time-to-MVP court** — le parcours d'onboarding est prêt côté stack (3
  étapes déjà mockées).
- **Différenciation produit** claire : Ankora n'est pas un énième agrégateur,
  c'est un **cockpit de lissage**.

### Négatives

- **Friction à l'onboarding** : saisir 10-15 charges fixes à la main est moins
  agréable qu'une connexion OAuth en 3 clics. Mitigations :
  - templates pré-remplis par catégorie (logement, transport, santé,
    télécoms) ;
  - import CSV arrivant en Phase 2 pour tout ce qui est **dépenses variables**
    (le revenu + charges fixes restent à saisir, mais sont stables dans le
    temps donc one-shot).
- **Pas de vue transactionnelle temps réel** — Ankora ne sait pas qu'une
  facture a été payée à l'instant T. Acceptable pour le MVP (le rétro-planning
  et les alertes fonctionnent sur l'échéancier, pas sur le flux transactionnel).
- **Dépendances aux formats d'export banque** pour Phase 2 — certaines banques
  belges (Belfius, KBC, BNP Paribas Fortis, ING) proposent des exports
  différents. À cadrer dans un ADR dédié quand Phase 2 commencera.
- **Position marché** — Ankora ne pourra pas se comparer feature-à-feature avec
  Bankin' ou Linxo sur l'agrégation. Assumé : le pitch est ailleurs.

### Risques résiduels

- **Pression utilisateur pour du PSD2** si Ankora gagne en traction — à
  surveiller. Un questionnaire feedback trimestriel en Phase 2 permettra de
  mesurer si le signal est fort.
- **Évolution réglementaire** : PSD3 est en discussion au niveau UE (texte
  attendu courant 2026). Si PSD3 assouplit les exigences AISP pour les outils
  de gestion personnelle, rouvrir l'évaluation.

---

## Conformité & contraintes croisées

| Contrainte                           | Respect de cette décision                                        |
| ------------------------------------ | ---------------------------------------------------------------- |
| Budget 0 € (ROADMAP §1)              | ✅ Aucun coût tiers engagé                                       |
| No-LLM serveur Phase 1               | ✅ Cohérent — même esprit de minimalisme                         |
| Hosting EU (Vercel+Supabase eu-west) | ✅ Aucune exfiltration transfrontalière de données bancaires     |
| RGPD                                 | ✅ Minimisation — seules les données saisies sont traitées       |
| FSMA (Belgique)                      | ✅ Pas de conseil en placement, pas d'intermédiation de paiement |

---

## Alternatives explicitement **non** envisagées (hors scope)

- **Connexion directe banque par banque** (ex : API maison pour Belfius) —
  illégal sans agrément DSP2, et les banques ne proposent plus d'API publique
  hors du cadre Open Banking.
- **Scraping web bancaire** (Plaid model US) — non seulement interdit par les
  CGU des banques EU, mais aussi en violation du RGPD (traitement de
  credentials utilisateur).
- **Scraping e-mails** (factures, relevés) pour alimenter automatiquement —
  exclu pour des raisons identiques de PII et de consentement.

---

## Révision

Cet ADR sera **réévalué** si l'un des événements suivants se produit :

1. Adoption de PSD3 au Parlement européen avec assouplissement pour les PFM
   (Personal Finance Management tools).
2. Ankora génère plus de 5 000 € de MRR et peut absorber le coût agrégateur.
3. Apparition d'un partenaire AISP belge proposant un modèle de distribution
   gratuit pour les produits non-commerciaux.

Tant que ces conditions ne sont pas réunies, la décision tient.

---

## Liens & références

- [ROADMAP.md — §Hors scope](../ROADMAP.md#hors-scope-définitif) — PSD2
  listé explicitement comme hors scope.
- [ROADMAP.md — §Phase 2](../ROADMAP.md#phase-2--pots-partagés--ia-byok) —
  Import CSV/OFX prévu, PSD2 exclu.
- [ARCHITECTURE.md](../ARCHITECTURE.md) — diagramme de couches, Supabase EU.
- Directive (UE) 2015/2366 (PSD2) + règlement délégué (UE) 2018/389
  (RTS SCA & CSC).
- Discussion PSD3 : proposition COM(2023) 366 final.

---

**Décision acceptée le 2026-04-20.** Toute modification requiert un ADR de
supersession (ADR-NNN) qui documente la bascule.
