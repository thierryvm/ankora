import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AppRail } from '@/components/layout/AppRail';
import { requireUser } from '@/lib/auth/require-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // `requireUser()` already runs the (cookie-deduped) Supabase session lookup
  // and the redirect guard. Capture its User so the Header's AccountButton can
  // show the signed-in identity without a second round-trip (PR-A).
  const user = await requireUser();
  // PR-BETA-6 Hotfix Option A v3 (THI-277, 2026-05-25): the BottomTabBar is
  // now mounted ONCE at the locale root `src/app/[locale]/layout.tsx` so it
  // stays mounted across in-app navigation (cockpit → admin → faq → legal).
  // The mount + isAdmin gating both live there; this layout only needs to
  // keep the cockpit chrome (Header, breadcrumbs, footer) and the bottom
  // padding that reserves space below the bar. That reserve now releases at
  // `lg:` rather than `md:` (2026-08-02): the bar hides at 1024px, so releasing
  // it at 768px put the last section of every page behind the bar for the
  // whole 768–1023 band.
  return (
    <>
      {/* AppBreadcrumbs removed (@thierry 2026-07-19): with the header nav
          already marking the active page, the breadcrumb bar read as a
          confusing "double menu" on every app page. The public glossary keeps
          its own breadcrumb (deep SEO pages, different context). */}
      {/* Socle v3 (lot 1) : le rail a gauche a partir de 1024, la barre basse
          en dessous. Les deux ne coexistent jamais — la spec de coquille
          mesure « exactement une surface de navigation » a chaque largeur,
          parce que l'ancienne spec n'assertait qu'« au moins une » et
          n'aurait donc pas vu la superposition.

          Le pied de page vit DANS la colonne de droite, avec <main>, et non
          apres la rangee. Un element collant ne sort pas de son parent : avec le
          pied de page hors de la rangee, le parent du rail se terminait avant lui
          et, des que le pied entrait dans l'ecran, remontait en poussant le rail
          sous l'en-tete de la hauteur du pied (defaut du 21 septembre 2026, mesure
          en production). La rangee couvre maintenant toute la page : le rail reste
          colle jusqu'au dernier pixel.

          La coquille a aussi la hauteur de l'ecran (un minimum, jamais un
          maximum) : <main> prend la place libre (flex-1), donc sur une page
          courte le pied de page se pose en bas au lieu de flotter sous le contenu.

          La reserve de la barre basse est ICI, sous le pied de page, et non dans
          <main> ni dans le pied de page : c'est la derniere chose de la page qui
          doit rester atteignable. Sa hauteur est celle de la barre — sa hauteur
          de jeton, la bordure haute de 1 px, la zone de securite — et elle
          disparait des 1024, la ou la barre disparait.

          La colonne porte min-w-0 : un enfant flex ne descend jamais sous la
          largeur minimale de son contenu, donc sans elle une liste large (les
          factures) elargissait la colonne au-dela de l'ecran (470 px dans 375),
          et le corps, qui rogne, coupait le texte sans qu'aucune barre ne le dise. */}
      <div className="flex min-h-svh flex-col">
        <Header variant="app" isAuthenticated userEmail={user.email ?? null} />
        <div className="flex w-full flex-1">
          <AppRail />
          <div className="flex min-w-0 flex-1 flex-col pb-[calc(var(--size-tabbar)+1px+env(safe-area-inset-bottom))] lg:pb-[env(safe-area-inset-bottom)]">
            <main
              id="main"
              className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-12 md:px-6 md:pt-12"
            >
              {children}
            </main>
            <Footer reserveBottomBar={false} />
          </div>
        </div>
      </div>
    </>
  );
}
