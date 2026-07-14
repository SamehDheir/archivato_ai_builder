import { LandingPage } from '@/components/marketing/LandingPage';
import { TEAM_PRICE } from '@/lib/landing';
import { siteDescription, siteName, siteUrl } from '@/lib/site';

/**
 * Structured data for the landing page.
 *
 * Emitted here — in the server component — rather than inside `LandingPage`,
 * which is a client component whose copy is resolved by i18next at runtime and
 * so would never exist in the HTML a crawler reads. The content is English for
 * the same reason the rest of the machine-facing output is (see `lib/site.ts`).
 *
 * There is no `FAQPage` block any more: the page no longer has an FAQ section,
 * and Google requires that answers marked up as FAQPage are **visible on the
 * page**. Marking up copy that isn't rendered is a structured-data violation,
 * not a free ranking signal.
 *
 * Prices mirror `lib/landing.ts` — the tiers being validated on discovery calls
 * — not `PLANS` in the billing package. See the note in that file.
 */
const price = TEAM_PRICE.replace(/[^0-9.]/g, '');

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${siteUrl}#app`,
  name: siteName,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Client scoping and proposal generation',
  operatingSystem: 'Web',
  url: siteUrl,
  description: siteDescription,
  inLanguage: ['en', 'ar'],
  audience: {
    '@type': 'BusinessAudience',
    name: 'Software development companies, agencies and dev shops',
  },
  featureList: [
    'AI client-scoping interview (9 questions or fewer)',
    'Requirements document from the client call',
    'System architecture with justified technology choices',
    'Hosting cost estimate at three usage scales',
    'Client-ready shareable proposal link',
    'Implementation roadmap',
    'OpenAPI spec, SQL DDL and Postman collection',
    'Runnable code scaffold',
  ],
  offers: [
    { '@type': 'Offer', name: 'Starter', price: '0', priceCurrency: 'USD' },
    {
      '@type': 'Offer',
      name: 'Team',
      price,
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price,
        priceCurrency: 'USD',
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: 'MON',
      },
    },
  ],
};

/**
 * The public marketing landing page at `/` (AuthGate treats `/` as public).
 * Signed-in users can jump into the auth-gated app at `/dashboard`.
 */
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
