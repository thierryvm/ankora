import Decimal from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadMonthSituation = vi.fn();
const getCategories = vi.fn();

/*
  The session client, recorded call by call. The descriptions read is the only
  thing this action asks of it; every chained call is kept so a test can prove
  the query is scoped to the workspace — RLS is the second wall, not the first.
*/
type DescriptionsResult = { data: unknown[] | null; error: { message: string } | null };
const descriptionsQuery = {
  calls: [] as [string, unknown[]][],
  result: { data: [], error: null } as DescriptionsResult,
  throws: false,
};
const createClient = vi.fn(async () => {
  if (descriptionsQuery.throws) throw new Error('cookies unavailable');
  const builder = {
    select: (...args: unknown[]) => {
      descriptionsQuery.calls.push(['select', args]);
      return builder;
    },
    eq: (...args: unknown[]) => {
      descriptionsQuery.calls.push(['eq', args]);
      return builder;
    },
    order: (...args: unknown[]) => {
      descriptionsQuery.calls.push(['order', args]);
      return builder;
    },
    limit: async (...args: unknown[]) => {
      descriptionsQuery.calls.push(['limit', args]);
      return descriptionsQuery.result;
    },
  };
  return {
    from: (table: string) => {
      descriptionsQuery.calls.push(['from', [table]]);
      return builder;
    },
  };
});

vi.mock('@/lib/data/month-situation', () => ({
  loadMonthSituation: () => loadMonthSituation(),
}));
vi.mock('@/lib/data/categories', () => ({
  getCategories: (id: string) => getCategories(id),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}));

import { getExpenseEntryContextAction } from '@/lib/actions/expense-entry';

/**
 * Le contexte de la feuille ⊕ — écrit AVANT d'y ajouter un champ.
 *
 * Ce fichier n'avait aucun test, alors que ses neuf voisins de
 * `src/lib/actions/__tests__/` en ont un. La refonte du cockpit va lui faire
 * porter « Dépensé ce mois » en plus, pour que la courbe du mois puisse suivre
 * le montant du hero. Écrit après, un test prouverait que le nouveau code fait
 * ce que le nouveau code fait ; écrit avant, il prouve que le reste a survécu.
 *
 * Ce qu'il protège en priorité : **la frontière Decimal**. Le module la
 * documente lui-même (« Decimal never crosses the RSC / action boundary — it
 * loses its prototype »). C'est une panne déjà vécue sur ce projet, et une
 * fixture qui passerait un Decimal la masquerait au lieu de la révéler — d'où
 * des `Decimal` réels dans les données d'entrée ci-dessous, et une assertion de
 * TYPE et non de valeur en sortie.
 */
const categorie = (id: string, name: string, colorToken: string) => ({
  id,
  name,
  kind: 'variable' as const,
  colorToken,
  isSystem: false,
});

function situationFactice(
  over: Partial<{
    ilTeReste: Decimal;
    resteDisponible: Decimal;
    depensesDuMois: Decimal;
    statut: string;
  }> = {},
) {
  return {
    snapshot: { workspaceId: 'ws-1', monthlyExpenses: [] },
    situation: {
      ilTeReste: new Decimal('429.89'),
      resteDisponible: new Decimal('838.52'),
      // 838,52 − 429,89. Cohérent avec les deux autres délibérément : la feuille
      // publie désormais un couple, et une situation dont les membres se
      // contredisent laisserait passer une implémentation qui les intervertit.
      depensesDuMois: new Decimal('408.63'),
      statut: 'vert',
      ...over,
    },
    todayIso: '2026-08-24',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  descriptionsQuery.calls = [];
  descriptionsQuery.result = { data: [], error: null };
  descriptionsQuery.throws = false;
  loadMonthSituation.mockResolvedValue(situationFactice());
  getCategories.mockResolvedValue([
    categorie('c-1', 'Courses', 'emerald'),
    categorie('c-2', 'Carburant', 'cyan'),
  ]);
});

describe('getExpenseEntryContextAction — la frontière Decimal', () => {
  it('rend des nombres, jamais des Decimal', async () => {
    const res = await getExpenseEntryContextAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // `typeof` et non une comparaison de valeur : un Decimal se compare
    // volontiers à un nombre dans une assertion permissive, puis perd son
    // prototype en traversant la frontière et casse à l'affichage. C'est le
    // type qui doit être asserté.
    expect(typeof res.data.ilTeReste).toBe('number');
    expect(typeof res.data.budgetDuMois).toBe('number');
    expect(typeof res.data.depensesDuMois).toBe('number');
    expect(res.data.ilTeReste).toBe(429.89);
    expect(res.data.budgetDuMois).toBe(838.52);
    expect(res.data.depensesDuMois).toBe(408.63);
  });

  it('LIT « Dépensé ce mois », au lieu de le déduire des deux autres', async () => {
    // Le pivot du couple optimiste. La feuille pourrait le dériver de « Budget
    // du mois » moins « Il te reste » — un SECOND calcul de la même somme au
    // moment de l'affichage, que la règle 10 interdit, et par lequel deux
    // lectures d'un même mois commencent à diverger.
    //
    // Ce cas le prouve en cassant la cohérence exprès : ici la soustraction
    // rendrait 408,63 et la lecture rend 7. Avec la fixture cohérente des
    // autres cas, les deux implémentations seraient indiscernables.
    loadMonthSituation.mockResolvedValue(situationFactice({ depensesDuMois: new Decimal('7') }));
    const res = await getExpenseEntryContextAction();
    expect(res.ok && res.data.depensesDuMois).toBe(7);
  });

  it('lit le budget dans `resteDisponible`, pas ailleurs', async () => {
    // Les deux chiffres du hero sont proches et faciles à intervertir. Ce cas
    // les sépare avec des valeurs qui ne peuvent pas se confondre.
    loadMonthSituation.mockResolvedValue(
      situationFactice({ ilTeReste: new Decimal('1'), resteDisponible: new Decimal('999') }),
    );
    const res = await getExpenseEntryContextAction();
    expect(res.ok && res.data.ilTeReste).toBe(1);
    expect(res.ok && res.data.budgetDuMois).toBe(999);
  });
});

describe('getExpenseEntryContextAction — l’état incomplet', () => {
  it('signale `incomplet` quand la situation l’est', async () => {
    loadMonthSituation.mockResolvedValue(situationFactice({ statut: 'incomplet' }));
    const res = await getExpenseEntryContextAction();
    expect(res.ok && res.data.incomplet).toBe(true);
  });

  it.each(['vert', 'orange', 'rouge'])(
    'ne le signale pas quand le statut est %s',
    async (statut) => {
      // Les trois autres statuts décrivent un mois connu : seul `incomplet` dit
      // qu'il manque le revenu, et c'est lui qui éteint la ligne « Il te restera »
      // de la feuille. Confondre « mauvais mois » et « mois inconnu » ferait
      // disparaître cette ligne précisément quand elle est la plus utile.
      loadMonthSituation.mockResolvedValue(situationFactice({ statut }));
      const res = await getExpenseEntryContextAction();
      expect(res.ok && res.data.incomplet).toBe(false);
    },
  );
});

describe('getExpenseEntryContextAction — les catégories', () => {
  it('interroge le workspace du snapshot', async () => {
    await getExpenseEntryContextAction();
    expect(getCategories).toHaveBeenCalledWith('ws-1');
  });

  it('ne laisse passer que l’identifiant, le nom et le jeton de couleur', async () => {
    const res = await getExpenseEntryContextAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const toutes = [...res.data.chips, ...res.data.overflow];
    expect(toutes.length).toBeGreaterThan(0);
    for (const c of toutes) {
      // `kind` et `isSystem` sont des détails de domaine : les envoyer au client
      // élargirait la surface sans que rien ne les lise.
      expect(Object.keys(c).sort()).toEqual(['colorToken', 'id', 'name']);
    }
  });

  it('transmet la date du jour telle que le domaine la calcule', async () => {
    // `todayIso` vient de l'horloge de Bruxelles côté serveur. La feuille ne la
    // recalcule pas : une dépense datée par le fuseau du téléphone tomberait
    // dans le mauvais mois une nuit sur deux en fin de mois.
    const res = await getExpenseEntryContextAction();
    expect(res.ok && res.data.todayIso).toBe('2026-08-24');
  });
});

describe('getExpenseEntryContextAction — les descriptions déjà saisies (règle 26)', () => {
  const ligne = (
    label: string,
    occurred_on: string,
    category_id: string | null,
    created_at = `${occurred_on}T12:00:00Z`,
  ) => ({ label, category_id, occurred_on, created_at });

  it('lit les dépenses de l’espace du snapshot, et de lui seul', async () => {
    await getExpenseEntryContextAction();
    expect(descriptionsQuery.calls).toEqual([
      ['from', ['expenses']],
      ['select', ['label, category_id, occurred_on, created_at']],
      ['eq', ['workspace_id', 'ws-1']],
      ['order', ['occurred_on', { ascending: false }]],
      ['order', ['created_at', { ascending: false }]],
      ['limit', [200]],
    ]);
  });

  it('agrège par description pliée : nombre, dernière catégorie, dernier libellé affiché', async () => {
    descriptionsQuery.result = {
      data: [
        ligne('Colruyt', '2026-08-20', 'c-1'),
        ligne('Station Q8', '2026-08-18', 'c-2'),
        ligne('colruyt', '2026-08-10', null),
        ligne('COLRUYT', '2026-08-02', 'c-2'),
      ],
      error: null,
    };
    const res = await getExpenseEntryContextAction();
    expect(res.ok && res.data.descriptions).toEqual([
      { label: 'Colruyt', categoryId: 'c-1', count: 3, lastOn: '2026-08-20' },
      { label: 'Station Q8', categoryId: 'c-2', count: 1, lastOn: '2026-08-18' },
    ]);
  });

  it('écarte une description qui ne dit aucun lieu : nom de catégorie ou mot par défaut', async () => {
    descriptionsQuery.result = {
      data: [
        // The sheet writes the category name in place of an empty description…
        ligne('Courses', '2026-08-20', 'c-1'),
        ligne('carburant', '2026-08-20', 'c-2'),
        // …and the default word, in whatever language the sheet was in.
        ligne('Dépense', '2026-08-19', null),
        ligne('Colruyt', '2026-08-18', 'c-1'),
      ],
      error: null,
    };
    const res = await getExpenseEntryContextAction();
    expect(res.ok && res.data.descriptions.map((d) => d.label)).toEqual(['Colruyt']);
  });

  it.each(['fr-BE', 'nl-BE', 'en', 'de-DE', 'es-ES'] as const)(
    'écarte le mot par défaut de la locale %s',
    async (locale) => {
      // The list of default words lives in the action; the messages are the
      // truth. This case breaks the day one of them changes without the other.
      const m = (await import(`../../../../messages/${locale}.json`)).default as {
        app: { expenses: { addSheet: { fallbackLabel: string } } };
      };
      descriptionsQuery.result = {
        data: [ligne(m.app.expenses.addSheet.fallbackLabel, '2026-08-19', null)],
        error: null,
      };
      const res = await getExpenseEntryContextAction();
      expect(res.ok && res.data.descriptions).toEqual([]);
    },
  );

  it('une lecture en erreur ne casse pas le contexte : aucune description, le reste intact', async () => {
    descriptionsQuery.result = { data: null, error: { message: 'boom' } };
    const res = await getExpenseEntryContextAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.descriptions).toEqual([]);
    expect(res.data.ilTeReste).toBe(429.89);
    expect(res.data.chips.length).toBeGreaterThan(0);
  });

  it('un client qui lève ne casse pas le contexte non plus', async () => {
    descriptionsQuery.throws = true;
    const res = await getExpenseEntryContextAction();
    expect(res.ok && res.data.descriptions).toEqual([]);
  });
});
