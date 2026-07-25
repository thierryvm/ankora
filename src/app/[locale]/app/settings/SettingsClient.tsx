'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { Locale } from '@/i18n/routing';
import { formatDate, normalizeEmail } from '@/lib/i18n/formatters';

import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import {
  updateProfileAction,
  enrollMfaAction,
  verifyMfaAction,
  unenrollMfaAction,
  exportMyDataAction,
  requestAccountDeletionAction,
} from '@/lib/actions/settings';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

type Factor = { id: string; friendlyName: string | null; status: string };
type Deletion = { scheduledFor: string; status: string } | null;

type Props = {
  email: string;
  displayName: string;
  factors: Factor[];
  deletion: Deletion;
  /**
   * Optional slot rendered between DataCard and DangerZone — used by the
   * page-level Server Component to inject the CookiesPreferencesSection
   * (which needs server-fetched consent state) without leaking that data
   * fetch into this client tree.
   */
  cookiesSection?: React.ReactNode;
};

export function SettingsClient({ email, displayName, factors, deletion, cookiesSection }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileCard email={email} displayName={displayName} />
      <MfaCard factors={factors} />
      <DataCard />
      {cookiesSection}
      <DangerZone deletion={deletion} email={email} />
    </div>
  );
}

function ProfileCard({ email, displayName }: { email: string; displayName: string }) {
  const t = useTranslations('app.settings.profile');
  const translateError = useActionErrorTranslator();
  const [name, setName] = useState(displayName);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateProfileAction({ displayName: name });
      if (res.ok) toast.success(t('toastSaved'));
      else toast.error(translateError(res.errorCode));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            <Input id="email" type="email" value={email} readOnly disabled />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">{t('displayNameLabel')}</Label>
            <Input
              id="displayName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>

        {/*
          Language sits OUTSIDE the form on purpose. It is not a draft the user
          submits — `LocaleSwitcher` persists the choice immediately and then
          navigates to the localised URL, which remounts this card. Leaving the
          control inside the form would suggest "Save" applies to it, and a name
          typed but not yet saved would vanish on switch with no explanation.
          Same label-left / control-right grammar as the theme toggle in
          `MoreSheet`.

          `data-testid` on the WRAPPER, not on the switcher: `/app/settings`
          mounts `<Header variant="app">` (which renders a LocaleSwitcher in a
          `hidden lg:flex` block — present in the DOM at every viewport) and,
          on mobile, `MoreSheet` renders another. There are therefore two to
          three instances on this page, all carrying the same internal testids.
          Any Playwright locator for this one must scope through this wrapper,
          or hit a strict-mode violation.
        */}
        <div
          data-testid="settings-locale-field"
          className="border-border mt-4 flex items-center justify-between gap-4 border-t pt-4"
        >
          {/*
            A <span>, not a <Label>: `LocaleSwitcher` is a radiogroup with no
            single labelable control, so `htmlFor` would dangle.

            It NAMES the group through `labelledById` rather than letting the
            switcher use its own `aria-label`. At ≥1024px this page mounts a
            second switcher in the header, and two radiogroups both announced
            as "Changer de langue" are indistinguishable in a screen reader's
            element list. Borrowing the visible "Langue" text disambiguates
            them, and makes the accessible name exactly match the visible one
            (WCAG 2.5.3) instead of merely containing it.
          */}
          <span id="settings-locale-label" className="text-sm leading-none font-medium">
            {t('localeLabel')}
          </span>
          <LocaleSwitcher labelledById="settings-locale-label" />
        </div>
      </CardContent>
    </Card>
  );
}

function MfaCard({ factors }: { factors: Factor[] }) {
  const t = useTranslations('app.settings.mfa');
  const translateError = useActionErrorTranslator();
  const verified = factors.filter((f) => f.status === 'verified');
  const [enrollment, setEnrollment] = useState<{
    factorId: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [pending, startTransition] = useTransition();

  const startEnroll = () => {
    startTransition(async () => {
      const res = await enrollMfaAction();
      if (res.ok) setEnrollment(res.data);
      else toast.error(translateError(res.errorCode));
    });
  };

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    startTransition(async () => {
      const res = await verifyMfaAction({ factorId: enrollment.factorId, code });
      if (res.ok) {
        toast.success(t('toastEnabled'));
        setEnrollment(null);
        setCode('');
      } else toast.error(translateError(res.errorCode));
    });
  };

  const remove = (factorId: string) => {
    startTransition(async () => {
      const res = await unenrollMfaAction(factorId);
      if (res.ok) toast.success(t('toastDisabled'));
      else toast.error(translateError(res.errorCode));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {verified.length === 0 && !enrollment && (
          <div>
            <p className="text-muted-foreground text-sm">{t('emptyState')}</p>
            <Button type="button" onClick={startEnroll} disabled={pending} className="mt-3">
              {pending ? t('enrolling') : t('enrollButton')}
            </Button>
          </div>
        )}

        {enrollment && (
          <form onSubmit={confirm} className="flex flex-col gap-3">
            <p className="text-sm">{t('scanInstruction')}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qr}
              alt={t('qrAlt')}
              width={192}
              height={192}
              className="border-border h-48 w-48 rounded-md border bg-white p-2"
            />
            <details className="text-muted-foreground text-xs">
              <summary className="cursor-pointer">{t('manualEntry')}</summary>
              <code className="bg-brand-100 text-brand-900 mt-2 block rounded px-2 py-1 font-mono">
                {enrollment.secret}
              </code>
            </details>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mfaCode">{t('codeLabel')}</Label>
              <Input
                id="mfaCode"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || code.length !== 6}>
                {pending ? t('verifying') : t('verifyButton')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEnrollment(null)}
                disabled={pending}
              >
                {t('cancel')}
              </Button>
            </div>
          </form>
        )}

        {verified.length > 0 && (
          <ul className="flex flex-col gap-2">
            {verified.map((f) => (
              <li
                key={f.id}
                className="border-border flex items-center justify-between rounded-md border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{f.friendlyName ?? t('defaultFactorName')}</p>
                  <p className="text-success text-xs">{t('activeLabel')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => remove(f.id)}
                  disabled={pending}
                >
                  {t('disableButton')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DataCard() {
  const t = useTranslations('app.settings.data');
  const translateError = useActionErrorTranslator();
  const [pending, startTransition] = useTransition();

  const onExport = () => {
    startTransition(async () => {
      const res = await exportMyDataAction();
      if (!res.ok) {
        toast.error(translateError(res.errorCode));
        return;
      }
      const blob = new Blob([res.data.payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('toastDownloaded'));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={onExport} disabled={pending}>
          {pending ? t('exporting') : t('exportButton')}
        </Button>
      </CardContent>
    </Card>
  );
}

function DangerZone({ deletion, email }: { deletion: Deletion; email: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('app.settings.danger');
  const translateError = useActionErrorTranslator();
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, startTransition] = useTransition();
  // i18n-safe destructive-action pattern: the user must type their own email
  // address (case-insensitive, trimmed) — no translated keyword to drift.
  const expected = normalizeEmail(email);
  const confirmMatches = normalizeEmail(confirm) === expected;

  const onRequest = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await requestAccountDeletionAction({ reason, confirm });
      if (res.ok) {
        toast.success(t('toastScheduled'));
        setReason('');
        setConfirm('');
      } else toast.error(translateError(res.errorCode));
    });
  };

  if (deletion) {
    const date = formatDate(deletion.scheduledFor, locale as Locale, 'long');
    return (
      <Card className="border-danger/40">
        <CardHeader>
          <CardTitle className="text-danger">{t('scheduledTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {t.rich('scheduledBody', {
              date,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/app/settings/deletion-status">{t('viewStatus')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle className="text-danger">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onRequest} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">{t('reasonLabel')}</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder={t('reasonPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">
              {t.rich('confirmLabel', {
                email,
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </Label>
            <Input
              id="confirm"
              type="email"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              placeholder={email}
              required
            />
          </div>
          <div>
            <Button type="submit" variant="destructive" disabled={pending || !confirmMatches}>
              {pending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
