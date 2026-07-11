import { PLANS, planPriceForCycle } from '@archivato/shared';
import { LandingPage } from '@/components/marketing/LandingPage';
import { siteDescription, siteName, siteUrl } from '@/lib/site';

/**
 * Structured data for the landing page.
 *
 * Emitted here — in the server component — rather than inside `LandingPage`,
 * which is a client component whose copy is resolved by i18next at runtime and
 * so would never exist in the HTML a crawler reads. The content is English for
 * the same reason the rest of the machine-facing output is (see `lib/site.ts`).
 *
 * The FAQ entries must stay in sync with `locales/en/marketing.json` → `faq`:
 * Google requires that answers marked up as FAQPage are also visible on the page.
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}#app`,
      name: siteName,
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Software architecture design',
      operatingSystem: 'Web',
      url: siteUrl,
      description: siteDescription,
      inLanguage: ['en', 'ar'],
      featureList: [
        'Adaptive AI requirements interview',
        'System architecture design',
        'Database schema design with ER diagrams',
        'REST API design with OpenAPI export',
        'Scored AI architect review (security, scalability, performance, cost)',
        'Implementation roadmap',
        'Hosting cost estimator',
        'STRIDE threat model',
        'Test / QA plan',
        'Backend code scaffold with GitHub push',
      ],
      offers: [
        {
          '@type': 'Offer',
          name: PLANS.free.name,
          price: String(PLANS.free.priceUsd),
          priceCurrency: 'USD',
        },
        {
          '@type': 'Offer',
          name: PLANS.pro.name,
          price: String(PLANS.pro.priceUsd),
          priceCurrency: 'USD',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: String(PLANS.pro.priceUsd),
            priceCurrency: 'USD',
            billingDuration: 1,
            billingIncrement: 1,
            unitCode: 'MON',
          },
        },
        {
          '@type': 'Offer',
          name: `${PLANS.pro.name} (annual)`,
          price: String(planPriceForCycle(PLANS.pro, 'annual')),
          priceCurrency: 'USD',
        },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteUrl}#faq`,
      mainEntity: [
        [
          'Is this just another AI chatbot?',
          'No. Archivato is an architecture engine. Instead of a wall of chat text, it produces structured, versioned, editable artifacts — requirements, schema, API, review, roadmap — the exact things a team builds from.',
        ],
        [
          'Do I need to be technical to use it?',
          'No. You describe your idea in plain language and answer a short interview. Archivato handles the technical translation into requirements, database, and API design — which you can then edit or hand to a developer.',
        ],
        [
          'What do I actually get out of it?',
          'A complete, editable system design: a requirements document, system architecture, database schema with diagrams, a REST API, a scored architect review, and an implementation roadmap — exportable to JSON, Markdown, OpenAPI, or a scaffolded repo.',
        ],
        [
          "What's the difference between Free and Pro?",
          'Free covers one project through the interview, requirements, system and database design, and Product Vision. Pro unlocks the API design, AI review, roadmap, cost estimate, and export — for up to five projects.',
        ],
        [
          'Can I edit what the AI generates?',
          'Yes. Every artifact is directly editable through structured forms — not free text — and you can refine the whole design by chat. Every change is versioned so you can compare and restore any point.',
        ],
        [
          'Which languages are supported?',
          'The interface is available in English and Arabic (with full right-to-left support), and the interview adapts its questions to the language of your idea.',
        ],
      ].map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
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
