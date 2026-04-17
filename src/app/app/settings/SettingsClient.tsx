'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

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
import {
  updateProfileAction,
  enrollMfaAction,
  verifyMfaAction,
  unenrollMfaAction,
  exportMyDataAction,
  requestAccountDeletionAction,
} from '@/lib/actions/settings';

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
      <DangerZone deletion={deletion} />
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
  const [name, setName] = useState(displayName);
  const [lang, setLang] = useState(locale);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateProfileAction({ displayName: name, locale: lang });
      if (res.ok) toast.success('Profil mis à jour');
      else toast.error(res.error);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil</CardTitle>
        <CardDescription>Ces informations personnalisent ton cockpit.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} readOnly disabled />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Nom d&apos;affichage</Label>
            <Input
              id="displayName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="locale">Langue</Label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr-BE">Français (Belgique)</SelectItem>
                <SelectItem value="fr-FR">Français (France)</SelectItem>
                <SelectItem value="en-GB">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MfaCard({ factors }: { factors: Factor[] }) {
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
      else toast.error(res.error);
    });
  };

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    startTransition(async () => {
      const res = await verifyMfaAction({ factorId: enrollment.factorId, code });
      if (res.ok) {
        toast.success('MFA activé');
        setEnrollment(null);
        setCode('');
      } else toast.error(res.error);
    });
  };

  const remove = (factorId: string) => {
    startTransition(async () => {
      const res = await unenrollMfaAction(factorId);
      if (res.ok) toast.success('MFA désactivé');
      else toast.error(res.error);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sécurité — 2FA</CardTitle>
        <CardDescription>
          Un code à usage unique généré par une app d&apos;authentification (Authy, 1Password,
          Google Authenticator).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {verified.length === 0 && !enrollment && (
          <div>
            <p className="text-sm text-(--color-muted-foreground)">
              Aucun facteur 2FA actif. Active-le pour protéger ton compte.
            </p>
            <Button type="button" onClick={startEnroll} disabled={pending} className="mt-3">
              {pending ? 'Préparation…' : 'Activer la 2FA'}
            </Button>
          </div>
        )}

        {enrollment && (
          <form onSubmit={confirm} className="flex flex-col gap-3">
            <p className="text-sm">
              Scanne ce QR code dans ton app d&apos;authentification, puis saisis le code à 6
              chiffres.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qr}
              alt="QR code pour l'app d'authentification"
              width={192}
              height={192}
              className="h-48 w-48 rounded-md border border-(--color-border) bg-white p-2"
            />
            <details className="text-xs text-(--color-muted-foreground)">
              <summary className="cursor-pointer">Saisie manuelle</summary>
              <code className="mt-2 block rounded bg-(--color-brand-100) px-2 py-1 font-mono text-(--color-brand-900)">
                {enrollment.secret}
              </code>
            </details>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mfaCode">Code à 6 chiffres</Label>
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
                {pending ? 'Vérification…' : 'Vérifier et activer'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEnrollment(null)}
                disabled={pending}
              >
                Annuler
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
                  <p className="text-sm font-medium">{f.friendlyName ?? 'App TOTP'}</p>
                  <p className="text-xs text-(--color-success)">Actif</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => remove(f.id)}
                  disabled={pending}
                >
                  Désactiver
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
  const [pending, startTransition] = useTransition();

  const onExport = () => {
    startTransition(async () => {
      const res = await exportMyDataAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.data.payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export téléchargé');
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mes données</CardTitle>
        <CardDescription>
          Portabilité RGPD (art. 20) — télécharge un JSON complet de tout ce qu&apos;Ankora détient
          sur toi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={onExport} disabled={pending}>
          {pending ? 'Génération…' : 'Télécharger mes données'}
        </Button>
      </CardContent>
    </Card>
  );
}

function DangerZone({ deletion }: { deletion: Deletion }) {
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, startTransition] = useTransition();

  const onRequest = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await requestAccountDeletionAction({ reason, confirm });
      if (res.ok) {
        toast.success('Suppression programmée — tu as 30 jours pour annuler');
        setReason('');
        setConfirm('');
      } else toast.error(res.error);
    });
  };

  if (deletion) {
    const date = new Date(deletion.scheduledFor).toLocaleDateString('fr-BE', {
      dateStyle: 'long',
    });
    return (
      <Card className="border-(--color-danger)/40">
        <CardHeader>
          <CardTitle className="text-(--color-danger)">Suppression en cours</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Ton compte sera supprimé le <strong>{date}</strong>. Tu peux annuler à tout moment
            jusque-là.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/app/settings/deletion-status">Voir le statut</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-(--color-danger)/40">
      <CardHeader>
        <CardTitle className="text-(--color-danger)">Zone dangereuse</CardTitle>
        <CardDescription>
          Suppression définitive du compte. Grâce de 30 jours pour annuler — après, tout est effacé
          (logs audit pseudonymisés).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onRequest} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">Raison (optionnel)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Aide-nous à nous améliorer…"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">
              Tape <code className="font-mono">SUPPRIMER</code> pour confirmer
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
              disabled={pending || confirm !== 'SUPPRIMER'}
            >
              {pending ? 'Programmation…' : 'Supprimer mon compte'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
