# Copywriting & UX Review — 2026-04-28

> Analyse contradictoire d'une proposition externe (ChatGPT) soumise par @thierry sur l'amélioration UX et copywriting de la landing Ankora. Verdict structuré, formulations FSMA-flaggées, et plan d'intégration.

**Auteur** : @cowork (session 2026-04-28)
**Source** : @thierry (analyse ChatGPT)
**Statut** : VERROUILLÉ — référence canonique pour PR-3c-3 et futures PR landing/copy
**Cf.** : `docs/NORTH_STAR.md`, `docs/cowork-handoff-conventions.md` §5, `docs/design/token-usage.md`

---

## 1. Contexte

@thierry a soumis une analyse externe de ChatGPT contenant :

- Un **prompt technique** ciblant l'UX des graphiques landing (waterfall + projection)
- Un **copywriting complet refait** pour toutes les sections de la landing

Le retour externe est précieux pour identifier des **angles morts UX**, mais ChatGPT n'a pas accès aux contraintes Ankora (FSMA, ADR, NORTH_STAR, identité de marque). Cette doc trace ce qui est intégrable, ce qui est refusé, et pourquoi — pour empêcher tout agent futur (cowork, cc-ankora, ou tiers) de réintroduire les formulations bloquantes.

---

## 2. Verdict global

| Bucket                         | %   | Action                                      |
| ------------------------------ | --- | ------------------------------------------- |
| ✅ **Aligné — intégrer**       | 40% | PR-3c-3 (WhatIfDemo) + PR-3d (copy refresh) |
| ⚠️ **Amender**                 | 10% | Adapter avec garde-fou FSMA                 |
| ❌ **Refuser FSMA**            | 25% | Documenter ici comme blocklist permanente   |
| ❌ **Refuser identité Ankora** | 10% | Notre vocabulaire métier prévaut            |
| ❌ **Scope creep**             | 15% | Hors NORTH_STAR ou hors scope landing       |

---

## 3. Formulations FSMA-flaggées — BLOCKLIST permanente

Ces formulations ChatGPT **ne doivent JAMAIS être intégrées** dans un texte Ankora. Tout agent qui les voit dans une proposition futur doit les refuser sans appel.

| Formulation refusée                                          | Cause                                                                                                               | Alternative FSMA-safe                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| "Sais combien tu peux dépenser sans te mettre dans le rouge" | Suggère une garantie de protection contre le découvert                                                              | "Vois ce qu'il te restera chaque mois (estimation)"                        |
| "Ce n'est pas une estimation. C'est une projection concrète" | Affirme une certitude impossible — toute projection EST une estimation                                              | À refuser tel quel. **Toute projection Ankora est une estimation, point.** |
| "Prévision réelle"                                           | Le mot "réelle" suggère une garantie                                                                                | Garder "Projection" ou "Estimation"                                        |
| "Argent réellement disponible"                               | "Réellement" = garantie                                                                                             | "Argent disponible (estimation)"                                           |
| "Plus de surprises"                                          | Promesse impossible (Ankora ne peut pas éliminer les surprises)                                                     | "Moins de surprises" / "Anticiper avant qu'il ne soit trop tard"           |
| "Plus de stress inutile"                                     | Effet thérapeutique non vérifiable                                                                                  | Refus                                                                      |
| "Ce qu'il te restera réellement chaque mois"                 | "Réellement" = garantie                                                                                             | "Estimation de ton solde mensuel"                                          |
| "Impact concret" (en remplacement de "Simulation")           | "Concret" suggère certitude                                                                                         | Garder "Simulation"                                                        |
| "Sans surprise" (formulation absolue)                        | Promesse marketing impossible                                                                                       | "Avec moins de surprises"                                                  |
| "Tu n'auras plus jamais de mauvaises surprises"              | Promesse exagérée                                                                                                   | "Tu vois venir les mois compliqués"                                        |
| "Voir l'impact réel sur ta réserve libre"                    | Le "réel" est borderline. Le mockup Claude Design original l'utilise — toléré dans contexte démo, à éviter ailleurs | À nuancer : "Voir l'impact estimé" ou contextualiser via caveat            |

**Règle générale** : tout texte Ankora doit pouvoir être lu par un régulateur FSMA sans déclencher la qualification "service de conseil en investissement" ou "garantie financière". Les mots à pister : _réel, certain, garanti, impossible (de perdre), assuré, sans risque, sécurité (au sens financier)_. Vocabulaire safe : _estimation, projection, simulation, prévision, indicatif, à titre informatif_.

---

## 4. Identité Ankora — vocabulaire métier à préserver

ChatGPT propose de remplacer notre vocabulaire métier par des termes "plus clairs". On refuse :

| Vocabulaire ChatGPT        | Notre vocabulaire (verrouillé ADR) | Justification                                                        |
| -------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| "Argent de sécurité"       | **Réserve libre**                  | Concept ADR-002, différenciation Ankora vs apps bancaires classiques |
| "Provisions" générique     | **Provisions affectées**           | Terme métier précis (chaque euro a un nom)                           |
| Vibe "sécurité financière" | Métaphore **ancrage**              | Notre identité NORTH_STAR (Ankora = ton ancrage)                     |
| "Outil de protection"      | **Cockpit personnel de finances**  | Notre positionnement non-régulé                                      |

**Cas particulier — Hero "Ton ancrage financier"** :

ChatGPT propose un punch émotionnel "Sais enfin combien tu peux dépenser..." (refusé FSMA). Notre Hero actuel est FSMA-safe + identitaire mais moins punchy. **Compromis validé** : garder le H1 "Ton ancrage financier." et **enrichir le sous-titre** avec un angle bénéfice utilisateur tout en restant FSMA-safe.

Sous-titre actuel :

> "Ankora sépare tes provisions affectées de ta réserve libre, projette six mois devant, et te laisse simuler l'impact de chaque décision — en clair, sans jargon."

Sous-titre proposé pour PR-3d (à valider @thierry) :

> "Sépare tes provisions affectées de ta réserve libre. Vois ce qu'il te restera chaque mois. Simule l'impact d'une décision avant de la prendre — sans jargon, sans connexion bancaire."

Ça garde "ancrage" + "provisions affectées" + "réserve libre" (identité), ajoute "ce qu'il te restera chaque mois" (bénéfice user), et "sans connexion bancaire" (différenciation forte).

---

## 5. Améliorations à intégrer — PR-3c-3 (WhatIfDemo simulator)

Ces améliorations sont à inscrire dans le brief PR-3c-3 :

### 5.1 Threshold zones colorées sur le chart projection 6 mois

Concept : ajouter 3 zones horizontales sur le SVG timeline du WhatIfDemo :

- **Zone rouge** : `< 0 €` — label "⚠️ Découvert estimé"
- **Zone orange** : `0 → 200 €` — label "Zone fragile"
- **Zone verte** : `> 200 €` — label "Zone confortable"

Implémentation : 3 `<rect>` SVG avec opacity faible (~10-15%) en arrière-plan du chart, derrière les paths baseline et scenario. Labels via `<text>` ou via la légende (au choix UX).

**Important** : labels **factuels descriptifs**, pas prescriptifs. Pas de "tu dois rester dans la zone verte" — juste "Zone confortable" descriptif.

A11y : zones doivent avoir `aria-hidden="true"` (pas pertinent pour screen reader, info redondante avec valeurs numériques).

### 5.2 Renommage labels safe (waterfall + simulator)

| Avant (mockup Claude Design) | Après (PR-3c-3)      | Justification                                |
| ---------------------------- | -------------------- | -------------------------------------------- |
| "Vie"                        | "Dépenses courantes" | Plus clair pour user non-initié              |
| "Reste"                      | "Argent disponible"  | Plus parlant (pas "réellement" car FSMA)     |
| "Salaire"                    | "Revenus"            | Couvre auto-entrepreneurs / freelances aussi |

**Pas de renommage** :

- "Provisions" → reste "Provisions" (pas "Épargne" qui pourrait suggérer placement)
- "Réserve" → reste "Réserve" (concept ADR)

### 5.3 Helper text waterfall

Sous le graphique waterfall, ajouter un helper text :

> "Exemple basé sur un revenu mensuel de 3 200 €. Modifiable selon ton profil dans le cockpit."

Cohérent avec R1 PR-3c-2 ("Aperçu cockpit" eyebrow).

### 5.4 Delta labels animés WhatIfDemo

Déjà partiellement dans le mockup (KPI "Sur 12 mois"). À enrichir :

- Animer la transition de la valeur quand le slider bouge (pas juste le path SVG)
- Phrase descriptive sous le KPI : "Cette décision améliore ta projection de +14 €/mois sur la période simulée."

Note : "améliore ta projection" = factuel, FSMA-safe. Pas "améliore ta situation" (jugement de valeur).

---

## 6. Améliorations à intégrer — PR-3d ou ultérieure (copy refresh landing)

Ces améliorations relèvent du copywriting et nécessitent une PR dédiée post-PR-3c-3 :

### 6.1 Section Feature (waterfall) — copy

**Avant** :

> "Du salaire au net disponible. En un seul coup d'œil."
> "Plus de mystère sur où va ton argent. Chaque étape est visible : salaire, provisions affectées, vie courante, réserve. Tu vois immédiatement si un poste dérape."

**Après proposé** :

> "Comprends exactement où part ton argent."
> "Chaque euro a une destination. Tu vois immédiatement ce qui est dépensé, ce qui est mis de côté, et ce qu'il te reste. Si un poste dérape, tu le repères avant la fin du mois."

Renommage labels visuels selon §5.2.

### 6.2 Section Principles — accroche émotionnelle + identité

**Avant** : "Une façon honnête de parler d'argent."
**Après proposé** : "Une façon honnête de parler d'argent. Et de garder le contrôle."

Garder les 3 principes existants (Provisions affectées / Réserve libre / Simulateur what-if) — vocabulaire métier verrouillé. Adapter les descriptions courtes pour pointer le bénéfice user au lieu de juste expliquer le concept.

### 6.3 Hero — sous-titre enrichi

Cf. §4 ci-dessus.

### 6.4 Section "Confiance" / Sécurité — à AJOUTER

Notre landing actuelle n'a pas de section dédiée "tes données restent à toi". ChatGPT a raison, c'est un manque.

**Section proposée** (après Pricing, avant FooterCTA) :

> ### Tes données restent à toi.
>
> - **Aucune connexion bancaire requise.** Tu saisis tes charges manuellement.
> - **Aucune donnée revendue.** Hébergées en Union Européenne (Supabase).
> - **Conforme RGPD.** Export et suppression à tout moment, en un clic.
>
> Tu gardes le contrôle, du début à la fin.

Cette section renforce la différenciation forte d'Ankora (no-PSD2, no banking access) qui est sous-utilisée dans le copy actuel.

### 6.5 Micro-preuve à ajouter — "Tester sans créer de compte"

**À VÉRIFIER d'abord** : est-ce que le simulator landing (`<WhatIfDemo />`) fonctionne sans login ? **Si oui** : ajouter une mention proche du Hero CTA :

> "Tester le simulateur, sans créer de compte."

**Si non** : ne PAS le promettre. False advertising = problème légal.

---

## 7. Améliorations refusées — scope creep

Ces idées de ChatGPT sont **explicitement écartées** de la roadmap actuelle :

- **"Reality Mode" toggle** : suggère que les autres modes sont irréalistes. Confus. Hors NORTH_STAR.
- **Onboarding UX wording** : surface séparée (PR-3e prévu), pas dans la PR-3c-3 ni 3d.
- **Stratégie 10 premiers users** : marketing, hors scope produit/landing.
- **Wording in-app complet** : à traiter séparément, après le launch v1.0.

---

## 8. Principes UX gravés (à appliquer transverse)

Ces principes proviennent de l'analyse ChatGPT et sont **validés** comme directives transverses pour toute future PR landing/dashboard/onboarding/admin :

1. **Compréhension <10 secondes** : un nouveau visiteur doit comprendre l'essentiel sans effort cognitif.
2. **Anti-jargon** : si un terme financier est utilisé, il doit être expliqué via tooltip, helper text, ou contexte adjacent.
3. **"What does this mean for me ?"** : chaque chiffre/graph doit répondre à cette question depuis la perspective utilisateur.
4. **Feedback émotionnel discret mais présent** : threshold zones, color coding, delta visible — sans tomber dans l'alarmisme.
5. **Bénéfice user > feature** : un titre de section doit décrire ce que l'utilisateur GAGNE, pas ce que la feature FAIT.

À ajouter dans `docs/design/design-principles-2026.md` § "Principes UX transverse".

---

## 9. Action concrète

- ✅ Cette doc créée et versionnée comme référence
- 📋 À faire : mettre à jour `90_Meta/sources-of-truth/ankora.md` (vault Athenaeum) pour pointer vers ce doc
- 📋 À faire : enrichir `docs/design/design-principles-2026.md` avec §8 (Principes UX gravés)
- 📋 À intégrer dans brief PR-3c-3 : §5 (threshold zones, renamings, helper text, delta labels)
- 📋 À ouvrir comme issue GitHub : "feat(landing): copy refresh PR-3d (post-PR-3c-3)" avec §6 et §4 comme corps de l'issue

---

## 10. Référence rapide

| Besoin                                          | Section        |
| ----------------------------------------------- | -------------- |
| Vérifier si une formulation est FSMA-safe       | §3 (BLOCKLIST) |
| Préserver le vocabulaire métier Ankora          | §4             |
| Améliorations PR-3c-3 (WhatIfDemo)              | §5             |
| Améliorations PR-3d (copy refresh)              | §6             |
| Refuser une demande "Reality Mode" ou similaire | §7             |
| Principes UX transverse                         | §8             |

---

**Évolution de ce document** : toute nouvelle proposition copywriting (interne ou externe) doit être confrontée à §3 (FSMA blocklist) et §4 (identité Ankora) avant intégration. Modifications de cette doc = PR dédiée + validation @thierry.
