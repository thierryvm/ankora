import { describe, expect, it } from 'vitest';

import { aUnFacteurVerifie, elevationManquante, lireNiveauDuJeton } from '../mfa-elevation';

/**
 * The predicate that decides whether a session still owes its second factor.
 *
 * Two failure modes are being guarded against here, and they point in OPPOSITE
 * directions — which is why both sets of cases have to exist:
 *
 *   - too permissive: a verified factor exists and nobody is ever challenged.
 *     That was production until 2026-08-06;
 *   - too strict: an account with NO factor gets challenged, and since it can
 *     never reach `aal2`, it is locked out forever. An earlier design did
 *     exactly this by requiring `aal2` to enrol.
 *
 * A suite that only covered the first would let the second ship.
 */

const jeton = (payload: Record<string, unknown>): string =>
  `entete.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

describe('elevationManquante', () => {
  it('exige le second facteur quand un facteur vérifié existe et que la session est restée en aal1', () => {
    expect(elevationManquante({ facteurVerifie: true, niveauCourant: 'aal1' })).toBe(true);
  });

  it('laisse passer une session déjà élevée', () => {
    expect(elevationManquante({ facteurVerifie: true, niveauCourant: 'aal2' })).toBe(false);
  });

  /**
   * LE cas anti-verrouillage. Un compte sans facteur ne peut pas atteindre
   * `aal2` : le défier reviendrait à l'enfermer dehors définitivement, et à
   * rendre l'activation de la 2FA impossible pour qui ne l'a pas encore.
   */
  it('ne défie jamais un compte sans facteur vérifié, quel que soit le niveau', () => {
    expect(elevationManquante({ facteurVerifie: false, niveauCourant: 'aal1' })).toBe(false);
    expect(elevationManquante({ facteurVerifie: false, niveauCourant: 'aal2' })).toBe(false);
    expect(elevationManquante({ facteurVerifie: false, niveauCourant: null })).toBe(false);
  });

  /**
   * Repli FERMÉ. Un niveau illisible n'est pas une panne de Supabase — celle-là
   * est classée `unavailable` bien avant d'arriver ici. C'est un jeton
   * indécodable, donc des octets que le client tient : laisser passer ferait du
   * contournement une question de cookie malformé.
   */
  it('exige le second facteur quand le niveau est illisible, mais seulement si un facteur existe', () => {
    expect(elevationManquante({ facteurVerifie: true, niveauCourant: null })).toBe(true);
  });
});

describe('aUnFacteurVerifie', () => {
  it('reconnaît un facteur vérifié', () => {
    expect(aUnFacteurVerifie({ factors: [{ status: 'verified' }] as never })).toBe(true);
  });

  /**
   * Un facteur `unverified` est une tentative d'enrôlement abandonnée : il
   * n'authentifie personne. Le compter reviendrait à défier quelqu'un avec un
   * facteur qu'il ne peut pas produire — l'enfermement, encore.
   */
  it('ignore un facteur non vérifié', () => {
    expect(aUnFacteurVerifie({ factors: [{ status: 'unverified' }] as never })).toBe(false);
  });

  it('accepte une liste vide et une liste absente', () => {
    expect(aUnFacteurVerifie({ factors: [] })).toBe(false);
    expect(aUnFacteurVerifie({})).toBe(false);
  });
});

describe('lireNiveauDuJeton', () => {
  it('lit la claim aal', () => {
    expect(lireNiveauDuJeton(jeton({ aal: 'aal2', sub: 'user-1' }))).toBe('aal2');
  });

  /**
   * Chaque forme illisible rend `null`, jamais une exception : une exception
   * remonterait en 500 sur une page authentifiée, ce qui transformerait un
   * contrôle de sécurité en panne d'application.
   */
  it('rend null sur tout ce qui ne se lit pas, sans lever', () => {
    expect(lireNiveauDuJeton(null)).toBeNull();
    expect(lireNiveauDuJeton(undefined)).toBeNull();
    expect(lireNiveauDuJeton('')).toBeNull();
    expect(lireNiveauDuJeton('pas-un-jeton')).toBeNull();
    expect(lireNiveauDuJeton('entete.pas-du-base64-valide!!.signature')).toBeNull();
    expect(lireNiveauDuJeton(jeton({ sub: 'user-1' }))).toBeNull();
  });

  /** Une claim `aal` qui n'est pas une chaîne ne devient pas « aal2 » par accident. */
  it('refuse une claim aal qui n est pas une chaîne', () => {
    expect(lireNiveauDuJeton(jeton({ aal: 2 }))).toBeNull();
    expect(lireNiveauDuJeton(jeton({ aal: null }))).toBeNull();
  });
});
