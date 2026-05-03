import Decimal from 'decimal.js';

import { paymentKey, type CockpitCharge, type PaymentLedger, type ReferencePeriod } from './types';

export type NotificationLevel = 'info' | 'warning' | 'danger';

export type NotificationKind =
  | 'transfer_to_savings'
  | 'transfer_from_savings'
  | 'charge_overdue'
  | 'charge_due_soon';

export type CockpitNotification = Readonly<{
  kind: NotificationKind;
  level: NotificationLevel;
  /** i18n message key — the UI layer renders the text via next-intl. */
  messageKey: string;
  /** Values interpolated by the i18n layer — kept as plain JSON-friendly types. */
  values: Readonly<Record<string, string | number>>;
  /** Stable id for React keys; format: `${kind}-${chargeId?}`. */
  id: string;
}>;

export type NotificationsInput = Readonly<{
  /** ADR-012 output. Sign drives the transfer notification. */
  transfertRecommandeAjuste: Decimal;
  charges: readonly CockpitCharge[];
  payments: PaymentLedger;
  ref: ReferencePeriod;
  /** Today's day-of-month (1..31). Caller passes it explicitly so the
   *  domain stays deterministic and timezone-agnostic. */
  todayDayOfMonth: number;
  /** Whether the displayed month is the current real-life month. Notifications
   *  for past or future months would be noise. ADR-011 requires this guard. */
  isCurrentMonth: boolean;
}>;

const DUE_SOON_THRESHOLD_DAYS = 3;

/**
 * Generates the cockpit's reactive notifications (bell + badge).
 * No notifications are produced for past or future months — only the
 * "live" month carries actionable signals.
 */
export function genererNotifications(input: NotificationsInput): readonly CockpitNotification[] {
  if (!input.isCurrentMonth) return [];

  const out: CockpitNotification[] = [];

  // 1. Transfer suggestion (positive → vers épargne, negative → depuis épargne).
  if (input.transfertRecommandeAjuste.gt(0)) {
    out.push({
      kind: 'transfer_to_savings',
      level: 'info',
      messageKey: 'app.cockpit.notifications.transferToSavings',
      values: { amount: input.transfertRecommandeAjuste.toFixed(2) },
      id: 'transfer_to_savings',
    });
  } else if (input.transfertRecommandeAjuste.lt(0)) {
    out.push({
      kind: 'transfer_from_savings',
      level: 'warning',
      messageKey: 'app.cockpit.notifications.transferFromSavings',
      values: { amount: input.transfertRecommandeAjuste.abs().toFixed(2) },
      id: 'transfer_from_savings',
    });
  }

  // 2. Per-charge notifications for unpaid bills due this month.
  for (const c of input.charges) {
    if (!c.isActive) continue;
    if (!c.paymentMonths.includes(input.ref.month)) continue;
    const isPaid = input.payments.get(paymentKey(c.id, input.ref.year, input.ref.month)) === true;
    if (isPaid) continue;

    const joursRestants = c.paymentDay - input.todayDayOfMonth;

    if (joursRestants < 0) {
      out.push({
        kind: 'charge_overdue',
        level: 'danger',
        messageKey: 'app.cockpit.notifications.chargeOverdue',
        values: { label: c.label, day: c.paymentDay },
        id: `charge_overdue-${c.id}`,
      });
    } else if (joursRestants <= DUE_SOON_THRESHOLD_DAYS) {
      out.push({
        kind: 'charge_due_soon',
        level: 'warning',
        messageKey: 'app.cockpit.notifications.chargeDueSoon',
        values: { label: c.label, days: joursRestants },
        id: `charge_due_soon-${c.id}`,
      });
    }
  }

  return out;
}
