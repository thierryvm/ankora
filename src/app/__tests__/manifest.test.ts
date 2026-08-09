import { describe, expect, it } from 'vitest';

import manifest from '../manifest';

/**
 * Le manifeste décide de ce que voit quelqu'un qui touche l'icône Ankora.
 *
 * Ces assertions existent parce que `start_url` a longtemps valu `'/'`, la page
 * marketing : mesuré le 8 août 2026, un utilisateur **connecté** qui demandait
 * `/` y restait — la page d'accueil n'a aucun garde de session. L'application
 * installée s'ouvrait donc sur la vitrine, et il fallait un geste de plus pour
 * atteindre le cockpit, à **chaque** ouverture, sur les deux intentions
 * quotidiennes (saisir une dépense, regarder où l'on en est).
 *
 * Des deux corrections envisagées, c'est la seule qui puisse porter sur iPhone :
 * Safari ne supporte pas les raccourcis de manifeste (`shortcuts`), ni le menu
 * contextuel d'une web app installée. Un raccourci n'aurait rien changé pour
 * l'utilisateur principal.
 *
 * Mais déplacer `start_url` sans épingler `id` aurait suffi à ce que la
 * correction n'atteigne personne — d'où l'assertion sur `id` ci-dessous, ajoutée
 * le 9 août 2026 après relecture.
 */
describe('manifeste de l’application installée', () => {
  const m = manifest();

  it('démarre sur le cockpit, pas sur la page marketing', () => {
    expect(m.start_url).toBe('/app');
  });

  it("garde l'identité de l'application, sans la laisser suivre start_url", () => {
    // Celle-ci garde un comportement réel, contrairement à `shortcuts` plus bas.
    // Sans `id`, l'identité d'une PWA EST son `start_url` : la déplacer sans
    // épingler l'identité fait voir aux navigateurs une AUTRE application, qui
    // n'hérite pas de la mise à jour. Le correctif d'à côté n'aurait alors
    // atteint aucune installation existante.
    //
    // `'/'` est la valeur historiquement calculée. Elle ne doit pas suivre
    // `start_url` — les deux assertions séparées disent exactement cela.
    expect(m.id).toBe('/');
    expect(m.id).not.toBe(m.start_url);
  });

  it('garde une portée qui englobe les pages publiques', () => {
    // `scope` reste `/` : depuis l'application installée, le pied de page mène
    // à la FAQ, au glossaire et aux pages légales. Une portée réduite à `/app`
    // les ferait sortir de l'application vers le navigateur, à chaque lien.
    //
    // Une troisième ligne vérifiait ici que `start_url` commence par `scope`.
    // Retirée : les deux égalités du dessus figent les deux littéraux, donc elle
    // calculait `'/app'.startsWith('/')` — vraie par construction, incapable de
    // rougir. Une assertion qui ne peut pas échouer coûte de la lecture et ne
    // protège rien.
    expect(m.scope).toBe('/');
  });

  it('reste en affichage autonome', () => {
    expect(m.display).toBe('standalone');
  });

  /**
   * Contrôle de non-régression du raisonnement ci-dessus.
   *
   * Si un jour `shortcuts` apparaît, ce test ne doit PAS être supprimé pour le
   * faire passer : il doit être réécrit avec, dans son message, la plateforme
   * réellement couverte. Un raccourci ajouté en croyant servir iOS serait du
   * travail dépensé pour personne.
   */
  it('ne déclare pas encore de raccourcis — ils ne serviraient qu’Android', () => {
    expect(m.shortcuts).toBeUndefined();
  });
});
