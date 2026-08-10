# Parcours de bout en bout, sur une vie complète — ce qu'un utilisateur peut prouver, et ce qu'il doit croire

**Date** : 10 août 2026. **Méthode** : Supabase local éphémère, profil semé de bout en bout
(`scripts/dev/seed-profil-test.mjs` puis `scripts/dev/seed-vie-complete.mjs`), navigateur
réel WebKit, iPhone 14 (390 × 664). **Aucune donnée de production n'a été lue ni écrite.**

**La question posée** : chaque chiffre affiché peut-il être démontré — d'où il vient, à
quoi il sert ?

## 0. Le profil semé, et ses totaux calculés HORS application

| Grandeur                                             | Valeur                                             |
| ---------------------------------------------------- | -------------------------------------------------- |
| Revenu mensuel                                       | 2 500,00 €                                         |
| Virement mensuel vers la carte du quotidien          | 300,00 €                                           |
| Charges du mois (14 mensuelles, payées du principal) | 1 804,21 €                                         |
| Provisions (1 trimestrielle + 4 annuelles, lissées)  | 59,00 €                                            |
| Engagements (plan d'apurement 220 + prêt 180)        | 400,00 €                                           |
| Dépenses saisies sur le mois (9)                     | 421,05 €                                           |
| Soldes                                               | principal 1 240 · quotidien 385,50 · épargne 2 150 |
| **Reste attendu**                                    | **−63,21 €**                                       |

## 1. Ce qui est juste, et qu'il faut dire

**L'arithmétique du domaine est exacte.** `2 500 − 300 − 59 − 1 804,21 − 400 = −63,21`, et
c'est très précisément ce qu'affiche « Plan du mois ». Les onze montants semés sont tous
présents à l'écran, aux bons endroits, dans le bon format.

**La décomposition existe déjà, et elle est bonne.** Chaque poste du hero porte un
« Détail » dépliable qui énumère ses composantes : les 14 charges ligne à ligne, les 5
provisions avec leur périodicité (« 45 € tous les 3 mois » → 15 €/mois, « 300 € une fois
par an » → 25 €/mois), les 2 engagements. C'est exactement la règle « un chiffre qu'on ne
peut pas ouvrir est une injonction » — elle est appliquée.

**Le piège du double comptage est évité.** Le semis pose délibérément un plan d'apurement
SPF de 220 €/mois qui désigne la même dette qu'une charge mensuelle « Impôt 220 € ».
Aucun « 440 € » n'apparaît nulle part : l'application ne les additionne pas.

## 2. ⛔ Deux « il te reste » sur le même écran, et ils ne disent pas la même chose

| Où                     | Libellé                                              | Montant       |
| ---------------------- | ---------------------------------------------------- | ------------- |
| Hero, en haut          | « **IL TE RESTE** -184,26 € sur 236,79 € de budget » | **−184,26 €** |
| Plan du mois, plus bas | « Après tes sorties · Août »                         | **−63,21 €**  |

Les deux sont défendables **séparément** :

- `236,79 = 2 500 − 1 804,21 − 59 − 400` — ce qui reste une fois les obligations fixes
  retirées, **avant** le virement vers la carte du quotidien ;
- `−184,26 = 236,79 − 421,05` — le même budget, moins ce qui a réellement été dépensé ;
- `−63,21 = 236,79 − 300` — le même budget, moins le virement de lissage.

Trois notions distinctes, **deux d'entre elles appelées « il te reste »**, et rien à
l'écran ne dit comment elles s'articulent. Un utilisateur qui lit −184,26 € en haut et
−63,21 € plus bas n'a aucun moyen de savoir laquelle est « la sienne ».

C'est le cœur du problème d'expérience : **le produit sait calculer, il ne sait pas encore
raconter.**

## 3. ⛔ L'épargne se contredit elle-même, dans la même carte

Relevé, à quelques centaines de pixels d'écart, **après correction du semis** (§4) :

- « **100 % À jour** · **+ 1 851,08 €** au-delà de la cible »
- « **Épargne estimée −1 068,47 €** »

Le premier dit : tu as 1 851 € de plus que nécessaire. Le second annonce une épargne
négative. Et la projection qui suit descend jusqu'à **−4 018 €** en douze pas, contre une
cible qui reste plate.

**Cette contradiction n'est PAS un artefact du harnais** : elle subsiste identique une fois
`payment_months` corrigé, seule la valeur de l'écart à la cible ayant bougé (1 577 →
1 851,08, le calcul de cible étant désormais juste).

Les deux peuvent avoir une définition cohérente en interne — l'une constate, l'autre
projette le déficit mensuel. **Aucune des deux ne le dit.** Juxtaposées sans phrase de
liaison, elles se lisent comme une contradiction.

## 4. ✅ FAUSSE PISTE, redressée — le défaut était dans le HARNAIS, pas dans le produit

**Ce paragraphe annonçait d'abord un bug applicatif. Il n'en était pas un.** Il est
conservé en entier, corrigé, parce que la méthode qui a permis de le redresser vaut plus
que le constat lui-même.

**Ce qui était observé.** Cinq charges apparaissaient dans « Prochaines factures »,
marquées « En retard · 1 août 2026 · 9 jours en retard » : S.W.D.E (trimestrielle,
janvier), Taxe voiture (annuelle, **mars**), Taxe égout (**juin**), Taxe poubelle
(septembre), Dashlane (novembre). « Reste à payer » affichait **1 542,21 €** et « Ce
mois-ci **16 factures** ».

**Ce que j'allais écrire** : « la date est construite avec le jour de prélèvement et le
mois courant, en ignorant le mois d'échéance ». C'était faux.

**Ce que la vérification a montré.** L'interface ne lit pas `due_month` : elle lit
`payment_months` (`ChargesClient.tsx:226` et `:463` — `paymentMonths.includes(mois)`).
Interrogée, la base rendait `{1,2,…,12}` pour **toutes** les charges non mensuelles. Or
c'est la **valeur par défaut de la colonne** : mon script de semis ne la renseignait pas.
L'application affichait donc fidèlement ce qu'on lui avait donné — une taxe annuelle
déclarée due tous les mois.

Et le formulaire de l'application, lui, la renseigne : `ChargesClient.tsx:370` calcule
`paymentMonthsFromFrequency(frequency, dueMonth)` et l'envoie. **Le chemin utilisateur est
correct.**

**Le vrai défaut, et il est réel.** `scripts/dev/seed-profil-test.mjs` — le script de
semis **du dépôt**, pas le mien — n'écrivait pas `payment_months` non plus. Toute charge
non mensuelle du profil de test héritait donc du défaut « tous les mois ». **Chaque mesure
prise sur ce profil depuis son écriture a surévalué le reste à payer**, et l'audit du
5 août a probablement compté ces factures fantômes.

C'est la famille « un harnais ment aussi par l'état qu'il installe » : personne ne mentait,
et pourtant tous les chiffres étaient faux.

**Corrigé le 10 août** dans les deux scripts, qui calculent désormais `payment_months`
comme le fait le formulaire.

**Falsification — prédiction posée AVANT de re-mesurer, puis vérifiée** :

| Grandeur                    | Semis fautif | Prédit   | Mesuré après correction |
| --------------------------- | ------------ | -------- | ----------------------- |
| Reste à payer               | 1 542,21 €   | 969,21 € | **969,21 €** ✅         |
| Factures ce mois-ci         | 16           | 11       | **11** ✅               |
| Factures en retard fantômes | 5            | 0        | **0** ✅                |

Les retards restants sont tous légitimes — des charges mensuelles, aux dates de leur jour
de prélèvement (1, 1, 3, 5, 5).

**Ce qui reste à trancher, et qui n'est pas un bug** : la colonne `payment_months` a pour
défaut `{1,…,12}`, c'est-à-dire « tous les mois ». Ce défaut est sûr pour le chemin
applicatif, qui renseigne toujours la colonne. Il est un piège pour **tout autre
écrivain** : un script, une migration, un futur import CSV. Le dépôt en a déjà payé le
prix une fois — la migration `20260605000001_backfill_payment_months.sql` existe
précisément pour réparer des lignes tombées dedans — et son propre script de semis y est
retombé. Un défaut plus prudent (par exemple `{}` avec contrainte, forçant l'écrivain à
choisir) mérite d'être arbitré.

## 5. Structure des titres — deux défauts

**Titres dupliqués sur le cockpit.** « Santé des provisions », « Mes engagements » et
« Prochaines factures » apparaissent **chacun deux fois**, en `h2` puis en `h3`. Un lecteur
d'écran annonce donc chaque section deux fois.

**Aucun `h1` sur les pages du tunnel** : `/signup` ouvre sur un `h3` (« Créer mon
cockpit »), `/signup/check-email` et `/onboarding` (« Nomme ton espace ») n'ont pas de
`h1` non plus. Le cockpit, lui, en a un correct (« Août — ton cockpit »).

## 6. Le tunnel d'inscription, mesuré séparément sur la production

- **La case « J'accepte les CGU » est recouverte par le bandeau cookies** à la position
  d'arrivée : `elementFromPoint` rend `button « Personnaliser »`. Taper la case obligatoire
  ouvre les préférences de cookies.
- **Zone cliquable des deux cases de consentement : 308 × 20 px** — sous les 24 px de
  WCAG 2.5.8, sur deux contrôles juridiquement obligatoires. Même défaut sur le lien
  « la politique cookies » du bandeau : **127 × 17 px**.
- **Le premier écran d'un nouveau visiteur ne contient aucun appel à l'action produit** :
  les seuls contrôles visibles sont le logo et les quatre boutons du bandeau, qui occupe
  **44 % de la hauteur utile** (354 → 648 sur 664).

## 7. Ce que ce parcours N'A PAS pu éprouver, et pourquoi

**La confirmation par e-mail.** `supabase/config.toml` pose `enable_confirmations = false`
en local : aucun message n'est envoyé et le compte est confirmé d'office. Or
`signUpAction` redirige **toujours** vers `/signup/check-email`. Dans cette configuration,
l'utilisateur lit « vérifie ta boîte mail » alors qu'aucun e-mail ne partira. Ce n'est
**pas** un défaut de production, où les confirmations sont actives — mais c'est un piège
latent si ce réglage venait à changer.

**Le limiteur de débit.** Le journal du serveur rend `ERROR: Rate limit upstream error` à
chaque connexion, et la requête aboutit quand même après ~4 s d'attente. Le limiteur
**laisse passer** quand son service est injoignable. C'est peut-être un arbitrage
délibéré de disponibilité ; il n'est écrit nulle part, et il mérite d'être tranché par
écrit plutôt que constaté.

## 8. Fautes d'instrument commises pendant ce parcours

Consignées parce qu'elles se rejoueront :

1. **Un garde-fou vacuole.** Ma vérification « toutes les requêtes partent-elles en
   local ? » filtrait sur `/auth/v1/`, or l'inscription passe par une **Server Action** :
   l'appel part du serveur, invisible au réseau du navigateur. Zéro requête observée, et
   `[].every()` rend `true` — le contrôle affichait ✅ sans rien avoir vérifié.
2. **Un délai au lieu d'une condition.** `waitForTimeout(4000)` lisait l'URL juste avant
   la redirection, parce que le POST met 4,1 s (cf. §7). J'ai conclu deux fois à un échec
   de connexion qui n'existait pas.
3. **Un parcours de texte qui lisait les `<script>`.** La charge utile RSC contient tous
   les messages i18n : mon relevé de « montants » y trouvait des chiffres affichés nulle
   part.
4. **Une comparaison à deux décimales** contre une interface qui écrit `2 500 €`. Dix
   montants pourtant présents ont été annoncés absents.

## 9. Suites proposées, par gravité

| #   | Constat                                               | Gravité                          | Suite                                                      |
| --- | ----------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| 1   | Case CGU recouverte par le bandeau, cibles 20 px (§6) | **bloque la conversion**         | PR tunnel d'inscription                                    |
| 2   | Deux « il te reste » contradictoires (§2)             | trompe l'utilisateur             | Décision de conception : un seul chiffre dominant          |
| 3   | Épargne : constat et projection se contredisent (§3)  | trompe l'utilisateur             | Idem, et une phrase de liaison                             |
| 4   | Titres dupliqués, `h1` absents (§5)                   | accessibilité                    | PR structure + `ui-auditor`                                |
| 5   | Défaut `{1,…,12}` sur `payment_months` (§4)           | piège pour les écrivains hors UI | Arbitrage : défaut plus prudent ?                          |
| 6   | Limiteur de débit qui laisse passer en silence (§7)   | sécurité, à décider              | Décision écrite, pas un constat                            |
| —   | ~~Charges non dues comptées comme en retard~~         | **retiré**                       | Faux positif : défaut de harnais, corrigé et falsifié (§4) |
