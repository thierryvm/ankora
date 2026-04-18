'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import type { Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/i18n/formatters';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  locale: string;
  factors: Factor[];
  deletion: Deletion;
};

export function SettingsClient({ email, displayName, locale, factors, deletion }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileCard email={email} displayName={displayName} locale={locale} />
      <MfaCard factors={factors} />
      <DataCard />
      <DangerZone deletion={deletion} locale={locale} />
    </div>
  );
}

function ProfileCard({
  email,
  displayName,
  locale,
}: {
  email: string;
  displayName: string;
  locale: string;
}) {
  const t = useTranslations('app.settings.profile');
  const tOptions = useTranslations('app.settings.profile.localeOptions');
  const translateError = useActionErrorTranslator();
  const [name, setName] = useState(displayName);
  const [lang, setLang] = useState(locale);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateProfileAction({ displayName: name, locale: lang });
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="locale">{t('localeLabel')}</Label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr-BE">{tOptions('fr-BE')}</SelectItem>
                <SelectItem value="fr-FR">{tOptions('fr-FR')}</SelectItem>
                <SelectItem value="en-GB">{tOptions('en-GB')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
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
            <p className="text-sm text-(--color-muted-foreground)">{t('emptyState')}</p>
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
              className="h-48 w-48 rounded-md border border-(--color-border) bg-white p-2"
            />
            <details className="text-xs text-(--color-muted-foreground)">
              <summary className="cursor-pointer">{t('manualEntry')}</summary>
              <code className="mt-2 block rounded bg-(--color-brand-100) px-2 py-1 font-mono text-(--color-brand-900)">
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
                className="flex items-center justify-between rounded-md border border-(--color-border) px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{f.friendlyName ?? t('defaultFactorName')}</p>
                  <p className="text-xs text-(--color-success)">{t('activeLabel')}</p>
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

function DangerZone({ deletion, locale }: { deletion: Deletion; locale: string }) {
  const t = useTranslations('app.settings.danger');
  const translateError = useActionErrorTranslator();
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, startTransition] = useTransition();
  const confirmKeyword = t('confirmKeyword');

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
      <Card className="border-(--color-danger)/40">
        <CardHeader>
          <CardTitle className="text-(--color-danger)">{t('scheduledTitle')}</CardTitle>
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
    <Card className="border-(--color-danger)/40">
      <CardHeader>
        <CardTitle className="text-(--color-danger)">{t('title')}</CardTitle>
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
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </Label>
            <Input
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || confirm !== confirmKeyword}
            >
              {pending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
