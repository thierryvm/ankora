# Ankora Design System — skill

When a Claude Code agent is handed this folder as a skill, follow these rules before generating any Ankora UI.

## 0. CRITICAL BRAND CONSTRAINT — NO PSD2

Ankora is **NOT a bank aggregator.** It does NOT use PSD2, AIS, or any banking API. All data is **MANUALLY entered by the user**. Never generate UI that suggests:

- Bank connection / "connect your accounts" / "relier ta banque"
- Transaction sync / import / read-only bank access / lecture seule
- IBAN pickers showing real BE/FR IBANs as accounts the user links
- Bank logos (BNP, KBC, Belfius, Revolut, N26…) as connection options
- Aggregation / agrégation / agrégateur copy

This is **non-negotiable** — it's a regulatory choice, part of the FSMA-compliant positioning. When a screen needs to reassure the user about data handling, use: _"Saisie manuelle · données hébergées en Belgique"_ or _"Ankora ne se connecte à aucune banque."_

**Phase 1 pricing constraint** — Ankora is 100% free during Phase 1 (budget 0€ strict, founder regulatory situation). Never ship pricing tiers or paid plans until this constraint lifts. The "Gratuit pendant la Phase 1" block on the landing is the only correct pricing surface.

## 1. Load the tokens, always

- Import `colors_and_type.css` at the top of every new HTML/CSS file. **Do not redefine colors, radii, shadows, or type scale.** Every component reads from the tokens declared there.
- Dark mode is the default. Light mode is supported via `[data-theme="dark"]` being present or absent on `<html>`. Never hard-code a hex value for a neutral.

## 2. Accent rule is non-negotiable

- **User-facing surfaces** (product cockpit, marketing, onboarding, mobile app) → **teal** (default token set).
- **Admin-facing surfaces** (operator console, internal tools) → **laiton nautique** (brass) via `data-accent="admin"` on the root. One pigment, two contexts: fresh brass `#d4a017` on dark (AAA 7.93:1), aged brass `#8b6914` on light (AA 5.09:1). Same grammar, same story, different patina.
- Do not introduce a third accent. If you need to differentiate a third surface, change layout or density, not color.

## 3. Typography

- Inter for all UI, ramp 400/500/600/700. Never italic.
- Fraunces only for hero/display moments ≥ 28px. Never body.
- JetBrains Mono for every number — use `font-variant-numeric: tabular-nums` always.
- Headings ≥ 32px get `letter-spacing: -0.02em`.

## 4. Voice (FR-first, tutoiement)

- French is the canonical language. Use `tu / ton / tes`, never `vous`.
- Say `cockpit`, `provisions affectées`, `réserve libre`, `lissage`, `prédictif`. Never `savings`, `budget générique`, `forecast`, `nous recommandons`.
- Never imply investment advice — banned phrasings include _"placement conseillé"_, _"rendement garanti"_, _"nous vous recommandons d'investir"_. FSMA-compliant means Ankora tells you **how much** to transfer toward savings, never **where** to put it.
- Sentence case everywhere. No emoji in UI (footer `🇧🇪` only).

## 5. Icons

- `lucide-react` only, stroke 1.5, sizes 14/16/18/20/24. If a glyph is missing, draw at stroke 1.5 in a 24×24 viewBox to match.
- Never use unicode arrows/checks as decoration.
- In these preview files the Lucide-matching subset lives in `ui_kits/_shared/icons.jsx` — extend it there if you need a new glyph.

## 6. Components

- Reuse `.btn / .btn-primary / .btn-secondary / .btn-outline / .btn-ghost`, `.card`, `.glass`, `.input`, `.label`, `.badge`, `.num`, `.micro` from `ui_kits/_shared/shell.css`. These compile from the tokens — never restyle them with ad-hoc CSS.
- Liquid Glass surfaces are **multi-layer**: blur + `color-mix` tint + inset edge highlight + `prefers-reduced-transparency` opaque fallback. Single-layer `backdrop-filter` is rejected.

## 7. Motion

- Durations: 120/200/320ms. Easing: `var(--ease-spring)` — never `linear`, never `ease`.
- Respect `prefers-reduced-motion` on every animation. The token stylesheet wires this globally; don't override it.
- Number changes should tick (digit roll), never cross-fade.

## 8. Forbidden (instant reject)

- Bento grids of equal cards · emoji icons · `$` signs · historic bar charts · hardcoded hex outside `colors_and_type.css` · Rocket Money / Nubank / N26 aesthetic cues · copy suggesting investment advice · AI-generated hero illustrations · gradient-heavy backgrounds · **any PSD2 / bank-picker / IBAN-import UI** · paid pricing tiers (v1.0 is free only).

## 9. When the user asks for a new screen

1. Pick the right accent (user → teal, admin → laiton).
2. Start from the nearest existing kit in `ui_kits/` and extend — don't fork the tokens.
3. Numbers go in `.num`. Status pills pick one of `.badge-{paid,scheduled,action,received,manual}`.
4. Surface privacy/consent copy — Ankora is manual-entry only: _"Saisie manuelle · données hébergées en Belgique · export RGPD à tout moment."_ Never mention PSD2.
5. If you need a new component shape, add it to `ui_kits/_shared/shell.css` so the next screen inherits it.

## 10. Surfaces overview

- `ui_kits/index.html` — meta-index with live thumbnails.
- `ui_kits/user_dashboard/` — the cockpit. Hero waterfall, health ring, timeline, envelopes, ⌘K palette, what-if drawer.
- `ui_kits/admin_dashboard/` — operator console. DAU chart, users table, audit log, system health.
- `ui_kits/landing_page/` — marketing site. Hero, three principles, feature block, pricing, RGPD footer.
- `ui_kits/onboarding/` — 3-step wizard: choose account structure (3 comptes vs 1 compte) → add starter envelopes manually → add annual provisions manually. No bank connection, ever.
