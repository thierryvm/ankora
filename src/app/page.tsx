import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowRight, Shield, TrendingUp, Wallet } from 'lucide-react';

import { SITE } from '@/lib/site';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
};

const FEATURES = [
  {
    icon: TrendingUp,
    title: 'Lissage automatique',
    body: "Tes factures annuelles ou trimestrielles réparties sur 12 mois. Plus jamais de mauvaise surprise en fin d'année.",
  },
  {
    icon: Wallet,
    title: 'Assistant virements',
    body: 'Chaque mois, Ankora te dit exactement combien virer vers ton épargne — et combien garder sur ton courant pour les factures du mois.',
  },
  {
    icon: Shield,
    title: 'Isolé et sécurisé',
    body: 'Tes données ne sortent pas de ton espace privé. Chiffrement, RLS et audit logs par défaut. Hébergement UE.',
  },
] as const;

const STEPS = [
  {
    n: '01',
    title: 'Renseigne tes charges',
    body: 'Loyer, assurances, abonnements… classés par catégorie et fréquence.',
  },
  {
    n: '02',
    title: 'Ankora lisse',
    body: 'Chaque facture annuelle est répartie sur les 12 mois pour calculer ta provision idéale.',
  },
  {
    n: '03',
    title: 'Pilote ton mois',
    body: 'Le cockpit te dit combien virer, combien garder, et si tu es en avance ou en retard sur tes provisions.',
  },
] as const;

const FAQ = [
  {
    q: 'Ankora est-il un outil de conseil financier ?',
    a: "Non. Ankora est un outil d'organisation et d'éducation budgétaire. Il ne fournit pas de recommandations de placement ni de conseil financier personnalisé.",
  },
  {
    q: 'Où sont stockées mes données ?',
    a: 'Tes données sont hébergées en Union européenne (Supabase, région UE) avec chiffrement au repos et isolation stricte par utilisateur via Row Level Security.',
  },
  {
    q: 'Est-ce que je peux partager mes données ?',
    a: 'Par défaut, ton espace est 100 % privé. Des pots partagés optionnels (voyage, projet commun) arriveront dans une prochaine version — tu choisiras explicitement ce que tu partages, et avec qui.',
  },
] as const;

export default async function HomePage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    description: SITE.description,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web, iOS, Android',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    inLanguage: 'fr-BE',
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <>
      <Script id="ld-software" type="application/ld+json" nonce={nonce}>
        {JSON.stringify(softwareJsonLd)}
      </Script>
      <Script id="ld-faq" type="application/ld+json" nonce={nonce}>
        {JSON.stringify(faqJsonLd)}
      </Script>

      <Header />

      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 md:px-6 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-card) px-3 py-1 text-xs font-medium text-(--color-brand-700)">
              <span className="inline-block h-2 w-2 rounded-full bg-(--color-brand-500)" />
              En construction · lancement 2026
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-balance text-(--color-foreground) md:text-6xl">
              {SITE.tagline}.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-(--color-muted-foreground)">
              {SITE.description}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  Créer mon cockpit
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="#features">Découvrir</Link>
              </Button>
            </div>
          </div>
        </section>

        <section
          id="features"
          aria-labelledby="features-heading"
          className="mx-auto max-w-6xl px-4 py-16 md:px-6"
        >
          <h2 id="features-heading" className="mb-12 text-center text-3xl font-bold tracking-tight">
            Trois piliers, zéro angoisse
          </h2>
          <ul className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-xl border border-(--color-border) bg-(--color-card) p-6"
              >
                <f.icon
                  className="mb-4 h-8 w-8 text-(--color-brand-700)"
                  aria-hidden
                  strokeWidth={1.75}
                />
                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                <p className="text-sm text-(--color-muted-foreground)">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <h2 id="how-heading" className="mb-12 text-center text-3xl font-bold tracking-tight">
            Comment ça marche
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="rounded-xl border border-(--color-border) bg-(--color-card) p-6"
              >
                <div className="mb-4 font-mono text-sm font-bold text-(--color-accent-600)">
                  {s.n}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
                <p className="text-sm text-(--color-muted-foreground)">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="faq"
          aria-labelledby="faq-heading"
          className="mx-auto max-w-3xl px-4 py-16 md:px-6"
        >
          <h2 id="faq-heading" className="mb-8 text-center text-3xl font-bold tracking-tight">
            Questions fréquentes
          </h2>
          <dl className="space-y-4">
            {FAQ.map((item) => (
              <div
                key={item.q}
                className="rounded-xl border border-(--color-border) bg-(--color-card) p-6"
              >
                <dt className="mb-2 font-semibold">{item.q}</dt>
                <dd className="text-sm text-(--color-muted-foreground)">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <Footer />
    </>
  );
}
