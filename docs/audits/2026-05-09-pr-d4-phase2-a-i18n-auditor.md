# i18n Audit — PR-D4-PHASE2-A (2026-05-09)

**Branch:** `feat/atoms-tasks-6-18` (HEAD 4214281)
**Auditor:** i18n-auditor (next-intl key parity, FR-BE 100%, glossary)
**Verdict:** PASS_WITH_FINDINGS (0 BLOCK, 19 strings hardcoded FR à wirer en PR-D)

## Verifications PASS

| #   | Check                                                | Result                                                              |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Atoms importent `getTranslations`/`useTranslations`  | ❌ aucun (atoms purement présentationnels — attendu, wiring PR-B/D) |
| 2   | Parité clés `messages/*.json`                        | ✅ aucun fichier JSON modifié, parité 5 locales intacte             |
| 3   | Placeholders ICU                                     | N/A (pas de nouveau message JSON)                                   |
| 4   | Resté FR dans nl-BE/en/de-DE/es-ES                   | ✅ aucun fichier locale non-FR modifié                              |
| 5   | Email-as-keyword pattern (suppressions destructives) | ✅ Drawer confirm UI classique, pas de `confirmKeyword`             |
| 6   | Routing `src/i18n/routing.ts`                        | ✅ inchangé                                                         |
| 7   | Glossary sync                                        | ✅ aucune clé glossaire ajoutée/modifiée                            |

## Hardcoded FR strings inventory (à wirer en PR-D)

| Atom             | File:line             | Hardcoded string                                          | Priorité PR-D     |
| ---------------- | --------------------- | --------------------------------------------------------- | ----------------- | ------ |
| **Drawer**       | `Drawer.tsx:413`      | `'Requis'` (validation message)                           | HIGH              |
| **Drawer**       | `Drawer.tsx:420`      | `'Montant invalide'` (validation)                         | HIGH              |
| **Drawer**       | `Drawer.tsx:545`      | `'Fermer'` (close aria-label)                             | HIGH              |
| **Drawer**       | `Drawer.tsx:569`      | `'Confirmer la suppression ?'`                            | HIGH              |
| **Drawer**       | `Drawer.tsx:574`      | `'Non'`                                                   | HIGH              |
| **Drawer**       | `Drawer.tsx:578`      | `'Oui, supprimer'`                                        | HIGH              |
| **Drawer**       | `Drawer.tsx:607`      | `'Annuler'`                                               | HIGH              |
| **Drawer**       | `Drawer.tsx:610`      | `'Enregistrer'`                                           | HIGH              |
| **Drawer**       | `Drawer.tsx:367`      | `deleteLabel` default `'Supprimer'`                       | HIGH              |
| **Drawer**       | `Drawer.tsx:292-295`  | Frequency: `'Mensuel'`, `'Trim.'`, `'Annuel'`, `'Unique'` | MEDIUM            |
| **ThemeToggle**  | `ThemeToggle.tsx:70`  | `'Activer le thème {clair                                 | sombre}'`         | MEDIUM |
| **ThemeToggle**  | `ThemeToggle.tsx:71`  | `'Thème {clair                                            | sombre}'` (title) | MEDIUM |
| **LangSwitcher** | `LangSwitcher.tsx:57` | `ariaLabel` default `'Changer de langue'`                 | MEDIUM            |
| **Chip**         | `Chip.tsx:54`         | `aria-label` `'Retirer'`                                  | MEDIUM            |
| **ColorPicker**  | `ColorPicker.tsx:46`  | `ariaLabel` default `'Choisir une couleur'`               | LOW               |
| **ColorPicker**  | `ColorPicker.tsx:65`  | `aria-label` swatch `Couleur ${color}`                    | LOW               |
| **IconPicker**   | `IconPicker.tsx:34`   | `ariaLabel` default `'Choisir une icône'`                 | LOW               |
| **ProgressBar**  | `ProgressBar.tsx:66`  | `ariaLabel` fallback `'Progression'`                      | LOW               |

**Note `ANKORA_V1_LOCALES` labels** : `'Français (Belgique)'`, `'English'` — convention CLDR : noms de langues restent dans leur langue native, pas wiring i18n. ✅ OK as-is.

## Playground (intentionnel)

Route `design-playground` interne dev-only (`noindex`, `gated env`). Libellés FR hardcodés acceptés et documentés. Hors scope wiring i18n.

Strings dans demos (pour info) : `DrawerDemo` (`'Nom'`, `'Montant'`, `'Échéance'`, `'Statut'`, `'Notes'`, `'Brouillon'`, `'Actif'`, `'Ouvrir le Drawer'`, `'Démo Drawer'`), `TabsDemo` (`'Vue d'ensemble'`, etc.), `ColorPickerDemo`/`IconPickerDemo`/`ThemeToggleDemo` (`'Sélectionnée :'`, `'Thème courant :'`, etc.).

## Recommandations PR-D wiring

Clés à créer en PR-D (toutes 5 locales) :

```
atoms.themeToggle.activateLight         = "Activer le thème clair"
atoms.themeToggle.activateDark          = "Activer le thème sombre"
atoms.themeToggle.titleLight            = "Thème clair"
atoms.themeToggle.titleDark             = "Thème sombre"
atoms.langSwitcher.ariaLabel            = "Changer de langue"
atoms.chip.removeAriaLabel              = "Retirer"
atoms.colorPicker.ariaLabel             = "Choisir une couleur"
atoms.colorPicker.swatchAriaLabel       = "Couleur {hex}"
atoms.iconPicker.ariaLabel              = "Choisir une icône"
atoms.progressBar.defaultAriaLabel      = "Progression"
atoms.drawer.close                      = "Fermer"
atoms.drawer.save                       = "Enregistrer"
atoms.drawer.cancel                     = "Annuler"
atoms.drawer.delete                     = "Supprimer"
atoms.drawer.confirmDelete              = "Confirmer la suppression ?"
atoms.drawer.confirmYes                 = "Oui, supprimer"
atoms.drawer.confirmNo                  = "Non"
atoms.drawer.validation.required        = "Requis"
atoms.drawer.validation.invalidAmount   = "Montant invalide"
atoms.drawer.frequency.monthly          = "Mensuel"
atoms.drawer.frequency.quarterly        = "Trim."
atoms.drawer.frequency.yearly           = "Annuel"
atoms.drawer.frequency.once             = "Unique"
```

## Verdict

PASS_WITH_FINDINGS — 0 BLOCK pour PR-A. 19 strings hardcoded attendues (atoms PR-A) à wirer en PR-D. Tracker dans rapport DoD §Concerns + brief PR-D.
