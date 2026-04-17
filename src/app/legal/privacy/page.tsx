import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Prose, ProseMeta } from '@/components/layout/Prose';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: `Politique de confidentialité de ${SITE.name} — hébergement UE, RGPD, droits des utilisateurs.`,
  alternates: { canonical: '/legal/privacy' },
};

const LAST_UPDATED = '16 avril 2026';
const VERSION = '1.0.0';

export default function PrivacyPage() {
  return (
    <>
      <Header variant="marketing" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Prose>
          <h1>Politique de confidentialité</h1>
          <ProseMeta>
            Version {VERSION} — dernière mise à jour : {LAST_UPDATED}
          </ProseMeta>

          <h2>1. Responsable de traitement</h2>
          <p>
            {SITE.name}, édité par Thierry Van Mele (Belgique). Contact :{' '}
            <a href="mailto:privacy@ankora.eu">privacy@ankora.eu</a>.
          </p>

          <h2>2. Données collectées</h2>
          <p>
            Ankora collecte uniquement les données strictement nécessaires à la fourniture du
            service :
          </p>
          <ul>
            <li>
              <strong>Identité</strong> : adresse email, nom d&apos;affichage (optionnel).
            </li>
            <li>
              <strong>Données financières saisies par toi</strong> : charges, dépenses, catégories,
              revenus déclarés, solde d&apos;épargne.
            </li>
            <li>
              <strong>Données techniques</strong> : adresse IP, user-agent (pour les logs de
              sécurité uniquement).
            </li>
            <li>
              <strong>Consentements</strong> : horodatage, version, portée (CGU, confidentialité,
              cookies).
            </li>
          </ul>
          <p>
            Ankora ne se connecte à aucune banque (pas d&apos;agrégation PSD2). Tu saisis toi-même
            tes charges et dépenses.
          </p>

          <h2>3. Bases légales (RGPD art. 6)</h2>
          <ul>
            <li>
              <strong>Contrat</strong> : fourniture du service (compte, données financières).
            </li>
            <li>
              <strong>Consentement</strong> : cookies analytics/marketing, newsletter.
            </li>
            <li>
              <strong>Obligation légale</strong> : logs de sécurité (conservation 12 mois).
            </li>
            <li>
              <strong>Intérêt légitime</strong> : prévention fraude, maintien de la sécurité.
            </li>
          </ul>

          <h2>4. Hébergement et sous-traitants</h2>
          <ul>
            <li>
              <strong>Supabase</strong> (base de données, auth) — région UE (Francfort ou Paris).
            </li>
            <li>
              <strong>Vercel</strong> (hébergement frontend) — région UE (Dublin).
            </li>
            <li>
              <strong>Upstash</strong> (rate limiting) — région UE.
            </li>
          </ul>
          <p>Aucune donnée n&apos;est transférée hors UE/EEE.</p>

          <h2>5. Durée de conservation</h2>
          <ul>
            <li>Compte actif : tant que tu utilises le service.</li>
            <li>
              Compte supprimé : suppression effective 30 jours après ta demande (grace period
              annulable).
            </li>
            <li>Logs de sécurité : 12 mois maximum, pseudonymisés après suppression du compte.</li>
          </ul>

          <h2>6. Tes droits (RGPD art. 15-22)</h2>
          <ul>
            <li>
              <strong>Accès</strong> : consulte tes données à tout moment dans ton espace.
            </li>
            <li>
              <strong>Rectification</strong> : modifie profil et données dans les pages dédiées.
            </li>
            <li>
              <strong>Effacement</strong> : bouton « Supprimer mon compte » dans Paramètres →
              Confidentialité.
            </li>
            <li>
              <strong>Portabilité</strong> : bouton « Télécharger mes données » — export JSON
              complet.
            </li>
            <li>
              <strong>Opposition / Restriction</strong> : refuse ou retire les cookies non
              essentiels à tout moment.
            </li>
            <li>
              <strong>Plainte</strong> : auprès de l&apos;
              <a href="https://www.autoriteprotectiondonnees.be/" rel="noopener">
                Autorité de protection des données
              </a>{' '}
              (Belgique).
            </li>
          </ul>

          <h2>7. Sécurité</h2>
          <ul>
            <li>Chiffrement en transit (TLS 1.3) et au repos.</li>
            <li>Row Level Security Supabase sur toutes les tables.</li>
            <li>Rate limiting, CSP stricte, audit log append-only.</li>
            <li>Authentification par mot de passe fort + MFA disponible.</li>
          </ul>

          <h2>8. Cookies</h2>
          <p>
            Voir la <a href="/legal/cookies">politique cookies</a>.
          </p>

          <h2>9. Modifications</h2>
          <p>
            Toute modification matérielle de cette politique est notifiée par email et nécessite ton
            consentement renouvelé pour continuer à utiliser le service.
          </p>
        </Prose>
      </main>
      <Footer />
    </>
  );
}
