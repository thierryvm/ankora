# PR-2 — Glossaire + stratégie de traduction Ankora (V1)

> **Contexte projet obligatoire** — avant d'exécuter cette PR, **lire** `docs/ROADMAP.md` (ordre des PR, contrainte budget 0 €, BYOK IA Phase 2). Toute décision prise ici doit rester cohérente avec le ROADMAP.
>
> **Position dans la séquence** : PR-1 ✅ → PR-Q ✅ → PR-1bis ✅ (attendu) → **PR-2 (ici)** → PR-B1 → PR-3 → PR-F → PR-B2.
>
> **Budget** : traduction effectuée **localement par Claude Code** (session Claude de Thierry, pas d'appel API facturé). Aucune dépendance runtime payante (pas de DeepL API, pas de Google Translate API, pas de Lokalise, etc.). DeepL free tier accepté uniquement pour review ponctuelle hors build.
>
> Document de référence obligatoire pour PR-2. Toute traduction vers `nl-BE`, `en`, `es-ES`, `de-DE` DOIT respecter les décisions ci-dessous. Ce fichier vit au-delà de PR-2 : il sert aussi pour toute string future ajoutée au produit.

---

## 1 · Stratégie globale

### Phase V1 — "Ship imperfect over perfect"

- Traduction **IA direct** par Claude Code sur la base de ce glossaire.
- Déploiement immédiat en production des 4 langues non-FR en phase V1.
- **Objectif V1** : qualité acceptable, zéro faux amis, zéro contresens métier, cohérence du vocabulaire.

### Phase V1.1 — Native review (post-lancement, dans les 90 jours)

- Revue par locuteurs natifs :
  - **NL-BE** : natif flamand (Flandre, pas Pays-Bas — registres différents)
  - **EN** : natif anglophone UK (marché cible = Europe, pas US)
  - **ES-ES** : natif espagnol castillan (pas LATAM)
  - **DE-DE** : natif allemand d'Allemagne (pas Autriche ni Suisse)
- Corrections mergées dans `messages/` sans toucher aux clés.

### Langue pivot

**Toute nouvelle string** est écrite d'abord en `fr-BE` (notre norme), puis traduite. Le fichier `fr-BE.json` est la **source de vérité** — les autres en dérivent.

---

## 2 · Ton & registre par marché

| Locale    | Adresse                                                      | Registre                                      | Ton général                            | Exemples de mot-clés                          |
| --------- | ------------------------------------------------------------ | --------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| **fr-BE** | Tutoiement (`tu`, `toi`)                                     | Chaleureux, direct, un brin complice          | "Ton ancrage financier", "tu peux"     | _taxe voiture_, _cockpit_, _lissage_          |
| **nl-BE** | Tutoiement (`je`, `jij`) pour l'UI ; `u` uniquement en legal | Clair, factuel, pas trop commercial           | "Je financieel anker", "je kunt"       | _autobelasting_, _cockpit_, _spreiden_        |
| **en**    | 2e personne directe (`you`)                                  | Confident, slightly conversational, no jargon | "Your financial anchor", "you can"     | _road tax_, _cockpit_, _smoothing_            |
| **es-ES** | Tuteo (`tú`) — PAS `usted`, PAS `vos`                        | Cercano, directo, sin tecnicismos             | "Tu ancla financiera", "puedes"        | _impuesto de circulación_, _panel_, _reparto_ |
| **de-DE** | Duzen (`du`) — PAS `Sie` (moderne fintech)                   | Direkt, freundlich, nicht zu formell          | "Dein finanzieller Anker", "du kannst" | _Kfz-Steuer_, _Cockpit_, _Glättung_           |

**Règle d'or** : Ankora vise les 25-45 ans urbains, numériquement à l'aise. Le ton doit être celui d'un conseiller ami, pas d'une banque institutionnelle. **Pas de vouvoiement moderne** en NL/ES/DE (moderne fintech = tutoiement).

### Mentions légales (exception)

Dans `legal/*` (CGU, privacy, cookies), bascule vers un registre **neutre** :

- FR : passe en "vous" (ton légal standard belge)
- NL : passe en "u"
- EN : reste en "you" (anglais ne distingue pas)
- ES : passe en "usted"
- DE : passe en "Sie"

---

## 3 · Glossaire des termes métier (source de vérité)

### 3.1 Concepts fondamentaux

| fr-BE                | nl-BE                 | en                   | es-ES                     | de-DE                      |
| -------------------- | --------------------- | -------------------- | ------------------------- | -------------------------- |
| Charge               | Vaste last            | Bill / Fixed expense | Gasto fijo                | Fixkosten                  |
| Provision            | Reserve               | Provision            | Provisión                 | Rücklage                   |
| Lissage              | Spreiding             | Smoothing            | Reparto mensual           | Glättung                   |
| Cockpit              | Cockpit               | Cockpit              | Panel                     | Cockpit                    |
| Compte principal     | Hoofdrekening         | Main account         | Cuenta principal          | Hauptkonto                 |
| Compte Vie Courante  | Lopende rekening      | Daily account        | Cuenta día a día          | Girokonto                  |
| Compte Épargne       | Spaarrekening         | Savings account      | Cuenta de ahorro          | Sparkonto                  |
| Virement             | Overschrijving        | Transfer             | Transferencia             | Überweisung                |
| Virement intelligent | Slimme overschrijving | Smart transfer       | Transferencia inteligente | Intelligente Überweisung   |
| Revenu mensuel net   | Netto maandinkomen    | Monthly net income   | Ingreso mensual neto      | Monatliches Nettoeinkommen |
| Dépense              | Uitgave               | Expense              | Gasto                     | Ausgabe                    |
| Budget               | Budget                | Budget               | Presupuesto               | Budget                     |
| Enveloppe            | Envelop               | Envelope             | Sobre                     | Umschlag                   |
| Catégorie            | Categorie             | Category             | Categoría                 | Kategorie                  |
| Simulateur           | Simulator             | Simulator            | Simulador                 | Simulator                  |
| Cible                | Doel                  | Target               | Objetivo                  | Ziel                       |
| Santé provisions     | Gezondheid reserves   | Provision health     | Salud de provisiones      | Rücklagen-Status           |

### 3.2 États & statuts

| fr-BE        | nl-BE         | en              | es-ES      | de-DE         |
| ------------ | ------------- | --------------- | ---------- | ------------- |
| Sain         | Gezond        | Healthy         | Saludable  | Gesund        |
| À surveiller | Op te volgen  | Needs attention | A vigilar  | Beobachten    |
| Critique     | Kritiek       | Critical        | Crítico    | Kritisch      |
| Actif        | Actief        | Active          | Activo     | Aktiv         |
| Inactif      | Inactief      | Inactive        | Inactivo   | Inaktiv       |
| En attente   | In afwachting | Pending         | Pendiente  | Ausstehend    |
| Terminé      | Voltooid      | Completed       | Completado | Abgeschlossen |
| Annulé       | Geannuleerd   | Cancelled       | Cancelado  | Abgebrochen   |

### 3.3 Fréquences (avec article défini féminin FR)

| fr-BE         | nl-BE           | en          | es-ES      | de-DE           |
| ------------- | --------------- | ----------- | ---------- | --------------- |
| Mensuelle     | Maandelijks     | Monthly     | Mensual    | Monatlich       |
| Trimestrielle | Driemaandelijks | Quarterly   | Trimestral | Vierteljährlich |
| Semestrielle  | Halfjaarlijks   | Semi-annual | Semestral  | Halbjährlich    |
| Annuelle      | Jaarlijks       | Annual      | Anual      | Jährlich        |

### 3.4 Exemples de charges belges (contexte marché)

| fr-BE                | nl-BE                  | en               | es-ES                   | de-DE               |
| -------------------- | ---------------------- | ---------------- | ----------------------- | ------------------- |
| Taxe de circulation  | Verkeersbelasting      | Road tax         | Impuesto de circulación | Kfz-Steuer          |
| Assurance auto       | Autoverzekering        | Car insurance    | Seguro del coche        | Autoversicherung    |
| Assurance habitation | Woningverzekering      | Home insurance   | Seguro del hogar        | Hausratversicherung |
| Loyer                | Huur                   | Rent             | Alquiler                | Miete               |
| Précompte immobilier | Onroerende voorheffing | Property tax     | IBI                     | Grundsteuer         |
| Abonnement           | Abonnement             | Subscription     | Suscripción             | Abo                 |
| Redevance TV         | Kijk- en luistergeld   | TV licence       | Canon RTVE              | Rundfunkbeitrag     |
| Eau                  | Water                  | Water            | Agua                    | Wasser              |
| Électricité          | Elektriciteit          | Electricity      | Electricidad            | Strom               |
| Gaz                  | Gas                    | Gas              | Gas                     | Gas                 |
| Internet             | Internet               | Internet         | Internet                | Internet            |
| Mutuelle             | Mutualiteit            | Health insurance | Seguro médico           | Krankenversicherung |

### 3.5 Verbes d'action UI

| fr-BE          | nl-BE        | en       | es-ES          | de-DE         |
| -------------- | ------------ | -------- | -------------- | ------------- |
| Ajouter        | Toevoegen    | Add      | Añadir         | Hinzufügen    |
| Créer          | Aanmaken     | Create   | Crear          | Erstellen     |
| Modifier       | Aanpassen    | Edit     | Modificar      | Bearbeiten    |
| Enregistrer    | Opslaan      | Save     | Guardar        | Speichern     |
| Supprimer      | Verwijderen  | Delete   | Eliminar       | Löschen       |
| Annuler        | Annuleren    | Cancel   | Cancelar       | Abbrechen     |
| Confirmer      | Bevestigen   | Confirm  | Confirmar      | Bestätigen    |
| Continuer      | Doorgaan     | Continue | Continuar      | Weiter        |
| Retour         | Terug        | Back     | Atrás          | Zurück        |
| Fermer         | Sluiten      | Close    | Cerrar         | Schließen     |
| Envoyer        | Versturen    | Send     | Enviar         | Senden        |
| Télécharger    | Downloaden   | Download | Descargar      | Herunterladen |
| Mettre à jour  | Bijwerken    | Update   | Actualizar     | Aktualisieren |
| Vérifier       | Verifiëren   | Verify   | Verificar      | Überprüfen    |
| Activer        | Activeren    | Enable   | Activar        | Aktivieren    |
| Désactiver     | Uitschakelen | Disable  | Desactivar     | Deaktivieren  |
| Se connecter   | Aanmelden    | Sign in  | Iniciar sesión | Anmelden      |
| S'inscrire     | Registreren  | Sign up  | Registrarse    | Registrieren  |
| Se déconnecter | Afmelden     | Sign out | Cerrar sesión  | Abmelden      |

### 3.6 Navigation principale

| fr-BE           | nl-BE             | en          | es-ES                | de-DE           |
| --------------- | ----------------- | ----------- | -------------------- | --------------- |
| Accueil         | Home              | Home        | Inicio               | Startseite      |
| Tableau de bord | Dashboard         | Dashboard   | Panel                | Dashboard       |
| Mes charges     | Mijn vaste lasten | My bills    | Mis gastos           | Meine Fixkosten |
| Mes comptes     | Mijn rekeningen   | My accounts | Mis cuentas          | Meine Konten    |
| Mes dépenses    | Mijn uitgaven     | My expenses | Mis gastos variables | Meine Ausgaben  |
| Virements       | Overschrijvingen  | Transfers   | Transferencias       | Überweisungen   |
| Simulateur      | Simulator         | Simulator   | Simulador            | Simulator       |
| Paramètres      | Instellingen      | Settings    | Ajustes              | Einstellungen   |
| Profil          | Profiel           | Profile     | Perfil               | Profil          |
| Déconnexion     | Afmelden          | Sign out    | Cerrar sesión        | Abmelden        |

### 3.7 Termes marketing landing

| fr-BE                  | nl-BE                | en               | es-ES            | de-DE              |
| ---------------------- | -------------------- | ---------------- | ---------------- | ------------------ |
| Ancrage financier      | Financieel anker     | Financial anchor | Ancla financiera | Finanzieller Anker |
| Sans stress            | Zonder stress        | Stress-free      | Sin estrés       | Stressfrei         |
| Commencer gratuitement | Gratis beginnen      | Start free       | Empezar gratis   | Kostenlos starten  |
| Sans carte bancaire    | Geen bankkaart nodig | No credit card   | Sin tarjeta      | Ohne Kreditkarte   |
| Données en UE          | Data in de EU        | EU-hosted data   | Datos en la UE   | Daten in der EU    |
| Essai gratuit          | Gratis proberen      | Free trial       | Prueba gratuita  | Kostenlos testen   |
| En savoir plus         | Meer weten           | Learn more       | Saber más        | Mehr erfahren      |

---

## 4 · Faux amis & pièges à éviter

### 4.1 NL-BE vs NL-NL

- Utiliser "vaste lasten" (belgisch-nederlands) pour _charges_, pas juist "rekeningen" (ambigu).
- "huur" pour _loyer_ (OK aux Pays-Bas aussi).
- Éviter "geld" seul pour _argent_ — préférer "budget" ou "geld" contextualisé.
- **Belgianisme accepté** : "app" au lieu de "toepassing" (flamand utilise "app").

### 4.2 EN (UK vs US)

- **UK baseline** pour le marché européen :
  - "cheque" pas "check"
  - "colour" pas "color"
  - "organise" pas "organize" (**-ise** partout)
  - "centre" pas "center"
- _Bill_ ≠ _invoice_ : utiliser **"bill"** pour charges récurrentes (loyer, élec) et **"invoice"** pour factures ponctuelles reçues.
- "Road tax" (UK) plutôt que "vehicle registration fee" (US).

### 4.3 ES-ES vs ES-LATAM

- "coche" pas "carro" ou "auto"
- "ordenador" pas "computadora"
- "móvil" pas "celular"
- "contraseña" pas "clave" (plus formel)
- **Seseo** inchangé : ES écrit est identique, c'est seulement la prononciation.

### 4.4 DE (DE vs AT vs CH)

- **DE baseline** pour le marché européen :
  - "ß" conservé (pas "ss" comme en CH)
  - "Januar" pas "Jänner" (AT)
  - Pas de "Velo" (CH) — utiliser "Fahrrad"
- Mots composés : séparer si >20 caractères pour la lisibilité UI. Ex: `Krankenversicherungsbeitrag` → `Krankenversicherungs­beitrag` (shy hyphen `&shy;` dans les textes longs).

### 4.5 FR-BE vs FR-FR (nuances)

- "septante" et "nonante" NON utilisés dans l'interface — on garde "soixante-dix" et "quatre-vingt-dix" (standard français lisible par tous).
- "taxe voiture" OK en belge courant, préférer "taxe de circulation" (officiel) dans les legal.
- "mutuelle" = BE (pour assurance santé obligatoire) ≠ FR (où c'est l'assurance santé complémentaire). Conserver l'usage BE dans tout le contenu.

---

## 5 · Formats localisés (Intl)

### 5.1 Monétaire

| Locale | Format EUR   | Exemple 1883.50                                          |
| ------ | ------------ | -------------------------------------------------------- |
| fr-BE  | `1 883,50 €` | espace fine insécable + virgule + espace + €             |
| nl-BE  | `€ 1 883,50` | € + espace + milliers + virgule                          |
| en     | `€1,883.50`  | € collé + virgule milliers + point décimal               |
| es-ES  | `1883,50 €`  | pas de séparateur milliers < 10 000, virgule, espace + € |
| de-DE  | `1.883,50 €` | point milliers + virgule + espace + €                    |

Utiliser `useFormatter()` de next-intl v4 :

```ts
const format = useFormatter();
format.number(1883.5, { style: 'currency', currency: 'EUR' });
```

Cela applique automatiquement les conventions CLDR par locale. **Ne pas formatter à la main**.

### 5.2 Date

| Locale | Format court | Format long         | Exemple 2026-04-18                   |
| ------ | ------------ | ------------------- | ------------------------------------ |
| fr-BE  | `dd/mm/yyyy` | `dd mois yyyy`      | `18/04/2026` · `18 avril 2026`       |
| nl-BE  | `dd/mm/yyyy` | `dd mmm yyyy`       | `18/04/2026` · `18 apr 2026`         |
| en     | `dd/mm/yyyy` | `dd mmm yyyy`       | `18/04/2026` · `18 Apr 2026`         |
| es-ES  | `dd/mm/yyyy` | `dd de mes de yyyy` | `18/04/2026` · `18 de abril de 2026` |
| de-DE  | `dd.mm.yyyy` | `dd. mmm yyyy`      | `18.04.2026` · `18. Apr 2026`        |

### 5.3 Pluralisation (ICU syntax)

**Toujours** utiliser la syntaxe ICU de next-intl dès qu'un nombre est affiché :

```ts
t('charges.count', { count: n });
```

JSON :

```jsonc
{
  "charges": {
    "count": "{count, plural, =0 {Aucune charge} one {1 charge} other {# charges}}",
  },
}
```

Équivalents par locale :

- **fr-BE** : `{count, plural, =0 {Aucune charge} one {1 charge} other {# charges}}`
- **nl-BE** : `{count, plural, =0 {Geen vaste lasten} one {1 vaste last} other {# vaste lasten}}`
- **en** : `{count, plural, =0 {No bills} one {1 bill} other {# bills}}`
- **es-ES** : `{count, plural, =0 {Sin gastos fijos} one {1 gasto fijo} other {# gastos fijos}}`
- **de-DE** : `{count, plural, =0 {Keine Fixkosten} one {1 Fixkostenposten} other {# Fixkostenposten}}`

**Règle** : le plural ICU est OBLIGATOIRE pour tout texte qui affiche un nombre. Pas de concaténation manuelle `${n} charge${n>1?'s':''}` — ça casse en allemand (0 = pluriel), en polonais (3 formes), etc.

---

## 6 · SEO multilingue

### 6.1 Titres de pages (meta title)

Pattern : `[Tagline courte] · Ankora`

| Route  | fr-BE                                        | nl-BE                                        | en                                            | es-ES                                     | de-DE                                          |
| ------ | -------------------------------------------- | -------------------------------------------- | --------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `/`    | `Ton ancrage financier sans stress · Ankora` | `Je financieel anker zonder stress · Ankora` | `Your financial anchor, stress-free · Ankora` | `Tu ancla financiera sin estrés · Ankora` | `Dein finanzieller Anker, stressfrei · Ankora` |
| `/faq` | `Questions fréquentes · Ankora`              | `Veelgestelde vragen · Ankora`               | `FAQ · Ankora`                                | `Preguntas frecuentes · Ankora`           | `Häufig gestellte Fragen · Ankora`             |
| `/app` | `Tableau de bord · Ankora`                   | `Dashboard · Ankora`                         | `Dashboard · Ankora`                          | `Panel · Ankora`                          | `Dashboard · Ankora`                           |

### 6.2 Meta descriptions (max 160 chars)

Chaque locale a sa propre version, optimisée SEO, avec mot-clé principal en premier :

- fr-BE : "Ankora lisse tes charges annuelles en provisions mensuelles. Plus jamais de taxe voiture qui te tombe dessus un matin. Gratuit, sans carte."
- nl-BE : "Ankora spreidt je jaarlijkse lasten in maandelijkse provisies. Geen autobelasting meer die je verrast. Gratis, zonder kaart."
- en : "Ankora smooths your yearly bills into monthly provisions. Never let a road tax ambush your morning. Free, no credit card."
- es-ES : "Ankora reparte tus gastos anuales en provisiones mensuales. Que el impuesto de circulación no vuelva a pillarte. Gratis, sin tarjeta."
- de-DE : "Ankora verteilt deine Jahreskosten auf monatliche Rücklagen. Keine Kfz-Steuer mehr, die dich überrascht. Kostenlos, ohne Karte."

### 6.3 `hreflang` (déjà géré par PR-1 via `alternates.languages`)

Chaque page Next.js génère automatiquement :

```html
<link rel="alternate" hreflang="fr-BE" href="https://ankora.be/" />
<link rel="alternate" hreflang="nl-BE" href="https://ankora.be/nl-BE" />
<link rel="alternate" hreflang="en" href="https://ankora.be/en" />
<link rel="alternate" hreflang="es-ES" href="https://ankora.be/es-ES" />
<link rel="alternate" hreflang="de-DE" href="https://ankora.be/de-DE" />
<link rel="alternate" hreflang="x-default" href="https://ankora.be/" />
```

---

## 7 · Règles de longueur & troncation

Les 5 langues ont des tailles de string très variables. Prévoir :

| Locale | Ratio vs fr-BE | Exemple "Paramètres"                          |
| ------ | -------------- | --------------------------------------------- |
| fr-BE  | 1.00×          | 11 chars                                      |
| nl-BE  | ~1.10×         | "Instellingen" (12)                           |
| en     | ~0.85×         | "Settings" (8)                                |
| es-ES  | ~1.15×         | "Ajustes" (7) — cas rare, peut être plus long |
| de-DE  | ~1.30×         | "Einstellungen" (13)                          |

**DE-DE** est notre pire cas : prévoir **+30% de marge** dans tous les composants UI (boutons, labels, toasts). Tester avec les valeurs DE les plus longues pour valider l'UI.

**Règles** :

- Aucun texte-bouton ne doit être tronqué avec `text-overflow: ellipsis` — si ça dépasse, ajuster la taille du bouton, pas couper.
- Les toasts autorisent le wrap sur 2 lignes max (CSS `line-clamp: 2`).
- Les cartes KPI laissent toujours **2 lignes possibles** pour le titre.

---

## 8 · Process de validation

### 8.1 Avant commit PR-2

1. Tous les fichiers `messages/*.json` ont **exactement** la même arborescence que `fr-BE.json` (test `messages-parity` PR-1bis).
2. Aucune clé en anglais dans `es-ES.json` ou `de-DE.json` (faux stubs).
3. Test e2e : visiter `/` `/nl-BE` `/en` `/es-ES` `/de-DE` en headless, screenshot, vérifier qu'aucun texte n'affiche `common.xyz` (clé non résolue).

### 8.2 Revue native (post-deploy V1)

Pour chaque locale, identifier un reviewer natif et :

1. Partager le fichier `messages/{locale}.json` + captures d'écran du site.
2. Lui demander de relever : erreurs grammaticales, faux amis, tournures maladroites, terminologie métier.
3. Mergeer les corrections dans un commit `fix(i18n): native review {locale}`.

### 8.3 Outillage recommandé

- **DeepL** pour un second avis sur les strings longues (free tier suffit pour le volume d'Ankora).
- **LanguageTool** (extension navigateur) pour grammar check sur les JSON.
- **Hemingway App** pour la lisibilité EN.

---

## 9 · Cas particuliers à trancher

### 9.1 "Ankora" — nom propre

Jamais traduit. Toujours capitalisé "Ankora" (pas ANKORA, pas ankora dans le corps de texte).

### 9.2 "Belgique / Belgium / Bélgica / België / Belgien"

Dans les badges OG et mentions légales, utiliser la forme locale.

- fr-BE : Belgique
- nl-BE : België
- en : Belgium
- es-ES : Bélgica
- de-DE : Belgien

### 9.3 "UE" vs "EU" vs "Europese Unie"

- fr-BE : "UE"
- nl-BE : "EU"
- en : "EU"
- es-ES : "UE"
- de-DE : "EU"

### 9.4 Emojis dans les messages

Autorisés uniquement dans les toasts success et les empty states (ton engageant). Liste blanche : ⚓ (anchor = logo Ankora), ✅, 🎉, 💡, 📊. Pas d'emoji dans les messages d'erreur, les CGU, ou les notifications critiques.

### 9.5 Dates relatives ("il y a 2 jours")

Utiliser `format.relativeTime(date)` de next-intl. Ne jamais construire à la main.

---

## 10 · Check final avant merge PR-2

- [ ] Les 5 fichiers `messages/{fr-BE,nl-BE,en,es-ES,de-DE}.json` ont strictement la même structure (test `messages-parity` vert).
- [ ] Aucun placeholder non-traduit (`TODO`, `XXX`, `[to translate]`).
- [ ] Les termes métier suivent le glossaire §3 (spot check de 20 clés).
- [ ] Les pluriels ICU sont utilisés partout où un compte numérique apparaît.
- [ ] Les formats `date`/`currency`/`number` passent par `useFormatter()` de next-intl.
- [ ] Les tests e2e visitent les 5 locales sans erreur de clé manquante.
- [ ] Aucune régression visuelle en DE-DE (longueur la plus longue) sur les composants shadcn (tester après PR-3).
- [ ] SEO : titres et descriptions par page respectent §6.

---

**Quand Claude Code produira le prompt PR-2 lui-même, il DEVRA référencer ce document comme source unique de vérité pour toutes les décisions de traduction.**
