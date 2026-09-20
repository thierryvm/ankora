import { seedOnboardedUser } from './seed';
import type { AdminClient } from './seed';

/**
 * Le semis du cockpit v3 : un ménage FICTIF mais de forme réaliste.
 *
 * Extrait de `e2e/cockpit-v3.spec.ts` pour qu'une campagne de captures mesure
 * EXACTEMENT l'écran que la spec mesure. Deux semis voisins finiraient par
 * diverger, et on comparerait alors deux écrans différents sans le savoir.
 *
 * Dépôt public : aucun montant, libellé ou compte réel n'entre ici.
 */
export type Seme = { email: string; password: string; userId: string };

/** Le mois `n` mois après `depuis`, ramené dans 1..12. */
function moisApres(depuis: Date, n: number): number {
  return ((depuis.getMonth() + n) % 12) + 1;
}

/**
 * Le semis. FICTIF de bout en bout — dépôt public : aucun montant, libellé ou
 * compte réel n'entre ici. Réaliste en FORME, jamais en contenu.
 */
export async function semerCockpit(admin: AdminClient): Promise<Seme> {
  const user = await seedOnboardedUser(admin);
  const aujourdhui = new Date();

  const { error: revenuError } = await admin
    .from('workspaces')
    .update({ monthly_income: 3200 })
    .eq('id', user.workspaceId);
  if (revenuError) throw new Error(`semis revenu: ${revenuError.message}`);

  const commun = {
    workspace_id: user.workspaceId,
    created_by: user.userId,
    is_active: true,
    paid_from: 'principal' as const,
  };

  // Douze factures mensuelles — le format d'un ménage, pas un cas d'école.
  const mensuelles = [
    ['Loyer', 780],
    ['Électricité', 68],
    ['Gaz', 54],
    ['Eau', 26],
    ['Internet', 45],
    ['Téléphone', 18],
    ['Assurance habitation', 31],
    ['Abonnement transport', 49],
    ['Mutuelle', 22],
    ['Salle de sport', 29],
    ['Streaming', 14],
    ['Épargne enfants', 50],
  ] as const;

  const { error: mensuellesError } = await admin.from('charges').insert(
    mensuelles.map(([label, amount], i) => ({
      ...commun,
      label,
      amount,
      frequency: 'monthly' as const,
      due_month: aujourdhui.getMonth() + 1,
      payment_day: ((i * 3) % 27) + 1,
    })),
  );
  if (mensuellesError) throw new Error(`semis mensuelles: ${mensuellesError.message}`);

  // Trois non mensuelles. La première tombe le mois prochain — dans la fenêtre
  // de 60 jours, donc elle DOIT apparaître sous « Bientôt » ; les deux autres
  // sont hors fenêtre et n'y ont rien à faire.
  const nonMensuelles = [
    { label: 'Assurance auto', amount: 186, frequency: 'quarterly' as const, dans: 1, jour: 10 },
    { label: 'Précompte immobilier', amount: 540, frequency: 'annual' as const, dans: 5, jour: 15 },
    { label: 'Taxe déchets', amount: 96, frequency: 'semiannual' as const, dans: 7, jour: 20 },
  ];

  const { error: nonMensuellesError } = await admin.from('charges').insert(
    nonMensuelles.map((c) => ({
      ...commun,
      label: c.label,
      amount: c.amount,
      frequency: c.frequency,
      due_month: moisApres(aujourdhui, c.dans),
      payment_months: [moisApres(aujourdhui, c.dans)],
      payment_day: c.jour,
    })),
  );
  if (nonMensuellesError) throw new Error(`semis non mensuelles: ${nonMensuellesError.message}`);

  // Un engagement en cours : douze mensualités, la prochaine ce mois-ci.
  const { error: engagementError } = await admin.from('commitments').insert({
    workspace_id: user.workspaceId,
    created_by: user.userId,
    label: 'Plan de paiement',
    kind: 'installment_plan',
    total_amount: 1440,
    installment_amount: 120,
    installments_total: 12,
    start_year: aujourdhui.getFullYear(),
    start_month: aujourdhui.getMonth() + 1,
    payment_day: 12,
    frequency: 'monthly',
    paid_from: 'principal',
    is_active: true,
  });
  if (engagementError) throw new Error(`semis engagement: ${engagementError.message}`);

  // Une dizaine de dépenses du mois, datées dans le passé du mois courant.
  const depenses = [
    ['Courses', 62.4],
    ['Essence', 55],
    ['Pharmacie', 18.9],
    ['Boulangerie', 7.2],
    ['Restaurant', 34.5],
    ['Librairie', 21],
    ['Cadeau', 40],
    ['Bricolage', 13.75],
    ['Coiffeur', 28],
    ['Marché', 16.3],
  ] as const;

  const pad = (n: number) => String(n).padStart(2, '0');
  const { error: depensesError } = await admin.from('expenses').insert(
    depenses.map(([label, amount], i) => ({
      workspace_id: user.workspaceId,
      created_by: user.userId,
      label,
      amount,
      paid_from: 'vie_courante' as const,
      occurred_on: `${aujourdhui.getFullYear()}-${pad(aujourdhui.getMonth() + 1)}-${pad(
        Math.max(1, aujourdhui.getDate() - i),
      )}`,
    })),
  );
  if (depensesError) throw new Error(`semis dépenses: ${depensesError.message}`);

  return { email: user.email, password: user.password, userId: user.userId };
}
