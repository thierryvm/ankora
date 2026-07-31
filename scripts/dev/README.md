# `scripts/dev/` — outils de mise au point locale

Outils **locaux uniquement**. Aucun n'est appelé par la CI ni par un script npm.
Tous exigent une stack Supabase locale debout et refusent une cible non locale.

Les variables attendues (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
se relèvent de la stack, jamais d'un littéral en dur :

```bash
supabase status -o env
```

> ⚠️ Démarrer la stack avec la CLI **2.84.2**, la version épinglée par
> `.github/workflows/ci.yml`. Mesuré le 2026-07-30 : avec la CLI 2.110.0, les
> `GRANT` de table de `service_role` sur `public.users` manquent et 25 des 31 cas
> du job authentifié échouent sur `permission denied for table users`. Aucune
> migration du dépôt ne pose ces droits — ils viennent des défauts de la
> plateforme, donc la version n'est pas un détail.

| Script                      | Rôle                                                                                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed-profil-test.mjs`      | Crée un profil de test à **valeurs contrôlées** : 19 charges (14 mensuelles, 1 trimestrielle, 4 annuelles), un plan d'apurement en doublon volontaire de la charge « Impôt », 3 dépenses. Idempotent : purge le compte précédent. |
| `audit-profil.mjs`          | Parcours iPhone 390×844 sur ce profil : captures de 8 écrans + dump du texte du cockpit pour relever les chiffres affichés.                                                                                                       |
| `probe-consent-overlap.mjs` | Mesure le recouvrement bannière de consentement ↔ bouton « Se connecter » sur les presets d'appareils, et balaie la hauteur pour trouver le seuil de bascule.                                                                     |
| `inspect-consent.mjs`       | Liste les options de la bannière de consentement (utilitaire d'appoint).                                                                                                                                                          |

## Totaux de contrôle du profil de test

Ils viennent des données réelles de @thierry et servent d'étalon : **si
l'application affiche autre chose, c'est un défaut à documenter, pas un chiffre à
ajuster.**

| Fréquence        |      Somme |  Lissé mensuel |
| ---------------- | ---------: | -------------: |
| mensuelles       | 1 804,21 € |     1 804,21 € |
| trimestrielle    |       45 € |           15 € |
| annuelles        |      528 € |           44 € |
| **effort lissé** |            | **1 863,21 €** |

Équivalent annuel : **22 358,52 €**. Vérifiable sans l'application :

```sql
select sum(amount / (case frequency
         when 'monthly' then 1 when 'quarterly' then 3
         when 'semiannual' then 6 else 12 end))
from charges where workspace_id = '<ws>';
```

## Le doublon est volontaire

`seed-profil-test.mjs` crée **à dessein** une charge mensuelle « Impôt 220 € » et
un plan d'apurement « SPF Impôt » de 220 €/mois désignant la même dette. C'est le
cas d'essai du double comptage documenté dans
[`docs/specs/2026-07-31-engagement-source-unique-mensualite.md`](../../docs/specs/2026-07-31-engagement-source-unique-mensualite.md).
Ne pas le « corriger » sans lire cette note.
