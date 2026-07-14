'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/shared/Logo';
import { LandingNavActions } from '@/components/marketing/LandingNavActions';

/** The in-page sections the nav links to, in document order. */
const NAV_SECTIONS = ['pain', 'how', 'value', 'proof', 'pricing'] as const;

/**
 * The landing page's sticky header.
 *
 * Split out of `LandingPage` for one concrete reason: it holds per-scroll state,
 * and keeping it here means a scroll only re-renders the bar, not the whole
 * marketing page.
 *
 * Two behaviors give the bar its presence:
 *   - it starts flush and near-transparent over the hero, then on scroll picks up
 *     a solid backdrop, a border, and a shadow, and tightens its padding — so it
 *     reads as a real, deliberate toolbar rather than a strip that happens to
 *     overlap the content;
 *   - the link for the section you're currently in is highlighted, tracked with an
 *     IntersectionObserver rather than scroll math.
 */
export function LandingHeader() {
  const { t } = useTranslation('marketing');
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // Elevate the bar once the page has moved off the very top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll(); // a reload can restore a mid-page scroll position
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Highlight the section currently under the header. The top margin in
  // `rootMargin` discounts the header's own height, and the bottom one keeps a
  // single section active instead of flickering between two as they overlap.
  useEffect(() => {
    const targets = NAV_SECTIONS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-72px 0px -60% 0px', threshold: 0 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-200',
        scrolled
          ? 'border-b border-border bg-background/85 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/75'
          : 'border-b border-transparent bg-background/40 backdrop-blur-sm',
      )}
    >
      <nav
        className={cn(
          'mx-auto flex max-w-6xl items-center gap-4 px-5 transition-all duration-200 sm:px-6 lg:px-8',
          scrolled ? 'py-2.5' : 'py-3.5',
        )}
      >
        <Link href="/" aria-label="Archivato">
          <Logo />
        </Link>
        <div className="ms-6 hidden items-center gap-1 text-sm md:flex">
          {NAV_SECTIONS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? 'true' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 transition-colors',
                active === id
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t(`nav.${id}`)}
            </a>
          ))}
        </div>
        <LandingNavActions />
      </nav>
    </header>
  );
}
