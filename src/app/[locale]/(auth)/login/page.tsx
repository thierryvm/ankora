import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './LoginForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('metaTitle') };
}

type LoginPageProps = {
  searchParams: Promise<{ reset?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getTranslations('auth.login');
  const params = await searchParams;
  const resetDone = params.reset === 'done';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {resetDone && (
          <div
            role="status"
            className="mb-4 rounded-md border border-(--color-success) bg-(--color-success)/10 px-3 py-2 text-sm text-(--color-success)"
          >
            {t('passwordUpdatedBanner')}
          </div>
        )}
        <div className="mb-6 flex flex-col gap-4">
          <GoogleSignInButton />
          <div className="flex items-center gap-3 text-xs text-(--color-muted-foreground)">
            <span className="h-px flex-1 bg-(--color-border)" />
            <span>{t('dividerOrEmail')}</span>
            <span className="h-px flex-1 bg-(--color-border)" />
          </div>
        </div>
        <LoginForm />
        <div className="mt-6 flex flex-col gap-2 text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-(--color-muted-foreground) hover:text-(--color-foreground)"
          >
            {t('forgotLink')}
          </Link>
          <p className="text-(--color-muted-foreground)">
            {t('noAccount')}{' '}
            <Link href="/signup" className="font-medium text-(--color-brand-700) hover:underline">
              {t('signupLink')}
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
