// Adds jest-dom's custom matchers (toBeInTheDocument, toHaveClass, …) to expect.
import '@testing-library/jest-dom';

// jsdom implements no layout, so it ships no `scrollIntoView` — every browser
// has one. Components that follow their own tail (StreamingConsole) call it in
// an effect, where the resulting TypeError surfaces as an unrelated render
// failure in whatever test happens to mount them. A no-op is the honest stub:
// there is no scroll position in jsdom to assert on either way.
Element.prototype.scrollIntoView = function scrollIntoView() {};

// Same class of gap: jsdom has no layout, so it implements no `matchMedia`, and
// accessing it throws rather than returning a non-match. Components that branch
// on a breakpoint read it in an effect (ProjectStages' `useIsDesktop`), so the
// failure again lands as an unrelated render error.
//
// It reports **no match**, which is the meaningful default: jsdom has no
// viewport, and a stub claiming every query matches would silently put every
// component under test into its desktop branch. Tests that need the other answer
// should override this per-test rather than flip it globally.
if (!window.matchMedia) {
  window.matchMedia = function matchMedia(query: string): MediaQueryList {
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      // Deprecated, but Radix and friends still feature-detect them.
      addListener: () => {},
      removeListener: () => {},
    } as MediaQueryList;
  };
}
