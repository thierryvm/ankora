# GDPR/RGPD Audit — PR-D4-PHASE2-A (2026-05-09)

**Branch:** `feat/atoms-tasks-6-18` (HEAD 4214281)
**Auditor:** gdpr-compliance-auditor
**Verdict:** PASS_WITH_FINDINGS (0 BLOCK, 2 trackable PR-B)

## Findings

### F1 — MEDIUM (trackable PR-B) : Cookie name divergence

**File:** `src/components/atoms/ThemeToggle.tsx:40,50`

`ThemeToggle` écrit `document.cookie = "theme=..."` par défaut. La politique cookies (`/legal/cookies` via `messages/fr-BE.json:458` + `en.json:458`) déclare publiquement le cookie `ankora-theme`.

**Risque** : article 5(1)a RGPD + ePrivacy art. 5(3) — un cookie déposé sous un nom non déclaré dans la politique expose à un grief DPA, même si l'exemption "strictly necessary" s'applique au cookie lui-même (preference UI light/dark, pas de PII).

**Statut PR-A** : non-bloquant. Le wiring `cookieKey` est explicitement reporté à PR-B (AppShell). Tracker dans rapport DoD §Concerns + brief PR-B integration.

**Fix PR-B** : passer `cookieKey="ankora-theme"` à chaque instance, OU changer le default dans `ThemeToggle.tsx` ligne 36 (`cookieKey = 'theme'` → `'ankora-theme'`).

### F2 — LOW (trackable PR-B) : Cookie sans flag `Secure`

**File:** `src/components/atoms/ThemeToggle.tsx:50`

```ts
document.cookie = `${cookieKey}=${theme}; max-age=31536000; path=/; SameSite=Lax`;
```

`Secure` absent. Cookie non-sensible (valeur `light|dark`), risque confidentialité nul, mais bonne pratique OWASP recommande `Secure`. Tracker pour PR-B.

`HttpOnly` intentionnellement absent (JS client doit lire pour anti-FOUC) → acceptable.

## Verifications PASS

| #   | Check                                                      | File                          | Result                                             |
| --- | ---------------------------------------------------------- | ----------------------------- | -------------------------------------------------- | ------------------- |
| V1  | Pas de PII dans 11 fixtures demos                          | `_components/demos/*Demo.tsx` | ✅ 0 PII (initiales `AD`, emojis, valeurs neutres) |
| V2  | Env var `ANKORA_PLAYGROUND_ENABLED` non leak bundle client | `page.tsx:42`, `env.ts:19`    | ✅ server-only (pas `NEXT_PUBLIC_`)                |
| V3  | `metadata.robots noindex/nofollow` sur playground          | `page.tsx:18-22`              | ✅ présent                                         |
| V4  | Aucun fetch external dans atoms                            | `src/components/atoms/*.tsx`  | ✅ 0 occurrence                                    |
| V5  | LangSwitcher ne pose pas de cookie (PR-A headless)         | `LangSwitcher.tsx`            | ✅ pas de `document.cookie`                        |
| V6  | Cookie `theme` exemption ePrivacy "strictly necessary"     | `ThemeToggle.tsx:50`          | ✅ valeur `light                                   | dark` non-trackable |

## Verdict & actions

- **PR-A merge-safe** : aucun BLOCK GDPR
- **PR-B mandatory fixes** : F1 (cookie name) + F2 (Secure flag) avant intégration AppShell production
- **Tracking** : rapport DoD §Concerns documenté, brief PR-B à enrichir
