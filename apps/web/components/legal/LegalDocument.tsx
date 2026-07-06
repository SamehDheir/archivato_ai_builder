'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/shared/Logo';
import { ThemeToggle } from '@/components/shared/theme';
import { LanguageToggle } from '@/components/shared/i18n';

/** One content block: a heading, optional paragraphs, and an optional list. */
interface LegalSection {
  heading: string;
  body?: string[];
  list?: string[];
}

/**
 * Renders a legal document (Privacy Policy / Terms) from the `legal` i18n
 * namespace. Content is data-driven (title, intro, and an array of sections),
 * so both documents share this one presentational component and both locales
 * (EN/AR, RTL-safe) render from JSON.
 */
export function LegalDocument({ doc }: { doc: 'privacy' | 'terms' }) {
  const { t } = useTranslation('legal');
  const sections = t(`${doc}.sections`, { returnObjects: true }) as
    | LegalSection[]
    | string;
  const list = Array.isArray(sections) ? sections : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
          <Link
            href="/"
            aria-label={t('nav.backHome')}
            className="rounded-md transition-opacity hover:opacity-80"
          >
            <Logo />
          </Link>
          <div className="ms-auto flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10" dir="auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
          {t('nav.backHome')}
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight">
          {t(`${doc}.title`)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t(`${doc}.updated`)}</p>
        <p className="mt-6 leading-relaxed text-muted-foreground">
          {t(`${doc}.intro`)}
        </p>

        <div className="mt-8 space-y-8">
          {list.map((section, i) => (
            <section key={i}>
              <h2 className="text-xl font-semibold tracking-tight">
                {section.heading}
              </h2>
              {section.body?.map((para, j) => (
                <p key={j} className="mt-3 leading-relaxed text-muted-foreground">
                  {para}
                </p>
              ))}
              {section.list && (
                <ul className="mt-3 space-y-2 ps-5 text-muted-foreground">
                  {section.list.map((item, k) => (
                    <li key={k} className="list-disc leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          {t('nav.contact')}
        </p>
      </main>
    </div>
  );
}
