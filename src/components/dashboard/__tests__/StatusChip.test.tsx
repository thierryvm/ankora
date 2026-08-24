import { render, screen } from '@testing-library/react';
import { Wallet } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { StatusChip, type StatusTone } from '../StatusChip';

/**
 * La puce d'état, tenue à la seule chose qu'elle promet : **la couleur n'est
 * jamais seule**.
 *
 * L'assertion qui compte n'est pas « une icône est présente » — un composant
 * qui rendrait la même icône partout la passerait, en n'apportant aucune
 * information à qui ne distingue pas les teintes. C'est « les tons porteurs
 * d'alarme rendent des icônes DIFFÉRENTES ».
 */

const ALARMES: StatusTone[] = ['success', 'warning', 'danger'];

const glyphe = () => screen.getByTestId('status-chip').querySelector('svg')?.getAttribute('class');

describe('StatusChip — la couleur n’est jamais seule', () => {
  it.each(ALARMES)('rend une icône pour le ton %s', (tone) => {
    render(<StatusChip tone={tone} label="constat" />);
    expect(screen.getByTestId('status-chip').querySelector('svg')).toBeInTheDocument();
  });

  it('rend une icône DIFFÉRENTE par ton porteur d’alarme', () => {
    // Le vrai test. Trois puces avec le même glyphe seraient trois puces
    // distinguées par la seule teinte, c'est-à-dire exactement le défaut que
    // l'icône est censée corriger.
    const glyphes = ALARMES.map((tone) => {
      const { unmount } = render(<StatusChip tone={tone} label="constat" />);
      const g = glyphe();
      unmount();
      return g;
    });
    expect(new Set(glyphes).size).toBe(ALARMES.length);
  });

  it('écrit toujours son libellé, quel que soit le ton', () => {
    render(<StatusChip tone="danger" label="Tes factures dépassent tes revenus" />);
    expect(screen.getByTestId('status-chip')).toHaveTextContent(
      'Tes factures dépassent tes revenus',
    );
  });

  it('rend une icône que les lecteurs d’écran ignorent — garantie de lucide, pas de nous', () => {
    // **Mesuré** : retirer le `aria-hidden` de `StatusChip.tsx` laisse ce cas
    // VERT. `lucide-react` pose l'attribut lui-même en l'absence de nom
    // accessible, donc cette assertion ne tient pas notre prop — elle tient le
    // contrat de la dépendance.
    //
    // Elle est conservée pour cette raison-là, écrite : une montée de version
    // qui inverserait ce défaut ferait répéter chaque libellé deux fois à un
    // lecteur d'écran, et rien d'autre dans la suite ne le verrait. Notre
    // `aria-hidden` explicite reste, par cohérence avec le reste du cockpit et
    // parce qu'il ne coûte rien — mais il est redondant, et le prétendre
    // testé serait faux.
    render(<StatusChip tone="success" label="Tout est couvert" />);
    expect(screen.getByTestId('status-chip').querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('n’ajoute pas de glyphe décoratif au ton neutre', () => {
    // Aucun signal à doubler : le libellé EST l'information.
    render(<StatusChip tone="neutral" label="12 échéances" />);
    expect(screen.getByTestId('status-chip').querySelector('svg')).toBeNull();
  });
});

describe('StatusChip — le ton et l’exception', () => {
  it.each<StatusTone>(['success', 'warning', 'danger', 'info', 'neutral'])(
    'expose le ton %s en attribut',
    (tone) => {
      render(<StatusChip tone={tone} label="constat" />);
      expect(screen.getByTestId('status-chip')).toHaveAttribute('data-tone', tone);
    },
  );

  it('accepte une icône de remplacement pour l’exception motivée', () => {
    // « Configure tes revenus » ne signale pas un état mais une action : le
    // portefeuille y dit quelque chose qu'un point d'exclamation ne dit pas.
    const { unmount } = render(<StatusChip tone="info" label="Configure tes revenus" />);
    const parDefaut = glyphe();
    unmount();
    render(<StatusChip tone="info" label="Configure tes revenus" icon={Wallet} />);
    expect(glyphe()).not.toBe(parDefaut);
  });

  it('accepte un testid propre, pour cohabiter avec d’autres puces', () => {
    render(<StatusChip tone="neutral" label="constat" testId="cockpit-tile-avenir-chip" />);
    expect(screen.getByTestId('cockpit-tile-avenir-chip')).toBeInTheDocument();
  });
});

describe('StatusChip — CSP', () => {
  it('ne porte aucun attribut `style`', () => {
    const { container } = render(<StatusChip tone="warning" label="constat" />);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });
});
