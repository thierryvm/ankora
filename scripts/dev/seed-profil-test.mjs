// Profil de test à valeurs contrôlées — stack LOCALE uniquement.
// Totaux attendus : chargesFixes 1455,37 · provisions 58 · engagements 190.
// Valeurs FICTIVES (dépôt public) : aucun libellé ni montant d'un budget réel.
import { createClient } from '@supabase/supabase-js';

import { moisDePaiement } from './lib/payment-months.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('env manquant');
if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
  throw new Error(`REFUS : cible non locale (${url})`);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const EMAIL = 'ankora-test-profil@ankora.test';
const PASSWORD = 'TestProfil!2026';

// 14 mensuelles — le nombre entre parenthèses est le jour de prélèvement.
const MENSUELLES = [
  ['Charges communes', 95, 1],
  ['Loyer', 690, 1],
  ['Assurance habitation', 28, 2],
  ['Assurance auto', 64, 3],
  ['Téléphonie', 35, 3],
  ['Frais bancaires', 4, 4],
  ['Impôt', 190, 5],
  ['Mutuelle', 12, 5],
  ['Énergie', 61.37, 8],
  ['Abonnement jeux', 8, 9],
  ['Cotisation syndicale', 17, 10],
  ['Mutuelle (2)', 18, 11],
  ['Crédit auto', 230, 15],
  ['Stockage en ligne', 3, 16],
];
const TRIMESTRIELLE = [['Eau', 60, 1]];
const ANNUELLES = [
  ['Taxe de circulation', 260, 3],
  ['Taxe égouts', 48, 6],
  ['Collecte des déchets', 110, 9],
  ['Gestionnaire de mots de passe', 38, 11],
];

// Purge d'un éventuel passage précédent.
const { data: existing } = await db.auth.admin.listUsers();
for (const u of existing.users.filter((u) => u.email === EMAIL)) {
  await db.auth.admin.deleteUser(u.id);
}

const { data: created, error: cErr } = await db.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (cErr) throw cErr;
const userId = created.user.id;

await db.from('users').update({ onboarded_at: new Date().toISOString() }).eq('id', userId);

const { data: member } = await db
  .from('workspace_members')
  .select('workspace_id')
  .eq('user_id', userId)
  .single();
const ws = member.workspace_id;

// Revenus = valeur d'exemple, DÉLIBÉRÉMENT fictive et ronde.
//
// Ce fichier portait auparavant le revenu mensuel réel de @thierry, annoté
// comme tel. Ce dépôt est public : un revenu exact rattaché à une personne
// nommée est une donnée financière nominative, et la règle du dépôt public la
// vise explicitement. Un chiffre rond signale de lui-même qu'il est inventé.
//
// Aucun total de contrôle n'en dépend : les attendus en tête de fichier
// (chargesFixes, provisions, engagements) se déduisent des charges seules.
await db.from('workspaces').update({ monthly_income: 2500 }).eq('id', ws);

// `payment_months` est la SEULE colonne que l'interface lit pour décider si une charge
// tombe ce mois-ci (`ChargesClient.tsx:226,463` — `paymentMonths.includes(mois)`), et
// `due_month` n'est qu'une référence héritée. Ce script ne la renseignait pas : la valeur
// par défaut de la colonne est `{1,…,12}`, si bien que la taxe annuelle de mars était due
// TOUS LES MOIS dans le profil semé. Le cockpit affichait alors cinq fausses factures en
// retard et gonflait le « reste à payer » de 573 € — un défaut du harnais, pas du produit,
// mais qui faussait toute mesure prise sur ce profil. Mesuré le 10 août 2026.
//
// Le calcul vit dans `./lib/payment-months.mjs`, miroir de la fonction du domaine
// `paymentMonthsFromFrequency()` — ce script tourne hors du bundle applicatif et ne
// peut pas importer le TypeScript ni l'alias `@/`. Ce miroir était auparavant recopié
// ici même, non testé, et il avait DÉJÀ dérivé : sa branche annuelle enroulait un mois
// hors bornes là où le domaine le plafonne. Il est désormais tenu par
// `scripts/dev/__tests__/payment-months-parity.test.ts`, qui échoue si l'un des deux
// côtés bouge seul.
const rows = [];
let sort = 0;
for (const [label, amount, day] of MENSUELLES) {
  rows.push({
    workspace_id: ws,
    created_by: userId,
    label,
    amount,
    frequency: 'monthly',
    due_month: 1,
    payment_months: moisDePaiement('monthly', 1),
    payment_day: day,
    paid_from: 'principal',
    sort_order: sort++,
  });
}
for (const [label, amount, m] of TRIMESTRIELLE) {
  rows.push({
    workspace_id: ws,
    created_by: userId,
    label,
    amount,
    frequency: 'quarterly',
    due_month: m,
    payment_months: moisDePaiement('quarterly', m),
    payment_day: 1,
    paid_from: 'epargne',
    sort_order: sort++,
  });
}
for (const [label, amount, m] of ANNUELLES) {
  rows.push({
    workspace_id: ws,
    created_by: userId,
    label,
    amount,
    frequency: 'annual',
    due_month: m,
    payment_months: moisDePaiement('annual', m),
    payment_day: 1,
    paid_from: 'epargne',
    sort_order: sort++,
  });
}
const { error: chErr } = await db.from('charges').insert(rows);
if (chErr) throw chErr;

// LE CAS À TRANCHER : un plan d'apurement qui désigne la MÊME dette que la
// charge mensuelle « Impôt 190 € » ci-dessus. Si l'app déduit 380 €, elle
// compte deux fois.
const { error: coErr } = await db.from('commitments').insert({
  workspace_id: ws,
  created_by: userId,
  label: 'SPF Impôt — plan d apurement',
  kind: 'installment_plan',
  total_amount: 2280,
  installment_amount: 190,
  installments_total: 12,
  start_year: 2026,
  start_month: 1,
  payment_day: 5,
  frequency: 'monthly',
});
if (coErr) throw coErr;

// Quelques dépenses du mois pour que « Dépensé ce mois » ne soit pas vide.
const now = new Date();
// `expenses.occurred_on` est une DATE, pas un horodatage — on lui donne une date.
// Jamais après aujourd'hui : l'app refuse une dépense future. Le jour UTC n'est
// jamais après le jour de Bruxelles, donc la borne est sûre.
const d = (day) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(day, now.getUTCDate())))
    .toISOString()
    .slice(0, 10);
const { data: cat } = await db
  .from('categories')
  .select('id')
  .eq('workspace_id', ws)
  .limit(1)
  .single();
const { error: exErr } = await db.from('expenses').insert([
  {
    workspace_id: ws,
    created_by: userId,
    label: 'Courses Delhaize',
    amount: 62.4,
    occurred_on: d(3),
    category_id: cat?.id ?? null,
  },
  {
    workspace_id: ws,
    created_by: userId,
    label: 'Essence',
    amount: 70,
    occurred_on: d(9),
    category_id: cat?.id ?? null,
  },
  {
    workspace_id: ws,
    created_by: userId,
    label: 'Restaurant',
    amount: 38.5,
    occurred_on: d(14),
    category_id: cat?.id ?? null,
  },
]);
// `throw`, pas `console.error` — comme les insertions de charges et
// d'engagements plus haut. Un simple log laissait le script imprimer son
// résumé de succès et rendre un profil SANS dépenses : le cockpit semé
// affichait « Dépensé ce mois » vide, et rien ne disait pourquoi. C'est
// exactement ce qui s'est produit le 8 août 2026, quand la colonne s'appelait
// encore `spent_at` ici alors qu'elle avait été renommée `occurred_on`.
if (exErr) throw new Error(`seed dépenses: ${exErr.message}`);

// Le salaire fictif du mois en cours : reçu le 28 du mois PRÉCÉDENT, rattaché au
// mois en cours par son mois de budget (ADR-046).
const { error: incErr } = await db.from('movements').insert({
  workspace_id: ws,
  created_by: userId,
  kind: 'income',
  to_account_type: 'income_bills',
  amount: 2500,
  occurred_on: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 28))
    .toISOString()
    .slice(0, 10),
  income_nature: 'regular',
  description: 'Salaire fictif',
  budget_year: now.getUTCFullYear(),
  budget_month: now.getUTCMonth() + 1,
});
if (incErr) throw new Error(`seed salaire: ${incErr.message}`);

console.log(
  JSON.stringify(
    {
      email: EMAIL,
      password: PASSWORD,
      userId,
      workspaceId: ws,
      charges: rows.length,
      mensuelles: MENSUELLES.length,
    },
    null,
    2,
  ),
);
