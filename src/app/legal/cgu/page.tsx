import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Prose, ProseMeta } from '@/components/layout/Prose';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description: `CGU de ${SITE.name} — règles d'utilisation du service.`,
  alternates: { canonical: '/legal/cgu' },
};

const LAST_UPDATED = '16 avril 2026';
const VERSION = '1.0.0';

export default function CguPage() {
  return (
    <>
      <Header variant="marketing" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Prose>
          <h1>Conditions générales d&apos;utilisation</h1>
          <ProseMeta>
            Version {VERSION} — dernière mise à jour : {LAST_UPDATED}
          </ProseMeta>

          <h2>1. Objet</h2>
          <p>
            {SITE.name} est un outil d&apos;organisation budgétaire et d&apos;éducation financière
            destiné aux particuliers. Il permet de saisir manuellement ses charges et dépenses, de
            les lisser sur l&apos;année, et d&apos;anticiper les besoins de trésorerie.
          </p>

          <h2>2. Ce que {SITE.name} n&apos;est PAS</h2>
          <ul>
            <li>
              {SITE.name} n&apos;est <strong>pas un service de conseil en placement</strong> ni en
              investissement.
            </li>
            <li>
              {SITE.name} n&apos;est <strong>pas un service bancaire</strong> et ne détient aucun
              fonds.
            </li>
            <li>
              {SITE.name} n&apos;est <strong>pas un agrégateur PSD2</strong> — aucune connexion à
              tes comptes bancaires.
            </li>
            <li>
              {SITE.name} n&apos;est{' '}
              <strong>pas un logiciel de comptabilité professionnelle</strong>.
            </li>
          </ul>
          <p>
            Les informations affichées sont des estimations basées sur tes saisies. Elles ne
            constituent pas un conseil financier personnalisé. Pour toute décision importante,
            consulte un professionnel agréé.
          </p>

          <h2>3. Compte</h2>
          <ul>
            <li>Tu dois être majeur ou avoir l&apos;autorisation d&apos;un représentant légal.</li>
            <li>Un seul compte par personne physique.</li>
            <li>Mot de passe minimum 12 caractères, mixte.</li>
            <li>Tu es responsable de la confidentialité de tes identifiants.</li>
          </ul>

          <h2>4. Usage acceptable</h2>
          <p>Tu t&apos;engages à ne pas :</p>
          <ul>
            <li>utiliser le service à des fins illégales,</li>
            <li>tenter de contourner les mesures de sécurité,</li>
            <li>automatiser l&apos;accès sans autorisation explicite,</li>
            <li>partager ton compte avec un tiers.</li>
          </ul>

          <h2>5. Propriété intellectuelle</h2>
          <p>
            Tu restes propriétaire de tes données. {SITE.name} conserve la propriété de son code,
            marque, design et documentation.
          </p>

          <h2>6. Responsabilité</h2>
          <p>
            {SITE.name} est fourni « tel quel ». L&apos;éditeur ne saurait être tenu responsable des
            décisions financières prises sur base des informations affichées. Aucune garantie de
            disponibilité à 100%.
          </p>

          <h2>7. Résiliation</h2>
          <p>
            Tu peux supprimer ton compte à tout moment depuis Paramètres → Confidentialité. La
            suppression est effective 30 jours après la demande (période annulable).
          </p>

          <h2>8. Droit applicable</h2>
          <p>Ces CGU sont soumises au droit belge. Tribunal compétent : Bruxelles.</p>
        </Prose>
      </main>
      <Footer />
    </>
  );
}
