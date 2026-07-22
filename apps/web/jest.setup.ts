// Adds jest-dom's custom matchers (toBeInTheDocument, toHaveClass, …) to expect.
import '@testing-library/jest-dom';

// jsdom implements no layout, so it ships no `scrollIntoView` — every browser
// has one. Components that follow their own tail (StreamingConsole) call it in
// an effect, where the resulting TypeError surfaces as an unrelated render
// failure in whatever test happens to mount them. A no-op is the honest stub:
// there is no scroll position in jsdom to assert on either way.
Element.prototype.scrollIntoView = function scrollIntoView() {};
