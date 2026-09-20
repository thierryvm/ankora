import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect } from './helpers/test';
import { adminClientOrNull, deleteSeededUser, seedOnboardedUser } from './helpers/seed';

const admin = adminClientOrNull();

/**
 * J2 / ADR-038 D1 + ADR-045 — le journal des opérations et le relevé de solde.
 *
 * ## Pourquoi ces preuves vivent ici et pas dans Vitest
 *
 * Tout ce qui suit est une garantie de BASE DE DONNÉES : des politiques RLS,
 * six contraintes CHECK, deux triggers, et une cascade de suppression. Les
 * tests d'action du dépôt travaillent sur un faux client Supabase — ils ne
 * peuvent, par construction, rien dire d'une policy. Le seul instrument du
 * dépôt qui touche une vraie base est `adminClientOrNull()`, donc le job
 * Playwright authentifié.
 *
 * ## Le client qui compte ici est le client ANON, pas l'admin
 *
 * `adminClientOrNull()` porte la clé de service, qui **contourne RLS** : un
 * test d'isolation écrit avec lui prouverait exactement rien. Chaque cas
 * ci-dessous ouvre donc un client `anon` par personne, authentifié avec le mot
 * de passe que `seedOnboardedUser` rend — c'est le même chemin qu'un
 * navigateur, l'anon key étant publique (`NEXT_PUBLIC_*`).
 *
 * ## Ce que ces cas NE prouvent PAS
 *
 * Rien sur les écrans : J2 ne livre ni interface ni Server Action. Et rien sur
 * la dérivation des soldes, qui est du domaine pur et se teste en Vitest
 * (`src/lib/domain/accounts/__tests__/`).
 */
test.describe('J2 — le journal des opérations, ses garde-fous et son isolation', () => {
  test.skip(!admin, 'Needs real Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');

  /**
   * Un refus se vérifie par SA CAUSE, pas par son code.
   *
   * Cinq de ces cas produisent le même `23514`, et plusieurs contraintes
   * peuvent refuser la même ligne : un virement de `provisions` vers
   * `provisions` est arrêté par `movements_comptes_distincts` ET par
   * `movements_ventilation`. Un test qui ne regarde que le code resterait vert
   * si l'on supprimait la contrainte qu'il prétend prouver — c'est-à-dire
   * exactement quand il devrait rougir.
   */
  function attendRefus(
    error: { code?: string; message?: string } | null,
    contrainte: string,
    quoi: string,
  ): void {
    expect(error?.code, `${quoi} — refusé par la base`).toBe('23514');
    expect(error?.message ?? '', `${quoi} — par la contrainte ${contrainte}`).toContain(contrainte);
  }

  /** Un client `anon` authentifié comme cette personne-là. */
  async function clientDe(email: string, password: string): Promise<SupabaseClient> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY manquantes');

    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signIn failed: ${error.message}`);
    return client;
  }

  test("chaque CHECK refuse ce qu'il dit refuser, et laisse passer ce qui est juste", async () => {
    if (!admin) return;
    const alice = await seedOnboardedUser(admin);
    try {
      const client = await clientDe(alice.email, alice.password);
      const base = { workspace_id: alice.workspaceId, created_by: alice.userId };

      // Une ventilation posée sur un virement qui ne va PAS vers les provisions.
      const horsProvisions = await client.from('movements').insert({
        ...base,
        kind: 'transfer',
        from_account_type: 'income_bills',
        to_account_type: 'daily_card',
        amount: 100,
        occurred_on: '2026-09-01',
        provision_part: 60,
        free_savings_part: 40,
      });
      attendRefus(horsProvisions.error, 'movements_ventilation', 'ventilation hors provisions');

      // Deux parts qui ne somment pas au montant : refusé, JAMAIS arrondi.
      const sommeFausse = await client.from('movements').insert({
        ...base,
        kind: 'transfer',
        from_account_type: 'income_bills',
        to_account_type: 'provisions',
        amount: 200,
        occurred_on: '2026-09-01',
        provision_part: 50,
        free_savings_part: 100,
      });
      attendRefus(sommeFausse.error, 'movements_ventilation', '50 + 100 ≠ 200');

      // Aucun compte de part ni d'autre. Cette ligne viole `compte_present`
      // ET `forme_selon_nature` : PostgreSQL ne nomme que la PREMIÈRE, et
      // c'est ce qui a rendu ce cas rouge en CI. Il vise donc `compte_present`,
      // et le cas suivant vise `forme_selon_nature` avec une ligne qui ne
      // viole que lui. Un cas qui violerait deux contraintes ne prouverait
      // aucune des deux : l'ordre des noms n'est pas un contrat.
      const sansCompte = await client
        .from('movements')
        .insert({ ...base, kind: 'transfer', amount: 10, occurred_on: '2026-09-01' });
      attendRefus(sansCompte.error, 'movements_compte_present', 'from et to nuls ensemble');

      // Un virement avec un seul compte : `compte_present` est satisfait (`to`
      // est là), `comptes_distincts` aussi (une comparaison avec NULL ne
      // refuse rien), `ventilation` aussi (la cible n'est pas les provisions).
      // Seule la forme selon la nature est violée — un virement vient de
      // quelque part.
      const virementSansSource = await client.from('movements').insert({
        ...base,
        kind: 'transfer',
        to_account_type: 'daily_card',
        amount: 10,
        occurred_on: '2026-09-01',
      });
      attendRefus(
        virementSansSource.error,
        'movements_forme_selon_nature',
        'un virement sans compte source',
      );

      // Un virement d'un compte vers lui-même.
      const versLuiMeme = await client.from('movements').insert({
        ...base,
        kind: 'transfer',
        from_account_type: 'daily_card',
        to_account_type: 'daily_card',
        amount: 10,
        occurred_on: '2026-09-01',
      });
      attendRefus(versLuiMeme.error, 'movements_comptes_distincts', 'from = to');

      // De l'argent reçu sans dire à quel titre ni d'où.
      const sansNature = await client.from('movements').insert({
        ...base,
        kind: 'income',
        to_account_type: 'income_bills',
        amount: 25,
        occurred_on: '2026-09-01',
      });
      attendRefus(
        sansNature.error,
        'movements_forme_selon_nature',
        'rentrée sans nature ni description',
      );

      // Et ce qui est juste passe : un virement ventilé, une rentrée, un relevé.
      const virement = await client.from('movements').insert({
        ...base,
        kind: 'transfer',
        from_account_type: 'income_bills',
        to_account_type: 'provisions',
        amount: 150,
        occurred_on: '2026-09-01',
        provision_part: 40,
        free_savings_part: 110,
      });
      expect(virement.error, 'un virement ventilé 40 + 110 = 150').toBeNull();

      const rentree = await client.from('movements').insert({
        ...base,
        kind: 'income',
        to_account_type: 'daily_card',
        amount: 25,
        occurred_on: '2026-09-02',
        income_nature: 'extra',
        description: 'Remboursement',
      });
      expect(rentree.error, "de l'argent reçu en plus du revenu").toBeNull();

      const releve = await client.from('account_balance_statements').insert({
        ...base,
        account_type: 'daily_card',
        balance: 210.4,
        stated_on: '2026-09-02',
      });
      expect(releve.error, 'un relevé de solde').toBeNull();
    } finally {
      await deleteSeededUser(admin, alice.userId);
    }
  });

  test("une opération se défait, elle ne s'efface pas — et son instant d'écriture est figé", async () => {
    if (!admin) return;
    const alice = await seedOnboardedUser(admin);
    try {
      const client = await clientDe(alice.email, alice.password);

      // `recorded_at` fourni par le client est IGNORÉ : sans ce trigger, une
      // opération antérieure à tous les relevés serait invisible de chaque
      // solde dérivé (ADR-045 D16), et une ligne pourrait naître annulée.
      const { data: ecrite, error } = await client
        .from('movements')
        .insert({
          workspace_id: alice.workspaceId,
          created_by: alice.userId,
          kind: 'income',
          to_account_type: 'income_bills',
          amount: 90,
          occurred_on: '2026-09-03',
          income_nature: 'regular',
          description: 'Revenu du mois',
          recorded_at: '2020-01-01T00:00:00.000Z',
          cancelled_at: '2020-01-01T00:00:00.000Z',
        })
        .select()
        .single();
      expect(error).toBeNull();
      expect(new Date(ecrite!.recorded_at).getUTCFullYear(), 'recorded_at forgé').toBeGreaterThan(
        2020,
      );
      expect(ecrite!.cancelled_at, 'une ligne ne naît pas annulée').toBeNull();

      // Le DELETE n'est ouvert à personne : il n'existe aucune policy DELETE.
      const suppression = await client.from('movements').delete().eq('id', ecrite!.id).select();
      expect(suppression.data ?? [], 'aucune ligne supprimée côté client').toHaveLength(0);
      const { count } = await admin
        .from('movements')
        .select('*', { count: 'exact', head: true })
        .eq('id', ecrite!.id);
      expect(count, 'la ligne est toujours là après le DELETE').toBe(1);

      // Redater l'écriture est refusé par le trigger.
      const redate = await client
        .from('movements')
        .update({ recorded_at: '2020-01-01T00:00:00.000Z' })
        .eq('id', ecrite!.id);
      expect(redate.error, 'redater une écriture').not.toBeNull();

      // Changer de compte n'est pas une correction, c'est une autre
      // opération : les deux comptes sont figés, comme `kind`.
      for (const [colonne, valeur] of [
        ['kind', 'transfer'],
        ['to_account_type', 'daily_card'],
        ['from_account_type', 'income_bills'],
      ] as const) {
        const deplace = await client
          .from('movements')
          .update({ [colonne]: valeur })
          .eq('id', ecrite!.id);
        expect(deplace.error?.message ?? '', `${colonne} est figé`).toContain(colonne);
      }

      // Les trois chiffres du plan sont une COPIE de ce que le plan proposait
      // ce jour-la : les reecrire rendrait l'historique retroactif, ce que D3
      // ferme par ailleurs. Envoyes ENSEMBLE, ils passeraient `plan_complet`
      // sans le trigger -- le refus vient donc bien de lui.
      const replan = await client
        .from('movements')
        .update({ plan_year: 2026, plan_month: 9, plan_suggested_amount: 500 })
        .eq('id', ecrite!.id);
      expect(replan.error?.message ?? '', 'les chiffres du plan sont figes').toMatch(/plan_/);

      // Corriger ce que « Modifier » propose EST permis (ADR-045 D17) : le
      // montant, la date, la description, la note, la nature.
      const correction = await client
        .from('movements')
        .update({ amount: 95, occurred_on: '2026-09-04', description: 'Revenu du mois (corrigé)' })
        .eq('id', ecrite!.id)
        .select()
        .single();
      expect(correction.error, 'corriger le montant et la date').toBeNull();
      expect(Number(correction.data!.amount), 'le montant corrigé').toBe(95);

      // Annuler est permis, et laisse une trace datée (règle 11). L'instant et
      // l'auteur de l'annulation sont IMPOSÉS par la base : ici le client les
      // forge tous les deux — un instant de 2020, et personne comme auteur —,
      // et la base écrit quand même l'heure vraie et la personne connectée.
      // Sans cela, « annulé le 3 août par X » serait une déclaration du
      // client, c'est-à-dire l'inverse d'une trace (règle 11 : une date se
      // vérifie, une coche se croit).
      const annulation = await client
        .from('movements')
        .update({ cancelled_at: '2020-01-01T00:00:00.000Z', cancelled_by: null })
        .eq('id', ecrite!.id)
        .select()
        .single();
      expect(annulation.error).toBeNull();
      expect(
        new Date(annulation.data!.cancelled_at!).getUTCFullYear(),
        "l'instant d'annulation est celui de la base",
      ).toBeGreaterThan(2020);
      expect(annulation.data!.cancelled_by, "l'auteur de l'annulation est imposé").toBe(
        alice.userId,
      );

      // Une ligne annulée ne se modifie plus.
      const modif = await client.from('movements').update({ amount: 9999 }).eq('id', ecrite!.id);
      expect(modif.error, "modifier le contenu d'une ligne annulée").not.toBeNull();

      // Mais elle se ré-ouvre : annuler par erreur doit se réparer, sinon le
      // « défaire » devient lui-même le piège à un clic. La ré-ouverture efface
      // les deux colonnes ensemble — un annulateur sans annulation n'existe pas.
      const reouverture = await client
        .from('movements')
        .update({ cancelled_at: null })
        .eq('id', ecrite!.id)
        .select()
        .single();
      expect(reouverture.error, 'ré-ouvrir une opération annulée').toBeNull();
      expect(reouverture.data!.cancelled_at, 'ré-ouverte : plus d’annulation').toBeNull();
      expect(reouverture.data!.cancelled_by, 'ré-ouverte : plus d’annulateur').toBeNull();
    } finally {
      await deleteSeededUser(admin, alice.userId);
    }
  });

  test("une personne ne voit ni n'écrit les opérations d'une autre", async () => {
    if (!admin) return;
    const alice = await seedOnboardedUser(admin);
    const bob = await seedOnboardedUser(admin);
    try {
      const clientAlice = await clientDe(alice.email, alice.password);
      const clientBob = await clientDe(bob.email, bob.password);

      const { error: ecriture } = await clientAlice.from('movements').insert({
        workspace_id: alice.workspaceId,
        created_by: alice.userId,
        kind: 'income',
        to_account_type: 'income_bills',
        amount: 75,
        occurred_on: '2026-09-04',
        income_nature: 'extra',
        description: "Le secret d'Alice",
      });
      expect(ecriture).toBeNull();

      // Alice voit la sienne — sans ce contrôle, « Bob voit 0 ligne » ne
      // prouverait rien : il n'y en aurait peut-être aucune à voir.
      const chezAlice = await clientAlice.from('movements').select('id, description');
      expect(chezAlice.data ?? [], 'Alice voit son opération').toHaveLength(1);

      const chezBob = await clientBob.from('movements').select('id, description');
      expect(chezBob.data ?? [], "Bob ne voit rien d'Alice").toHaveLength(0);

      // Bob ne peut pas écrire dans le workspace d'Alice, même en se
      // désignant lui-même comme auteur.
      const intrusion = await clientBob.from('movements').insert({
        workspace_id: alice.workspaceId,
        created_by: bob.userId,
        kind: 'income',
        to_account_type: 'income_bills',
        amount: 5,
        occurred_on: '2026-09-04',
        income_nature: 'extra',
        description: 'Intrusion',
      });
      expect(intrusion.error?.code, "écrire chez quelqu'un d'autre").toBe('42501');

      // Ni relever un solde chez elle.
      const releveIntrus = await clientBob.from('account_balance_statements').insert({
        workspace_id: alice.workspaceId,
        created_by: bob.userId,
        account_type: 'daily_card',
        balance: 1,
        stated_on: '2026-09-04',
      });
      expect(releveIntrus.error?.code, 'relever un solde chez autrui').toBe('42501');

      // Et le relevé d'Alice lui reste invisible. Attention à la forme de
      // cette preuve : Bob VOIT des relevés — les trois ancres de ses propres
      // comptes, posées par `accounts_ancre_releve` à son inscription. Un
      // `toHaveLength(0)` global rougirait donc sur un système SAIN, et
      // l'ajuster à « 3 » aurait été pire : ce nombre passerait tout aussi
      // bien avec trois relevés d'Alice.
      //
      // La question est donc posée dans les deux sens : combien de lignes
      // d'ALICE, et à qui appartient tout ce que Bob voit.
      const relevesVusParBob = await clientBob
        .from('account_balance_statements')
        .select('id, workspace_id');
      const lignes = relevesVusParBob.data ?? [];
      expect(
        lignes.filter((r) => r.workspace_id === alice.workspaceId),
        "Bob ne voit aucun relevé d'Alice",
      ).toHaveLength(0);
      expect(
        [...new Set(lignes.map((r) => r.workspace_id))],
        'tout ce que Bob voit est à Bob',
      ).toEqual([bob.workspaceId]);
      // Et il voit bien quelque chose : sans cette ligne, une table vide ou
      // une policy qui refuse tout passerait les deux contrôles ci-dessus.
      expect(lignes.length, 'Bob voit les ancres de ses trois comptes').toBe(3);
    } finally {
      await deleteSeededUser(admin, alice.userId);
      await deleteSeededUser(admin, bob.userId);
    }
  });

  test('la suppression de compte emporte le journal et les relevés (art. 17)', async () => {
    if (!admin) return;
    const alice = await seedOnboardedUser(admin);
    const client = await clientDe(alice.email, alice.password);

    await client.from('movements').insert({
      workspace_id: alice.workspaceId,
      created_by: alice.userId,
      kind: 'income',
      to_account_type: 'income_bills',
      amount: 60,
      occurred_on: '2026-09-05',
      income_nature: 'regular',
      description: 'À effacer',
    });

    // Les comptes AVANT. Un « 0 après » sans le « 1 avant » ne prouve rien :
    // il se lit aussi bien « tout a été effacé » que « rien n'a été écrit ».
    const avant = await Promise.all([
      admin
        .from('movements')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', alice.workspaceId),
      admin
        .from('account_balance_statements')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', alice.workspaceId),
    ]);
    expect(avant[0].count, 'mouvements avant').toBe(1);
    // Trois relevés : le trigger d'ancrage en pose un à la création de chaque
    // compte. Le semis de la migration, lui, ne couvre que les comptes qui
    // existaient au moment où elle a été jouée — Alice naît après.
    expect(avant[1].count, 'relevés avant').toBe(3);

    await deleteSeededUser(admin, alice.userId);

    const apres = await Promise.all([
      admin
        .from('movements')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', alice.workspaceId),
      admin
        .from('account_balance_statements')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', alice.workspaceId),
    ]);
    expect(apres[0].count, 'mouvements après').toBe(0);
    expect(apres[1].count, 'relevés après').toBe(0);
  });
});
