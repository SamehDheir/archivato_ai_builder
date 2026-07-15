import { estimateCosts } from '@archivato/shared';
import type {
  ApiDesign,
  CostEstimate,
  DatabaseDesign,
  ProductVision,
  ProjectRoadmap,
  QaPlan,
  RequirementDocument,
  RequirementsSummary,
  ReviewReport,
  SystemDesign,
  ThreatModel,
} from '@archivato/shared';

/**
 * A complete, static, read-only sample project ("HomeHelper" — an on-demand
 * home-services booking platform). It lets a first-time user see exactly what
 * Archivato produces before investing in the interview, without seeding a real
 * backend session or consuming their plan quota. Everything here is a plain
 * data fixture rendered through the same read-only `*View` components the real
 * pipeline uses. Content stays English (the AI-output convention); only the
 * surrounding chrome is translated.
 */

const SESSION_ID = 'example-project';
const GENERATED_AT = '2026-01-01T00:00:00.000Z';

export const EXAMPLE_SUMMARY: RequirementsSummary = {
  goal: 'Let customers book vetted home-services professionals (cleaning, handyman, moving) on demand, pay securely online, and rate the work — while giving providers a schedule, job queue, and payouts.',
  users: [
    'Customers booking a service',
    'Service providers fulfilling jobs',
    'Operations admins managing the marketplace',
  ],
  features: [
    'Browse services and available time slots',
    'Book, reschedule, and cancel appointments',
    'Online payment with provider payouts',
    'Ratings and reviews after each job',
    'Provider schedule and job management',
    'Admin dashboard for disputes and payouts',
  ],
  businessRules: [
    'A time slot can be held by only one booking at a time.',
    'Payment is authorized at booking and captured after the job completes.',
    'A customer may review a provider only for a completed booking.',
    'Cancellations within 24 hours of the slot incur a fee.',
  ],
  constraints: [
    'Launch on web first; a mobile app follows.',
    'Payments handled by a third-party processor (PCI out of scope).',
    'Initial launch limited to a single metro area.',
  ],
  assumptions: [
    'Providers are independent contractors, not employees.',
    'Most bookings are made 1–7 days in advance.',
  ],
};

export const EXAMPLE_REQUIREMENTS: RequirementDocument = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  executiveSummary:
    'HomeHelper is an on-demand marketplace for local home services, built for homeowners who need a trusted provider and the independent providers who serve them. Customers browse services, book a guaranteed time slot, pay securely online, and rate the work afterward, while providers manage their availability and jobs in one place. The result is a dependable booking experience that fills provider calendars and gives the operator a clean, disputes-and-payouts view of the whole marketplace. It launches web-first in a single city, ready to expand as demand grows.',
  functional: [
    {
      id: 'FR-1',
      title: 'Service catalog',
      description:
        'Customers can browse a catalog of services with descriptions, base pricing, and provider availability.',
      priority: 'must',
    },
    {
      id: 'FR-2',
      title: 'Slot booking',
      description:
        'Customers can select an available time slot and create a booking; the slot is locked to prevent double-booking.',
      priority: 'must',
    },
    {
      id: 'FR-3',
      title: 'Online payment',
      description:
        'The system authorizes payment at booking and captures it when the provider marks the job complete.',
      priority: 'must',
    },
    {
      id: 'FR-4',
      title: 'Reschedule & cancel',
      description:
        'Customers can reschedule or cancel a booking; late cancellations apply the configured fee.',
      priority: 'should',
    },
    {
      id: 'FR-5',
      title: 'Ratings & reviews',
      description:
        'After a completed job, customers can leave a 1–5 star rating and a written review for the provider.',
      priority: 'should',
    },
    {
      id: 'FR-6',
      title: 'Provider job queue',
      description:
        'Providers see upcoming bookings, mark jobs in progress or complete, and manage their availability.',
      priority: 'must',
    },
    {
      id: 'FR-7',
      title: 'Admin console',
      description:
        'Operations admins can view bookings, resolve disputes, and trigger provider payouts.',
      priority: 'could',
    },
  ],
  nonFunctional: [
    {
      id: 'NFR-1',
      category: 'performance',
      description: 'Catalog and availability pages load in under 1.5s at the 95th percentile.',
    },
    {
      id: 'NFR-2',
      category: 'security',
      description:
        'All traffic over TLS; card data never touches our servers (handled by the payment processor).',
    },
    {
      id: 'NFR-3',
      category: 'availability',
      description: 'Booking and payment flows target 99.9% monthly uptime.',
    },
    {
      id: 'NFR-4',
      category: 'scalability',
      description: 'Support 10,000 concurrent customers browsing during peak weekend demand.',
    },
  ],
  roles: [
    {
      name: 'Customer',
      description: 'Books services, pays, and reviews providers.',
      permissions: ['booking:create', 'booking:cancel', 'review:create'],
    },
    {
      name: 'Provider',
      description: 'Fulfills jobs and manages availability.',
      permissions: ['job:read', 'job:update', 'availability:manage'],
    },
    {
      name: 'Admin',
      description: 'Manages the marketplace, disputes, and payouts.',
      permissions: ['booking:read_all', 'dispute:manage', 'payout:trigger'],
    },
  ],
  businessRules: [
    { id: 'BR-1', description: 'A time slot can be held by only one active booking.' },
    { id: 'BR-2', description: 'Payment is authorized at booking and captured on completion.' },
    { id: 'BR-3', description: 'A review may be left only for a completed booking by its customer.' },
    { id: 'BR-4', description: 'Cancellations within 24 hours of the slot incur a fee.' },
  ],
  constraints: [
    'Web-first launch; mobile app to follow.',
    'Payments delegated to a third-party PCI-compliant processor.',
    'Single metro area at launch.',
  ],
  assumptions: [
    'Providers are independent contractors.',
    'Bookings are typically made 1–7 days ahead.',
  ],
  outOfScope: [
    {
      item: 'Native mobile apps (iOS / Android)',
      reason: 'Web-first at launch; a mobile app can follow once demand is proven.',
    },
    {
      item: 'In-app chat between customer and provider',
      reason: 'Coordination happens by phone at launch to keep the first release small.',
    },
    {
      item: 'Real-time GPS tracking of providers',
      reason: 'Not needed for scheduled home visits; bookings are by time slot, not live dispatch.',
    },
    {
      item: 'Multi-city / multi-region expansion',
      reason: 'Launching in a single metro area first; geography is a later phase.',
    },
    {
      item: 'Provider background-check integration',
      reason: 'Vetting is manual at launch; an automated check can be added later.',
    },
  ],
  assumptionsAndOpenQuestions: [
    {
      assumption: 'Providers are independent contractors, not employees.',
      impactIfWrong:
        'Payouts, tax handling, and the payments model would need to change.',
    },
    {
      assumption: 'Bookings are typically made 1–7 days ahead, not instantly on demand.',
      impactIfWrong:
        'A same-day, live-dispatch flow would change the availability and notification design.',
    },
    {
      assumption:
        "Assumed a sensible default pending the client's answer: which payout schedule do providers expect (weekly, per-job)?",
      impactIfWrong: 'Scope, timeline, or cost may change once the client confirms.',
    },
  ],
};

export const EXAMPLE_SYSTEM_DESIGN: SystemDesign = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  architecture: 'modular_monolith',
  architectureRationale:
    'A modular monolith keeps the marketplace simple to build and deploy at launch while enforcing clear module boundaries (booking, payments, reviews). Modules can be extracted into services later if a domain needs independent scaling.',
  techStack: [
    {
      layer: 'backend',
      technology: 'NestJS (TypeScript)',
      rationale: 'Opinionated module structure maps cleanly onto the domain and is fast to build.',
    },
    {
      layer: 'frontend',
      technology: 'Next.js + Tailwind',
      rationale: 'Server-rendered catalog pages for SEO and fast first loads.',
    },
    {
      layer: 'database',
      technology: 'PostgreSQL',
      rationale: 'Relational integrity and transactional slot locking prevent double-booking.',
    },
    {
      layer: 'cache',
      technology: 'Redis',
      rationale: 'Caches availability lookups and backs the booking-hold locks.',
    },
    {
      layer: 'queue',
      technology: 'BullMQ (Redis)',
      rationale: 'Async payment capture, payout runs, and notification delivery.',
    },
    {
      layer: 'payments',
      technology: 'Stripe',
      rationale: 'PCI-compliant processor keeps card data off our servers and handles payouts.',
    },
  ],
  services: [
    {
      name: 'Catalog',
      responsibility: 'Services, pricing, and provider availability.',
      dependencies: [],
    },
    {
      name: 'Booking',
      responsibility: 'Creating, rescheduling, and cancelling bookings; slot locking.',
      dependencies: ['Catalog', 'Payments'],
    },
    {
      name: 'Payments',
      responsibility: 'Authorization, capture, refunds, and provider payouts.',
      dependencies: [],
    },
    {
      name: 'Reviews',
      responsibility: 'Ratings and reviews for completed bookings.',
      dependencies: ['Booking'],
    },
    {
      name: 'Notifications',
      responsibility: 'Email and push reminders for bookings and job status.',
      dependencies: ['Booking'],
    },
  ],
};

export const EXAMPLE_DATABASE_DESIGN: DatabaseDesign = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  databaseType: 'PostgreSQL',
  entities: [
    {
      name: 'users',
      description: 'Customers, providers, and admins (role-differentiated).',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'string', nullable: false, unique: true },
        { name: 'full_name', type: 'string', nullable: false },
        { name: 'role', type: 'enum', nullable: false },
        { name: 'created_at', type: 'timestamp', nullable: false },
      ],
    },
    {
      name: 'services',
      description: 'The catalog of bookable home services.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'name', type: 'string', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'base_price', type: 'decimal', nullable: false },
      ],
    },
    {
      name: 'bookings',
      description: 'A customer booking of a provider for a service at a time slot.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        {
          name: 'customer_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'users', column: 'id' },
        },
        {
          name: 'provider_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'users', column: 'id' },
        },
        {
          name: 'service_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'services', column: 'id' },
        },
        { name: 'scheduled_at', type: 'timestamp', nullable: false },
        { name: 'status', type: 'enum', nullable: false },
        { name: 'created_at', type: 'timestamp', nullable: false },
      ],
    },
    {
      name: 'payments',
      description: 'Payment authorization and capture per booking.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        {
          name: 'booking_id',
          type: 'uuid',
          nullable: false,
          unique: true,
          references: { entity: 'bookings', column: 'id' },
        },
        { name: 'amount', type: 'decimal', nullable: false },
        { name: 'status', type: 'enum', nullable: false },
        { name: 'processor_ref', type: 'string', nullable: true },
      ],
    },
    {
      name: 'reviews',
      description: 'Customer ratings and reviews for completed bookings.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        {
          name: 'booking_id',
          type: 'uuid',
          nullable: false,
          unique: true,
          references: { entity: 'bookings', column: 'id' },
        },
        { name: 'rating', type: 'integer', nullable: false },
        { name: 'comment', type: 'text', nullable: true },
        { name: 'created_at', type: 'timestamp', nullable: false },
      ],
    },
  ],
  relations: [
    { from: 'users', to: 'bookings', type: 'one-to-many', description: 'A customer has many bookings.' },
    { from: 'services', to: 'bookings', type: 'one-to-many', description: 'A service is booked many times.' },
    { from: 'bookings', to: 'payments', type: 'one-to-one', description: 'Each booking has one payment.' },
    { from: 'bookings', to: 'reviews', type: 'one-to-one', description: 'A completed booking has one review.' },
  ],
};

export const EXAMPLE_API_DESIGN: ApiDesign = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  modules: [
    {
      name: 'Catalog',
      basePath: '/api/services',
      endpoints: [
        {
          method: 'GET',
          path: '/api/services',
          summary: 'List bookable services with availability.',
          requestSchema: [],
          responseSchema: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'name', type: 'string', required: true },
            { name: 'base_price', type: 'decimal', required: true },
          ],
          statusCodes: [200],
        },
        {
          method: 'GET',
          path: '/api/services/:id/availability',
          summary: 'Get available time slots for a service.',
          requestSchema: [{ name: 'date', type: 'date', required: false }],
          responseSchema: [{ name: 'slots', type: 'json', required: true }],
          statusCodes: [200, 404],
        },
      ],
    },
    {
      name: 'Booking',
      basePath: '/api/bookings',
      endpoints: [
        {
          method: 'POST',
          path: '/api/bookings',
          summary: 'Create a booking and authorize payment.',
          requestSchema: [
            { name: 'service_id', type: 'uuid', required: true },
            { name: 'provider_id', type: 'uuid', required: true },
            { name: 'scheduled_at', type: 'timestamp', required: true },
          ],
          responseSchema: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'status', type: 'string', required: true },
          ],
          statusCodes: [201, 400, 409],
        },
        {
          method: 'DELETE',
          path: '/api/bookings/:id',
          summary: 'Cancel a booking (late cancellations incur a fee).',
          requestSchema: [],
          responseSchema: [],
          statusCodes: [204, 403, 404],
        },
      ],
    },
    {
      name: 'Reviews',
      basePath: '/api/reviews',
      endpoints: [
        {
          method: 'POST',
          path: '/api/reviews',
          summary: 'Leave a rating and review for a completed booking.',
          requestSchema: [
            { name: 'booking_id', type: 'uuid', required: true },
            { name: 'rating', type: 'integer', required: true },
            { name: 'comment', type: 'string', required: false },
          ],
          responseSchema: [{ name: 'id', type: 'uuid', required: true }],
          statusCodes: [201, 400, 403],
        },
      ],
    },
  ],
};

export const EXAMPLE_REVIEW: ReviewReport = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  overallScore: 82,
  scores: { security: 78, scalability: 84, performance: 80, cost: 85 },
  scalabilityScore: 84,
  summary:
    'A well-structured modular monolith with clear domain boundaries and sensible technology choices. The design handles the core booking and payment flows safely; the main risks are around concurrent slot locking under load and observability of async payment capture.',
  securityIssues: [
    {
      title: 'Payout endpoint needs strict authorization',
      detail: 'The admin payout trigger must be guarded by role and audited, since it moves money.',
      severity: 'high',
    },
    {
      title: 'Rate-limit booking creation',
      detail: 'Unthrottled booking creation could be abused to hold slots; add per-user rate limits.',
      severity: 'medium',
    },
  ],
  scalabilityIssues: [
    {
      title: 'Slot locking is the contention point',
      detail:
        'Under peak weekend demand many customers target the same popular slots. Use short-lived Redis locks plus a unique DB constraint as the backstop.',
      severity: 'medium',
    },
  ],
  performanceRisks: [
    {
      title: 'Availability queries can be hot',
      detail: 'Cache per-service availability with a short TTL and invalidate on booking changes.',
      severity: 'medium',
    },
  ],
  costOptimizations: [
    {
      title: 'Right-size Redis before scaling out',
      detail: 'A single Redis instance covers caching and locks at launch; only cluster once traffic warrants it.',
      severity: 'low',
    },
  ],
  missingFeatures: [
    'Dispute-resolution workflow for contested jobs',
    'Provider onboarding and background-check tracking',
  ],
  recommendations: [
    'Add an idempotency key to booking creation to survive client retries.',
    'Emit structured events for payment capture so failures are observable.',
    'Introduce a read replica when catalog traffic grows.',
  ],
};

// --- Standalone stages -------------------------------------------------------
// The remaining agents hang off the same confirmed session: Product Vision (from
// the interview), and Roadmap / Cost / Threat model / QA plan (from the full
// design). They don't gate the pipeline, so they're independent fixtures here.

export const EXAMPLE_VISION: ProductVision = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  vision:
    'Make booking a trusted home-services professional as effortless as ordering a ride — transparent pricing, a vetted provider, and a guaranteed time slot in under two minutes, so households stop losing weekends to chasing quotes.',
  goals: [
    'Become the default way a household books recurring home services in its metro.',
    'Give providers a predictable, full schedule so they stay on the platform.',
    'Earn trust through vetting, guaranteed pricing, and honest reviews.',
    'Keep the booking-to-completion flow reliable enough to charge a premium take rate.',
  ],
  mvp: [
    'Browse a service catalog with transparent base pricing.',
    'Book a specific provider into a guaranteed time slot.',
    'Pay online, with capture deferred until the job is done.',
    'Rate and review a provider after completion.',
    'Provider job queue with availability management.',
  ],
  futureFeatures: [
    'Recurring bookings and subscription plans for regular cleaning.',
    'Native mobile apps for customers and providers.',
    'Instant "book now" matching with the nearest available provider.',
    'Provider tiers and loyalty pricing.',
    'Expansion to additional metro areas.',
  ],
  successMetrics: [
    {
      name: 'Booking completion rate',
      target: '≥ 85% of created bookings reach "completed"',
      rationale:
        'Cancellations and no-shows are the clearest signal that supply quality or scheduling is failing.',
    },
    {
      name: 'Repeat booking rate',
      target: '40% of customers book a second time within 60 days',
      rationale:
        'Home services are inherently recurring; a weak repeat rate means trust was not earned on job one.',
    },
    {
      name: 'Provider utilization',
      target: 'Median active provider fills 60% of published slots',
      rationale:
        'Providers churn when the platform does not fill their calendar, which collapses supply.',
    },
    {
      name: 'Time to book',
      target: 'Median under 2 minutes from catalog to confirmation',
      rationale:
        'The core promise is effortlessness; friction here directly suppresses conversion.',
    },
  ],
  personas: [
    {
      name: 'Busy household customer',
      description:
        'A dual-income household that values time far more than the marginal cost of a service.',
      goals: [
        'Book a trusted cleaner for Saturday without making phone calls.',
        'Know the price before committing.',
        'Reschedule easily when plans change.',
      ],
      painPoints: [
        'Chasing quotes across phone, text, and social media.',
        'No way to tell a good provider from a bad one.',
        'Surprise pricing after the job is done.',
      ],
    },
    {
      name: 'Independent service provider',
      description:
        'A self-employed cleaner or handyman who wants a full calendar without doing sales.',
      goals: [
        'Fill empty slots with paying jobs.',
        'Get paid reliably and on time.',
        'Control which days and hours they work.',
      ],
      painPoints: [
        'Unpredictable income from word-of-mouth demand.',
        'Chasing customers for payment after the job.',
        'Time lost to scheduling back-and-forth.',
      ],
    },
    {
      name: 'Operations admin',
      description:
        'A marketplace operator keeping supply quality high and disputes low.',
      goals: [
        'Resolve disputed jobs quickly and fairly.',
        'Trigger provider payouts on schedule.',
        'Spot and remove underperforming providers.',
      ],
      painPoints: [
        'No single view of a booking’s payment and dispute state.',
        'Manual payout reconciliation.',
      ],
    },
  ],
};

export const EXAMPLE_ROADMAP: ProjectRoadmap = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  summary:
    'Four phases from foundation to launch. The critical path runs through booking and payments — slot integrity and deferred capture are the two mechanisms the whole marketplace rests on, so they land early and get hardened before supply and trust features are layered on.',
  totalEstimate: '~11 weeks',
  phases: [
    {
      name: 'Foundation',
      goal: 'A deployable modular monolith with auth, the data model, and CI in place.',
      effort: '~2 wks',
      dependsOn: [],
      milestones: [
        {
          title: 'Project skeleton and infrastructure',
          effort: '1 wk',
          tasks: [
            {
              title: 'Scaffold the NestJS modular monolith',
              detail: 'Catalog, Booking, Payments, Reviews, and Notifications module boundaries.',
            },
            { title: 'Provision PostgreSQL and Redis' },
            { title: 'Set up CI with migrations and a test gate' },
          ],
        },
        {
          title: 'Identity and data model',
          effort: '1 wk',
          tasks: [
            { title: 'Implement users with customer/provider/admin roles' },
            {
              title: 'Migrate the core schema',
              detail: 'users, services, bookings, payments, reviews plus their relations.',
            },
          ],
        },
      ],
    },
    {
      name: 'Booking core',
      goal: 'A customer can find an available slot and hold it without risk of double-booking.',
      effort: '~3 wks',
      dependsOn: ['Foundation'],
      milestones: [
        {
          title: 'Catalog and availability',
          effort: '1 wk',
          tasks: [
            { title: 'Service catalog endpoints with base pricing' },
            {
              title: 'Availability lookup',
              detail: 'Cached in Redis with a short TTL, invalidated on booking changes.',
            },
          ],
        },
        {
          title: 'Slot-safe booking',
          effort: '2 wks',
          tasks: [
            {
              title: 'Booking creation with slot locking',
              detail:
                'Short-lived Redis lock plus a unique DB constraint as the backstop (BR-1).',
            },
            { title: 'Reschedule and cancel, including the 24-hour fee rule (BR-4)' },
            {
              title: 'Idempotency keys on booking creation',
              detail: 'So a client retry cannot create a duplicate booking.',
            },
          ],
        },
      ],
    },
    {
      name: 'Payments and trust',
      goal: 'Money moves safely and customers can judge provider quality.',
      effort: '~3 wks',
      dependsOn: ['Booking core'],
      milestones: [
        {
          title: 'Authorize and capture',
          effort: '2 wks',
          tasks: [
            {
              title: 'Authorize at booking, capture on completion (BR-2)',
              detail: 'Capture runs async on BullMQ with structured events for observability.',
            },
            { title: 'Refunds and cancellation fees' },
            { title: 'Provider payout runs' },
          ],
        },
        {
          title: 'Ratings and reviews',
          effort: '1 wk',
          tasks: [
            {
              title: 'Reviews restricted to the customer of a completed booking (BR-3)',
            },
            { title: 'Aggregate provider rating on the catalog' },
          ],
        },
      ],
    },
    {
      name: 'Operations and launch',
      goal: 'Admins can run the marketplace and the system is safe to open to real traffic.',
      effort: '~3 wks',
      dependsOn: ['Payments and trust'],
      milestones: [
        {
          title: 'Admin console',
          effort: '1 wk',
          tasks: [
            {
              title: 'Booking and dispute views with audited payout triggers',
              detail: 'The payout action moves money — role-guarded and written to an audit log.',
            },
          ],
        },
        {
          title: 'Hardening',
          effort: '1 wk',
          tasks: [
            { title: 'Rate-limit booking creation to stop slot-holding abuse' },
            { title: 'Load-test the availability and booking paths at peak weekend demand' },
          ],
        },
        {
          title: 'Launch',
          effort: '1 wk',
          tasks: [
            { title: 'Notifications for booking reminders and job status' },
            { title: 'Onboard the first provider cohort in the launch metro' },
          ],
        },
      ],
    },
  ],
};

export const EXAMPLE_THREAT_MODEL: ThreatModel = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  summary:
    'The highest-value assets are money movement (payouts, capture) and the booking slot itself, which is a scarce resource an attacker can deny to others. Card data is out of scope thanks to the third-party processor, which removes the largest class of confidentiality risk — so the model concentrates on authorization around payouts, integrity of booking state, and abuse of the unauthenticated catalog surface.',
  trustBoundaries: [
    'Public internet → Next.js web app (unauthenticated catalog browsing).',
    'Web app → NestJS API (authenticated customer, provider, and admin sessions).',
    'API → PostgreSQL and Redis (internal network, not publicly reachable).',
    'API ↔ Stripe (outbound payment calls and inbound webhooks).',
    'Admin console → payout triggers (the money-moving boundary).',
  ],
  assumptions: [
    'All traffic is served over TLS.',
    'Card data never reaches our servers; the processor is PCI-compliant (NFR-2).',
    'Providers are independent contractors, not trusted internal staff.',
    'The database and cache are not exposed to the public internet.',
  ],
  threats: [
    {
      category: 'spoofing',
      component: 'Stripe webhook endpoint',
      threat:
        'An attacker posts a forged "payment captured" webhook to mark an unpaid booking as settled.',
      severity: 'critical',
      mitigation:
        'Verify the processor’s HMAC signature over the raw request body and reject any unsigned or replayed event.',
    },
    {
      category: 'spoofing',
      component: 'Authentication endpoints',
      threat:
        'Credential stuffing against customer and provider logins to take over accounts holding payment methods.',
      severity: 'high',
      mitigation:
        'Per-IP and per-account rate limits on login, and hashed passwords with a slow KDF.',
    },
    {
      category: 'tampering',
      component: 'Booking creation',
      threat:
        'A client submits a manipulated price or an out-of-range scheduled_at to book below the catalog rate.',
      severity: 'high',
      mitigation:
        'Never trust client-supplied pricing — resolve base_price server-side from the services table and validate the slot against published availability.',
    },
    {
      category: 'tampering',
      component: 'Booking status transitions',
      threat:
        'A provider marks a job "completed" that never happened, triggering payment capture.',
      severity: 'high',
      mitigation:
        'Enforce a server-side state machine for booking status and require customer confirmation (or a dispute window) before capture.',
    },
    {
      category: 'repudiation',
      component: 'Admin payout trigger',
      threat:
        'An admin triggers a payout and later denies it; there is no record of who moved the money.',
      severity: 'high',
      mitigation:
        'Write an append-only audit row (actor, booking, amount, timestamp) for every payout and refund.',
    },
    {
      category: 'repudiation',
      component: 'Dispute resolution',
      threat:
        'A customer disputes a completed job and no evidence trail exists to adjudicate it.',
      severity: 'medium',
      mitigation:
        'Emit immutable timeline events for every booking state change and review submission.',
    },
    {
      category: 'information_disclosure',
      component: 'Booking detail endpoint',
      threat:
        'IDOR on `/api/bookings/:id` lets a customer read another customer’s booking, including their address and provider.',
      severity: 'critical',
      mitigation:
        'Owner-scope every booking read: return 404 (not 403) when the requester is neither the booking’s customer nor its provider.',
    },
    {
      category: 'information_disclosure',
      component: 'Provider and customer records',
      threat:
        'Home addresses and contact details in the users table are exposed by an over-broad API response.',
      severity: 'high',
      mitigation:
        'Map entities to explicit response DTOs so new columns are never serialized by default; encrypt personal data at rest.',
    },
    {
      category: 'denial_of_service',
      component: 'Booking creation (slot holds)',
      threat:
        'An attacker mass-creates bookings to hold every popular weekend slot, starving real customers of supply.',
      severity: 'high',
      mitigation:
        'Per-user rate limits on booking creation, a cap on concurrent unpaid holds, and short lock expiry so abandoned holds release automatically.',
    },
    {
      category: 'denial_of_service',
      component: 'Availability lookup',
      threat:
        'Unauthenticated catalog and availability queries are expensive and can be flooded to exhaust the database.',
      severity: 'medium',
      mitigation:
        'Serve availability from the Redis cache with a short TTL, rate-limit by IP, and put the catalog behind a CDN.',
    },
    {
      category: 'elevation_of_privilege',
      component: 'Payout and dispute endpoints',
      threat:
        'A customer or provider calls the admin payout trigger directly and pays themselves.',
      severity: 'critical',
      mitigation:
        'Guard every admin route with a server-side role check; never rely on the UI hiding the action.',
    },
    {
      category: 'elevation_of_privilege',
      component: 'Role assignment',
      threat:
        'A self-registering user sets `role: "admin"` in the sign-up payload and provisions themselves as an operator.',
      severity: 'high',
      mitigation:
        'Strip `role` from all self-service DTOs; assign roles only through an admin-guarded path.',
    },
  ],
};

export const EXAMPLE_QA_PLAN: QaPlan = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  summary:
    'A pyramid-shaped plan weighted toward the two places this marketplace actually breaks: concurrent slot booking and the authorize-then-capture payment lifecycle. Unit tests cover the business rules, integration tests pin the module contracts, and a small e2e set protects the money path end to end.',
  strategy: [
    'Test pyramid: many fast unit tests, a focused integration layer, a thin e2e set over the booking-to-payment journey.',
    'Every business rule (BR-1…BR-4) has at least one dedicated unit test.',
    'Concurrency is tested explicitly, not assumed — double-booking is the marketplace’s worst failure.',
    'The payment processor is stubbed in CI; a nightly suite runs against the processor’s sandbox.',
    'CI gate: unit + integration must pass on every pull request; e2e runs before deploy.',
  ],
  suites: [
    {
      name: 'Booking rules',
      type: 'unit',
      objective: 'The slot, cancellation, and review business rules hold in isolation.',
      cases: [
        {
          id: 'TC-1',
          title: 'A slot already held by an active booking cannot be booked again',
          expected: 'Booking creation is rejected with a conflict (BR-1).',
          priority: 'high',
        },
        {
          id: 'TC-2',
          title: 'Cancelling within 24 hours of the slot applies the fee',
          expected: 'The cancellation fee is charged; outside 24 hours it is not (BR-4).',
          priority: 'high',
        },
        {
          id: 'TC-3',
          title: 'A review on a non-completed booking is rejected',
          expected: 'Only the customer of a completed booking may review (BR-3).',
          priority: 'medium',
        },
        {
          id: 'TC-4',
          title: 'Booking price is resolved server-side from the catalog',
          expected: 'A client-supplied price is ignored, not trusted.',
          priority: 'high',
        },
      ],
    },
    {
      name: 'Booking and payment endpoints',
      type: 'integration',
      objective: 'The Booking and Payments modules honour their API contracts against a real database.',
      cases: [
        {
          id: 'TC-5',
          title: 'POST /api/bookings authorizes payment and returns 201',
          expected: 'A booking row and an authorized (not captured) payment row are created (BR-2).',
          priority: 'high',
        },
        {
          id: 'TC-6',
          title: 'Repeating POST /api/bookings with the same idempotency key',
          expected: 'The original booking is returned; no duplicate is created.',
          priority: 'high',
        },
        {
          id: 'TC-7',
          title: 'Marking a job complete captures the authorized payment',
          expected: 'The capture job runs and the payment status becomes captured.',
          priority: 'high',
        },
        {
          id: 'TC-8',
          title: 'DELETE /api/bookings/:id on someone else’s booking',
          expected: 'Responds 404 — no existence leak.',
          priority: 'high',
        },
      ],
    },
    {
      name: 'Book-to-review journey',
      type: 'e2e',
      objective: 'A customer can complete the full happy path in a real browser.',
      cases: [
        {
          id: 'TC-9',
          title: 'Browse catalog → pick a slot → pay → provider completes → leave a review',
          expected: 'The booking reaches completed, payment is captured, and the review appears.',
          priority: 'high',
        },
        {
          id: 'TC-10',
          title: 'Reschedule a booking to a different available slot',
          expected: 'The old slot is released and the new one is held.',
          priority: 'medium',
        },
      ],
    },
    {
      name: 'Authorization and abuse',
      type: 'security',
      objective: 'Money-moving and cross-tenant paths are closed.',
      cases: [
        {
          id: 'TC-11',
          title: 'A customer calls the admin payout trigger',
          expected: 'Rejected by the server-side role guard (403), regardless of the UI.',
          priority: 'high',
        },
        {
          id: 'TC-12',
          title: 'A customer requests another customer’s booking by id',
          expected: 'Responds 404, leaking neither the booking nor its existence.',
          priority: 'high',
        },
        {
          id: 'TC-13',
          title: 'Sign-up payload includes role: "admin"',
          expected: 'The field is stripped; the account is created as a customer.',
          priority: 'high',
        },
        {
          id: 'TC-14',
          title: 'A forged (unsigned) payment webhook is posted',
          expected: 'Rejected on signature verification; no booking is marked paid.',
          priority: 'high',
        },
      ],
    },
    {
      name: 'Load and concurrency',
      type: 'performance',
      objective: 'The system holds up under peak weekend demand (NFR-1, NFR-4).',
      cases: [
        {
          id: 'TC-15',
          title: '200 concurrent requests target the same popular slot',
          expected: 'Exactly one booking succeeds; the rest get a clean conflict, with no duplicate rows.',
          priority: 'high',
        },
        {
          id: 'TC-16',
          title: '10,000 concurrent customers browse the catalog',
          expected: 'Catalog and availability stay under 1.5s at p95 (NFR-1).',
          priority: 'medium',
        },
      ],
    },
    {
      name: 'Stakeholder acceptance',
      type: 'acceptance',
      objective: 'The delivered product satisfies the functional requirements as written.',
      cases: [
        {
          id: 'TC-17',
          title: 'A customer books a vetted provider in under two minutes',
          expected: 'The core promise of the product vision is met end to end.',
          priority: 'high',
        },
        {
          id: 'TC-18',
          title: 'A provider manages availability and works their job queue (FR-6)',
          expected: 'The provider can publish slots and move a job to completed.',
          priority: 'medium',
        },
        {
          id: 'TC-19',
          title: 'An admin resolves a dispute and triggers a payout (FR-7)',
          expected: 'The action succeeds and is written to the audit log.',
          priority: 'low',
        },
      ],
    },
  ],
  coverageGoals: [
    '≥ 80% line coverage on service-layer business logic.',
    '100% of business rules (BR-1…BR-4) covered by an explicit test.',
    'Every endpoint in the API design has at least one integration test.',
    'Every critical and high threat from the security model has a matching security test.',
  ],
  tooling: [
    'Jest for unit and integration tests (matches the NestJS backend).',
    'Supertest for HTTP-level integration against the Nest app.',
    'Testcontainers for a real PostgreSQL and Redis in integration runs.',
    'Playwright for the end-to-end browser journey.',
    'k6 for load and concurrency testing of the booking path.',
    'The payment processor’s sandbox and test cards for payment flows.',
  ],
  outOfScope: [
    'PCI compliance testing — card data is handled entirely by the processor (NFR-2).',
    'Native mobile apps, which are post-MVP.',
    'Penetration testing, which is commissioned separately before launch.',
  ],
};

/**
 * The cost estimate is **deterministic** — derived from the design, not written
 * by hand — so it stays consistent with the fixtures above the same way the real
 * stage does. This mirrors `CostEstimateService.generate()` exactly: same
 * workload inputs, same pure `estimateCosts()` from the shared package.
 */
export const EXAMPLE_COST_ESTIMATE: CostEstimate = {
  sessionId: SESSION_ID,
  generatedAt: GENERATED_AT,
  ...estimateCosts({
    sessionId: SESSION_ID,
    services: EXAMPLE_SYSTEM_DESIGN.services.length,
    entities: EXAMPLE_DATABASE_DESIGN.entities.length,
    endpoints: EXAMPLE_API_DESIGN.modules.reduce(
      (n, m) => n + m.endpoints.length,
      0,
    ),
    databaseType: EXAMPLE_DATABASE_DESIGN.databaseType,
    architecture: EXAMPLE_SYSTEM_DESIGN.architecture,
  }),
};
