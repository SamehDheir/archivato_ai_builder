'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** Show the button once the visitor is roughly a screen down the page. */
const SHOW_AFTER_PX = 600;

/**
 * A floating "back to top" control for the landing page.
 *
 * Positioned with logical properties (`end-6`) so it lands bottom-right in LTR
 * and bottom-left in RTL. It stays mounted and animates opacity/translate rather
 * than unmounting, so it fades rather than popping, and it honours
 * `prefers-reduced-motion` in both the transition and the scroll itself — a
 * forced smooth scroll of several screens is exactly the kind of motion that
 * setting exists to suppress.
 */
export function BackToTop() {
  const { t } = useTranslation('marketing');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function toTop() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label={t('nav.backToTop')}
      title={t('nav.backToTop')}
      // Hidden from the tab order and the a11y tree while invisible, so a
      // keyboard user can't focus a button they cannot see.
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        'fixed bottom-6 end-6 z-40 flex h-11 w-11 items-center justify-center rounded-full',
        'border border-border bg-card/90 text-foreground shadow-lg backdrop-blur',
        'transition-all duration-200 motion-reduce:transition-none',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-xl',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0',
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
