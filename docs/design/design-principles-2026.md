# Design Principles Ankora — 2026

Synthèse des trends design fintech 2026 appliqués à Ankora. Source de vérité pour les briefs Claude Design et les reviews @cowork.

---

## 1. Les 5 critères "wow" vs "correct" (références 2026)

1. **Hiérarchie radicale** — 1 hero domine 60 % de l'attention, le reste supporte. Ref : Monarch Money (cashflow hero), Copilot (net worth animated).
2. **Animations narratives** — chaque animation raconte quelque chose (argent qui coule, jauge qui se remplit). Ref : Cleo, Revolut Pockets.
3. **Données vivantes** — number tickers, graphs live, what-if inline. Ref : Copilot (simulator drawer), Monarch (drag-to-rebalance).
4. **Typo chiffres dédiée** — tabular-nums + serif display sur gros montants. Ref : Stripe, Mercury.
5. **Détails invisibles** — edge highlights glass, spring physics, haptics, micro-sons. Ref : Arc Browser, Linear.

---

## 2. Apple Liquid Glass — implémentation correcte

Annoncé WWDC 2025, devenu standard iOS 26 / macOS Tahoe. En 2026, mal implémenté dans 80 % des cas web (simple `backdrop-filter` ≠ Liquid Glass).

**Ingrédients minimum (CSS)** :

```css
/* Couche 1 : blur dynamique */
backdrop-filter: blur(20px) saturate(180%);

/* Couche 2 : tint adaptatif */
background: color-mix(in oklch, var(--surface) 70%, transparent);

/* Couche 3 : edge highlight (bordure lumineuse) */
border: 1px solid color-mix(in oklch, white 20%, transparent);
box-shadow:
  inset 0 1px 0 rgb(255 255 255 / 0.15),
  0 8px 32px rgb(0 0 0 / 0.12);
```

**Pièges** :

- Performance mobile low-end (Android mid-range = FPS drop)
- Contraste WCAG AA fragile (toujours tester backdrop clair ET sombre, min 70 % opacity sur surfaces textuelles)
- Safari iOS : OK mais consomme batterie
- PWA standalone : peut être désactivé sans GPU — fallback obligatoire
- `@media (prefers-reduced-transparency)` → fallback surface opaque

**Apps qui le font bien (2026)** : Arc Browser, Raycast, Linear, Vercel.

---

## 3. Dashboard fintech — métaphores dominantes 2026

| Métaphore                                  | Pertinence Ankora                                    | Ref                   |
| ------------------------------------------ | ---------------------------------------------------- | --------------------- |
| **Cashflow waterfall / Sankey**            | Signature PRINCIPALE — salary → envelopes → outflows | YNAB v5, Copilot      |
| **Jauges de santé (health score)**         | Pour provisions — garder                             | Monarch, Rocket Money |
| **Timeline prédictive 6 mois**             | Pour projection — garder                             | Copilot, Cleo         |
| **Enveloppes skeuomorphiques modernisées** | Pour cards enveloppes — moderne, pas 90s             | Goodbudget, YNAB      |
| Orbites / radars / rivières                | À éviter — perçu gadget                              | —                     |

**Bento grid** : banalisé en 2024-25 (Apple, Linear, Vercel), devenu "fond de scène" en 2026. Pas signature. Ankora doit ÉVITER.

---

## 4. Navigation multi-role (user vs admin)

**Desktop** :

- Sidebar contextuelle qui change selon le rôle
- Badge "Admin" persistant (amber pill)
- Command palette ⌘K unifiée avec scope (`>user`, `>admin`)
- Route distincte `/app/*` user vs `/admin/*` admin

**Mobile PWA** :

- Tab bar flottante user (4-5 items max)
- Admin = écran dédié via long-press avatar OU ⌘K
- JAMAIS polluer la tab bar user avec des sections admin

**Transitions** :

- Même typo, même spacing, même glass
- Accent color différent : teal user → amber admin
- L'utilisateur admin sent "la même maison, autre pièce"

Ref : Linear Admin, Vercel team settings, Stripe dashboard vs Stripe Atlas.

---

## 5. Micro-interactions premium 2026

**Signature** :

- Magnetic hover sur CTA (Apple.com, Vercel)
- Gradient follow sur cards (Linear, Resend)
- Spring physics par défaut (pas linear easing)
- Inertia scroll (Lenis.js)
- Tilt 3D subtil (max 5-8°)
- Haptic feedback mobile (Vibration API)

**Cheap vs Premium** :

| Cheap                        | Premium                    |
| ---------------------------- | -------------------------- |
| `transition: all 0.3s ease`  | Spring physics, < 200 ms   |
| Hover = scale(1.05) uniforme | Magnetic + gradient follow |
| Fade-in au scroll (AOS-like) | View transitions natives   |
| Parallax agressif > 30 %     | Parallax < 10 %            |
| Glassmorphism 1 couche       | Liquid Glass multi-couches |
| Gradient statique            | Gradient animé > 8s cycle  |

**Outils recommandés** :

- **Motion** (ex-Framer Motion v12) — standard 2026 pour React
- **GSAP** — toujours roi pour animations complexes marketing
- **Lenis** — scroll smooth
- **CSS pure** (`@starting-style`, `transition-behavior: allow-discrete`, View Transitions API) — monte fort, réduit le JS

---

## 6. Couleurs & typographies 2026

**Palette Ankora actuelle** : navy (#0b1120) + teal (#2dd4bf) + amber (#fbbf24) = **pertinent mais risque de se fondre** dans la masse Revolut/N26/Lunar. Différenciation nécessaire via accent signature.

**Accent signature verrouillé (2026-04-24 par @thierry)** :

- ✅ **Laiton nautique #d4a017** — jaune-doré mat évoquant les instruments marins (sextant, boussole, laiton d'ancre). Cohérent avec le nom "Ankora" (ancre marine). Plus mat et sérieux que l'amber pur, sans conflit avec `--color-danger`.
- **Rôle** : accent signature + accent admin (teal reste user)
- **Rationale** : amber #fbbf24 jugé trop générique (Revolut/N26/Qonto l'utilisent), copper #c2410c écarté (conflit sémantique avec rouge danger en fintech), violet/magenta écartés (hors narrative marine).

**Options explorées et écartées** :

- ~~Amber #fbbf24~~ — trop générique fintech
- ~~Electric violet #a855f7~~ — hors narrative Ankora
- ~~Coral magenta #f472b6~~ — trop pink, hors narrative
- ~~Cuivre brûlé #c2410c~~ — conflit sémantique avec danger red

**Typographies** :

- **Inter Variable** (UI) — OK mais "default", pas signature
- **Fraunces** (hero éditorial) — OK, signature douce
- **Geist** (Vercel) — à considérer si on pousse plus tech-forward
- **Instrument Serif** — monte fort comme serif éditorial 2026
- Numbers : tabular-nums obligatoire, serif display sur gros montants

**Combo premium 2026 fintech** : Geist Sans (UI) + Fraunces / Instrument Serif (display + numbers) — cette combinaison serif chiffres + sans-serif UI est LA tendance 2026.

---

## 7. Apps de référence à citer à Claude Design

| App                  | Pour                            | Note                             |
| -------------------- | ------------------------------- | -------------------------------- |
| **Monarch Money**    | Dashboard enveloppes iOS        | Référence #1 structure dashboard |
| **Copilot Money**    | Animations + hero narrative     | Référence animations             |
| **Mercury**          | Fintech premium desktop         | Référence density + premium      |
| **Linear**           | ⌘K + speed + micro-interactions | Référence command-driven         |
| **Arc Browser**      | Glass + command palette         | Référence glass                  |
| **Qonto**            | Fintech européenne pro          | Référence EU pro                 |
| **Raycast**          | Command-driven UX               | Référence ⌘K                     |
| **Stripe Dashboard** | Density pro + typo chiffres     | Référence typo chiffres          |

**À NE PAS citer** : Revolut 10.x (trop saturé), N26 (trop froid), Nubank (trop consumer).

---

## 8. Red flags à détecter dans les exports Claude Design

Avant d'intégrer un export, @cowork vérifie qu'aucun de ces anti-patterns n'est présent :

- ❌ Bento grid de cards égales sans hiérarchie
- ❌ Glassmorphism 1 couche (pas de edge highlight)
- ❌ Linear easing sur transitions
- ❌ Parallax > 10 %
- ❌ Icons emoji
- ❌ Dollar signs ($)
- ❌ Copy qui suggère conseil en investissement
- ❌ Classes Tailwind arbitraires (`bg-[#abc]`)
- ❌ Hardcoded hex hors `globals.css`
- ❌ Dépendance payante non validée
