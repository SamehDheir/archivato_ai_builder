import { render, screen, waitFor } from '@testing-library/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LocaleProvider } from './i18n';
import { LOCALE_STORAGE } from '@/lib/i18n/settings';

/**
 * Guards the one thing that made the whole app render LTR in Arabic.
 *
 * Radix resolves direction from a React CONTEXT, not from the DOM: with no
 * `DirectionProvider` mounted, `useDirection()` falls through to `'ltr'` and every
 * `Tabs` root stamps a literal `dir="ltr"` onto its own element. An explicit
 * attribute beats an inherited one, so that single node overrode `<html dir="rtl">`
 * for its entire subtree — and on the project page that node IS the flex container
 * holding the stage rail and the artifact column, which is why the rail stayed on
 * the left on every stage.
 *
 * The assertion is deliberately made against a REAL `Tabs`, not against
 * `LocaleProvider`'s output: what has to stay true is that Radix agrees with the
 * document, and only Radix's own resolution can tell us that. Asserting the
 * provider is present would still pass if Radix changed how it reads direction.
 */
describe('LocaleProvider direction', () => {
  function renderTabs() {
    return render(
      <LocaleProvider>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
          <TabsContent value="a">content</TabsContent>
        </Tabs>
      </LocaleProvider>,
    );
  }

  /** The Radix `Tabs` root — the node that carries the resolved direction. */
  const tabsRoot = () =>
    screen.getByRole('tablist').closest('[data-orientation]')?.parentElement ??
    screen.getByRole('tablist').parentElement;

  afterEach(() => {
    localStorage.clear();
  });

  it('hands an RTL locale through to Radix', async () => {
    localStorage.setItem(LOCALE_STORAGE, 'ar');
    renderTabs();

    await waitFor(() => {
      expect(tabsRoot()).toHaveAttribute('dir', 'rtl');
    });
  });

  it('leaves the default LTR case alone', async () => {
    localStorage.setItem(LOCALE_STORAGE, 'en');
    renderTabs();

    await waitFor(() => {
      expect(tabsRoot()).toHaveAttribute('dir', 'ltr');
    });
  });
});
