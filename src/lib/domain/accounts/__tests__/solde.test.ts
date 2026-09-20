import { describe, expect, it } from 'vitest';

import {
  compareStatementOrder,
  deriveAccountBalance,
  flowCountsAfterStatement,
  measureStatementGap,
  selectLatestStatement,
  type AccountBalanceStatement,
  type AccountFlow,
} from '@/lib/domain/accounts/solde';
import { money } from '@/lib/domain/types';

// Every figure below is INVENTED. This repository is public and the real
// numbers of the person using the app never enter it (CLAUDE.md §« Ce dépôt
// est PUBLIC »).

/** `date` column shape: day-granular, UTC midnight. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** `timestamptz` column shape: an instant. */
const at = (iso: string) => new Date(iso);

function statement(over: Partial<AccountBalanceStatement> = {}): AccountBalanceStatement {
  return {
    id: 'stmt-1',
    accountType: 'income_bills',
    // A number crossing `money()`, never a raw Decimal: a Decimal in a fixture
    // hides the RSC-boundary crash instead of exposing it.
    balance: money(1250),
    statedOn: day('2026-03-10'),
    recordedAt: at('2026-03-10T18:00:00.000Z'),
    cancelledAt: null,
    ...over,
  };
}

function flow(over: Partial<AccountFlow> = {}): AccountFlow {
  return {
    id: 'flow-1',
    accountType: 'income_bills',
    direction: 'out',
    amount: money(80),
    occurredOn: day('2026-03-12'),
    recordedAt: at('2026-03-12T09:00:00.000Z'),
    cancelledAt: null,
    ...over,
  };
}

const ASOF = day('2026-03-31');

describe('flowCountsAfterStatement — la règle de l’heure (ADR-045 D16)', () => {
  const anchor = statement();

  it('counts a flow that happened after the statement day', () => {
    expect(flowCountsAfterStatement(anchor, flow({ occurredOn: day('2026-03-11') }))).toBe(true);
  });

  it('never counts a flow that happened before the statement day', () => {
    expect(flowCountsAfterStatement(anchor, flow({ occurredOn: day('2026-03-09') }))).toBe(false);
  });

  it('counts a same-day flow written after the statement', () => {
    const sameDay = flow({
      occurredOn: day('2026-03-10'),
      recordedAt: at('2026-03-10T18:00:00.001Z'),
    });
    expect(flowCountsAfterStatement(anchor, sameDay)).toBe(true);
  });

  it('does not count a same-day flow written before the statement', () => {
    const sameDay = flow({
      occurredOn: day('2026-03-10'),
      recordedAt: at('2026-03-10T17:59:59.999Z'),
    });
    expect(flowCountsAfterStatement(anchor, sameDay)).toBe(false);
  });

  // Strictly posterior. Equal instants mean the statement already saw it.
  it('does not count a same-day flow written at the very instant of the statement', () => {
    const sameDay = flow({
      occurredOn: day('2026-03-10'),
      recordedAt: at('2026-03-10T18:00:00.000Z'),
    });
    expect(flowCountsAfterStatement(anchor, sameDay)).toBe(false);
  });

  // The branch that exists only for pre-journal rows (`expenses`,
  // `charge_payments`, …): no write instant, so the same day cannot be ordered.
  it('does not count a same-day flow that carries NO write instant', () => {
    const legacy = flow({ occurredOn: day('2026-03-10'), recordedAt: null });
    expect(flowCountsAfterStatement(anchor, legacy)).toBe(false);
  });

  it('still counts a LATER-day flow that carries no write instant', () => {
    const legacy = flow({ occurredOn: day('2026-03-11'), recordedAt: null });
    expect(flowCountsAfterStatement(anchor, legacy)).toBe(true);
  });
});

describe('selectLatestStatement — l’ordre total (stated_on, recorded_at, id)', () => {
  it('returns null when the account has no statement at all', () => {
    expect(selectLatestStatement([], 'income_bills')).toBeNull();
  });

  it('returns null when every statement belongs to another account', () => {
    expect(
      selectLatestStatement([statement({ accountType: 'provisions' })], 'daily_card'),
    ).toBeNull();
  });

  it('picks the most recent stated_on', () => {
    const older = statement({ id: 'a', statedOn: day('2026-03-01') });
    const newer = statement({ id: 'b', statedOn: day('2026-03-20') });
    expect(selectLatestStatement([newer, older], 'income_bills')).toBe(newer);
    expect(selectLatestStatement([older, newer], 'income_bills')).toBe(newer);
  });

  // Two statements the same day is how a typo gets corrected without erasing.
  it('breaks a same-day tie on recorded_at', () => {
    const first = statement({ id: 'a', recordedAt: at('2026-03-10T08:00:00.000Z') });
    const corrected = statement({
      id: 'b',
      balance: money(1265.4),
      recordedAt: at('2026-03-10T21:30:00.000Z'),
    });
    expect(selectLatestStatement([first, corrected], 'income_bills')).toBe(corrected);
  });

  // Two rows written in the same transaction share `now()` to the microsecond.
  it('breaks a full tie on id, so the answer is never arbitrary', () => {
    const a = statement({ id: 'aaa' });
    const b = statement({ id: 'bbb' });
    expect(selectLatestStatement([a, b], 'income_bills')).toBe(b);
    expect(selectLatestStatement([b, a], 'income_bills')).toBe(b);
  });

  it('ignores a cancelled statement, even when it is the most recent', () => {
    const kept = statement({ id: 'a', statedOn: day('2026-03-10') });
    const cancelled = statement({
      id: 'b',
      statedOn: day('2026-03-20'),
      cancelledAt: at('2026-03-21T10:00:00.000Z'),
    });
    expect(selectLatestStatement([kept, cancelled], 'income_bills')).toBe(kept);
  });

  it('never crosses accounts', () => {
    const mine = statement({ id: 'a', accountType: 'provisions', statedOn: day('2026-03-01') });
    const other = statement({ id: 'b', accountType: 'daily_card', statedOn: day('2026-03-25') });
    expect(selectLatestStatement([mine, other], 'provisions')).toBe(mine);
  });
});

describe('compareStatementOrder', () => {
  it('sorts oldest first, so the last element is the latest', () => {
    // `b` and `c` share a day, so `recordedAt` breaks the tie — and both are
    // spelled out here. Leaving `b` on the fixture default once made this case
    // unreachable: the default is later than an explicit date picked to be
    // "later", and the test then asserted an order the comparator cannot
    // produce. A tie-break fixture states both sides, or it states nothing.
    const a = statement({ id: 'a', statedOn: day('2026-03-01') });
    const b = statement({
      id: 'b',
      statedOn: day('2026-03-05'),
      recordedAt: at('2026-03-05T08:00:00.000Z'),
    });
    const c = statement({
      id: 'c',
      statedOn: day('2026-03-05'),
      recordedAt: at('2026-03-06T00:00:00.000Z'),
    });
    expect([c, a, b].sort(compareStatementOrder).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns 0 for two rows identical on the three ordering columns', () => {
    expect(compareStatementOrder(statement(), statement())).toBe(0);
  });
});

describe('deriveAccountBalance', () => {
  it('returns the statement balance when nothing happened after it', () => {
    const result = deriveAccountBalance({ statement: statement(), flows: [], asOf: ASOF });
    expect(result.balance.toString()).toBe('1250');
    expect(result.netFlow.toString()).toBe('0');
    expect(result.contributions).toEqual([]);
    expect(result.accountType).toBe('income_bills');
  });

  it('adds an inflow and subtracts an outflow', () => {
    const result = deriveAccountBalance({
      statement: statement(),
      flows: [
        flow({ id: 'in', direction: 'in', amount: money(310.5), occurredOn: day('2026-03-14') }),
        flow({ id: 'out', direction: 'out', amount: money(64.4), occurredOn: day('2026-03-15') }),
      ],
      asOf: ASOF,
    });
    expect(result.balance.toString()).toBe('1496.1');
    expect(result.netFlow.toString()).toBe('246.1');
  });

  // Rule 10 of CLAUDE.md: the total travels WITH what makes it up.
  it('carries the decomposition of the total it returns', () => {
    const inflow = flow({
      id: 'in',
      direction: 'in',
      amount: money(310.5),
      occurredOn: day('2026-03-14'),
    });
    const outflow = flow({
      id: 'out',
      direction: 'out',
      amount: money(64.4),
      occurredOn: day('2026-03-15'),
    });
    const result = deriveAccountBalance({
      statement: statement(),
      flows: [inflow, outflow],
      asOf: ASOF,
    });

    expect(result.contributions).toHaveLength(2);
    expect(result.contributions[0]?.flow).toBe(inflow);
    expect(result.contributions[0]?.signedAmount.toString()).toBe('310.5');
    expect(result.contributions[1]?.flow).toBe(outflow);
    expect(result.contributions[1]?.signedAmount.toString()).toBe('-64.4');

    // The decomposition is not decorative: it sums back to the total.
    const rebuilt = result.contributions.reduce(
      (acc, c) => acc.plus(c.signedAmount),
      result.anchor.balance,
    );
    expect(rebuilt.toString()).toBe(result.balance.toString());
  });

  it('exposes the statement it derived from', () => {
    const anchor = statement();
    expect(deriveAccountBalance({ statement: anchor, flows: [], asOf: ASOF }).anchor).toBe(anchor);
  });

  it('ignores a flow belonging to another account', () => {
    const result = deriveAccountBalance({
      statement: statement(),
      flows: [flow({ accountType: 'daily_card', direction: 'out', amount: money(500) })],
      asOf: ASOF,
    });
    expect(result.balance.toString()).toBe('1250');
  });

  it('ignores a CANCELLED flow (ADR-045 D15)', () => {
    const result = deriveAccountBalance({
      statement: statement(),
      flows: [flow({ amount: money(500), cancelledAt: at('2026-03-13T08:00:00.000Z') })],
      asOf: ASOF,
    });
    expect(result.balance.toString()).toBe('1250');
    expect(result.contributions).toEqual([]);
  });

  it('ignores a flow that has not happened yet at the calculation date', () => {
    const result = deriveAccountBalance({
      statement: statement(),
      flows: [flow({ amount: money(500), occurredOn: day('2026-04-02') })],
      asOf: ASOF,
    });
    expect(result.balance.toString()).toBe('1250');
  });

  it('counts a flow occurring ON the calculation date', () => {
    const result = deriveAccountBalance({
      statement: statement(),
      flows: [flow({ direction: 'out', amount: money(25), occurredOn: ASOF })],
      asOf: ASOF,
    });
    expect(result.balance.toString()).toBe('1225');
  });

  it('ignores a flow older than the statement', () => {
    const result = deriveAccountBalance({
      statement: statement(),
      flows: [flow({ amount: money(500), occurredOn: day('2026-02-28') })],
      asOf: ASOF,
    });
    expect(result.balance.toString()).toBe('1250');
  });

  it('derives a negative balance without complaining — an overdraft is a fact', () => {
    const result = deriveAccountBalance({
      statement: statement({ balance: money(40) }),
      flows: [flow({ direction: 'out', amount: money(95.75) })],
      asOf: ASOF,
    });
    expect(result.balance.toString()).toBe('-55.75');
  });

  it('refuses a calculation date older than the statement it derives from', () => {
    expect(() =>
      deriveAccountBalance({ statement: statement(), flows: [], asOf: day('2026-03-09') }),
    ).toThrow(/asOf/);
  });

  it('refuses a flow amount that is not strictly positive — the sign is the direction', () => {
    expect(() =>
      deriveAccountBalance({
        statement: statement(),
        flows: [flow({ amount: money(-30) })],
        asOf: ASOF,
      }),
    ).toThrow(/amount/);
    expect(() =>
      deriveAccountBalance({
        statement: statement(),
        flows: [flow({ amount: money(0) })],
        asOf: ASOF,
      }),
    ).toThrow(/amount/);
  });

  it('refuses an unusable date instead of deriving from NaN', () => {
    expect(() =>
      deriveAccountBalance({
        statement: statement({ statedOn: new Date('pas-une-date') }),
        flows: [],
        asOf: ASOF,
      }),
    ).toThrow(/date/i);
  });
});

describe('invariant D12-1 — un virement interne ne crée pas d’argent', () => {
  it('leaves the sum of the derived balances unchanged', () => {
    const statements: AccountBalanceStatement[] = [
      statement({ id: 's-ib', accountType: 'income_bills', balance: money(1250) }),
      statement({ id: 's-pr', accountType: 'provisions', balance: money(400) }),
      statement({ id: 's-dc', accountType: 'daily_card', balance: money(120.25) }),
    ];

    // ONE transfer, written as the TWO flows it is: a debit and a credit.
    const flows: AccountFlow[] = [
      flow({
        id: 'mv-1-out',
        accountType: 'income_bills',
        direction: 'out',
        amount: money(310),
        occurredOn: day('2026-03-14'),
      }),
      flow({
        id: 'mv-1-in',
        accountType: 'provisions',
        direction: 'in',
        amount: money(310),
        occurredOn: day('2026-03-14'),
      }),
    ];

    const before = statements.reduce((acc, s) => acc.plus(s.balance), money(0));
    const after = statements
      .map((s) => deriveAccountBalance({ statement: s, flows, asOf: ASOF }).balance)
      .reduce((acc, b) => acc.plus(b), money(0));

    expect(after.toString()).toBe(before.toString());
    expect(after.toString()).toBe('1770.25');

    // And it moved: the invariant would also hold if nothing had been counted.
    const source = deriveAccountBalance({ statement: statements[0]!, flows, asOf: ASOF });
    const target = deriveAccountBalance({ statement: statements[1]!, flows, asOf: ASOF });
    expect(source.balance.toString()).toBe('940');
    expect(target.balance.toString()).toBe('710');
  });
});

describe('measureStatementGap — mesurer ce qui MANQUE (ADR-040 D11)', () => {
  const anchor = statement({
    id: 'anchor',
    balance: money(1000),
    statedOn: day('2026-03-01'),
    recordedAt: at('2026-03-01T10:00:00.000Z'),
  });

  it('reports a zero gap when the journal explains the declared balance', () => {
    const declared = statement({ id: 'later', balance: money(1200), statedOn: day('2026-03-10') });
    const result = measureStatementGap({
      statement: declared,
      anchor,
      flows: [flow({ direction: 'in', amount: money(200), occurredOn: day('2026-03-05') })],
    });
    expect(result.derived.toString()).toBe('1200');
    expect(result.declared.toString()).toBe('1200');
    expect(result.gap.toString()).toBe('0');
  });

  it('reports derived − declared when something was never written down', () => {
    const declared = statement({ id: 'later', balance: money(1150), statedOn: day('2026-03-10') });
    const result = measureStatementGap({
      statement: declared,
      anchor,
      flows: [flow({ direction: 'in', amount: money(200), occurredOn: day('2026-03-05') })],
    });
    // +50 : the journal believes 50 € more than the bank says — 50 € of spending
    // was never recorded. This is the number the statement would otherwise absorb.
    expect(result.gap.toString()).toBe('50');
    expect(result.derived.toString()).toBe('1200');
  });

  it('reports a negative gap when money arrived without being written down', () => {
    const declared = statement({
      id: 'later',
      balance: money(1275.8),
      statedOn: day('2026-03-10'),
    });
    const result = measureStatementGap({ statement: declared, anchor, flows: [] });
    expect(result.gap.toString()).toBe('-275.8');
  });

  it('carries the flows that built the derived figure', () => {
    const counted = flow({ direction: 'in', amount: money(200), occurredOn: day('2026-03-05') });
    const result = measureStatementGap({
      statement: statement({ id: 'later', statedOn: day('2026-03-10') }),
      anchor,
      flows: [counted],
    });
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0]?.flow).toBe(counted);
  });

  // The window is open at the anchor and closed at the statement, and BOTH ends
  // use the same hour rule — that is the whole point of having one.
  it('excludes a flow posterior to the statement being measured', () => {
    const declared = statement({ id: 'later', balance: money(1000), statedOn: day('2026-03-10') });
    const result = measureStatementGap({
      statement: declared,
      anchor,
      flows: [flow({ direction: 'in', amount: money(500), occurredOn: day('2026-03-11') })],
    });
    expect(result.gap.toString()).toBe('0');
  });

  it('includes a same-day flow written BEFORE the statement, excludes one written after', () => {
    const declared = statement({
      id: 'later',
      balance: money(1000),
      statedOn: day('2026-03-10'),
      recordedAt: at('2026-03-10T12:00:00.000Z'),
    });
    const beforeIt = flow({
      id: 'before',
      direction: 'in',
      amount: money(70),
      occurredOn: day('2026-03-10'),
      recordedAt: at('2026-03-10T09:00:00.000Z'),
    });
    const afterIt = flow({
      id: 'after',
      direction: 'in',
      amount: money(900),
      occurredOn: day('2026-03-10'),
      recordedAt: at('2026-03-10T15:00:00.000Z'),
    });
    const result = measureStatementGap({
      statement: declared,
      anchor,
      flows: [beforeIt, afterIt],
    });
    expect(result.derived.toString()).toBe('1070');
    expect(result.contributions.map((c) => c.flow.id)).toEqual(['before']);
  });

  it('ignores a cancelled flow inside the window', () => {
    const declared = statement({ id: 'later', balance: money(1000), statedOn: day('2026-03-10') });
    const result = measureStatementGap({
      statement: declared,
      anchor,
      flows: [
        flow({
          direction: 'in',
          amount: money(400),
          occurredOn: day('2026-03-05'),
          cancelledAt: at('2026-03-06T08:00:00.000Z'),
        }),
      ],
    });
    expect(result.gap.toString()).toBe('0');
  });

  it('ignores a flow belonging to another account', () => {
    const declared = statement({ id: 'later', balance: money(1000), statedOn: day('2026-03-10') });
    const result = measureStatementGap({
      statement: declared,
      anchor,
      flows: [
        flow({
          accountType: 'provisions',
          direction: 'in',
          amount: money(400),
          occurredOn: day('2026-03-05'),
        }),
      ],
    });
    expect(result.gap.toString()).toBe('0');
  });

  it('refuses an anchor from another account', () => {
    expect(() =>
      measureStatementGap({
        statement: statement({ id: 'later', statedOn: day('2026-03-10') }),
        anchor: statement({ id: 'anchor', accountType: 'provisions', statedOn: day('2026-03-01') }),
        flows: [],
      }),
    ).toThrow(/account/i);
  });

  it('refuses an anchor that is not strictly earlier in the total order', () => {
    const later = statement({ id: 'later', statedOn: day('2026-03-10') });
    expect(() => measureStatementGap({ statement: later, anchor: later, flows: [] })).toThrow(
      /anchor/i,
    );
    expect(() =>
      measureStatementGap({
        statement: statement({ id: 'a', statedOn: day('2026-03-01') }),
        anchor: statement({ id: 'b', statedOn: day('2026-03-10') }),
        flows: [],
      }),
    ).toThrow(/anchor/i);
  });
});

describe('la frontière du domaine refuse le sous-centime (ADR-045 D19)', () => {
  it('refuses a statement balance carrying more than two decimals', () => {
    expect(() =>
      deriveAccountBalance({
        statement: statement({ balance: money('1250.005') }),
        flows: [],
        asOf: day('2026-03-31'),
      }),
    ).toThrow(/two decimals/);
  });

  it('refuses a flow amount carrying more than two decimals', () => {
    expect(() =>
      deriveAccountBalance({
        statement: statement(),
        flows: [flow({ amount: money('80.001') })],
        asOf: day('2026-03-31'),
      }),
    ).toThrow(/two decimals/);
  });

  it('names the flow that cannot be written, not just the fact', () => {
    expect(() =>
      deriveAccountBalance({
        statement: statement(),
        flows: [flow({ id: 'flow-42', amount: money('80.001') })],
        asOf: day('2026-03-31'),
      }),
    ).toThrow(/flow-42/);
  });

  it('accepts a balance and a flow at exactly two decimals', () => {
    const derived = deriveAccountBalance({
      statement: statement({ balance: money('1250.05') }),
      flows: [flow({ amount: money('80.01') })],
      asOf: day('2026-03-31'),
    });
    expect(derived.balance.toString()).toBe('1170.04');
  });

  /**
   * `measureStatementGap` est l'autre porte du même domaine, et elle laissait
   * passer ce que `deriveAccountBalance` refuse : un écart calculé contre un
   * solde au dix-millième rendrait un « il manque 0,004 € » que personne n'a
   * tapé et qu'aucune ligne n'explique — l'écart deviendrait un artefact de la
   * mesure au lieu d'un fait à montrer.
   */
  it('refuses a statement balance carrying more than two decimals', () => {
    expect(() =>
      measureStatementGap({
        statement: statement({ id: 'b', statedOn: day('2026-03-10'), balance: money('1250.005') }),
        anchor: statement({ id: 'a', statedOn: day('2026-03-01') }),
        flows: [],
      }),
    ).toThrow(/two decimals/);
  });

  it('refuses an anchor balance carrying more than two decimals, and names it', () => {
    expect(() =>
      measureStatementGap({
        statement: statement({ id: 'b', statedOn: day('2026-03-10') }),
        anchor: statement({
          id: 'anchor-7',
          statedOn: day('2026-03-01'),
          balance: money('90.001'),
        }),
        flows: [],
      }),
    ).toThrow(/anchor-7/);
  });

  it('accepts a gap measured between two balances at exactly two decimals', () => {
    const mesure = measureStatementGap({
      statement: statement({ id: 'b', statedOn: day('2026-03-10'), balance: money('1000.05') }),
      anchor: statement({ id: 'a', statedOn: day('2026-03-01'), balance: money('1000.00') }),
      flows: [],
    });
    expect(mesure.gap.toString()).toBe('-0.05');
  });
});
