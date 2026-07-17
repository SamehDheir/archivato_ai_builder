import type { Config } from 'tailwindcss';

/**
 * Tailwind + shadcn/ui theme.
 *
 * Every value here resolves to a CSS variable defined in app/globals.css — that
 * file is the single source of truth, this one just exposes it as utilities.
 * Nothing in this config may hardcode a colour: a literal here is invisible to
 * the theme switch and to the print stylesheet, which is exactly the drift the
 * token layer exists to prevent.
 *
 * Adding a colour utility? Add the token to globals.css first, then surface it
 * here. Raw hex and Tailwind's stock palette (`bg-blue-500`) are banned in
 * components — see the `no-restricted-syntax` rule in .eslintrc.json.
 */

/**
 * A semantic colour with its four-token contract: a solid fill + text that sits
 * on it, and a tinted surface + text that sits on THAT. Spelled once here so
 * the five semantics can't drift apart.
 *
 *   bg-warning            text-warning-foreground         → solid
 *   bg-warning-subtle     text-warning-subtle-foreground  → chip / callout
 */
const semantic = (name: string) => ({
  DEFAULT: `hsl(var(--${name}))`,
  foreground: `hsl(var(--${name}-foreground))`,
  subtle: {
    DEFAULT: `hsl(var(--${name}-subtle))`,
    foreground: `hsl(var(--${name}-subtle-foreground))`,
  },
});

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1100px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        primary: semantic('primary'),
        success: semantic('success'),
        warning: semantic('warning'),
        destructive: semantic('destructive'),
        info: semantic('info'),

        /**
         * The `high` rung of the severity ramp. Not a full four-token semantic:
         * it's only ever used as text/border on a finding row, never as a filled
         * surface, so a solid value is the whole contract. See globals.css.
         */
        'severity-high': 'hsl(var(--severity-high))',

        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        /**
         * Categorical data hues — the canvas node categories, where telling two
         * boxes apart IS the function. Not a decorative palette: if a new use
         * isn't "these are different kinds of thing", it wants a semantic token.
         */
        data: {
          1: 'hsl(var(--data-1))',
          2: 'hsl(var(--data-2))',
          3: 'hsl(var(--data-3))',
          4: 'hsl(var(--data-4))',
          5: 'hsl(var(--data-5))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        // Injected by next/font in app/layout.tsx. The literal fallbacks only
        // cover the window before the woff2 lands (`display: swap`).
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // A 1.2-ish scale. `display` is the landing/share headline; everything
        // else is the app. Line-heights are Latin — the Arabic overrides live in
        // globals.css, keyed off [lang], because they're script-dependent.
        display: ['3rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        h1: ['2rem', { lineHeight: '1.2', letterSpacing: '-0.022em' }],
        h2: ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.018em' }],
        h3: ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.014em' }],
        h4: ['1.0625rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        body: ['0.9375rem', { lineHeight: '1.6' }],
        small: ['0.8125rem', { lineHeight: '1.5' }],
        micro: ['0.6875rem', { lineHeight: '1.45', letterSpacing: '0.01em' }],
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down var(--duration-base) var(--ease-out)',
        'accordion-up': 'accordion-up var(--duration-base) var(--ease-out)',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
