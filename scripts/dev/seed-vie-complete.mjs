// Complète le profil semé par `scripts/dev/seed-profil-test.mjs` pour en faire une VIE
// entière : trois comptes avec leurs soldes, un versement de lissage, un second
// engagement avec une fin datée, et l'historique des paiements.
//
// STACK LOCALE UNIQUEMENT — refus explicite sinon. Même garde que le script de base :
// ce profil n'a rien à faire dans une base qui porte de vraies personnes.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('env manquant');
if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
  throw new Error(`REFUS : cible non locale (${url})`);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const EMAIL = 'ankora-test-profil@ankora.test';

const { data: liste } = await db.auth.admin.listUsers();
const user = liste.users.find((u) => u.email === EMAIL);
if (!user) throw new Error('profil de base absent — lancer seed-profil-test.mjs d abord');
const userId = user.id;

const { data: membre } = await db
  .from('workspace_members')
  .select('workspace_id')
  .eq('user_id', userId)
  .single();
const ws = membre.workspace_id;

// ---------------------------------------------------------------- 1. Les comptes
// Trois comptes, trois rôles. Les soldes sont ronds et inventés : ce dépôt est public.
const SOLDES = [
  ['principal', 1240.0], // ce qui arrive et d'où partent les factures
  ['vie_courante', 385.5], // la carte du quotidien
  ['epargne', 2150.0], // là où dorment les provisions
];
for (const [kind, balance] of SOLDES) {
  const { error } = await db
    .from('accounts')
    .update({ balance, updated_at: new Date().toISOString() })
    .eq('workspace_id', ws)
    .eq('kind', kind);
  if (error) throw new Error(`solde ${kind}: ${error.message}`);
}

// -------------------------------------------------- 2. Le versement de lissage
// Ce que l'utilisateur se vire chaque mois sur la carte du quotidien.
const VIREMENT_VIE_COURANTE = 300;
{
  const { error } = await db
    .from('workspaces')
    .update({ vie_courante_monthly_transfer: VIREMENT_VIE_COURANTE })
    .eq('id', ws);
  if (error) throw new Error(`virement: ${error.message}`);
}

// ------------------------------------------------------- 3. Un vrai crédit, daté
// Le premier engagement du semis de base est un plan d'apurement qui DOUBLE une charge
// mensuelle (piège de double comptage volontaire). Celui-ci est un crédit ordinaire,
// avec un début, une mensualité et une fin — de quoi éprouver la projection.
const CREDIT = {
  workspace_id: ws,
  created_by: userId,
  label: 'Prêt rénovation salle de bain',
  kind: 'debt',
  total_amount: 5400,
  installment_amount: 180,
  installments_total: 30,
  start_year: 2025,
  start_month: 1,
  payment_day: 20,
  frequency: 'monthly',
};
const { data: credit, error: crErr } = await db
  .from('commitments')
  .insert(CREDIT)
  .select('id')
  .single();
if (crErr) throw new Error(`credit: ${crErr.message}`);

// ------------------------------------------- 4. L'historique : ce qui est DÉJÀ payé
// Le crédit a commencé en janvier 2025 : 19 échéances courues jusqu'à juillet 2026.
// On en coche 19 pour que le compteur « échéance N/30 » et le restant dû aient un sens.
const echeances = [];
let annee = 2025;
let mois = 1;
for (let i = 0; i < 19; i++) {
  echeances.push({
    workspace_id: ws,
    commitment_id: credit.id,
    created_by: userId,
    paid_amount: 180,
    period_year: annee,
    period_month: mois,
    paid_at: new Date(Date.UTC(annee, mois - 1, 20)).toISOString(),
  });
  mois += 1;
  if (mois > 12) {
    mois = 1;
    annee += 1;
  }
}
// Le plan d'apurement du SPF : 7 échéances de 2026 réglées (janvier → juillet).
const { data: plan } = await db
  .from('commitments')
  .select('id')
  .eq('workspace_id', ws)
  .eq('kind', 'installment_plan')
  .single();
for (let m = 1; m <= 7; m++) {
  echeances.push({
    workspace_id: ws,
    commitment_id: plan.id,
    created_by: userId,
    paid_amount: 220,
    period_year: 2026,
    period_month: m,
    paid_at: new Date(Date.UTC(2026, m - 1, 5)).toISOString(),
  });
}
{
  const { error } = await db.from('commitment_payments').insert(echeances);
  if (error) throw new Error(`echeances: ${error.message}`);
}

// --------------------------------- 5. Trois factures cochées pour le mois en cours
const maintenant = new Date();
const AN = maintenant.getUTCFullYear();
const MOIS = maintenant.getUTCMonth() + 1;
const { data: charges } = await db
  .from('charges')
  .select('id,label,amount')
  .eq('workspace_id', ws)
  .in('label', ['Loyer', 'Orange', 'Belfius']);
const paiements = charges.map((c) => ({
  workspace_id: ws,
  charge_id: c.id,
  created_by: userId,
  paid_amount: c.amount,
  period_year: AN,
  period_month: MOIS,
  paid_at: new Date(Date.UTC(AN, MOIS - 1, 4)).toISOString(),
}));
{
  const { error } = await db.from('charge_payments').insert(paiements);
  if (error) throw new Error(`paiements: ${error.message}`);
}

// ------------------------------------------ 6. Des dépenses réparties sur le mois
const { data: cats } = await db.from('categories').select('id,name').eq('workspace_id', ws);
const cat = (n) => cats.find((c) => new RegExp(n, 'i').test(c.name))?.id ?? cats[0]?.id ?? null;
const jour = (d) => new Date(Date.UTC(AN, MOIS - 1, d)).toISOString().slice(0, 10);
const DEPENSES = [
  ['Pharmacie', 23.4, 2],
  ['Boulangerie', 8.6, 5],
  ['Carburant', 68.0, 7],
  ['Cinéma', 24.0, 11],
  ['Courses Colruyt', 94.15, 12],
  ['Coiffeur', 32.0, 16],
];
{
  const { error } = await db.from('expenses').insert(
    DEPENSES.map(([label, amount, d]) => ({
      workspace_id: ws,
      created_by: userId,
      label,
      amount,
      occurred_on: jour(d),
      category_id: cat(label),
    })),
  );
  if (error) throw new Error(`depenses: ${error.message}`);
}

// ----------------------------------------------------------- Totaux de contrôle
const { data: toutesCharges } = await db
  .from('charges')
  .select('amount,frequency,paid_from')
  .eq('workspace_id', ws);
const parMois = (c) =>
  c.frequency === 'monthly' ? c.amount : c.frequency === 'quarterly' ? c.amount / 3 : c.amount / 12;
const principal = toutesCharges
  .filter((c) => c.paid_from === 'principal')
  .reduce((s, c) => s + (c.frequency === 'monthly' ? c.amount : 0), 0);
const provisions = toutesCharges
  .filter((c) => c.paid_from === 'epargne')
  .reduce((s, c) => s + parMois(c), 0);

const { data: dep } = await db.from('expenses').select('amount').eq('workspace_id', ws);
const depenses = dep.reduce((s, e) => s + Number(e.amount), 0);

console.log(
  JSON.stringify(
    {
      workspace: ws,
      revenuMensuel: 2500,
      virementVieCourante: VIREMENT_VIE_COURANTE,
      soldes: Object.fromEntries(SOLDES),
      chargesPrincipalParMois: Number(principal.toFixed(2)),
      provisionsParMois: Number(provisions.toFixed(2)),
      engagementsParMois: 220 + 180,
      depensesDuMois: Number(depenses.toFixed(2)),
      echeancesCochees: echeances.length,
      facturesCochees: paiements.length,
      // Ce que le cockpit DEVRAIT afficher comme reste, si transfer.ts dit vrai :
      resteAttendu: Number(
        (2500 - VIREMENT_VIE_COURANTE - provisions - principal - (220 + 180)).toFixed(2),
      ),
    },
    null,
    2,
  ),
);
