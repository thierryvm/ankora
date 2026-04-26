---
name: i18n-translator
description: Traducteur i18n rigoureux pour Ankora (Next.js + next-intl, fr-BE reference, locales fr-BE/nl-BE/en/de-DE/es-ES). Utilise ce skill pour traduire, auditer ou enrichir les fichiers `messages/*.json`, vérifier la parité des clés, appliquer le glossaire projet, ou refactor un keyword de confirmation destructive vers le pattern email-as-keyword.
---

# i18n Translator — Ankora (Next.js + next-intl)

Ce skill guide l'exécution d'une tâche i18n sans rien casser. Il s'applique
au repo Ankora (fr-BE reference) et respecte le glossaire `docs/i18n-glossary.md`
(version courante dans la table §Versioning).

## Quand utiliser ce skill

- Ajouter une nouvelle locale → traduire un `messages/<newLocale>.json`
- Fixer une locale où du texte source a fuité (copié-collé non traduit)
- Vérifier la parité des clés entre locales (zéro clé manquante / orpheline)
- Auditer le registre (tu/vous, du/Sie, tú/usted, je/u)
- Appliquer le glossaire projet (termes verrouillés, don't-translate)
- Refactor d'un keyword de confirmation destructive → email-as-keyword

## Principes intangibles

1. **fr-BE est la seule source. Jamais l'inverse.** Si un message doit changer,
   change-le en référence d'abord, puis propage aux 4 autres locales.
2. **Parité stricte des clés.** Les 5 JSON ont **exactement** le même arbre de clés.
   Tout ajout/suppression/renommage se répercute sur les 5 fichiers dans le même commit.
3. **Placeholders ICU préservés.** `{name}`, `{count}`, `{amount}`, `{email}`,
   `{date}`, `{percent}`, etc. — tokens identiques, pas d'espacement, jamais traduits.
4. **Pseudo-tags HTML préservés.** `<b>`, `<code>`, `<link>`, `<mail>`, `<apd>`,
   `<cgu>`, `<privacy>`, `<strong>` — même nom, même casse.
5. **Registres stables.** Jamais mélanger tu/vous dans le même fichier (ou du/Sie,
   tú/usted). Vérifier verbe, possessif, impératif après chaque modification.
6. **Don't-translate list immuable** : brand names, tech acronymes, symboles,
   régulateurs, articles de loi. Voir §Don't-translate ci-dessous.
7. **Destructive confirmations → email-as-keyword.** Pas de mot-clé traduit
   (pas de SUPPRIMER / DELETE / LÖSCHEN / ELIMINAR / VERWIJDER / VERWIJDEREN).
   L'utilisateur tape son email ; le backend compare case-insensitive + trim.

## Workflow standard (5 étapes)

### 1. Recon — lire la référence et le glossaire

Avant toute chose, lire dans l'ordre :

1. `docs/i18n-glossary.md` (source de vérité terminologique + version courante)
2. `messages/fr-BE.json` (référence)
3. Le JSON de la locale cible (si elle existe)
4. Le pattern i18n : `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/middleware.ts`

Puis demander à l'utilisateur, si besoin, le périmètre : toutes les sections ?
Seulement landing ? Seulement une feature ?

### 2. Stratégie — choisir le bon pattern

- **Ajout de locale complet** → 1 subagent par locale en parallèle. Chaque subagent
  reçoit le glossaire + le fr-BE.json + un brief de registre.
- **Patch local** (3-10 clés) → éditer directement les 5 fichiers en un tour.
- **Refactor structurel** (suppression d'une clé, ajout ICU) → modifier fr-BE
  d'abord, propager aux 4 autres, mettre à jour le test de parité.

### 3. Traduction — règles par locale

| Locale | Register | Notes critiques                                                                         |
| ------ | -------- | --------------------------------------------------------------------------------------- |
| fr-BE  | tu       | Ton confident, direct, chaleureux. Pas de jargon corporate.                             |
| nl-BE  | je       | Standard NL-BE consumer. `u` = trop formel. Préférer VERWIJDEREN à VERWIJDER si besoin. |
| en     | you      | Neutre UK/US. Éviter idiomes culturels marqués.                                         |
| de-DE  | du       | Style N26 / Trade Republic. Composés allemands naturels.                                |
| es-ES  | tú       | Castillan. **Jamais** vos (argentin). «» pour guillemets.                               |

Pour chaque traduction :

1. Partir du FR de référence
2. Appliquer le glossaire (termes verrouillés → correspondance exacte)
3. Respecter les locked terms (`Ankora`, `cockpit`, `lissage`, etc.)
4. Appliquer le registre de la locale
5. Garder la même **longueur approximative** (éviter 2× plus long → casse le design)
6. Conserver placeholders + tags **à l'identique**

### 4. Vérification — 5 checks mécaniques

Avant de livrer, vérifier systématiquement :

1. **Parité des clés** : chaque fichier a le même `Object.keys()` récursif que fr-BE.
   Lancer `tests/i18n/messages-parity.test.ts`.
2. **Placeholders** : pour chaque clé qui contient `{xxx}`, les 5 locales ont les
   mêmes tokens.
3. **Pseudo-tags** : idem pour `<b>`, `<code>`, `<link>`, etc.
4. **Registre** : grep rapide par locale pour détecter les résidus (fr "vous" dans
   un fichier `tu`, nl "u " dans un fichier `je`, es "usted" dans un fichier `tú`).
5. **Copy-paste residuals** : grep FR dans les autres locales (accents é/è/à,
   articles « le/la/les/du », prépositions « avec/sans/pour »). Zéro match attendu
   en nl-BE/en/de-DE/es-ES.

### 5. Commit — message conventionnel

```
feat(i18n): <scope> <summary>

- FR-BE: <change résumé>
- NL-BE, EN, DE-DE, ES-ES: full translations applied from glossary v<version>
- Backend: <changement si applicable>
- Tests: <ajout ou mise à jour>

Refs: <issue / ADR>
```

## Don't-translate

- **Brand** : `Ankora`, `Supabase`, `Vercel`, `Upstash`, `Anthropic`, `Google`
- **Tech acronymes** : `PSD2`, `RLS`, `TLS`, `CSP`, `MFA`, `TOTP`, `JSON`,
  `IBAN`, `2FA`, `BYOK`
- **Régulateurs** : `FSMA`, `APD`, `GBA`, `DPA`, `Datenschutzbehörde`
- **GDPR local** : FR/ES = `RGPD`, NL = `AVG`, EN = `GDPR`, DE = `DSGVO`
- **Placeholders ICU** : `{name}`, `{count}`, `{month}`, `{amount}`, `{year}`,
  `{date}`, `{days}`, `{sign}`, `{percent}`, `{total}`, `{label}`, `{provision}`,
  `{bills}`, `{frequency}`, `{version}`, `{email}`
- **Pseudo-tags** : `<b>`, `<code>`, `<link>`, `<mail>`, `<apd>`, `<cgu>`,
  `<privacy>`, `<strong>`

La liste complète des termes verrouillés (cockpit, lissage, charge, dépense,
provision, compte Principal, Vie Courante, bucket, etc.) est dans
`docs/i18n-glossary.md` — source de vérité unique.

## Anti-patterns à refuser

1. **Traduire un keyword de confirmation destructive.** Utiliser email-as-keyword.
2. **Hardcoder `SITE.tagline` / `SITE.description` dans `generateMetadata`.**
   Toujours passer par `getTranslations({ locale, namespace: 'common' })`.
3. **Renommer une clé sans propager aux 5 fichiers.** Le test de parité doit rester vert.
4. **Ajouter une nouvelle locale sans mettre à jour `LOCALES` dans
   `src/i18n/routing.ts` ET la matrice de redirects `/xx` → `/xx-YY` dans
   `next.config.ts`.**
5. **Traduire un pseudo-tag HTML** (`<code>` qui devient `<kod>` etc.).
6. **Changer un numéro d'article légal** (`art. 20` doit rester `art. 20` partout).

## Checklist de livraison

Avant de marquer une tâche i18n terminée :

- [ ] Glossaire à jour si un nouveau terme introduit (bump version dans §Versioning)
- [ ] Parité des clés vérifiée (test `tests/i18n/messages-parity.test.ts` vert)
- [ ] Placeholders ICU préservés
- [ ] Pseudo-tags HTML préservés
- [ ] Registre cohérent par locale (pas de résidu FR dans NL/EN/DE/ES)
- [ ] `generateMetadata` utilise `getTranslations`, pas `SITE.tagline`
- [ ] Destructive confirmations → email-as-keyword (pas de SUPPRIMER/DELETE/etc.)
- [ ] Redirects short-locale (`/fr /nl /de /es`) présents si `localePrefix: 'as-needed'`
- [ ] Tests `messages-parity.test.ts` + `routing.test.ts` passent
- [ ] Commit message conventionnel avec `feat(i18n):` ou `fix(i18n):`

## Références projet

- `docs/i18n-glossary.md` — source de vérité terminologique (version courante)
- `src/i18n/routing.ts` — liste des locales + defaultLocale
- `src/i18n/request.ts` — chargement des messages
- `next.config.ts` — redirects short-locale
- `tests/i18n/messages-parity.test.ts` — garde-fou CI pour la parité des clés
- `src/lib/schemas/settings.ts` — référence du pattern email-as-keyword
- Agent associé : `.claude/agents/i18n-auditor.md`
- Slash command associé : `/i18n-audit`
