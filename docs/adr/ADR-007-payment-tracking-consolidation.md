# ADR-007 — Consolidation du tracking paiements (placeholder de numérotation)

- **Statut** : Superseded by ADR-011 + ADR-012 + ADRs futurs 013-015
- **Date** : 2026-05-03
- **Authored by** : Cowork-Opus (Architecture)
- **Tags** : `meta`, `traceability`

---

## Contexte

Cet ADR existe pour combler un trou de numérotation entre ADR-006 (testing-strategy-v1) et ADR-008 (account-naming-and-typing). Il documente l'évolution du raisonnement architectural sur le tracking paiements.

## Historique du raisonnement

**3 mai 2026 (matin)** — Découvertes empiriques smoke test prod par @cowork :

- Gap A6 : section Dépenses absente du Dashboard (livré PR-C2a #89)
- Gap A7 : aucun toggle "payée" sur les charges du mois (paiements non traçables)

**3 mai 2026 (après-midi)** — Extension de A7 par @thierry pour incorporer 3 dimensions supplémentaires :

1. Historique renégociations (provider history avec économies mensuelles)
2. Log transferts inter-comptes (audit trail des virements user-déclarés)
3. Ségrégation Compte Épargne (réserve libre vs provisions affectées 3/6/9/12 mois)

**Plan initial @cowork** : rédiger un ADR-007 unique "Payment tracking model" couvrant les 4 dimensions.

**3 mai 2026 (soir)** — Pivot suite au partage par @thierry du mockup AI Studio "IronBudget" + extraction de la spec canonique `dashboard-cockpit-vraie-vision-2026-05-03.md` :

Le mockup IronBudget formalise les concepts plus proprement par responsabilité. La consolidation A7 unique a été **éclatée en 5 ADRs ciblés** :

| Sujet original A7                                                  | ADR éclaté                                                                          | Justification                                                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Toggle paye/non-payée par charge mensuelle                         | **ADR-011** (Détection déficit + plan rattrapage) — utilise `charge_payments` table | Le toggle paye nourrit l'algo Santé Provisions (chronologie échéances payées vs non payées) |
| Calcul intelligent provisions ↔ factures du mois                   | **ADR-012** (Assistant Virements)                                                   | Cœur différenciateur, mérite son ADR dédié                                                  |
| Historique renégociations                                          | **ADR-013** (à rédiger en PR-D8) — table `provider_negotiations`                    | KPI annuel "Économies via renégociations"                                                   |
| Log transferts inter-comptes                                       | **ADR-014** (à rédiger en PR-D5) — table `account_transfers`                        | Audit trail pédagogique                                                                     |
| Ségrégation Compte Épargne (réserve libre vs provisions affectées) | **ADR-015** (à rédiger en PR-D5) — table `savings_buckets`                          | Affine ADR-002 (bucket-model) avec implémentation concrète                                  |

## Résultat

ADR-007 reste comme **marqueur de traçabilité**. Le contenu fonctionnel d'A7 vit dans ADR-011/012 (dans le scope MVP) + ADRs futurs 013-015 (rédigés au moment où chaque sous-PR D5/D8 sera ouverte).

## Conséquences

- ✅ **Traçabilité préservée** : un futur lecteur peut comprendre pourquoi la numérotation passe de 006 à 008
- ✅ **Cohérence ADR-002** : les concepts de "réserve libre" vs "provisions affectées" formalisés dans ADR-015 future restent l'ancrage canonique du bucket-model
- ✅ **Pas de doublon** : on évite de rédiger un méga-ADR-007 qui aurait été superseded par 4 plus petits ADRs

## Référence canonique

Voir `specs/dashboard-cockpit-vraie-vision-2026-05-03.md` (vault Athenaeum) pour la vision unifiée du Dashboard cockpit qui amène ce découpage ADR.

## Décision finale

`Superseded by ADR-011 + ADR-012 + futur ADR-013 + futur ADR-014 + futur ADR-015`. Statut éditorial figé — cet ADR ne sera plus modifié.
