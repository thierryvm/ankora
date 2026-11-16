# ADR-050 — Le cockpit s'ouvre sur le dernier état connu

- **Statut** : Proposé (16 novembre 2026), avec **deux acceptations séparées**.
  - D1 est accepté sur sa preuve propre (§7.A).
  - D2 n'est accepté qu'une fois la preuve du §7.B rendue sur une branche d'essai, avant
    toute PR de code D2 mergée. Le verdict ePrivacy est rendu (§4).
- **Décidé par** : le pilote, sur délégation explicite de @thierry (15 novembre 2026 : « ne me
  demande rien, tu as l'autorisation de faire tout ce qui est nécessaire »).
- **Relu par**, le 16 novembre 2026. Cette version 3 intègre tous leurs points :

  | Relecteur                 | Version 1           | Version 2                   |
  | ------------------------- | ------------------- | --------------------------- |
  | `plan-reviewer`           | 🟡, dix changements | 🟡, neuf changements        |
  | `security-auditor`        | FAIL, onze constats | PASS_WITH_NOTES, huit notes |
  | `gdpr-compliance-auditor` | —                   | exempté sous conditions     |

- **Base** : `origin/main` à `0c78d6c` (#547).
- **Cite** :
  - ADR-037 (primitive `Sheet`), ADR-044 (consentement), ADR-047 (mois de budget) ;
  - ADR-048 §4 (Partial Prerendering) ;
  - ADR-049 (grammaire de mouvement : `--dur-default`, aucune pulsation) ;
  - THI-324 et l'incident du 2026-07-25 (`/app` jamais servi depuis le cache du service
    worker) ;
  - règles 10 et 11 du `CLAUDE.md` ;
  - lot P (lancement rapide) du ROADMAP.

## 1. Contexte

@thierry, le 16 novembre 2026, sur iPhone, en PWA comme sur le web : « ce micro temps de
chargement d'environ 1 seconde où il ne charge pas les données, comme si une image devait
charger ».

Ce qu'il voit, c'est `src/app/[locale]/app/loading.tsx` : des blocs gris qui pulsent
(`animate-pulse`), affichés pendant que `DashboardPage`, un Server Component qui bloque, lit
la session, l'espace de travail, le journal des comptes et la situation du mois, puis calcule
le cockpit.

Mesures du 15 novembre 2026 :

| Mesure             | Valeur                                |
| ------------------ | ------------------------------------- |
| Desktop, à chaud   | squelette à 360 ms, chiffres à 780 ms |
| Logs de production | `page_ms` de 230 à 755 ms             |
| Démarrage à froid  | environ +1,9 s                        |

Le lot P réduit le chemin serveur, sans supprimer l'attente.

Ce `loading.tsx` est aussi **le seul repli de tout `/app/*`** : il s'affiche en chargeant
Factures, Comptes, Dépenses, Engagements, les Réglages et le flux de suppression de compte.

**Deux chemins :**

- **La navigation dans l'app (client).** Le repli est déjà dans le routeur et s'affiche avant
  toute réponse du serveur. Next 16 précharge jusqu'à la **première** limite de chargement
  (`node_modules/next/dist/docs/01-app/02-guides/prefetching.md`, « Layout to first loading
  boundary »).
- **L'ouverture à froid (PWA lancée, page rechargée).** Le HTML du repli vient du serveur et
  ne peut pas contenir de chiffres de l'appareil. Avant l'hydratation, seul D1 s'affiche.

## 2. Décision

### D1 — Un repli par page, et qui n'imite plus une image qui charge

**Arborescence, sans déplacer aucune URL**

| Chemin                                                 | Rôle                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `app/(cockpit)/page.tsx` + `app/(cockpit)/loading.tsx` | le cockpit, `/app`, avec son repli                                                                     |
| `app/(pages)/loading.tsx`                              | le repli neutre de toutes les autres pages, qui restent à leurs URL (`/app/charges`, `/app/accounts`…) |
| `app/loading.tsx`                                      | **aucun**                                                                                              |

- Sur `/app`, la première limite de chargement est donc celle du cockpit. Un repli au-dessus
  d'elle l'empêcherait de s'afficher en navigation client.
- **Le garde-fou qui doit changer** : `src/components/layout/__tests__/app-destinations.test.ts`
  (l. 42, 75, 91) suppose `app/page.tsx` à la racine et écarte les dossiers `(x)`. Il est
  **adapté pour descendre dans les groupes, jamais affaibli**. `app-destinations.ts` reste
  inchangé.
- **Un second garde-fou suit le déplacement** :
  `src/components/primitives/__tests__/sheet-is-the-only-modal.test.ts:39` liste
  `app/[locale]/app/expenses/ExpenseEditDrawer.tsx` dans `PENDING_MIGRATION`, une liste qui
  ne peut que rétrécir.
  - Q1 met le chemin à jour vers `app/(pages)/expenses/`.
  - Le compte reste à quatre, aucune entrée n'est ajoutée.
- **Chemins cités ailleurs, mis à jour dans Q1** :
  - `.claude/agents/dashboard-ux-auditor.md:15` ;
  - `.claude/skills/ankora-design-system/SKILL.md:163` ;
  - `e2e/cockpit-v3.spec.ts:4`.

**Le repli du cockpit**

- La structure réelle du cockpit : en-tête, carte « Il te reste », carte « Encore à payer ».
- Les libellés en texte réel, à leur place définitive, et les montants en tiret cadratin
  (« — »).

**Le repli neutre** : aucun libellé du cockpit. Pas de « Il te reste » en chargeant Factures.

**Le mouvement** (ADR-049)

- **Plus d'`animate-pulse`.**
- Les chiffres arrivent par un fondu de `--dur-default` sur les seules valeurs.
- Sous `prefers-reduced-motion`, le remplacement est instantané, sans fondu.
- **Aucun déplacement de mise en page** : les hauteurs sont réservées pour chaque variante du
  §7.A.

### D2 — Un instantané d'ouverture, lié à la session qui l'a produit

**1. Activation**

- Un réglage « Ouvrir sur mes derniers chiffres », affiché dans `/app/settings` avec son
  information à côté, **désactivé par défaut**.
- C'est un **drapeau local, propre à chaque appareil** (`localStorage`), et non une
  préférence de compte :
  - la condition 1 doit se lire dans un repli, sans réseau ;
  - l'article 5(3) raisonne par terminal.
- L'activer sur un appareil ne l'active pas ailleurs. Le désactiver sur l'appareil B ne purge
  pas l'appareil A : la politique de confidentialité le dit.
- Le désactiver purge tout de suite l'instantané de cet appareil.

**2. Ce qui est gardé** (le minimum, validé par le §4)

- Le chiffre « Il te reste », les quatre termes de la formule (« Revenus », « Déjà compté
  pour tes factures », « Mis de côté », « Dépensé ») et les trois postes génériques de
  « Déjà compté » (`chargesFixes`, `provisionsLissees`, `engagementsMensuels`). Tous en
  `number` : un `Decimal` ne franchit jamais la frontière RSC.
- La **date de fin** de la fenêtre du mois de budget, telle que le serveur l'a déduite
  (ADR-047). Jamais la date de début, qui révèle le jour de paie.
- L'**empreinte de session** (point 3), le niveau `aal` au moment du rendu, l'instant
  d'écriture et un numéro de version de schéma.
- **Jamais** :
  - un libellé saisi par l'utilisateur : nom de facture, de compte, d'engagement, de dépense
    **ou de catégorie** ;
  - une adresse e-mail, un identifiant d'espace de travail, un montant ligne par ligne ;
  - le jeton de rafraîchissement.

**3. L'empreinte de session est fournie par le serveur**

- **Le serveur fournit l'empreinte.** `DashboardPage` calcule
  `SHA-256(session_id)` à partir des claims **qu'il vient de vérifier**, et la passe avec les
  chiffres au composant d'écriture. `getUser()` ne rend pas le `session_id` : celui-ci vient
  de `getClaims()`, ou du jeton d'accès de la session que `getUser()` vient de valider dans la
  même requête (le schéma de `elevationDue`, `src/lib/auth/require-elevated.ts`). Le cookie de
  la requête n'est jamais relu séparément.
- **Un repère de rendu** (identifiant à usage unique créé par le serveur) accompagne les
  chiffres. Le client garde en mémoire les repères déjà écrits : c'est ce qui rend « une seule
  écriture par réponse serveur » vérifiable.
- **Le client n'écrit que si les deux empreintes sont égales**, celle reçue du serveur et
  celle qu'il tire de son cookie, et **une seule fois par réponse serveur**. Un onglet qui
  montre encore les chiffres de A ne peut donc pas les lier à la session de B ouverte entre
  temps dans un autre onglet.
- **Le calcul client** passe par `crypto.subtle.digest`, qui est asynchrone et n'existe qu'en
  contexte sécurisé (HTTPS, localhost). Sans `crypto.subtle`, rien n'est écrit et rien n'est
  affiché. Aucun repli vers l'identifiant en clair ni vers un hachage maison.
- **Comment l'empreinte arrive au rendu** : elle est calculée dans un effet **avant** toute
  lecture d'instantané, puis publiée à un petit magasin externe. Le `getSnapshot` de
  `useSyncExternalStore` reste synchrone. Tant que l'empreinte n'est pas prête, il rend
  `null`, donc les tirets.
- **Une empreinte est une donnée pseudonyme, pas anonyme** (§4).

**4. Le décodage du cookie de session, local**

- **Reproduire le format de `@supabase/ssr`** (`combineChunks`, `chunker.js:66-86`) :
  - le cookie `sb-<ref>-auth-token` non découpé d'abord, puis `.0`, `.1`… jusqu'au premier
    absent ;
  - `decodeURIComponent`, puis le préfixe `base64-` ;
  - un décodage base64url par `TextDecoder`, et non `atob` seul.
- **N'extraire du jeton d'accès que `exp`, `session_id` et `aal`.**
- **Tout le reste vaut « condition fausse »** : format sans préfixe, format inconnu, erreur
  de décodage.
- **Aucun appel réseau, aucun `getSession()`** : il rafraîchirait le jeton depuis un écran de
  chargement et ajouterait supabase-js au bundle.

**5. Où et quand il est écrit**

- **Où** : `localStorage`, sous une clé versionnée.
  - `sessionStorage` est vidé quand iOS tue la PWA.
  - IndexedDB offre la même exposition pour plus de complexité.
  - Un chiffrement à clé lisible par le JavaScript n'est que de l'obfuscation.
- **Ce qui est exclu** : jamais dans le cache du service worker, jamais envoyé au serveur,
  aucune nouvelle route.
- **Quand** : seulement après un rendu frais de la page cockpit, si le réglage est activé, si
  `isCurrentMonth` est vrai et si aucun `?period` n'est présent.

**6. Quand il est affiché**

Seulement dans le repli du cockpit, sur `/app` sans `?period`, et seulement si les **cinq**
conditions sont vraies :

1. le réglage est activé sur cet appareil ;
2. le cookie de session est décodé (point 4) et son `exp` n'est pas dépassé ;
3. l'empreinte du `session_id` courant égale celle de l'instantané, et l'`aal` courant est au
   moins celui de l'instantané ;
4. la date du jour à Bruxelles ne dépasse pas la date de fin de fenêtre enregistrée ;
5. l'instantané a moins de 7 jours et passe un schéma Zod strict :
   - nombres finis et bornés, version attendue ;
   - **les chiffres s'additionnent** : la formule retombe sur le chiffre, et les trois postes
     sur « Déjà compté » ;
   - un échec vaut purge.

Sinon : le repli de D1, sans aucun chiffre.

**7. Purge à la lecture**

- **Un composant client monté dans `src/app/[locale]/layout.tsx`**, chargé dans un morceau à
  part.
- **Il ne fait rien s'il n'existe aucune clé d'instantané** : il ne décode pas le cookie pour
  rien.
- **Il attend l'empreinte.** « Empreinte pas encore calculée » n'est pas « condition 3
  fausse » : sinon la purge effacerait l'instantané à chaque chargement. Il n'efface tout de
  suite que si `crypto.subtle` est absent.
- **Sinon, il efface l'instantané dès que l'une des conditions 1 à 5 échoue**, sur toute page
  localisée : landing, pages légales, glossaire, `/login`, `/login/2fa`, `/signup`,
  `/reset-password`, `/admin`, `/app/*`.
- C'est le mécanisme principal :
  - `logoutAction` est une Server Action qui ne peut pas toucher au `localStorage`, et elle
    redirige vers `/` (`src/lib/actions/auth.ts:212`), où la purge tourne ;
  - une redirection serveur n'exécute aucun code client.
- **Purges directes en plus** : dans le gestionnaire client du formulaire de déconnexion, et
  à la désactivation du réglage.
- **`Clear-Site-Data: "storage"` est écarté** : il effacerait aussi le choix de consentement
  et l'enregistrement du service worker.

**8. Affichage** (règles 10 et 11)

- **La date** : « Chiffres du 16 nov. à 08:12 — mise à jour… ». Si la page fraîche n'est pas
  arrivée au bout de 8 secondes, le libellé devient « Mise à jour impossible pour l'instant —
  chiffres du 16 nov. à 08:12 ».
- **La règle 10, sous une exception assumée et datée** :
  - « D'où vient ce chiffre » s'ouvre sur les quatre termes et les trois postes ;
  - le détail facture par facture n'est pas stocké : à sa place, le panneau dit « Le détail
    par facture arrive avec la mise à jour » ;
  - l'exception dure tant que l'instantané est affiché, et ce libellé le dit.
- **La règle 11 sur la carte** :
  - aucune action d'écriture n'est rendue sur l'instantané ;
  - le ⊕ de la barre d'onglets reste utilisable ;
  - l'instantané **n'alimente jamais** `useOptimisticSpend` (`src/lib/expenses/optimistic-spend.ts`)
    ni la projection de la feuille d'ajout.
- **Testids** : l'instantané ne porte **aucun** testid du cockpit vivant (`cockpit-chiffre`,
  `cockpit-formule` de `IlTeResteChiffres.tsx`). Il porte `data-instantane`.
- **Aucun script en ligne d'amorçage.** Le HTML serveur montre les tirets.
- Les données fraîches remplacent l'instantané selon le mouvement de D1.

### D3 — Le chemin serveur continue de maigrir

Le lot P reste nécessaire. D2 ne fait rien au premier lancement, après une déconnexion, en
début de mois, ni à l'ouverture à froid avant l'hydratation.

## 3. Sécurité

**La session est déjà lisible par le JavaScript de la page.** Le cookie de `@supabase/ssr`
n'est pas `httpOnly` (`node_modules/@supabase/ssr/dist/main/utils/constants.js:7`, et aucun
`cookieOptions` dans `src/lib/supabase/`). Un script injecté lit donc déjà le jeton de
rafraîchissement. L'instantané n'ajoute presque rien au risque XSS. Les protections restent :

- la CSP à nonce stricte ;
- `connect-src` limité à l'origine Supabase du projet, en `https` et `wss` (#538, vérifié en
  production le 15 novembre 2026). `img-src` vaut `'self' data: blob:` ;
- le rendu en texte, jamais en HTML.

**Session révoquée mais jeton non expiré**

- **Au chargement complet**, le proxy appelle `getUser()` (`src/lib/supabase/middleware.ts:46`).
  Une fin de session efface les cookies dans la même réponse (`:83`), avant l'hydratation :
  la condition 2 échoue.
- **En cas de panne d'Auth**, les cookies sont conservés (`:60`). L'instantané peut alors
  s'afficher jusqu'à l'expiration du jeton (une heure au plus), avec le libellé « mise à jour
  impossible » au-delà de 8 secondes.
- **En navigation interne**, l'utilisateur voyait déjà ses chiffres : l'exposition est nulle.

**Second facteur ajouté depuis un autre appareil.** La session courante reste en `aal1`, donc
la condition 3 passe, alors que le serveur exigera la 2FA (`src/lib/auth/require-elevated.ts`).

**Risques résiduels acceptés**, tous limités à un appareil déverrouillé, à la même session et
à des chiffres déjà vus sur cet appareil :

- la panne d'Auth au moment d'une révocation ;
- le second facteur ajouté ailleurs.

**Intégrité.** Un script ou une extension peut écrire de faux chiffres. Le schéma Zod, les
bornes et le contrôle d'addition limitent l'effet, et la page fraîche remplace toujours
l'instantané.

## 4. RGPD et ePrivacy

**Verdict ePrivacy (`gdpr-compliance-auditor`, 16 novembre 2026) : exempté.**

- **Fondement** : article 5(3)(b) de la directive 2002/58/CE. Le stockage est strictement
  nécessaire à une fonctionnalité explicitement demandée (G29, avis 04/2012, §§ 3.3, 3.6 et
  4 ; EDPB, lignes directrices 2/2023).
- **Conditions** :
  - le réglage est désactivé par défaut ;
  - l'information est affichée à côté du réglage ;
  - aucune autre utilisation : ni envoi au serveur, ni lecture par la mesure d'audience. Une
    réutilisation ferait tomber l'exemption.
- **Aucun scope `ConsentBanner`.** Le réglage n'est **pas** présenté comme un consentement au
  sens de l'article 7.
- **Base RGPD** : article 6(1)(b).
- **Retrait** : désactiver le réglage purge tout de suite cet appareil. Les autres appareils
  et un compte supprimé ne sont purgés qu'à la prochaine ouverture.
- **Article 9** : non concerné tant qu'aucun libellé ni nom de catégorie n'est stocké.

Les références de droit sont citées de mémoire par l'auditeur : elles sont relues avant leur
reprise dans la politique publique.

- **Minimisation (art. 5.1.c, 25)** : le contenu se limite à D2 point 2. Les données
  financières sont « hautement personnelles » au sens du WP248 : la minimisation est
  obligatoire.
- **Conservation (art. 5.1.e, 17)** : l'instantané est effacé à la désactivation, à la
  déconnexion, ou à la prochaine ouverture d'Ankora si la session a changé ou s'il date de
  plus de 7 jours. Sans réouverture, il reste sur l'appareil, y compris après la suppression
  du compte.
- **Pseudonymat** : l'empreinte de session est une donnée **pseudonyme**.

**Texte pour la politique de confidentialité** (lot Q2) :

- **Où** : dans `extras`, car la politique est composée de phrases sourcées.
- **Locales** : les cinq.
- **Politique cookies** : la clé de l'instantané et celle du réglage sont ajoutées à
  `legal.cookies.essentialItem4`.

> **Instantané d'ouverture (sur votre appareil).** Si vous activez « Ouvrir sur mes derniers
> chiffres », Ankora garde dans le stockage local de votre navigateur : le montant « Il te
> reste », les montants de sa décomposition, la fin de la période du mois, la date
> d'enregistrement et une empreinte de votre session. Il n'y garde aucun libellé, aucune
> adresse e-mail, aucun identifiant de compte. Ces données servent uniquement à afficher vos
> derniers chiffres pendant le chargement et ne quittent jamais votre appareil. Ce traitement
> est nécessaire à une fonction que vous avez demandée (article 6(1)(b)). Ce stockage,
> strictement nécessaire à cette fonction, ne demande pas de consentement (article 5(3) de la
> directive 2002/58/CE). Le réglage vaut pour cet appareil seulement. L'instantané est effacé
> quand vous désactivez le réglage, quand vous vous déconnectez, ou à la prochaine ouverture
> d'Ankora sur cet appareil si votre session a changé ou s'il date de plus de 7 jours. Sans
> réouverture, il reste sur l'appareil, y compris après la suppression de votre compte. Vider
> les données du site dans votre navigateur l'efface aussi.

**Écarts relevés dans l'existant, hors de cet ADR** (une PR séparée, voie légère) :

- `legal.cookies.essentialItem4` (`messages/fr-BE.json:572`) ne cite ni `ankora.consent.reopen`
  ni `ankora.skew-reload.at` ;
- `manageMethod1` (`:582`) situe la barre de consentement en haut, alors qu'elle est en bas
  depuis ADR-044. À vérifier dans les cinq locales.

## 5. Options écartées

| Option                                          | Raison du refus                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Servir `/app` depuis le cache du service worker | incident du 2026-07-25, THI-324                                                 |
| Partial Prerendering                            | incompatible avec la CSP à nonce de `/app` (ADR-048 §4)                         |
| Un script en ligne d'amorçage                   | un script avec nonce qui manipule des données financières avant l'hydratation   |
| `getSession()` du client Supabase               | réseau, rafraîchissement de jeton, poids du bundle                              |
| Une empreinte calculée par le client seul       | un onglet périmé lierait les chiffres d'une session à une autre (§2 D2 point 3) |
| Un réglage stocké en compte                     | illisible sans réseau dans un repli                                             |
| Charger toutes les données côté client          | une réécriture du cockpit, qui déplacerait l'autorisation                       |
| D1 seul                                         | livré d'abord ; il habille l'attente sans la supprimer                          |

## 6. Lots et ordre des merges

| Lot    | Contenu                                                                                                           | Après                        | Voie                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| **Q1** | D1 : groupes de routes, garde-fou adapté, chemins cités mis à jour, repli du cockpit sans pulsation, repli neutre | #542 (ADR-049)               | légère : `ui-auditor`, `mobile-liquid-glass-auditor`                           |
| **Q2** | D2 : réglage local, empreinte serveur, écriture, purge à la lecture, politique de confidentialité                 | #544 (P2 : `page.tsx`) et Q1 | lourde : `plan-reviewer`, `security-auditor` (Opus), `gdpr-compliance-auditor` |

**Traçage au ROADMAP** : cette PR ajoute Q1 et Q2, avec leur ordre, au tableau « Programme —
une seule grammaire » de `docs/ROADMAP.md`. Ce tableau arrive avec #542 : la PR de cet ADR est
rebasée sur `main` une fois #542 fusionnée, puis les lignes sont ajoutées avant sa sortie de
brouillon.

Chaque plan de lot porte :

- les cinq critères de DONE du `CLAUDE.md` ;
- la porte `npm run dev` : une page chargée, son code HTTP lu ;
- les deux planchers e2e, mesurés en local.

## 7. Preuves

### 7.A — D1 (Q1)

1. **Replis** : à 390 × 844, le repli de chaque page `/app/*` est mesuré au DOM, et aucun
   libellé du cockpit n'apparaît hors du cockpit. **Une navigation client depuis
   `/app/charges` vers `/app` rend le marqueur du repli du cockpit, pas celui du repli
   neutre.**
2. **CLS = 0** entre le repli et la page fraîche, pour chaque variante, chacune produite par
   une fixture nommée dans le plan Q1 (helpers de semis de `e2e/helpers/seed.ts`, ou fixture
   de composant) :
   - `soldeQuotidien` présent et absent ;
   - « Mis de côté » présent, absent, et au mois incomplet ;
   - jauge présente et absente ;
   - état incomplet ;
   - liste de factures vide.

   Pour chacune, le plan dit ce qui est réservé. La mesure note l'état de #545 (polices).

3. **Aucun `animate-pulse`** sous `/app` : un test sur les sources le vérifie. Axe sans
   violation. Sous `prefers-reduced-motion`, aucun fondu.
4. **`app-destinations.test.ts`** reste vert, et descend dans les groupes. **`PENDING_MIGRATION`**
   de `sheet-is-the-only-modal.test.ts` garde ses quatre entrées, chemin mis à jour. Un test
   supprimé ou affaibli, ou une entrée ajoutée, est refusé.

### 7.B — D2 (Q2)

1. **Les cinq conditions**, chacune prouvée par un test qui échoue si on la retire :
   - réglage désactivé ;
   - cookie absent, expiré, illisible, ou au format inconnu ;
   - autre empreinte, et `aal1` après une session `aal2` ;
   - date au-delà de la fin de fenêtre ;
   - plus de 7 jours ;
   - schéma invalide, ou chiffres qui ne s'additionnent pas.
2. **Décodeur** : un aller-retour avec le vrai `createServerClient`, sur :
   - un jeton découpé au-delà de 3 180 caractères ;
   - des métadonnées accentuées ;
   - un morceau périmé laissé en place.
3. **Écriture** :
   - empreinte serveur différente de celle du cookie : aucune écriture ;
   - une seule écriture par réponse serveur ;
   - sans `crypto.subtle` (contexte non sécurisé) : aucune écriture, aucun affichage.
4. **Purge à la lecture** : après chaque échec, le stockage est vide sur une page **publique**.
   Sans clé d'instantané, le composant ne décode pas le cookie. **Un instantané valide survit à
   une navigation vers une page publique** : la purge attend l'empreinte.
5. **Révocation** : déconnexion globale depuis l'appareil B, puis chargement complet de `/app`
   sur l'appareil A pendant la durée de vie du jeton. Aucun chiffre n'est affiché.
6. **Second facteur** : connexion par mot de passe d'un compte en 2FA. Pendant le passage par
   `/app` et vers `/login/2fa`, aucun instantané d'une session `aal2` antérieure n'est affiché.
7. **Carte sans action** : aucune action d'écriture dans le DOM de la carte instantanée.
   L'instantané n'alimente ni `useOptimisticSpend` ni la projection du ⊕ ; un test le prouve.
8. **Testids** : aucun testid du cockpit vivant dans l'instantané.
   `e2e/il-te-reste-formule.spec.ts` reste vert avec un instantané volontairement **faux**
   présent dans le stockage.
9. **Libellé de panne** : passé 8 secondes sans page fraîche, il devient « Mise à jour
   impossible pour l'instant ».
10. **Zéro avertissement console en dev**, hydratation comprise. Le coût en bundle du
    composant de purge est mesuré **sur la landing**, et Lighthouse y reste ≥ 95.
11. **Mesure** :
    - au DOM, séparément pour la navigation client et l'ouverture à froid ;
    - l'état de #545 et #546 est noté ;
    - en navigation client, le premier chiffre est lisible avant 100 ms ;
    - puis un contrôle sur l'iPhone de @thierry.
12. **Planchers e2e** : jamais en baisse. Q2 ajoute des cas.
