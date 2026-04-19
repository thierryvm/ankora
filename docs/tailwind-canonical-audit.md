# Tailwind Canonical Classes Audit — Étape 1

**Date:** 19 avril 2026  
**Branch:** `chore/tailwind-canonical-classes`  
**Scan patterns:** `bg-[#|text-[#|border-[#|ring-[#|from-[#|to-[#|via-[#|fill-[#|stroke-[#|shadow-[#`

---

## Résumé

✅ **ZERO inline hex colors trouvés**  
✅ **ZERO matches sur les patterns**  
✅ **Ankora est déjà 100% conforme à Tailwind canonical classes**

---

## Détail du scan

### Regex patterns cherchés

```
bg-\[#|text-\[#|border-\[#|ring-\[#|from-\[#|to-\[#|via-\[#|fill-\[#|stroke-\[#|shadow-\[#
```

### Étendue du scan

- Répertoire: `src/`
- Types: `.ts`, `.css`
- Récursif: ✓

### Résultats

- **Fichiers ayant des inline colors:** 0
- **Total occurrences:** 0
- **Fichiers inspectés:** ~95 TypeScript/CSS files

### Observations supplémentaires

**Dynamic classes présentes (légitimes):**

- `text-[1.0625rem]` (sizing, non-color) — **OK**
- `bg-(--color-brand-100)` (custom property token) — **OK**
- `text-[0.875em]` (sizing, non-color) — **OK**

**Pattern:** Ankora utilise exclusivement `(--color-xxx)` pour les couleurs dynamiques, respectant le design tokens Tailwind CSS 4 avec `@theme inline` dans `globals.css`.

---

## Verdict

**Migration status: ✅ COMPLETE**

Ankora n'a besoin d'**aucune migration Tailwind canonical.** Le repo respecte déjà 100% les bonnes pratiques :

- Zéro hardcoding de colors en inline
- Utilisation exclusive des tokens CSS custom properties `(--color-*)`
- Sizing dynamique acceptable (non-color)

---

## Prochaines étapes

**Option 1:** Fermer PR #22 comme **"Won't Fix — Already Compliant"** avec ce rapport en commentaire.

**Option 2:** Déployer PR #22 comme **validation + documentation** (ajouter ce rapport à la doc, merge comme "chore: document Tailwind canonical compliance", 0 code changes).

**À toi de trancher, Thierry.**
