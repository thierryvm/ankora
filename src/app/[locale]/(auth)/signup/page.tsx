import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignupForm } from './SignupForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signup');
  return { title: t('title') };
}

export default async function SignupPage() {
  const t = await getTranslations('auth.signup');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pageTitle')}</CardTitle>
        <CardDescription>{t('pageDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex flex-col gap-3">
          <GoogleSignInButton label={t('googleCta')} />
          <p className="text-muted-foreground text-center text-xs">
            {t.rich('googleTerms', {
              cgu: (chunks) => (
                <Link href="/legal/cgu" className="hover:text-foreground underline">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/legal/privacy" className="hover:text-foreground underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            <span>{t('dividerOrEmail')}</span>
            <span className="bg-border h-px flex-1" />
          </div>
        </div>
        <SignupForm />
        <p className="text-muted-foreground mt-6 text-center text-sm">
          {t('haveAccount')}{' '}
          <Link href="/login" className="text-brand-700 font-medium hover:underline">
            {t('loginLink')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
