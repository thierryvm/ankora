import { z } from 'zod';

import { CATEGORY_COLOR_TOKENS } from '@/lib/domain/categories';

/**
 * Longueur maximale d'un nom de catégorie côté application.
 *
 * La base autorise 60 (`categories.name check (char_length between 1 and 60)`).
 * On s'arrête à 40 **délibérément** : au-delà, la puce fait déjà deux lignes à
 * 390 px. Le plafond applicatif est un plafond d'AFFICHAGE, plus strict que le
 * plafond d'INTÉGRITÉ — il ne peut donc jamais entrer en conflit avec lui.
 * Écrit ici pour que la divergence 40/60 se lise comme une décision et non
 * comme un oubli.
 */
export const CATEGORY_NAME_MAX = 40;

/**
 * Assainit le nom AVANT de le valider — donc avant de le stocker.
 *
 * Le nettoyage vit ici plutôt qu'à la comparaison, pour que ce qui atterrit en
 * base soit déjà propre. Assainir seulement à la comparaison laisserait entrer
 * un nom porteur d'un caractère invisible, que chaque lecteur futur devrait
 * re-nettoyer — et le premier qui oublierait afficherait deux puces identiques.
 *
 * Les trois passes, dans l'ordre :
 *
 * 1. **NFC** — « Santé » décomposé (`e` + accent combinant) devient « Santé »
 *    précomposé. Aucun accent n'est retiré : c'est une équivalence canonique,
 *    pas un dépouillement.
 * 2. **Les invisibles** — U+200B/C/D, U+00AD, U+FEFF. Ni visibles, ni retirés
 *    par `trim()`. « Courses » plus une espace de largeur nulle serait une
 *    deuxième catégorie que rien ne distingue à l'écran.
 * 3. **Les espaces** — toute suite d'espaces devient une seule, puis on rogne
 *    les bords.
 */
const nomAssaini = z.string().transform((brut) =>
  brut
    .normalize('NFC')
    .replace(/[​-‍­﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim(),
);

/**
 * Le nom d'une catégorie créée par l'utilisateur.
 *
 * `/^[^<>]*$/` est repris tel quel d'`accountDisplayNameSchema` : même classe de
 * champ — un nom d'affichage libre — donc même garde. React échappe, ce n'est
 * donc pas une faille ; c'est une convention, et diverger sans raison est ce
 * qui rend une convention illisible.
 */
export const categoryNameSchema = nomAssaini.pipe(
  z
    .string()
    .min(1, { message: 'category.name.required' })
    .max(CATEGORY_NAME_MAX, { message: 'category.name.tooLong' })
    .regex(/^[^<>]*$/, { message: 'category.name.invalidChars' }),
);

/**
 * La palette est une liste FERMÉE de 8 jetons (ADR-022 §4).
 *
 * Ce `z.enum` est ce qui empêche une valeur arbitraire de traverser jusqu'à
 * Tailwind, où elle deviendrait une classe inexistante — donc une puce
 * invisible, et non une erreur.
 */
export const categoryColorTokenSchema = z.enum(CATEGORY_COLOR_TOKENS, {
  error: 'category.colorToken.invalid',
});

export const expenseCategoryInputSchema = z.object({
  name: categoryNameSchema,
  colorToken: categoryColorTokenSchema,
});

export type ExpenseCategoryInput = z.infer<typeof expenseCategoryInputSchema>;
