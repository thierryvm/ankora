/**
 * Adresse de contact publique de l'éditeur — SOURCE UNIQUE.
 *
 * Elle apparaît dans le pied de page, la politique de confidentialité et la
 * notice cookies. Elle était écrite en dur à quatre endroits du code et dans
 * vingt-cinq chaînes de traduction ; la seule qui se disait « source unique »
 * (`site.ts`) en était une cinquième. Le jour où cette adresse change, une
 * copie oubliée dans la mention RGPD est une demande d'exercice de droits qui
 * n'arrive nulle part — art. 12(2).
 *
 * Délibérément PAS une variable d'environnement : un contact légal qui diffère
 * entre la préproduction et la production est un contact sur lequel personne
 * ne peut compter. Le raisonnement vient de `site.ts`, il est juste, il est
 * conservé ici avec la valeur qu'il décrit.
 *
 * `src/lib/__tests__/brand.test.ts` vérifie qu'aucune copie littérale ne
 * réapparaît dans `src/` ni dans `messages/`.
 */
const CONTACT_EMAIL = 'thierryvm@gmail.com';

export const brand = {
  name: 'Ankora',
  nameMarked: 'Ankora™',
  domain: 'ankora.be',
  /** Contact général — pied de page, CGU. */
  contactEmail: CONTACT_EMAIL,
  /**
   * Divulgation de vulnérabilité. Même boîte aujourd'hui ; le rôle est distinct
   * parce qu'il partira le premier vers une adresse dédiée.
   */
  securityEmail: CONTACT_EMAIL,
  /** Responsable de traitement — exercice des droits RGPD. */
  privacyEmail: CONTACT_EMAIL,
  jurisdiction: "Tribunal de l'entreprise francophone de Bruxelles",
  licensePath: '/LICENSE',
  licenseType: 'Proprietary',
} as const;
