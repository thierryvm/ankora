/**
 * Pure types and constants for the cookie consent flow. Lives in its own
 * file so `consent.ts` (which carries the `'use server'` directive) can
 * stay strictly async-export-only as enforced by `scripts/lint-use-server.mjs`.
 */

/**
 * Version de la politique cookies en vigueur — **une seule pour toute
 * l'application**.
 *
 * Elle gouverne deux choses qui doivent rester la même chose :
 *
 * 1. la validité du stockage local du navigateur (`ankora.consent.v1`) : une
 *    valeur différente de celle-ci invalide la décision et **réaffiche la
 *    bannière** ;
 * 2. la colonne `user_consents.version` écrite en base — la preuve, au sens de
 *    l'art. 7(1) RGPD, de **quelle version** de la politique la personne a
 *    acceptée.
 *
 * Le composant de bannière portait sa propre copie (`CONSENT_VERSION`), sans
 * lien avec celle-ci. Les deux valaient `'1.0.0'`, donc rien ne se voyait — et
 * rien ne se serait vu au premier bump. Les deux dérives sont muettes, et
 * chacune casse la moitié utile du dispositif :
 *
 * - bumper la copie du navigateur seule : la personne redécide, mais la base
 *   atteste son accord sous l'**ancien** numéro de version. La preuve désigne
 *   un texte qu'elle n'a pas lu.
 * - bumper celle-ci seule : la base passe au nouveau numéro alors que la
 *   bannière ne se réaffiche **jamais**. On enregistre un consentement à un
 *   texte qui n'a jamais été présenté.
 *
 * Une seule constante rend les deux impossibles. À bumper à chaque
 * modification de fond de `/legal/cookies`.
 */
export const COOKIE_CONSENT_VERSION = '1.0.0';

export type CookieConsentInput = {
  analytics: boolean;
  marketing: boolean;
};

export type CookieConsentSnapshot = {
  analytics: boolean;
  marketing: boolean;
  version: string | null;
  decidedAt: string | null;
};
