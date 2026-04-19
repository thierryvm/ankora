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
            className="border-success bg-success/10 text-success mb-4 rounded-md border px-3 py-2 text-sm"
          >
            {t('passwordUpdatedBanner')}
          </div>
        )}
        <div className="mb-6 flex flex-col gap-4">
          <GoogleSignInButton />
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            <span>{t('dividerOrEmail')}</span>
            <span className="bg-border h-px flex-1" />
          </div>
        </div>
        <LoginForm />
        <div className="mt-6 flex flex-col gap-2 text-center text-sm">
          <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
            {t('forgotLink')}
          </Link>
          <p className="text-muted-foreground">
            {t('noAccount')}{' '}
            <Link href="/signup" className="text-brand-700 font-medium hover:underline">
              {t('signupLink')}
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
