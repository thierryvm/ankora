import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Prose, ProseMeta } from '@/components/layout/Prose';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Politique cookies',
  description: `Politique cookies de ${SITE.name} — granularité totale, tout refusable sauf essentiels.`,
  alternates: { canonical: '/legal/cookies' },
};

const LAST_UPDATED = '16 avril 2026';

export default function CookiesPage() {
  return (
    <>
      <Header variant="marketing" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Prose>
          <h1>Politique cookies</h1>
          <ProseMeta>Dernière mise à jour : {LAST_UPDATED}</ProseMeta>

          <h2>Catégories</h2>

          <h3>Essentiels (toujours actifs)</h3>
          <p>
            Indispensables au fonctionnement : session d&apos;authentification, préférence de thème,
            anti-CSRF.
          </p>
          <ul>
            <li>
              <code>sb-*</code> — session Supabase (auth)
            </li>
            <li>
              <code>ankora-theme</code> — préférence claire/sombre
            </li>
          </ul>

          <h3>Analytics (désactivés par défaut)</h3>
          <p>
            Uniquement si tu donnes ton consentement. Mesure d&apos;usage agrégée, sans identifiant
            personnel.
          </p>
          <p>
            Ankora n&apos;utilise pas Google Analytics. Les métriques Vercel sont agrégées et
            anonymisées.
          </p>

          <h3>Marketing (désactivés par défaut)</h3>
          <p>Ankora n&apos;utilise actuellement aucun cookie marketing.</p>

          <h2>Gérer tes préférences</h2>
          <p>
            Tu peux modifier tes consentements à tout moment dans{' '}
            <strong>Paramètres → Confidentialité</strong> ou en cliquant sur « Gérer les cookies »
            dans le pied de page.
          </p>
          <p>
            Refuser les cookies non essentiels ne dégrade pas l&apos;expérience : {SITE.name} reste
            entièrement fonctionnel.
          </p>

          <h2>Durée de vie</h2>
          <ul>
            <li>Session : fin de navigation</li>
            <li>Préférences : 12 mois</li>
            <li>Analytics : 6 mois (si acceptés)</li>
          </ul>
        </Prose>
      </main>
      <Footer />
    </>
  );
}
