import { ConflictException, NotFoundException } from '@nestjs/common';
import { ShareService } from './share.service';
import { InMemoryShareLinkRepository } from './in-memory-share-link.repository';
import { InterviewService } from '../interview/interview.service';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { RequirementsService } from '../requirements/requirements.service';
import { InMemoryRequirementDocumentRepository } from '../requirements/in-memory-requirement-document.repository';
import { SystemDesignService } from '../system-design/system-design.service';
import { InMemorySystemDesignRepository } from '../system-design/in-memory-system-design.repository';
import { DatabaseDesignService } from '../database-design/database-design.service';
import { InMemoryDatabaseDesignRepository } from '../database-design/in-memory-database-design.repository';
import { ApiDesignService } from '../api-design/api-design.service';
import { InMemoryApiDesignRepository } from '../api-design/in-memory-api-design.repository';
import { InMemoryReviewReportRepository } from '../review/in-memory-review-report.repository';
import { InMemoryProductVisionRepository } from '../product-vision/in-memory-product-vision.repository';
import { InMemoryCostEstimateRepository } from '../cost-estimate/in-memory-cost-estimate.repository';
import { InMemoryProjectRoadmapRepository } from '../roadmap/in-memory-roadmap.repository';
import { InMemoryThreatModelRepository } from '../threat-model/in-memory-threat-model.repository';
import { InMemoryQaPlanRepository } from '../qa-plan/in-memory-qa-plan.repository';
import { BillingService } from '../billing/billing.service';
import { InMemorySubscriptionRepository } from '../billing/in-memory-subscription.repository';
import { InMemoryBillingEventRepository } from '../billing/in-memory-billing-event.repository';
import { MockBillingProvider } from '../billing/mock-billing.provider';
import { InMemoryUserRepository } from '../auth/in-memory-user.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { ArchitectExplainerAgent } from '../llm/agents/architect-explainer.agent';
import { DatabaseDesignerAgent } from '../llm/agents/database-designer.agent';
import { ApiDesignerAgent } from '../llm/agents/api-designer.agent';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from '../interview/question-plan';

const IDEA = {
  idea: 'A clinic system with appointments, billing, notifications and reports',
};

interface Harness {
  interview: InterviewService;
  requirements: RequirementsService;
  systemDesign: SystemDesignService;
  databaseDesign: DatabaseDesignService;
  apiDesign: ApiDesignService;
  sessions: InMemoryInterviewSessionRepository;
  apiDesigns: InMemoryApiDesignRepository;
  databaseDesigns: InMemoryDatabaseDesignRepository;
  visions: InMemoryProductVisionRepository;
  costs: InMemoryCostEstimateRepository;
  roadmaps: InMemoryProjectRoadmapRepository;
  reviews: InMemoryReviewReportRepository;
  threats: InMemoryThreatModelRepository;
  qaPlans: InMemoryQaPlanRepository;
  users: InMemoryUserRepository;
  billing: BillingService;
  share: ShareService;
}

function makeHarness(): Harness {
  const sessionRepo = new InMemoryInterviewSessionRepository();
  const docRepo = new InMemoryRequirementDocumentRepository();
  const sysRepo = new InMemorySystemDesignRepository();
  const dbRepo = new InMemoryDatabaseDesignRepository();
  const apiRepo = new InMemoryApiDesignRepository();
  const reviewRepo = new InMemoryReviewReportRepository();
  const mock = new MockLlmProvider();

  const interview = new InterviewService(
    sessionRepo,
    new ProductAnalystAgent(mock),
    new InterviewerAgent(mock),
    undefined as never, // no billing enforcement for owner-less test sessions
  );
  const requirements = new RequirementsService(
    sessionRepo,
    docRepo,
    new RequirementEngineerAgent(mock),
  );
  const systemDesign = new SystemDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    new SystemArchitectAgent(mock),
    new ArchitectExplainerAgent(mock),
  );
  const databaseDesign = new DatabaseDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    new DatabaseDesignerAgent(mock),
  );
  const apiDesign = new ApiDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    new ApiDesignerAgent(mock),
  );
  const visionRepo = new InMemoryProductVisionRepository();
  const costRepo = new InMemoryCostEstimateRepository();
  const roadmapRepo = new InMemoryProjectRoadmapRepository();
  const userRepo = new InMemoryUserRepository();
  const billing = new BillingService(
    new InMemorySubscriptionRepository(),
    userRepo,
    new MockBillingProvider(),
    new InMemoryBillingEventRepository(),
  );

  const threatRepo = new InMemoryThreatModelRepository();
  const qaRepo = new InMemoryQaPlanRepository();

  const share = new ShareService(
    new InMemoryShareLinkRepository(),
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    reviewRepo,
    visionRepo,
    costRepo,
    roadmapRepo,
    threatRepo,
    qaRepo,
    billing,
  );
  return {
    interview,
    requirements,
    systemDesign,
    databaseDesign,
    apiDesign,
    sessions: sessionRepo,
    apiDesigns: apiRepo,
    databaseDesigns: dbRepo,
    visions: visionRepo,
    costs: costRepo,
    roadmaps: roadmapRepo,
    reviews: reviewRepo,
    threats: threatRepo,
    qaPlans: qaRepo,
    users: userRepo,
    billing,
    share,
  };
}

/** Create a real user and hand their session over to them (owner of the link). */
async function ownedBy(
  h: Harness,
  sessionId: string,
  plan: 'free' | 'pro',
): Promise<string> {
  const user = await h.users.create({
    email: `${plan}-${sessionId}@example.com`,
    passwordHash: null,
    displayName: 'Owner',
    providers: ['password'],
  });
  const session = await h.sessions.findById(sessionId);
  await h.sessions.save({ ...session!, userId: user.id });
  // The mock billing provider activates Pro immediately (no charge).
  if (plan === 'pro') await h.billing.startCheckout(user.id);
  return user.id;
}

/** Drive the interview to `confirmed` without generating any design. */
async function confirmedSession(h: Harness): Promise<string> {
  const { sessionId } = await h.interview.start(IDEA);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await h.interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    await h.interview.answer(sessionId, 'payments billing notifications reports');
  }
  await h.interview.confirm(sessionId);
  return sessionId;
}

/** Store a minimal threat model + QA plan, as their stages would have. */
async function seedExtendedArtifacts(h: Harness, sessionId: string) {
  const generatedAt = new Date().toISOString();
  await h.threats.upsert({
    sessionId,
    generatedAt,
    summary: 'A STRIDE pass.',
    threats: [],
    trustBoundaries: [],
    assumptions: [],
  });
  await h.qaPlans.upsert({
    sessionId,
    generatedAt,
    summary: 'A test plan.',
    strategy: ['Test the booking flow.'],
    suites: [],
    coverageGoals: [],
    tooling: [],
    outOfScope: [],
  });
}

/** Everything a **Free** owner can generate: no API design, no review. */
async function freePipeline(h: Harness): Promise<string> {
  const sessionId = await confirmedSession(h);
  await h.requirements.generate(sessionId);
  await h.systemDesign.generate(sessionId);
  await h.databaseDesign.generate(sessionId);
  return sessionId;
}

async function fullPipeline(h: Harness): Promise<string> {
  const sessionId = await freePipeline(h);
  await h.apiDesign.generate(sessionId);
  return sessionId;
}

describe('ShareService', () => {
  it('reports no link for an unshared session', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    await expect(h.share.get(sessionId)).resolves.toBeNull();
  });

  it('refuses to share a design that has not reached the database design', async () => {
    const h = makeHarness();
    const sessionId = await confirmedSession(h);
    await h.requirements.generate(sessionId);
    // No system or database design yet — nothing worth putting on a public page.
    await expect(h.share.create(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(h.share.get(sessionId)).resolves.toBeNull();
  });

  // The whole point of the free tier here: the API design and the review are Pro
  // stages, so a free owner will never have them — sharing must not require them.
  it('shares a free-tier design (no API design, no review)', async () => {
    const h = makeHarness();
    const sessionId = await freePipeline(h);

    const { token } = await h.share.create(sessionId);
    const shared = await h.share.view(token);

    expect(shared.requirements.sessionId).toBe(token);
    expect(shared.systemDesign.services.length).toBeGreaterThan(0);
    expect(shared.databaseDesign.entities.length).toBeGreaterThan(0);
    expect(shared.apiDesign).toBeNull();
    expect(shared.review).toBeNull();
    expect(JSON.stringify(shared)).not.toContain(sessionId);
  });

  // The client-facing artifacts are additive: a link that was shareable before
  // them must stay shareable without them. The cost estimate and the roadmap are
  // Pro (they need the full pipeline), so a free owner's link carries neither and
  // the page simply drops those sections.
  it('shares a design that has no vision, cost estimate or roadmap', async () => {
    const h = makeHarness();
    const sessionId = await freePipeline(h);

    const shared = await h.share.view((await h.share.create(sessionId)).token);

    expect(shared.vision).toBeNull();
    expect(shared.costEstimate).toBeNull();
    expect(shared.roadmap).toBeNull();
    expect(shared.threatModel).toBeNull();
    expect(shared.qaPlan).toBeNull();
    // …and the design it does have is still there.
    expect(shared.requirements.functional.length).toBeGreaterThan(0);
  });

  // R12 — a project that switched the extended artifacts off doesn't put them in
  // front of a client, even if they were generated before the owner turned them
  // off. Enforced in the payload, not by not-generating alone.
  it('hides the threat model + QA plan when the project opted out', async () => {
    const h = makeHarness();
    const sessionId = await freePipeline(h);
    await seedExtendedArtifacts(h, sessionId);

    // On by default: both cross.
    const on = await h.share.view((await h.share.create(sessionId)).token);
    expect(on.threatModel).not.toBeNull();
    expect(on.qaPlan).not.toBeNull();

    await h.interview.update(sessionId, { generateExtendedArtifacts: false });

    const off = await h.share.view((await h.share.create(sessionId)).token);
    expect(off.threatModel).toBeNull();
    expect(off.qaPlan).toBeNull();
    // The rest of the proposal is untouched — this hides two sections, not a design.
    expect(off.requirements.functional.length).toBeGreaterThan(0);
    expect(off.systemDesign.services.length).toBeGreaterThan(0);
  });

  // The page leads with these three — they are what the *client* reads — so they
  // have to actually cross the public boundary, with the session id stripped like
  // every other artifact.
  it('serves the vision, cost estimate and roadmap, stamped with the token', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);

    await h.visions.upsert({
      sessionId,
      generatedAt: new Date().toISOString(),
      vision: 'A booking system for clinics.',
      goals: ['Cut no-shows'],
      mvp: ['Booking'],
      futureFeatures: [],
      successMetrics: [],
      personas: [],
    });
    await h.roadmaps.upsert({
      sessionId,
      generatedAt: new Date().toISOString(),
      summary: 'Three phases.',
      totalEstimate: '~10 wks',
      phases: [],
    });
    await h.costs.upsert({
      sessionId,
      generatedAt: new Date().toISOString(),
      workload: {
        services: 3,
        entities: 5,
        endpoints: 12,
        databaseType: 'PostgreSQL',
        architecture: 'modular_monolith',
      },
      scales: [100, 1000, 10000],
      providers: [],
      cheapestByScale: {},
      recommended: 'render',
      disclaimer: 'Ballpark.',
      // OWNER-ONLY: a budget warning must never reach the public payload.
      budgetWarning: {
        severity: 'critical',
        messageKey: 'cost.budget.over',
        values: { estimatedLowUsd: 14400, budgetMaxUsd: 5000, overPct: 188 },
        links: { mvpPhase: false, outOfScope: false },
      },
    });

    const shared = await h.share.view((await h.share.create(sessionId)).token);
    const { token } = shared;

    expect(shared.vision?.vision).toBe('A booking system for clinics.');
    expect(shared.roadmap?.totalEstimate).toBe('~10 wks');
    expect(shared.costEstimate?.recommended).toBe('render');
    // The owner-only budget warning is stripped server-side.
    expect(shared.costEstimate?.budgetWarning).toBeNull();
    // Scoped to the estimate, and keyed on a distinctive field name rather than
    // the bare number "188" — the random token and the ISO timestamps are full of
    // digits, so a short numeric needle matches by chance (see the review test).
    expect(JSON.stringify(shared.costEstimate)).not.toContain('overPct');

    // The internal session id must not ride out on any of them.
    expect(shared.vision?.sessionId).toBe(token);
    expect(shared.roadmap?.sessionId).toBe(token);
    expect(shared.costEstimate?.sessionId).toBe(token);
    expect(JSON.stringify(shared)).not.toContain(sessionId);
  });

  // R10 — the client-readiness axis is a DEAL-risk lens (ambiguous scope, an
  // effort/timeline conflict): it is for the owner, never the client reading the
  // proposal. The payload IS the boundary, so it's stripped server-side — exactly
  // like R9's budget warning.
  it('never leaks client-readiness / consistency findings onto the public page', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);

    await h.reviews.upsert({
      sessionId,
      generatedAt: new Date().toISOString(),
      overallScore: 80,
      scores: {
        security: 80,
        scalability: 80,
        performance: 80,
        cost: 80,
        clientReadiness: 55,
      },
      scalabilityScore: 80,
      summary: 'Solid.',
      securityIssues: [{ title: 'Public security note', detail: 'd', severity: 'low' }],
      scalabilityIssues: [],
      performanceRisks: [],
      costOptimizations: [],
      missingFeatures: [],
      recommendations: [],
      clientReadinessIssues: [
        {
          title: 'SECRET_DEAL_RISK',
          detail: 'The payout window is ambiguous.',
          severity: 'high',
          suggestedResolution: 'tighten_requirement',
          resolutionHint: 'Pin the payout window.',
        },
      ],
      consistencyFindings: [
        {
          title: 'SECRET_TIMELINE_CONFLICT',
          detail: 'Effort exceeds the stated timeline.',
          severity: 'high',
          source: 'automated',
          artifacts: ['effort', 'timeline'],
        },
      ],
      clientReadinessNote: 'SECRET_NOTE',
    });

    const shared = await h.share.view((await h.share.create(sessionId)).token);
    const payload = JSON.stringify(shared);

    expect(shared.review?.clientReadinessIssues).toEqual([]);
    expect(shared.review?.consistencyFindings).toEqual([]);
    expect(shared.review?.clientReadinessNote).toBeUndefined();
    expect(shared.review?.scores.clientReadiness).toBeUndefined();
    expect(payload).not.toContain('SECRET_DEAL_RISK');
    expect(payload).not.toContain('SECRET_TIMELINE_CONFLICT');
    expect(payload).not.toContain('SECRET_NOTE');
    // Scope the score check to `scores` rather than searching the whole payload
    // for "55": the token is 43 random base64url chars and `sharedAt` is full of
    // digits, so a bare two-digit needle matches by chance and the test fails on
    // an unlucky token (it did). Assert the KEY is gone from the object that
    // would carry it — distinctive, and it can't collide with random data.
    expect(JSON.stringify(shared.review?.scores)).not.toContain('clientReadiness');
    // …while the engineering review still crosses (it lives in the appendix).
    expect(shared.review?.securityIssues[0].title).toBe('Public security note');
    expect(shared.review?.overallScore).toBe(80);
  });

  // The watermark is the free tier's price for a link that IS free — and it's the
  // whole of what Pro sells here, so the decision must be the server's, taken from
  // the OWNER's plan (a link holder is anonymous; there is no client flag to trust).
  describe('watermark', () => {
    it('watermarks a link owned by a free user', async () => {
      const h = makeHarness();
      const sessionId = await freePipeline(h);
      await ownedBy(h, sessionId, 'free');

      const shared = await h.share.view((await h.share.create(sessionId)).token);
      expect(shared.watermark).toBe(true);
    });

    it('leaves a Pro owner’s proposal unbranded', async () => {
      const h = makeHarness();
      const sessionId = await fullPipeline(h);
      await ownedBy(h, sessionId, 'pro');

      const shared = await h.share.view((await h.share.create(sessionId)).token);
      expect(shared.watermark).toBe(false);
    });

    // Downgrading (or a Pro period simply lapsing) must bring the watermark back on
    // links that are already out in the world — the plan is read at view time, not
    // frozen into the link when it was minted.
    it('re-watermarks an existing link when the owner drops back to Free', async () => {
      const h = makeHarness();
      const sessionId = await fullPipeline(h);
      const userId = await ownedBy(h, sessionId, 'pro');
      const { token } = await h.share.create(sessionId);
      await expect(h.share.view(token)).resolves.toMatchObject({
        watermark: false,
      });

      await h.billing.adminRevoke(userId, 'admin-1');

      await expect(h.share.view(token)).resolves.toMatchObject({
        watermark: true,
      });
    });

    // A session with no owner (legacy, pre-ownership) must not read as Pro.
    it('watermarks an owner-less session', async () => {
      const h = makeHarness();
      const sessionId = await freePipeline(h);

      const shared = await h.share.view((await h.share.create(sessionId)).token);
      expect(shared.watermark).toBe(true);
    });
  });

  it('mints an unguessable token and is idempotent', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);

    const link = await h.share.create(sessionId);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    expect(link.viewCount).toBe(0);

    // Sharing again must not invalidate a link the owner already sent out.
    const again = await h.share.create(sessionId);
    expect(again.token).toBe(link.token);
  });

  it('two sessions never share a token', async () => {
    const h = makeHarness();
    const a = await h.share.create(await fullPipeline(h));
    const b = await h.share.create(await fullPipeline(h));
    expect(a.token).not.toBe(b.token);
  });

  it('serves the design by token and counts the view', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const { token } = await h.share.create(sessionId);

    const shared = await h.share.view(token);
    expect(shared.token).toBe(token);
    expect(shared.title).toBe(IDEA.idea); // untitled project falls back to the idea
    expect(shared.systemDesign.services.length).toBeGreaterThan(0);
    expect(shared.apiDesign?.modules.length).toBeGreaterThan(0);
    expect(shared.review).toBeNull(); // review was never run

    // The public payload must not carry the session id or the owner.
    expect(JSON.stringify(shared)).not.toContain(sessionId);
    expect(shared).not.toHaveProperty('sessionId');
    expect(shared).not.toHaveProperty('userId');

    await h.share.view(token);
    const link = await h.share.get(sessionId);
    expect(link?.viewCount).toBe(2);
  });

  it('never leaks generation provenance to the public page', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const { token } = await h.share.create(sessionId);

    // The whole harness runs on MockLlmProvider, so every artifact the owner
    // holds IS stamped — this asserts redaction, not an accident of the fixture.
    const owned = await h.requirements.get(sessionId);
    expect(owned?.generation).toBeDefined();

    const shared = await h.share.view(token);

    // OWNER-ONLY: provenance tells a client their vendor's proposal was
    // machine-templated, and names our provider and model. Neither is theirs.
    expect(shared.requirements).not.toHaveProperty('generation');
    expect(shared.systemDesign).not.toHaveProperty('generation');
    expect(shared.databaseDesign).not.toHaveProperty('generation');
    expect(shared.apiDesign).not.toHaveProperty('generation');
    expect(shared.vision ?? {}).not.toHaveProperty('generation');
    // Belt and braces across the whole payload, including artifacts a richer
    // fixture would add later.
    expect(JSON.stringify(shared)).not.toContain('degradedReason');
    expect(JSON.stringify(shared)).not.toContain('"generation"');
  });

  it('prefers the owner-set title over the raw idea', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const session = await h.sessions.findById(sessionId);
    await h.sessions.save({ ...session!, title: 'Clinic OS' });

    const { token } = await h.share.create(sessionId);
    await expect(h.share.view(token)).resolves.toMatchObject({
      title: 'Clinic OS',
    });
  });

  it('404s an unknown token', async () => {
    const h = makeHarness();
    await expect(h.share.view('not-a-real-token')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s a revoked token, and re-sharing mints a fresh one', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const { token } = await h.share.create(sessionId);

    await h.share.revoke(sessionId);
    await expect(h.share.view(token)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.share.get(sessionId)).resolves.toBeNull();

    const fresh = await h.share.create(sessionId);
    expect(fresh.token).not.toBe(token);
    // The old link stays dead.
    await expect(h.share.view(token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s (not 409s) a link whose design regressed below the shareable floor', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const { token } = await h.share.create(sessionId);

    // e.g. a version restore rewound past the database design.
    await h.databaseDesigns.deleteBySessionId(sessionId);

    await expect(h.share.view(token)).rejects.toBeInstanceOf(NotFoundException);
  });

  // Losing only the API design is *not* a regression any more — it's just what a
  // free-tier design looks like, so the link keeps working and drops the tab.
  it('keeps serving a link whose API design was dropped', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const { token } = await h.share.create(sessionId);

    await h.apiDesigns.deleteBySessionId(sessionId);

    await expect(h.share.view(token)).resolves.toMatchObject({
      apiDesign: null,
    });
  });
});
