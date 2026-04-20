---
description: Audit i18n rapide — parité clés, placeholders, résidus FR, pattern email-as-keyword, metadata locale-aware
---

Audit i18n complet du projet Ankora en 7 sections. Utilise le skill
`.claude/skills/i18n-translator/SKILL.md` comme référence méthodologique et
l'agent `.claude/agents/i18n-auditor.md` pour la checklist technique.

## 1. Parité des clés (garde-fou CI)

Lance `npx vitest run tests/i18n/messages-parity.test.ts` :

- Si rouge : liste les clés manquantes/orphelines par locale. BLOCK.
- Si vert : continue. ✅

## 2. Placeholders ICU

Pour chaque clé de `messages/fr-BE.json` contenant `{xxx}` :

- Grep les 4 autres JSONs pour la même clé
- Compare l'ensemble des tokens `{xxx}` extraits
- Si divergence : liste (clé, locale, token manquant ou ajouté). BLOCK.

## 3. Pseudo-tags HTML

Pour chaque clé de `messages/fr-BE.json` contenant `<b>`, `<code>`, `<link>`,
`<mail>`, `<apd>`, `<cgu>`, `<privacy>`, `<strong>` :

- Grep les 4 autres JSONs pour la même clé
- Compare les tags ouvrants/fermants
- Si divergence ou tag traduit (`<code>` → `<kod>`) : BLOCK.

## 4. Résidus FR dans NL/EN/DE/ES

Grep dans `messages/nl-BE.json`, `en.json`, `de-DE.json`, `es-ES.json` :

```
 le | la | les | du | des | avec | sans | pour | chaque |
tu peux|tu as|c'est|nous avons
```

- Pour chaque match, vérifier contexte (peut-être valide dans proper noun).
- Lister les findings avec file:line. BLOCK si mot français non-ambigu.

## 5. Pattern email-as-keyword (destructive confirmations)

- Grep `src/lib/schemas/settings.ts` : doit contenir `makeDeletionRequestSchema`.
  Si `z.literal('SUPPRIMER')` ou similaire : BLOCK.
- Grep tous les `messages/*.json` pour `SUPPRIMER|DELETE|LÖSCHEN|ELIMINAR|VERWIJDER|VERWIJDEREN`
  avec clé `confirmKeyword` ou équivalent : BLOCK.
- Grep `src/app/[locale]/app/settings/SettingsClient.tsx` pour input
  `type="email"` + `autoComplete="off"`. Si manquant : PASS_WITH_NOTES.

## 6. Metadata locale-aware

Grep dans `src/app/[locale]/**/page.tsx` et `src/app/[locale]/layout.tsx` :

- `SITE.tagline` ou `SITE.description` dans un `generateMetadata` : BLOCK.
- Absence de `getTranslations({ locale: locale as Locale, namespace: 'common' })`
  dans les `generateMetadata` : BLOCK.
- `alternates.languages` absent : PASS_WITH_NOTES.

## 7. Routing + redirects short-locale

- `src/i18n/routing.ts` exporte `LOCALES` avec 5 entrées.
- `next.config.ts` `redirects()` contient `/fr`, `/nl`, `/de`, `/es` mappés.
  Si manquant : BLOCK.

## Synthèse

Produis un tableau final :

| Check                 | Statut   | Findings |
| --------------------- | -------- | -------- |
| Parité clés           | ✅ ou ⚠️ | …        |
| Placeholders ICU      | ✅ ou ⚠️ | …        |
| Pseudo-tags HTML      | ✅ ou ⚠️ | …        |
| Résidus FR            | ✅ ou ⚠️ | …        |
| Email-as-keyword      | ✅ ou ⚠️ | …        |
| Metadata locale-aware | ✅ ou ⚠️ | …        |
| Routing + redirects   | ✅ ou ⚠️ | …        |

Termine par :

- **Verdict global** : PASS / PASS_WITH_NOTES / BLOCK
- **Glossaire** : version courante (lire `docs/i18n-glossary.md` table Versioning),
  drift détecté (oui/non)
- **Recommandation concrète** si au moins un ⚠️
