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
        {/*
         * The arrow moved INSIDE the link, and the link carries `min-h-11`.
         * Measured 160 × 17 on 2026-08-22 (WebKit, iPhone 14) — under the
         * 24 × 24 floor of WCAG 2.2 AA · 2.5.8, with no exception available:
         * the link is the whole line, not a word inside a sentence. Leaving the
         * arrow outside made it decoration next to the target instead of part
         * of it, which is both a smaller tap area and a worse label.
         */}
        <p className="mt-6 flex justify-center text-sm">
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center justify-center gap-1 px-2"
          >
            <span aria-hidden="true">←</span>
            {t('backToLogin')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
