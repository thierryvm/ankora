import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.forgot');
  return { title: t('title') };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgot');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
        <p className="mt-6 text-center text-sm text-(--color-muted-foreground)">
          <Link href="/login" className="hover:text-(--color-foreground)">
            ← {t('backToLogin')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
