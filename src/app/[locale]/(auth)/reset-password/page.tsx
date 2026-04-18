import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from './ResetPasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.reset');
  return { title: t('title') };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth.reset');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
