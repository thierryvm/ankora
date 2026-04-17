import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Questions fréquentes sur Ankora : sécurité, données, fonctionnement, confidentialité.',
  alternates: { canonical: '/faq' },
};

const questions = [
  {
    q: "Est-ce qu'Ankora se connecte à ma banque ?",
    a: "Non. Ankora n'utilise pas la directive PSD2. Tu saisis manuellement tes charges et dépenses. Ce choix garantit que tu restes propriétaire de tes données et qu'aucune information bancaire sensible n'est stockée.",
  },
  {
    q: 'Où sont hébergées mes données ?',
    a: "Toutes tes données sont hébergées dans l'Union européenne (Supabase région UE, Vercel région UE, Upstash UE). Aucun transfert hors UE n'est effectué.",
  },
  {
    q: 'Comment fonctionne le lissage ?',
    a: 'Ankora prend tes charges trimestrielles, semestrielles et annuelles et les répartit sur 12 mois. Tu sais ainsi combien mettre de côté chaque mois pour couvrir toutes tes futures factures sans stress.',
  },
  {
    q: 'Puis-je supprimer mon compte ?',
    a: 'Oui, à tout moment depuis Paramètres → Confidentialité. La suppression prend effet 30 jours après ta demande (tu peux annuler pendant cette période). Toutes tes données financières sont effacées, les logs de sécurité sont pseudonymisés.',
  },
  {
    q: 'Puis-je exporter mes données ?',
    a: "Oui. Le bouton « Télécharger mes données » dans Paramètres te fournit un fichier JSON complet de tout ce qu'Ankora détient sur toi. Conforme au droit de portabilité RGPD (art. 20).",
  },
  {
    q: "Est-ce qu'Ankora donne des conseils financiers ?",
    a: "Non. Ankora est un outil d'éducation budgétaire et d'organisation. Nous n'émettons aucun conseil en placement (contrainte réglementaire FSMA Belgique). Pour toute décision d'investissement, consulte un professionnel agréé.",
  },
  {
    q: "Y a-t-il de l'intelligence artificielle ?",
    a: 'En Phase 1, non. Les calculs sont déterministes et auditables. En Phase 2, une couche optionnelle BYOK (Bring Your Own Key) te permettra de connecter ta propre clé Anthropic ou OpenRouter pour des suggestions — aucun surcoût côté Ankora.',
  },
  {
    q: 'Puis-je partager mon espace avec mes enfants ou mes amis ?',
    a: 'En Phase 1, chaque utilisateur a un espace privé, isolé par défaut. En Phase 2, nous ajouterons la possibilité de créer des « pots partagés » (par invitation, avec rôles viewer/editor) sans jamais mélanger tes données personnelles.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: questions.map((q) => ({
    '@type': 'Question',
    name: q.q,
    acceptedAnswer: { '@type': 'Answer', text: q.a },
  })),
};

export default function FaqPage() {
  return (
    <>
      <Header variant="marketing" />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <header>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Questions fréquentes</h1>
          <p className="mt-3 text-(--color-muted-foreground)">
            Tout ce qu&apos;il faut savoir sur {SITE.name} avant de se lancer.
          </p>
        </header>

        <dl className="mt-10 space-y-8">
          {questions.map((item) => (
            <div
              key={item.q}
              className="border-t border-(--color-border) pt-6 first:border-t-0 first:pt-0"
            >
              <dt className="text-lg font-semibold text-(--color-foreground) md:text-xl">
                {item.q}
              </dt>
              <dd className="mt-2 leading-relaxed text-(--color-muted-foreground)">{item.a}</dd>
            </div>
          ))}
        </dl>

        <JsonLd data={faqJsonLd} />
      </main>
      <Footer />
    </>
  );
}
