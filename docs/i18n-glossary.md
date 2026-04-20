# Ankora — i18n Glossary (fintech multi-locale)

> Single source of truth for translating Ankora UI. Any new locale must comply with these decisions.
> Registers, tone, and product-specific vocabulary are enforced across all JSON message files.

**Supported locales:** `fr-BE` (reference), `nl-BE`, `en`, `de-DE`, `es-ES`
**Default locale:** `fr-BE`
**URL strategy:** `localePrefix: 'as-needed'` (fr-BE served at `/`, others prefixed).

---

## 1. Register (tu/vous, du/Sie, tú/usted, je/u)

Ankora is a personal finance cockpit. Tone is **confident, warm, direct** — never paternalistic, never corporate. We use the **informal 2nd person** everywhere. Rationale: benchmarks (N26, Revolut, Monarch, Bunq) all default to informal register to feel like a friend, not a bank.

| Locale | Register | Rationale                                                 |
| ------ | -------- | --------------------------------------------------------- |
| fr-BE  | **tu**   | Already in use; standard for BE fintech consumer apps.    |
| nl-BE  | **je**   | Standard NL-BE app register; `u` would feel stiff/formal. |
| en     | **you**  | English has no formal distinction — neutral by default.   |
| de-DE  | **du**   | Modern DE fintech norm (N26, Trade Republic use `du`).    |
| es-ES  | **tú**   | Castilian Spanish, informal — **not** `vos` (Argentine).  |

**Rule:** never mix registers in the same file. Verbs, possessives, and imperatives stay consistent.

---

## 2. Product vocabulary (locked terms)

These terms have marketing weight and must match the decisions below in every locale. Do not paraphrase.

### Brand & identity

| Concept                          | fr-BE                 | nl-BE                 | en                    | de-DE                   | es-ES               |
| -------------------------------- | --------------------- | --------------------- | --------------------- | ----------------------- | ------------------- |
| Ankora                           | Ankora                | Ankora                | Ankora                | Ankora                  | Ankora              |
| Tagline: _Ton ancrage financier_ | Ton ancrage financier | Je financieel houvast | Your financial anchor | Dein finanzieller Anker | Tu ancla financiera |
| cockpit (metaphor)               | cockpit               | cockpit               | cockpit               | Cockpit                 | cockpit             |

**Note:** `Ankora™` is a trademark — never translated.

### Core concepts

| FR concept                  | nl-BE           | en             | de-DE          | es-ES               | Notes                                             |
| --------------------------- | --------------- | -------------- | -------------- | ------------------- | ------------------------------------------------- |
| lissage (n.)                | spreiding       | smoothing      | Verteilung     | distribución        | "Bill smoothing" is established EN fintech.       |
| lisser (v.)                 | spreiden        | to smooth      | verteilen      | distribuir          |                                                   |
| charge (facture récurrente) | vaste kost      | bill           | Fixkosten (pl) | gasto fijo          | NL "kost" > "uitgave" here. EN "bill" > "charge". |
| dépense (spontanée)         | uitgave         | expense        | Ausgabe        | gasto               | For non-recurring spend (groceries, dining).      |
| virement                    | overschrijving  | transfer       | Überweisung    | transferencia       | NL-BE standard bank term.                         |
| revenu (mensuel net)        | nettoloon       | net income     | Nettoeinkommen | ingreso neto        | Keep "net" explicit.                              |
| épargne                     | spaargeld       | savings        | Ersparnisse    | ahorro              |                                                   |
| provision                   | voorziening     | reserve        | Rücklage       | reserva             | Financial reserve, not "provision" (ambiguous).   |
| enveloppe (budget)          | envelop         | envelope       | Umschlag       | sobre               | Envelope-budgeting method (established).          |
| pot partagé                 | gedeelde pot    | shared pocket  | geteilter Topf | bolsillo compartido | Future feature — roommates / joint projects.      |
| compte Principal            | Hoofdrekening   | Main account   | Hauptkonto     | cuenta Principal    | Account receiving salary.                         |
| Vie Courante                | Dagelijks Leven | Daily Spending | Alltag         | Día a Día           | Daily spending account.                           |
| Épargne (acct name)         | Spaarrekening   | Savings        | Sparen         | Ahorro              | Savings account.                                  |

### UX micro-terms

| FR          | nl-BE            | en       | de-DE            | es-ES      |
| ----------- | ---------------- | -------- | ---------------- | ---------- |
| Valider     | Bevestigen       | Confirm  | Bestätigen       | Confirmar  |
| Enregistrer | Opslaan          | Save     | Speichern        | Guardar    |
| Annuler     | Annuleren        | Cancel   | Abbrechen        | Cancelar   |
| Supprimer   | Verwijderen      | Delete   | Löschen          | Eliminar   |
| Continuer   | Doorgaan         | Continue | Weiter           | Continuar  |
| Retour      | Terug            | Back     | Zurück           | Volver     |
| Envoyer     | Versturen        | Send     | Senden           | Enviar     |
| Vérifier    | Verifiëren       | Verify   | Prüfen           | Verificar  |
| Télécharger | Downloaden       | Download | Herunterladen    | Descargar  |
| Réessayer   | Opnieuw proberen | Retry    | Erneut versuchen | Reintentar |

---

## 3. Don't translate

Keep these **as-is** across all locales:

- Brand names: `Ankora`, `Supabase`, `Vercel`, `Upstash`, `Anthropic`, `OpenRouter`, `Google`
- Tech acronyms in the text: `PSD2`, `RLS`, `TLS 1.3`, `CSP`, `MFA`, `TOTP`, `JSON`, `IBAN`, `2FA`, `UE/EU/EEA`, `BYOK`
- Currency symbol: `€`
- Proper nouns of regulators:
  - `FSMA` (Belgium) — never translated
  - `APD` (FR) / `GBA` (NL) / `DPA` (EN) / `Datenschutzbehörde` (DE) / `APD belga` (ES)
- GDPR acronym by locale:
  - FR = **RGPD**, ES = **RGPD**, NL = **AVG**, EN = **GDPR**, DE = **DSGVO**
- Rights-text article references: keep `art. 20`, `art. 6`, etc.
- Placeholders: `{name}`, `{count}`, `{month}`, `{amount}`, `{year}`, `{date}`, `{days}`, `{sign}`, `{percent}`, `{total}`, `{label}`, `{provision}`, `{bills}`, `{frequency}`, `{version}` — keep token names **exactly**.
- HTML-like tags inside values: `<b>`, `<code>`, `<link>`, `<mail>`, `<apd>`, `<cgu>`, `<privacy>`, `<strong>` — keep tag names **exactly**.

---

## 4. Months & currency formatting

### Months (full form)

| #   | fr-BE     | nl-BE     | en        | de-DE     | es-ES      |
| --- | --------- | --------- | --------- | --------- | ---------- |
| 1   | janvier   | januari   | January   | Januar    | enero      |
| 2   | février   | februari  | February  | Februar   | febrero    |
| 3   | mars      | maart     | March     | März      | marzo      |
| 4   | avril     | april     | April     | April     | abril      |
| 5   | mai       | mei       | May       | Mai       | mayo       |
| 6   | juin      | juni      | June      | Juni      | junio      |
| 7   | juillet   | juli      | July      | Juli      | julio      |
| 8   | août      | augustus  | August    | August    | agosto     |
| 9   | septembre | september | September | September | septiembre |
| 10  | octobre   | oktober   | October   | Oktober   | octubre    |
| 11  | novembre  | november  | November  | November  | noviembre  |
| 12  | décembre  | december  | December  | Dezember  | diciembre  |

### Months (short form)

| #   | fr-BE | nl-BE | en  | de-DE | es-ES |
| --- | ----- | ----- | --- | ----- | ----- |
| 1   | janv. | jan.  | Jan | Jan   | ene.  |
| 2   | févr. | feb.  | Feb | Feb   | feb.  |
| 3   | mars  | mrt.  | Mar | Mrz   | mar.  |
| 4   | avr.  | apr.  | Apr | Apr   | abr.  |
| 5   | mai   | mei   | May | Mai   | may.  |
| 6   | juin  | jun.  | Jun | Jun   | jun.  |
| 7   | juil. | jul.  | Jul | Jul   | jul.  |
| 8   | août  | aug.  | Aug | Aug   | ago.  |
| 9   | sept. | sep.  | Sep | Sep   | sept. |
| 10  | oct.  | okt.  | Oct | Okt   | oct.  |
| 11  | nov.  | nov.  | Nov | Nov   | nov.  |
| 12  | déc.  | dec.  | Dec | Dez   | dic.  |

### Decimal separator

Runtime formatter uses `Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })`. No hard-coded separators in the JSON.

### Frequency labels

| FR          | nl-BE           | en          | de-DE           | es-ES      |
| ----------- | --------------- | ----------- | --------------- | ---------- |
| Mensuel     | Maandelijks     | Monthly     | Monatlich       | Mensual    |
| Trimestriel | Driemaandelijks | Quarterly   | Vierteljährlich | Trimestral |
| Semestriel  | Halfjaarlijks   | Semi-annual | Halbjährlich    | Semestral  |
| Annuel      | Jaarlijks       | Annual      | Jährlich        | Anual      |

---

## 5. Tone rules

1. **Direct, not chatty.** Ankora speaks like a trusted CFO-friend, not a marketer.
2. **No fear-selling.** Never "don't fall into debt" style — always "stay in control".
3. **Action verbs first.** Prefer "Configure your accounts" over "You can configure your accounts".
4. **Keep French idioms consistent.** Example: "zéro angoisse" → EN "zero stress" (not "anxiety"); NL "nul stress"; DE "null Stress"; ES "cero estrés".
5. **Legal pages** (CGU/privacy/cookies) stay slightly more formal but **still `tu/je/du/tú/you`**.
6. **Error messages** are one short sentence, no blame, no apology inflation.
7. **Numbers & amounts** — never invent; keep existing counts and `{amount}` placeholders identical to FR.

---

## 6. Destructive-action confirmations (email-as-keyword)

**Decision:** for irreversible user actions (account deletion), the user must type **their own email address** — not a translated keyword like SUPPRIMER / DELETE / LÖSCHEN.

**Rationale:**

1. **i18n-safe** — the email is identical in every locale; no backend `z.union`, no grammar drift per locale (VERWIJDER vs VERWIJDEREN, etc.), no support ambiguity.
2. **Max friction** — the user must actually know their account identity, not just copy a visible word.
3. **Scale-proof** — adding a 6th locale requires zero keyword maintenance.
4. **Premium pattern** — GitHub, Vercel, Linear, Heroku, Netlify all use this pattern for destructive actions.

**Implementation contract:**

- Backend: `makeDeletionRequestSchema(user.email)` in `src/lib/schemas/settings.ts` — case-insensitive, trimmed compare.
- Frontend: `SettingsClient.tsx` → `DangerZone` receives `email` prop; Confirm button stays disabled until `confirm.trim().toLowerCase() === email.trim().toLowerCase()`.
- i18n: `app.settings.danger.confirmLabel` uses the `{email}` ICU placeholder inside a `<code>` tag. Validation error = `validation.settings.deletion.confirm` ("this address doesn't match your account" per locale).

**Forbidden:** do NOT re-introduce locale-translated keywords (SUPPRIMER, DELETE, LÖSCHEN, ELIMINAR, VERWIJDER/VERWIJDEREN) for destructive confirmations. If a future action needs a typed confirmation, use the same email-as-keyword pattern.

---

## 7. Versioning

| Version | Date       | Change                                                                                                     |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-04-20 | Initial glossary — Wave 1.5 "Opération Babel" translation.                                                 |
| 1.1     | 2026-04-20 | Destructive confirmations switch to email-as-keyword pattern (§6). Drop SUPPRIMER/DELETE/LÖSCHEN/ELIMINAR. |

Any new term, any register change, any account-name update **must** be logged here before landing in messages/\*.json.
