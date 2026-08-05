import { reloadPage } from '@/lib/browser/reload';

/**
 * L'état « une nouvelle version attend » — et qui a le droit de recharger.
 *
 * ## Pourquoi ce fichier existe
 *
 * Dans une PWA `display: standalone`, iOS supprime la barre d'adresse **et** le
 * tirer-pour-rafraîchir. Il ne reste aucun geste pour recharger, donc aucune
 * mise à jour ne peut arriver : c'est le défaut rapporté par @thierry le
 * 2026-08-05 (« on n'arrive jamais à refresh la fenêtre, donc aucun moyen de
 * charger les modifications »). Le worker sait qu'une version attend ;
 * personne ne le disait.
 *
 * ## Le rechargement n'est armé que par nous
 *
 * `public/sw.js` appelle `clients.claim()` à l'activation, ce qui déclenche
 * `controllerchange` **aussi à la toute première installation**, pour un
 * visiteur qui n'a jamais rien vu. Recharger sur cet événement seul ferait
 * sauter la page d'un inconnu sans raison — en plein formulaire d'inscription,
 * par exemple. Le drapeau `rechargementArme` n'est posé que par
 * {@link appliquerMiseAJour}, c'est-à-dire par un clic.
 */

type Snapshot = { readonly miseAJourDisponible: boolean };

const AUCUNE: Snapshot = { miseAJourDisponible: false };
const DISPONIBLE: Snapshot = { miseAJourDisponible: true };

/**
 * Instantané SSR, référentiellement stable.
 *
 * `useSyncExternalStore` exige que `getServerSnapshot()` rende toujours la même
 * référence, sinon React boucle. Même convention que le store de consentement.
 */
const SNAPSHOT_SERVEUR: Snapshot = AUCUNE;

let snapshot: Snapshot = AUCUNE;
let registrationCourante: ServiceWorkerRegistration | null = null;
let rechargementArme = false;
let dejaRecharge = false;
let reporte = false;
let minuteurRepli: number | null = null;

const abonnes = new Set<() => void>();

function prevenir(): void {
  abonnes.forEach((cb) => cb());
}

export function subscribe(cb: () => void): () => void {
  abonnes.add(cb);
  return () => {
    abonnes.delete(cb);
  };
}

export function getSnapshot(): Snapshot {
  return snapshot;
}

export function getServerSnapshot(): Snapshot {
  return SNAPSHOT_SERVEUR;
}

/**
 * Une nouvelle version attend. Appelé par l'enregistreur, jamais par l'interface.
 *
 * Sans effet si l'utilisateur a déjà répondu « Plus tard » : le bandeau est
 * masqué **pour la vie du document**, et un second signalement du même worker
 * ne doit pas le faire réapparaître.
 */
export function signalerMiseAJour(registration: ServiceWorkerRegistration): void {
  registrationCourante = registration;
  if (reporte) return;
  if (snapshot.miseAJourDisponible) return;
  snapshot = DISPONIBLE;
  prevenir();
}

/**
 * « Plus tard » — masque jusqu'au prochain chargement de document.
 *
 * Conséquence produit à connaître : en mode `standalone`, cela veut dire
 * « plus rien jusqu'au redémarrage à froid de l'application », et le
 * redémarrage à froid est précisément le geste que @thierry ne fait pas.
 * L'entrée « Recharger l'application » de la feuille « Plus » est la porte de
 * sortie ; c'est ce qui justifie qu'elle existe en plus de ce bandeau.
 */
export function reporterMiseAJour(): void {
  reporte = true;
  snapshot = AUCUNE;
  prevenir();
}

/**
 * L'utilisateur demande la mise à jour.
 *
 * Trois issues, dans cet ordre :
 *  1. rien n'attend (worker devenu redondant entre le rendu du bandeau et le
 *     clic) → on recharge tout de suite. Un bouton « Recharger » qui ne
 *     recharge pas EST la plainte d'origine ;
 *  2. un worker attend → on l'active et on attend `controllerchange` ;
 *  3. `controllerchange` n'arrive pas (quirk WebKit, worker redondant) → repli
 *     après deux secondes.
 */
export function appliquerMiseAJour(): void {
  const attente = registrationCourante?.waiting;
  if (!attente) {
    rechargerUneFois();
    return;
  }
  // Armé AVANT `postMessage` : l'activation peut être immédiate, et armer
  // après laisserait une fenêtre où `controllerchange` arrive non armé.
  rechargementArme = true;
  attente.postMessage({ type: 'SKIP_WAITING' });
  minuteurRepli = window.setTimeout(rechargerUneFois, 2000);
}

/** Branché sur `controllerchange` par l'enregistreur. */
export function surControllerChange(): void {
  if (!rechargementArme) return;
  if (minuteurRepli !== null) {
    // Sans cette annulation, un `controllerchange` rapide laisserait le repli
    // courir : le nouveau worker peut être encore `activating` à t+2 s, et le
    // rechargement repartirait alors sous l'ancien — le bandeau réapparaîtrait.
    window.clearTimeout(minuteurRepli);
    minuteurRepli = null;
  }
  rechargerUneFois();
}

function rechargerUneFois(): void {
  if (dejaRecharge) return;
  // `location.reload()` est asynchrone : le document survit quelques
  // millisecondes, pendant lesquelles un second appel est possible.
  dejaRecharge = true;
  reloadPage();
}

/** Réservé aux tests — l'état de module survit d'un cas à l'autre. */
export function __resetUpdateStoreForTests(): void {
  snapshot = AUCUNE;
  registrationCourante = null;
  rechargementArme = false;
  dejaRecharge = false;
  reporte = false;
  if (minuteurRepli !== null) {
    window.clearTimeout(minuteurRepli);
    minuteurRepli = null;
  }
  abonnes.clear();
}
