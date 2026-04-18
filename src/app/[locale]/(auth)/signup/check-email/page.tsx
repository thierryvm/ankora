import type { Metadata } from 'next';
import { Mail } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.checkEmail');
  return { title: t('metaTitle') };
}

export default async function CheckEmailPage() {
  const t = await getTranslations('auth.checkEmail');

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--color-brand-100)">
          <Mail className="h-6 w-6 text-(--color-brand-700)" aria-hidden />
        </div>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('body')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">{t('backToLogin')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
