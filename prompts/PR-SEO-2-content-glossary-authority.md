# PR-SEO-2 — Content perfect score (Glossaire + Autorité + Copy GEO)

> **À lancer après PR-SEO-1 technical perfect score.**
> Issue de l'audit SEO-GEO-LLM du 2026-04-20
> (`docs/seo/AUDIT-SEO-GEO-LLM-2026-04-20.md`, Top 3 gaps stratégiques).
> Objectif : combler les gaps de **contenu** pour passer GEO de C+ à A.

## Contexte

Après PR-SEO-1 (technique), il reste les 3 gaps **contenu** qui font
plafonner la note GEO :

1. **Glossaire métier public absent** — Ankora est invisible sur les
   requêtes IA "qu'est-ce que le lissage budgétaire".
2. **Aucun chiffre / statistique sourcée** — la landing parle en
   abstrait, les LLM citent du factuel.
3. **Positionnement cryptique** — "Ton ancrage financier" est poétique
   mais ne décrit pas le produit pour un LLM qui le résume.

Cette PR livre le contenu, le re-injecte dans llms-full.txt (via le
script build créé en PR-SEO-1), et renforce l'autorité via des liens
sortants qualifiés.

## Périmètre

Chantier 1 — **Route `/glossaire` publique** (5 locales, 7 entrées)
Chantier 2 — **`DefinedTerm` schema par entrée**
Chantier 3 — **One-liner factuel sur landing**
Chantier 4 — **Mini-FAQ sur landing** (3 Q/A les plus fréquentes)
Chantier 5 — **Chiffres sourcés sur landing + FAQ**
Chantier 6 — **Liens sortants autorité** (FSMA, BNB, SPF Finances)
Chantier 7 — **Lien footer vers glossaire** (tous layouts)

## Chantier 1 — Route `/glossaire` publique

### Fichiers à créer

- `src/app/[locale]/(public)/glossaire/page.tsx` — route Server Component
- `src/app/[locale]/(public)/glossaire/layout.tsx` (si besoin d'un header
  dédié)
- `messages/fr-BE.json` + `messages/en.json` + `messages/nl-BE.json` +
  `messages/es-ES.json` + `messages/de-DE.json` — namespace `glossary`

### Entrées à produire (7 termes initiaux)

Chaque entrée doit avoir : `slug`, `term`, `definition` (2-4 phrases),
`example` (1 phrase concrète), `seeAlso` (tableau de slugs liés).

| Slug         | Terme (fr)             | Termes i18n connus                                                  |
| ------------ | ---------------------- | ------------------------------------------------------------------- |
| `bucket`     | Enveloppe (bucket)     | en "bucket", nl "envelop", es "sobre", de "Umschlag"                |
| `lissage`    | Lissage de charges     | en "smoothing", nl "spreiden", es "suavizado", de "Glätten"         |
| `provision`  | Provision              | en "provision", nl "voorziening", es "provisión", de "Rückstellung" |
| `smoothing`  | Smoothing              | technique sibling de `lissage`                                      |
| `goal`       | Objectif d'épargne     | en "goal", nl "spaardoel", es "objetivo", de "Sparziel"             |
| `buffer`     | Buffer (coussin)       | en "buffer", nl "buffer", es "colchón", de "Puffer"                 |
| `invariance` | Invariance des buckets | règle d'or Ankora                                                   |

### Copy attendu (exemple pour `bucket`)

```json
{
  "glossary.bucket.term": "Enveloppe (bucket)",
  "glossary.bucket.definition": "Une enveloppe — ou *bucket* — est une sous-division d'un de tes comptes bancaires dans Ankora. Chaque enveloppe a un solde propre, une catégorie (lissage, objectif, buffer) et participe à l'invariance globale : la somme de tes enveloppes doit toujours égaler le solde réel du compte.",
  "glossary.bucket.example": "Exemple : sur ton compte vie courante, tu crées une enveloppe 'assurance auto' qui reçoit 65 € chaque mois pour couvrir la facture annuelle de 780 €.",
  "glossary.bucket.seeAlso": ["lissage", "invariance", "provision"]
}
```

### Page layout

- H1 : "Glossaire Ankora" (localisé)
- Intro courte (1-2 phrases) : "Les termes métier qu'Ankora utilise."
- Liste d'entrées : chaque entrée est un `<article>` avec `<h2>` (term),
  `<p>` (definition), `<p><em>` (example), puis `<nav>` des seeAlso.
- Ancres stables (`#bucket`, `#lissage`, …) pour liens directs.

### Schema DefinedTerm

Chaque entrée émet un `DefinedTerm` dans un `DefinedTermSet` parent :

```ts
{
  '@context': 'https://schema.org',
  '@type': 'DefinedTermSet',
  name: 'Glossaire Ankora',
  inDefinedTermSet: 'https://ankora.be/glossaire',
  hasDefinedTerm: entries.map((e) => ({
    '@type': 'DefinedTerm',
    '@id': `https://ankora.be/glossaire#${e.slug}`,
    name: e.term,
    description: e.definition,
    termCode: e.slug,
  })),
}
```

### Tests

- Route `/fr-BE/glossaire`, `/en/glossaire`, `/nl-BE/glossaire`,
  `/es-ES/glossaire`, `/de-DE/glossaire` → 200 OK avec contenu localisé.
- Playwright e2e : visite page + assertion que les 7 H2 sont présents.
- Snapshot JsonLd : `DefinedTermSet` avec 7 `DefinedTerm`.
- Ajout de `/glossaire` au sitemap (dans `src/app/sitemap.ts`, ajouter
  la route).

## Chantier 3 — One-liner factuel sur landing

### Le problème

Tagline actuelle : **"Ton ancrage financier"** — poétique, brand-fit.
Mais un LLM qui résume Ankora écrit : "Ankora is a financial anchoring
tool" (ou pire, "a meditation app for finances").

### Le fix

Juste sous la tagline (ou en `<meta name="description">` étendu), ajouter
un one-liner factuel type :

**FR** : "Ankora est un cockpit de budgétisation par enveloppes (buckets)
pour les ménages belges et européens. Il aide à lisser les factures
annuelles, provisionner les dépenses, et suivre plusieurs comptes sans
connexion bancaire PSD2."

**EN** : "Ankora is an envelope-based personal budgeting app for Belgian
and European households. It smooths annual bills, pre-funds variable
expenses, and tracks multiple accounts without PSD2 bank connectivity."

Idem pour nl-BE, es-ES, de-DE (traductions à demander à Thierry si pas
de ressource interne).

### Intégration

- Rajouter une `<p class="text-lg text-muted-foreground">` sous le H1
  dans `src/app/[locale]/(public)/page.tsx`.
- Mettre à jour `SITE.description` dans `src/lib/site.ts` avec la version
  EN (langue pivot pour OG internationale).
- Propager dans metadata description des layouts i18n.

### Tests

- Lighthouse SEO : description longueur entre 120 et 160 caractères
  recommandés.
- Snapshot HTML landing : présence du one-liner.

## Chantier 4 — Mini-FAQ sur landing

### Concept

La FAQ `/faq` existe mais reste une page à part. Les LLM et GEO ranker
favorisent le contenu FAQ **sur la landing** (c'est là que s'applique
souvent le "People Also Ask" Google).

### Implémentation

Ajouter une section `<section id="landing-faq">` en bas de landing avec 3
questions les plus fréquentes. Les choisir parmi les 8 de `/faq` :

1. "Comment Ankora accède-t-il à mes comptes ?" (pas de PSD2)
2. "Où sont stockées mes données ?" (EU Supabase)
3. "Ankora fait-il du conseil financier ?" (non, et pourquoi)

Réutiliser les clés i18n existantes (`faq.bankConnection.*`,
`faq.dataLocation.*`, `faq.advice.*`).

### Schema

Injecter un second `FAQPage` sur la landing (**3 Q** uniquement). Google
ne pénalise pas la duplication si le contenu est différent entre landing
et /faq — mais pour être safe, mets les 3 mêmes Q/R mot pour mot ou
renvoie à `/faq` depuis la landing avec un lien "Voir la FAQ complète".

### Tests

- Snapshot HTML landing contient 3 `<dt>` + 3 `<dd>`.
- Snapshot JsonLd contient un `FAQPage` avec 3 questions.

## Chantier 5 — Chiffres sourcés sur landing + FAQ

### Objectif

Les LLM ingurgitent les chiffres. Une landing sans stats = une landing
peu citable. Viser **3 stats sourcées** insérées naturellement dans le
copy :

### Pistes (à valider / sourcer)

| Stat                                                                             | Source potentielle (à vérifier)  |
| -------------------------------------------------------------------------------- | -------------------------------- |
| "40-50 % des ménages belges ont du mal à absorber une facture annuelle imprévue" | BNB rapport stabilité financière |
| "L'inflation belge 2024-2025 a fait grimper les charges fixes de X %"            | StatBel ou BNB                   |
| "Le budget moyen des ménages belges est alloué à Y % aux charges fixes"          | StatBel                          |

**⚠️ Avertissement important** : ne **PAS** inventer des chiffres. Si
CC Ankora n'a pas accès à une source fiable, mettre un placeholder
`[STAT À SOURCER]` et demander à Thierry de combler.

### Intégration

Dans le hero ou la section "How it works", insérer une citation type :

> Selon la Banque Nationale de Belgique, X % des ménages n'ont pas de
> provision pour absorber une facture annuelle imprévue de 800 €.
> _[Source : BNB, Rapport sur la stabilité financière 2024](https://www.nbb.be/...)_.

### Tests

- Lien BNB/StatBel résolu 200 OK.
- Citation affichée avec attribut `cite` HTML.

## Chantier 6 — Liens sortants autorité

### Objectif

Le site a 1 seul lien sortant autorité (APD dans privacy). L'audit GEO
recommande 3+ liens vers des institutions belges/européennes de
référence.

### Pages à enrichir

- **`/faq`** (section "données") → lien APD (existe déjà via
  `legal/privacy`), ajouter lien FSMA (pour clarifier qu'Ankora N'EST
  PAS un conseiller FSMA-régulé).
- **`/legal/privacy`** → conserver APD, ajouter lien CNIL (pour audience
  FR) et EDPB (European Data Protection Board).
- **Landing** (section trust / footer) → lien BNB (Banque Nationale de
  Belgique) en référence à "pas de connexion bancaire PSD2 via un
  agrégateur autorisé" + lien SPF Finances pour "budgétisation et fiscalité".

### Liens recommandés (à vérifier 200 OK)

- FSMA : https://www.fsma.be/fr
- APD : https://www.autoriteprotectiondonnees.be/
- CNIL : https://www.cnil.fr
- EDPB : https://edpb.europa.eu/
- BNB : https://www.nbb.be/
- SPF Finances : https://finances.belgium.be/

### Attributs

Tous les liens sortants doivent avoir :

- `rel="noopener noreferrer"` (sécurité standard)
- `rel="external"` (signal sémantique)
- **PAS** `nofollow` (on veut que le jus SEO passe — on cite ces
  autorités volontairement, pas pour gruger).

### Tests

- Test unit : tous les liens de la page renvoient 200 au moment du
  snapshot (optionnel, peut être en job hebdo).
- Snapshot : `rel="noopener noreferrer external"` présent.

## Chantier 7 — Lien footer vers glossaire

Ajouter dans le footer (composant `src/components/layout/Footer.tsx` ou
équivalent) un lien "Glossaire" à côté de "FAQ" / "Privacy" / "CGU".
5 traductions à injecter dans `messages/*.json` → `footer.glossary`.

## Chantier 8 — Régénération llms-full.txt

Le script `scripts/build-llms-full.mjs` (créé en PR-SEO-1) doit
maintenant intégrer les 7 entrées glossaire + la mini-FAQ landing + les
chiffres sourcés. Vérifier que le rebuild `npm run build` régénère bien
le fichier avec le nouveau contenu.

## Acceptance criteria

- [ ] Route `/glossaire` rend 7 entrées × 5 locales, toutes ancres
      fonctionnelles.
- [ ] `DefinedTermSet` JsonLd avec 7 `DefinedTerm`.
- [ ] One-liner factuel visible sous la tagline landing (5 locales).
- [ ] Mini-FAQ sur landing (3 Q) avec `FAQPage` schema.
- [ ] Au moins 3 chiffres sourcés (BNB / StatBel / SPF) insérés dans le
      copy avec citations correctes ou placeholders marqués `[STAT À SOURCER]`.
- [ ] Au moins 5 liens sortants autorité (FSMA, APD, BNB, SPF Finances,
      CNIL) répartis entre landing / FAQ / legal.
- [ ] Footer étendu avec lien Glossaire (5 locales).
- [ ] `scripts/build-llms-full.mjs` intègre les nouvelles sections.
- [ ] `sitemap.xml` contient les 5 URLs `/glossaire`.
- [ ] `npm run typecheck` + `lint` + `test` passent.
- [ ] Lighthouse SEO = 100 en prod sur la landing et /glossaire.

## Contraintes non négociables

- **Pas de chiffre inventé.** Si une stat n'est pas sourçable, placer
  `[STAT À SOURCER]` explicite pour que Thierry intervienne.
- **Traductions cohérentes.** Si Thierry n'est pas natif nl/es/de,
  mettre les traductions glossaire en `[TRANSLATION NEEDED]` pour les
  locales non maîtrisées plutôt qu'inventer. Le FR + EN sont
  prioritaires.
- **Aucun changement du design-system**. Le glossaire utilise les
  composants existants (Typography, Card, etc.).
- **Branche** : `feat/seo/content-perfect-score`
- **Commit** : `feat(seo): content perfect — glossary + authority links + GEO copy`
- **Target** : `main`

## Risques à surveiller

- **Qualité des traductions** — 5 locales × 7 entrées × 4 champs = 140
  strings à traduire. Si tu utilises DeepL/ChatGPT, marque clairement
  pour review ultérieure.
- **SEO cannibalisation** — le mot-clé "lissage" va potentiellement
  compétitionner entre landing et glossaire. Utiliser `rel="canonical"`
  si la landing positionne fortement dessus.
- **Conformité FSMA** — le one-liner factuel dit "pas de conseil
  financier". Assure-toi que le reste du contenu reste aligné (pas de
  phrase qui pourrait être interprétée comme recommandation).

## Sortie attendue

- 1 PR, ~ 20-30 fichiers (route glossaire + 5 messages JSON + composants
  schema + layouts + script llms-full + sitemap + footer).
- Diff reviewable en ~ 1 h.
- Description PR qui cite `docs/seo/AUDIT-SEO-GEO-LLM-2026-04-20.md`
  section "Top 3 gaps stratégiques".

---

**Séquence recommandée** : PR-SEO-1 (technique) → **PR-SEO-2 (cette PR)**
→ audit final Lighthouse + Rich Results Test + llms-full.txt review.
