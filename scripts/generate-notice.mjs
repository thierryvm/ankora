// Pas de ligne shebang : ce fichier est aussi importé par sa spec, et le
// transformeur de Vitest hisse les imports au-dessus d'elle, ce qui produit une
// erreur de syntaxe. Il se lance par `npm run notice`, jamais en exécutable.
/**
 * Régénère l'inventaire des dépendances tierces du fichier `NOTICE`.
 *
 * ## Pourquoi ce script existe
 *
 * `NOTICE` était tenu à la main. Relevé le 2026-08-05 : trois licences fausses
 * (dont deux paquets annoncés « Proprietary » qui sont MIT et Apache-2.0), cinq
 * versions périmées, deux dépendances de production absentes, une dépendance de
 * développement rangée en production, et une affirmation de conformité qui se
 * contredisait elle-même à 158 lignes d'écart — « ISC est dev-only » quand le
 * même fichier liste `lucide-react` ISC en production.
 *
 * Un fichier tenu à la main dérive. C'est la cause, pas les écarts.
 *
 * ## Pourquoi `package-lock.json` SEUL, et jamais `node_modules`
 *
 * Trois raisons, chacune mesurée :
 *
 * 1. **`node_modules` dépend de la plateforme.** Le lock porte 300 entrées
 *    `os`/`optional`. `@next/swc-win32-x64-msvc` n'existe que sur une machine
 *    Windows, `@next/swc-linux-x64-gnu` que sur le runner CI. Un générateur qui
 *    lit le disque produirait deux fichiers différents, et le test de
 *    non-régression rougirait au premier push.
 * 2. **`node_modules` est aveugle aux doublons imbriqués.** Le lock contient 151
 *    entrées `node_modules/x/node_modules/y`. Cas réel : `intl-messageformat`
 *    existe deux fois — la copie hissée est en **développement**, la copie de
 *    production vit sous `node_modules/use-intl/node_modules/`. Un index par NOM
 *    lit la mauvaise. L'audit manuel qui a motivé ce script s'est fait prendre
 *    exactement là. D'où l'indexation par **chemin**.
 * 3. **`node_modules` n'est pas committé.** Le lock l'est. Le test devient une
 *    fonction pure de deux fichiers versionnés — hermétique, sans installation.
 *
 * ## La règle de partage production / développement
 *
 * On ne se fie PAS aux drapeaux `dev` / `devOptional` du lockfile : ils se
 * contredisent, et la contradiction est démontrée dans le commentaire de
 * `atteignablesEnProduction`. On parcourt le graphe depuis les dépendances de
 * production déclarées, arêtes optionnelles comprises.
 *
 * Pour un document d'**attribution**, prudent veut dire inclure davantage,
 * jamais moins.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const BEGIN_MARKER = '<!-- NOTICE:BEGIN GENERATED -->';
export const END_MARKER = '<!-- NOTICE:END GENERATED -->';

/**
 * Deux familles, deux traitements — parce que leur DÉCLENCHEUR diffère.
 *
 * `BLOQUANTES` se déclenchent sur l'**usage en réseau**. Ankora est un service
 * hébergé : ces licences s'appliqueraient donc pleinement, et une seule en
 * production suffit à faire échouer le script. On refuse de produire le fichier
 * plutôt que d'écrire une phrase rassurante.
 *
 * `A_DECLARER` se déclenchent sur la **distribution** d'une copie du logiciel.
 * Ankora n'en distribue aucune — personne ne reçoit de binaire. Elles ne sont
 * donc pas un défaut ici, mais elles ne sont pas rien : elles sont **nommées**
 * dans le fichier, avec leur chemin, pour que la question reste visible si le
 * modèle de distribution change un jour (application native, export, licence
 * sur site).
 *
 * Le NOTICE d'avant faisait l'inverse : il affirmait « aucune licence copyleft »
 * sans distinguer les deux déclencheurs, et se trompait dans les deux sens.
 */
const BLOQUANTES = ['AGPL', 'SSPL'];
const A_DECLARER = ['GPL', 'LGPL', 'MPL', 'EPL', 'CDDL', 'EUPL'];

/**
 * Licences dont l'obligation d'attribution vise le paquet nommément, et non la
 * seule mention du texte de licence. Elles sortent de l'agrégat.
 */
const ATTRIBUTION_NOMINATIVE = ['CC-BY-4.0', 'CC-BY-3.0'];

const porte = (licence, familles) =>
  familles.some((c) => new RegExp(`(^|[^A-Za-z])${c}([^A-Za-z]|$)`).test(licence));

// « AGPL » contient « GPL ». L'ordre compte : on teste les bloquantes d'abord,
// et A_DECLARER exclut ce qui a déjà été classé bloquant.
const estBloquante = (licence) => porte(licence, BLOQUANTES);
const estADeclarer = (licence) => !estBloquante(licence) && porte(licence, A_DECLARER);

/** Nom du paquet à partir de son chemin d'entrée — le dernier segment `node_modules/`. */
export function nomDepuisChemin(chemin) {
  const i = chemin.lastIndexOf('node_modules/');
  return chemin.slice(i + 'node_modules/'.length);
}

/**
 * Résolution npm : pour une dépendance `nom` demandée depuis `depuis`, on
 * remonte les `node_modules` imbriqués du plus proche au plus lointain.
 * C'est ce qui distingue les DEUX copies d'un même paquet — le cas
 * `intl-messageformat`, dont la copie hissée est de développement et la copie
 * de production vit sous `node_modules/use-intl/node_modules/`.
 */
function resoudre(lock, depuis, nom) {
  let base = depuis;
  for (;;) {
    const candidat = base === '' ? `node_modules/${nom}` : `${base}/node_modules/${nom}`;
    if (lock.packages[candidat]) return candidat;
    const i = base.lastIndexOf('/node_modules/');
    if (i === -1) {
      if (base === '') return null;
      base = '';
      continue;
    }
    base = base.slice(0, i);
  }
}

/**
 * Ce qui est réellement ATTEIGNABLE depuis les dépendances de production.
 *
 * ## Pourquoi ne pas se fier aux drapeaux `dev` du lockfile
 *
 * Parce qu'ils se contredisent, et mesurément. `sharp` porte
 * `devOptional: true` — atteignable en production, puisque `next` le déclare
 * dans ses `optionalDependencies` et que Vercel installe avec `--omit=dev`.
 * Mais son binaire natif `@img/sharp-linux-x64`, dont `sharp` dépend, porte
 * `dev: true`. La propagation de npm s'arrête un cran trop tôt sur les arêtes
 * optionnelles.
 *
 * Conséquence si on les croit : le NOTICE affirmerait « aucune licence à
 * réciprocité en production » alors que `@img/sharp-libvips-*`, en
 * LGPL-3.0-or-later, peut être déployé. Une fausse assurance dans un document
 * de conformité — exactement le défaut que ce script existe pour supprimer.
 *
 * On parcourt donc le graphe nous-mêmes, arêtes optionnelles comprises. Les
 * `peerDependencies` ne sont pas suivies : c'est le parent qui les fournit, et
 * elles apparaissent alors comme ses propres dépendances.
 */
export function atteignablesEnProduction(lock, pkgJson) {
  const racines = Object.keys(pkgJson.dependencies ?? {});
  const vus = new Set();
  const pile = racines.map((nom) => ({ nom, depuis: '' }));
  while (pile.length > 0) {
    const { nom, depuis } = pile.pop();
    const chemin = resoudre(lock, depuis, nom);
    if (!chemin || vus.has(chemin)) continue;
    vus.add(chemin);
    const pkg = lock.packages[chemin];
    const enfants = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
    for (const enfant of Object.keys(enfants)) pile.push({ nom: enfant, depuis: chemin });
  }
  return vus;
}

/**
 * Inventaire de production, indexé par chemin.
 *
 * Lève si une entrée atteignable n'a pas de champ `license` : mieux vaut un
 * échec bruyant qu'un `undefined` écrit dans un document juridique.
 */
export function inventaireProduction(lock, pkgJson) {
  const atteignables = atteignablesEnProduction(lock, pkgJson);
  const out = [];
  for (const chemin of atteignables) {
    const pkg = lock.packages[chemin];
    if (pkg.link === true) continue;
    if (!pkg.license) {
      throw new Error(
        `NOTICE: l'entrée de production « ${chemin} » n'a pas de champ "license" dans ` +
          `package-lock.json. Le NOTICE ne peut pas être généré sans elle.`,
      );
    }
    out.push({ chemin, nom: nomDepuisChemin(chemin), version: pkg.version, licence: pkg.license });
  }
  return out.sort((a, b) => a.nom.localeCompare(b.nom) || a.chemin.localeCompare(b.chemin));
}

/** Dépendances directes déclarées dans `package.json`, production puis développement. */
function directes(pkgJson) {
  return {
    prod: Object.keys(pkgJson.dependencies ?? {}).sort(),
    dev: Object.keys(pkgJson.devDependencies ?? {}).sort(),
  };
}

/**
 * Le corps généré. Fonction pure : deux objets JSON en entrée, une chaîne en
 * sortie. C'est ce qui rend le test hermétique.
 */
export function corpsGenere(lock, pkgJson) {
  const inventaire = inventaireProduction(lock, pkgJson);

  const bloquantes = inventaire.filter((p) => estBloquante(p.licence));
  if (bloquantes.length > 0) {
    throw new Error(
      `NOTICE: licence à déclencheur RÉSEAU en production — ` +
        bloquantes.map((p) => `${p.chemin} (${p.licence})`).join(', ') +
        `. Ankora est un service hébergé : cette licence s'appliquerait pleinement.`,
    );
  }
  const aDeclarer = inventaire.filter((p) => estADeclarer(p.licence));

  const { prod, dev } = directes(pkgJson);
  const parNom = new Map();
  for (const p of inventaire) if (!parNom.has(p.nom)) parNom.set(p.nom, p);

  const lignes = [];
  lignes.push(BEGIN_MARKER);
  lignes.push('');
  lignes.push(
    '> Cette section est **générée** depuis `package-lock.json` par `npm run notice`.',
    "> Ne pas l'éditer à la main : la prochaine génération écraserait la correction.",
    '> Tout ce qui est hors des deux marqueurs est écrit à la main et préservé.',
  );
  lignes.push('');
  lignes.push('## Dépendances de production (directes)');
  lignes.push('');
  lignes.push('| Paquet | Version | Licence |');
  lignes.push('| --- | --- | --- |');
  for (const nom of prod) {
    const p = parNom.get(nom);
    lignes.push(p ? `| \`${nom}\` | ${p.version} | ${p.licence} |` : `| \`${nom}\` | — | — |`);
  }
  lignes.push('');

  // Agrégat par licence. Ankora est un service hébergé : aucune copie du
  // logiciel n'est remise aux utilisateurs, donc le déclencheur de
  // redistribution MIT/BSD/Apache n'est pas franchi. L'agrégat suffit, à
  // condition de nommer individuellement les attributions nominatives.
  const agregat = new Map();
  for (const p of inventaire) {
    if (ATTRIBUTION_NOMINATIVE.includes(p.licence)) continue;
    agregat.set(p.licence, (agregat.get(p.licence) ?? 0) + 1);
  }
  lignes.push("## Licences de l'arbre de production complet");
  lignes.push('');
  lignes.push(
    `Arbre complet : **${inventaire.length}** paquets, transitives comprises. ` +
      "Ankora est un service hébergé — aucune copie du logiciel n'est remise aux " +
      "personnes qui l'utilisent, donc l'obligation de redistribution des licences " +
      "permissives n'est pas déclenchée. Le décompte par licence suffit ; les " +
      'attributions nominatives sont listées séparément ci-dessous.',
  );
  lignes.push('');
  lignes.push('| Licence | Paquets |');
  lignes.push('| --- | --- |');
  for (const [lic, n] of [...agregat].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lignes.push(`| ${lic} | ${n} |`);
  }
  lignes.push('');

  const nominatives = inventaire.filter((p) => ATTRIBUTION_NOMINATIVE.includes(p.licence));
  lignes.push('## Attributions nominatives');
  lignes.push('');
  if (nominatives.length === 0) {
    lignes.push('_Aucune dépendance de production ne porte de licence à attribution nominative._');
  } else {
    lignes.push(
      'Ces licences exigent que le paquet soit nommé, et non seulement son texte de licence reproduit.',
      '',
      '| Paquet | Version | Licence |',
      '| --- | --- | --- |',
    );
    for (const p of nominatives) lignes.push(`| \`${p.nom}\` | ${p.version} | ${p.licence} |`);
  }
  lignes.push('');

  lignes.push('## Conformité');
  lignes.push('');
  lignes.push(
    "Vérifié à chaque génération sur l'arbre de production **réellement atteignable**, " +
      'et non sur les drapeaux du lockfile.',
    '',
    `**Licences à déclencheur réseau** (${BLOQUANTES.join(', ')}) : aucune. ` +
      "Ce sont les seules qui s'appliqueraient pleinement à un service hébergé ; " +
      "le script échoue plutôt que d'écrire cette phrase si ce n'est pas vrai.",
  );
  lignes.push('');
  if (aDeclarer.length === 0) {
    lignes.push(
      `**Licences à déclencheur de distribution** (${A_DECLARER.join(', ')}) : aucune non plus.`,
    );
  } else {
    const parLicence = new Map();
    for (const p of aDeclarer) {
      const l = parLicence.get(p.licence) ?? [];
      l.push(p.nom);
      parLicence.set(p.licence, l);
    }
    lignes.push(
      `**Licences à déclencheur de distribution** (${A_DECLARER.join(', ')}) : présentes, ` +
        'et nommées ici plutôt que tues.',
      '',
      "Elles se déclenchent quand une COPIE du logiciel est remise à quelqu'un. Ankora " +
        'est un service hébergé : personne ne reçoit de binaire, le déclencheur ' +
        "n'est donc pas franchi à ce jour. Ce constat cesserait de valoir si Ankora " +
        'était un jour distribué — application native, export, installation sur site.',
      '',
      '| Licence | Paquets |',
      '| --- | --- |',
    );
    for (const [lic, noms] of [...parLicence].sort((a, b) => a[0].localeCompare(b[0]))) {
      const uniques = [...new Set(noms)].sort();
      const affiches =
        uniques.length > 6 ? `${uniques.slice(0, 6).join(', ')}, …` : uniques.join(', ');
      lignes.push(`| ${lic} | ${uniques.length} — ${affiches} |`);
    }
  }
  lignes.push('');
  lignes.push('## Outils de développement (directs)');
  lignes.push('');
  lignes.push('| Paquet | Version | Licence |');
  lignes.push('| --- | --- | --- |');
  const devParNom = new Map();
  for (const [chemin, p] of Object.entries(lock.packages ?? {})) {
    if (!chemin.startsWith('node_modules/') || !p.license) continue;
    const nom = nomDepuisChemin(chemin);
    if (!devParNom.has(nom)) devParNom.set(nom, p);
  }
  for (const nom of dev) {
    const p = devParNom.get(nom);
    lignes.push(p ? `| \`${nom}\` | ${p.version} | ${p.license} |` : `| \`${nom}\` | — | — |`);
  }
  lignes.push('');
  lignes.push(END_MARKER);
  return lignes.join('\n');
}

/**
 * Remplace la région générée dans un NOTICE existant.
 *
 * Échoue si les marqueurs manquent ou ne sont pas uniques : un second couple
 * collé par erreur ferait ne régénérer que le premier bloc, et le fichier
 * porterait deux inventaires dont un périmé, sans que rien ne le signale.
 */
export function remplacerRegion(noticeExistant, corps) {
  const nbDebut = noticeExistant.split(BEGIN_MARKER).length - 1;
  const nbFin = noticeExistant.split(END_MARKER).length - 1;
  if (nbDebut !== 1 || nbFin !== 1) {
    throw new Error(
      `NOTICE: marqueurs attendus une seule fois chacun, trouvés ${nbDebut} début / ${nbFin} fin. ` +
        'Le fichier ne sera pas écrit.',
    );
  }
  const debut = noticeExistant.indexOf(BEGIN_MARKER);
  const fin = noticeExistant.indexOf(END_MARKER) + END_MARKER.length;
  if (fin < debut) throw new Error('NOTICE: marqueur de fin avant le marqueur de début.');
  return noticeExistant.slice(0, debut) + corps + noticeExistant.slice(fin);
}

function main() {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const pkgJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const chemin = join(ROOT, 'NOTICE');
  const avant = readFileSync(chemin, 'utf8');
  const apres = remplacerRegion(avant, corpsGenere(lock, pkgJson));
  writeFileSync(chemin, apres, 'utf8');
  console.log(apres === avant ? 'NOTICE inchangé.' : 'NOTICE régénéré.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
