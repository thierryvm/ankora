import { ScrollToTopSlot } from '@/components/layout/bottom-tab-bar-visibility';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  // PR-BETA-6 hotfix #4 (THI-277, 2026-05-25, @thierry iPhone smoke) : le bouton
  // « haut de page » se cachait derrière la barre d'onglets sur iPhone Safari,
  // pour un visiteur authentifié sur `/faq`, `/legal/*`, `/glossaire`.
  //
  // Ce layout de GROUPE n'est pas re-rendu sur `/` → `/faq` par clic — `/` vit
  // dans le même groupe. Son ancienne décision serveur était donc figée
  // exactement comme celle de la racine, et le bouton se serait retrouvé sous
  // une barre montée : le hotfix #4 rejoué. L'emplacement lit maintenant le
  // contexte, réévalué à chaque navigation.
  return (
    <>
      {children}
      <ScrollToTopSlot />
    </>
  );
}
