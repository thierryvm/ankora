import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { genererNotifications } from '@/lib/domain/cockpit/notifications';
import { paymentKey, type CockpitCharge, type ReferencePeriod } from '@/lib/domain/cockpit/types';

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: over.label ?? 'Test',
  amount: over.amount ?? new Decimal(0),
  frequency: over.frequency ?? 'monthly',
  paymentMonths: over.paymentMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paymentDay: over.paymentDay ?? 15,
  isActive: over.isActive ?? true,
});

const ref = (year: number, month: number): ReferencePeriod => ({ year, month });
const noPayments = new Map<string, boolean>();

describe('genererNotifications — guard rails', () => {
  it('returns nothing when isCurrentMonth is false', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(100),
      charges: [charge({ paymentDay: 15 })],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 1,
      isCurrentMonth: false,
    });
    expect(out).toHaveLength(0);
  });

  it('returns nothing when nothing is actionable', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(0),
      charges: [],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 1,
      isCurrentMonth: true,
    });
    expect(out).toHaveLength(0);
  });
});

describe('genererNotifications — transfer suggestions', () => {
  it('emits info "transfer_to_savings" when ajusté > 0', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(59),
      charges: [],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 1,
      isCurrentMonth: true,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('transfer_to_savings');
    expect(out[0]!.level).toBe('info');
    expect(out[0]!.values).toEqual({ amount: '59.00' });
  });

  it('emits warning "transfer_from_savings" with absolute amount when < 0', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(-241.5),
      charges: [],
      payments: noPayments,
      ref: ref(2026, 6),
      todayDayOfMonth: 1,
      isCurrentMonth: true,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('transfer_from_savings');
    expect(out[0]!.level).toBe('warning');
    expect(out[0]!.values).toEqual({ amount: '241.50' });
  });

  it('does NOT emit a transfer notification when ajusté = 0', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(0),
      charges: [],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 1,
      isCurrentMonth: true,
    });
    expect(out.find((n) => n.kind.startsWith('transfer_'))).toBeUndefined();
  });
});

describe('genererNotifications — per-charge alerts', () => {
  it('emits "charge_overdue" with danger level when paymentDay < today', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(0),
      charges: [charge({ id: 'rent', label: 'Loyer', paymentDay: 5, paymentMonths: [5] })],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 10,
      isCurrentMonth: true,
    });
    const overdue = out.find((n) => n.kind === 'charge_overdue');
    expect(overdue).toBeDefined();
    expect(overdue!.level).toBe('danger');
    expect(overdue!.values).toEqual({ label: 'Loyer', day: 5 });
    expect(overdue!.id).toBe('charge_overdue-rent');
  });

  it('emits "charge_due_soon" with warning level when ≤ 3 days away', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(0),
      charges: [charge({ id: 'phone', label: 'Telecom', paymentDay: 18, paymentMonths: [5] })],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 16,
      isCurrentMonth: true,
    });
    const dueSoon = out.find((n) => n.kind === 'charge_due_soon');
    expect(dueSoon).toBeDefined();
    expect(dueSoon!.level).toBe('warning');
    expect(dueSoon!.values).toEqual({ label: 'Telecom', days: 2 });
  });

  it('does NOT alert when the charge is paid for the current period', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(0),
      charges: [charge({ id: 'rent', paymentDay: 5, paymentMonths: [5] })],
      payments: new Map<string, boolean>([[paymentKey('rent', 2026, 5), true]]),
      ref: ref(2026, 5),
      todayDayOfMonth: 10,
      isCurrentMonth: true,
    });
    expect(out.find((n) => n.kind.startsWith('charge_'))).toBeUndefined();
  });

  it('does NOT alert for charges not due this month', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(0),
      charges: [
        charge({ paymentDay: 5, paymentMonths: [3] }), // due in March
      ],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 1,
      isCurrentMonth: true,
    });
    expect(out).toHaveLength(0);
  });

  it('does NOT alert for inactive charges', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(0),
      charges: [charge({ paymentDay: 1, paymentMonths: [5], isActive: false })],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 28,
      isCurrentMonth: true,
    });
    expect(out).toHaveLength(0);
  });

  it('does NOT alert when the charge is more than 3 days away', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(0),
      charges: [charge({ paymentDay: 25, paymentMonths: [5] })],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 10,
      isCurrentMonth: true,
    });
    expect(out).toHaveLength(0);
  });

  it('emits multiple notifications when several charges qualify', () => {
    const out = genererNotifications({
      transfertRecommandeAjuste: new Decimal(50),
      charges: [
        charge({ id: 'a', label: 'A', paymentDay: 5, paymentMonths: [5] }), // overdue
        charge({ id: 'b', label: 'B', paymentDay: 12, paymentMonths: [5] }), // due soon
        charge({ id: 'c', label: 'C', paymentDay: 28, paymentMonths: [5] }), // far future
      ],
      payments: noPayments,
      ref: ref(2026, 5),
      todayDayOfMonth: 10,
      isCurrentMonth: true,
    });
    // 1 transfer + 1 overdue (a) + 1 due_soon (b) = 3
    expect(out).toHaveLength(3);
    expect(out.filter((n) => n.kind === 'charge_overdue')).toHaveLength(1);
    expect(out.filter((n) => n.kind === 'charge_due_soon')).toHaveLength(1);
  });
});
