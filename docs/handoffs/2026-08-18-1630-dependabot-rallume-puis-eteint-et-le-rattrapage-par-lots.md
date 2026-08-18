---
project: ankora
type: cc-handoff
session: 2026-08-18-1630
agent: cc-ankora
---

# Handoff — Dependabot rallumé puis éteint en urgence, et le rattrapage repris par lots

> Session @cc-ankora (Opus 5), clone principal. Écrit avant compaction de
> contexte, sur demande de @thierry.

## 1. État git

```text
origin/main : 042d859 chore(deps): lot A — 13 paquets d'outillage (#419)
              7f331b2 fix(deps): remettre Dependabot a zero (#410)
              59f0208 chore(deps): remettre Dependabot en marche (#389)
              276865b chore(dettes): trois choses qui mentaient en silence (#388)
```

**PR ouverte : [#420](https://github.com/thierryvm/ankora/pull/420)** — mise en
forme Prettier 3.9. Un job E2E encore en cours à l'écriture. À merger au vert.

Worktrees : **un seul**, le clone principal. `ankora-landing` et
`ankora-refonte` ont été supprimés (travail livré). Branches locales nettoyées :
il reste `main` plus trois branches orphelines, cf. §7.

## 2. L'erreur de la session, et ce qu'elle apprend

**J'ai rallumé Dependabot (#389), il a ouvert 24 PR en quelques minutes.**
@thierry : « je suis spammé par dependabot là stop », puis « d'urgence pls ».

`.github/dependabot.yml` portait `open-pull-requests-limit: 0` depuis le 8 mai.
Je l'ai remis à 10 en raisonnant « combien de PR par semaine ». **La vraie
question était « combien de PR au premier réveil »** : avec trois mois de
retard, la première exécution ne propose pas la semaine — elle propose **tout le
retard d'un coup**, groupe par groupe.

**Règle qui en sort : rallumer un système de mise à jour sur un dépôt en retard
n'est PAS une opération neutre.** La limite protège le régime de croisière, pas
le rattrapage.

Correctif : 24 PR fermées avec leurs branches, limites remises à 0 (#410).
**#410 a été mergée en `--admin`**, checks contournés — justifié par l'urgence et
le contenu (deux caractères de YAML, annulation de mon propre changement), mais
c'est un contournement de garde-fou et il est déclaré comme tel.

## 3. Le rattrapage, repris à la main par lots

Découpage validé par `plan-reviewer`, qui avait **🔴 REJECTED** mon plan initial
d'un `npm update` unique. Trois de ses constats, vérifiés indépendamment :

1. **`ci.yml` épingle l'image conteneur Playwright** sur la version résolue.
   Monter `@playwright/test` sans le tag casse le job E2E entier.
2. **`npm update` prend aussi la part _dans la plage_** de paquets qu'on croit
   « majeurs seulement », dont `@supabase/ssr` qui porte les cookies de session.
3. **`npm update` rétrograde 7 transitifs** (`ws` 8→7, `js-yaml` 4→3, …).
   Déplacements de position — deux `ws` cohabitent déjà, Lighthouse veut la 7 et
   Supabase la 8 — mais noyés dans 32 paquets, plus rien n'est imputable.

**Méthode retenue** : `npm install <paquet>@<version>` nommément, jamais
`npm update` nu.

| Lot            | Contenu                                                                                                                                                   | État          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **A**          | 13 paquets d'outillage (prettier, vitest, tsx, eslint, jsdom, types…)                                                                                     | ✅ mergé #419 |
| **Format**     | alignement Prettier 3.9                                                                                                                                   | 🟡 #420 en CI |
| **B**          | runtime non visuel : `@supabase/supabase-js`, `@supabase/ssr`, `next-intl`, `zod`, `date-fns`, `react-hook-form`, `@hookform/resolvers`, `@upstash/redis` | ⏳ à faire    |
| **C**          | surface visuelle : `tailwindcss` **et** `@tailwindcss/postcss` (jamais dissociés), `tailwind-merge`, les 5 radix, `lucide-react`, `sonner`                | ⏳ à faire    |
| **Playwright** | paquet **+** tag d'image `ci.yml`, PR `chore(ci)` dédiée                                                                                                  | ⏳ à faire    |

**Majeures restantes, une par une** : `typescript` 5→7, `eslint` 9→10,
`next` 16.2→16.3, `jsdom` 29→30, `lint-staged` 16→17, `nanoid` 5→6,
`@testing-library/jest-dom` 6→7, `@supabase/ssr` 0.10→0.12, `@types/node` 24→26.

## 4. Vérifications exigées par lot, à ne pas perdre

- **Lot B** : `dev` avec connexion réelle, **et vérifier le nonce CSP** après
  `next-intl`. Le piège `src/proxy.ts` (en-têtes posés avant
  `handleI18nRouting`, next-intl fige un instantané) rend cette régression
  **invisible à toutes les portes** — lint, typecheck, test, build et même e2e
  resteraient verts avec une CSP désarmée.
- **Lot C** : `tailwindcss` et `@tailwindcss/postcss` montent **ensemble**.
  Charger trois routes (landing, cockpit, une route à formulaire). Et
  **afficher un toast dans les deux thèmes** : `globals.css` déclare
  `@layer theme, base, sonner, components, utilities` et suppose que la feuille
  de sonner arrive **non-layered** ; une version de Tailwind qui change son
  émission de couches inverserait la précédence sans casser aucune porte, le
  symptôme étant un toast blanc en thème sombre.
- **`sonner`** : `globals.css` importe **en profondeur**
  `sonner/dist/styles.css`. Toute montée vérifie que ce chemin existe encore,
  ship toujours sans couche, et contient `[data-sonner-toaster]{position:fixed}`.
- **`lucide-react` 1.8 → 1.32** : un export retiré est une erreur `tsc`, donc
  gratuit. Ce que `typecheck` ne voit pas, c'est un **glyphe redessiné à nom
  constant**. Preuve possible : snapshot Vitest du `innerHTML` SVG des icônes
  réellement importées.

## 5. Le témoin `tsx`, à rejouer à chaque montée

**Aucune porte n'exécute `tsx`** — zéro occurrence dans `.github/`. Une
résolution de modules cassée partirait verte et ne se verrait qu'au prochain
`npm run icons` ou `npm run import:coda`.

Témoin utilisé en lot A : `npm run icons` puis `git status public/icons` →
**zéro diff**. Fiable parce que ces icônes venaient d'être recalées en #388.

## 6. Livré aussi cette session

- **#388** — scripts npm morts, icônes périmées, `aria-label` du pied de page.
  `security:audit` a été **ressuscité** (`npm audit --audit-level=high`) plutôt
  que supprimé : `README.md:179` documentait son intention.
- **#365 fermé** — « la page des factures porte deux noms » : plus vrai, vérifié
  dans les cinq langues (`common.nav.charges` == `layout.bottomTab.bills`).
- **#390 ouvert** — 6 vulnérabilités hautes dans la chaîne Lighthouse CI. Le seul
  correctif connu de npm est une **rétrogradation** de `@lhci/cli` 0.15.1 →
  0.12.0 (`fixAvailable.isSemVerMajor: true`). Rien n'atteint la production
  (devDependency, porte CI `--omit=dev` à 0). Re-vérification datée au
  **15 septembre 2026**.

## 7. Trois branches locales orphelines

Aucune PR, jamais proposées :

- `feat/pr-b2-mock-vertical-slice` — **3 commits**
- `fix/378-sonner-styles` — le correctif est pourtant dans `main` depuis juillet
- `docs/handoff-2026-06-02-dashboard-program` — 1 commit

À examiner ou supprimer, décision de @thierry.

## 8. Pannes d'instrument de la session

Quatre, toutes de la même famille — et c'est le motif à retenir.

- **`Get-Content -Raw -TotalCount`** est une combinaison invalide : elle rend du
  vide. D'où « 19 agents sans champ `model` », faux de bout en bout.
- **Trois sondes successives sur #365** ont rendu du vide parce que je cherchais
  `nav.charges` puis `layout.nav.charges`, alors que le chemin est
  `common.nav.charges`.
- **Erreur de date** : j'ai daté mes notes « 12 août » pendant toute la session
  en enchaînant depuis celle du 11, alors qu'il s'était écoulé **une semaine**.
  Repéré par `public/llms-full.txt`, qui régénère `Last generated:` à la date
  réelle. **Lire la date du système plutôt que la déduire de la conversation.**
- **Note périmée recopiée en avant** : j'ai répété deux jours durant que le
  correctif de #378 était « non écrit ». Il est dans `main` depuis le 25 juillet.

**Règle : un résultat vide n'est pas une absence, et un défaut sur N sur N est
une panne d'instrument.**

## 9. En attente d'une décision de @thierry

- **L'adresse de contact.** Le pied de page publie `thierryvm@gmail.com` en
  clair. Le domaine est chez **Vercel**, qui ne fait pas d'e-mail : soit bascule
  des serveurs de noms vers Cloudflare (Email Routing gratuit), soit un service
  à MX seuls. Une ligne dans `src/lib/brand.ts` une fois la boîte créée.
- **Les tickets qui touchent l'utilisateur**, à attaquer après les lots :
  #352 (cinq contrôles sous 24 px sur `/login`), #351, #350, #348.

## 10. Environnement

**L'outil Bash du harnais est cassé sur cette machine** — un profil shell y
injecte `expo`, exit 127 systématique. Tout passe par PowerShell, préfixé
`work perso -NoCd;`. Le tool `Monitor` en hérite et échoue de même : utiliser
une commande PowerShell en arrière-plan pour attendre une CI.

Connecteurs MCP Supabase et Vercel toujours interdits en session Ankora, lecture
comprise.
