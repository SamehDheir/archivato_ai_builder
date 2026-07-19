import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  isStale,
  normalizeReviewReport,
  redactReviewForShare,
  upstreamStamp,
  validateFixProposal,
  type ReviewReport,
} from '@archivato/shared';
import { ReviewFixService } from './review-fix.service';
import { InMemoryReviewReportRepository } from './in-memory-review-report.repository';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { InMemoryRequirementDocumentRepository } from '../requirements/in-memory-requirement-document.repository';
import { InMemorySystemDesignRepository } from '../system-design/in-memory-system-design.repository';
import { RequirementsService } from '../requirements/requirements.service';
import { SystemDesignService } from '../system-design/system-design.service';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { InMemoryBusinessAnalysisRepository } from '../business-analysis/in-memory-business-analysis.repository';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { ArchitectExplainerAgent } from '../llm/agents/architect-explainer.agent';
import { PatchAgent } from '../llm/agents/patch.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import type { InterviewSession } from '../interview/interview-session.entity';

const SESSION_ID = 's1';

function session(): InterviewSession {
  return {
    id: SESSION_ID,
    userId: 'u1',
    input: { idea: 'A clinic booking system' },
    title: null,
    clientName: null,
    weeklyRate: null,
    status: 'confirmed',
    intent: null,
    history: [],
    pendingQuestion: null,
    coverage: 1,
    summary: null,
    slots: null,
    openQuestions: null,
    fixLog: null,
    proposalDrafts: null,
    generateExtendedArtifacts: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function requirements(generatedAt = '2026-01-01T00:00:00.000Z') {
  return {
    sessionId: SESSION_ID,
    generatedAt,
    executiveSummary: 'A booking system for a clinic.',
    functional: [
      { id: 'FR-1', title: 'Book', description: 'Patients book', priority: 'must' as const },
    ],
    nonFunctional: [{ id: 'NFR-1', category: 'general', description: 'Fast' }],
    roles: [{ name: 'Patient', description: 'A patient', permissions: [] }],
    businessRules: [{ id: 'BR-1', description: 'One booking per slot' }],
    constraints: ['Must run in the EU'],
    assumptions: [],
    outOfScope: [{ item: 'Native apps' }],
    assumptionsAndOpenQuestions: [
      { assumption: 'Single clinic', impactIfWrong: 'Re-scope' },
    ],
    openQuestions: [],
  };
}

function systemDesign(generatedAt = '2026-01-01T00:00:00.000Z') {
  return {
    sessionId: SESSION_ID,
    generatedAt,
    architecture: 'modular_monolith' as const,
    architectureRationale: 'Simplest that fits.',
    techStack: [
      { layer: 'backend', technology: 'NestJS', rationale: 'Modular' },
    ],
    services: [
      { name: 'Booking', responsibility: 'Bookings', dependencies: [], complexity: 'M' as const },
    ],
    constraintCompliance: [],
  };
}

/**
 * A report carrying one finding of each action type. Written raw (no ids, no
 * statuses) so the store's read boundary is what classifies it — the same path a
 * pre-R11 row takes.
 */
function rawReport(): ReviewReport {
  return {
    sessionId: SESSION_ID,
    generatedAt: '2026-01-02T00:00:00.000Z',
    overallScore: 60,
    scores: { security: 60, scalability: 60, performance: 60, cost: 60 },
    scalabilityScore: 60,
    summary: 'ok',
    securityIssues: [
      { title: 'No encryption stated', detail: 'Add an NFR.', severity: 'high' },
    ],
    scalabilityIssues: [],
    performanceRisks: [],
    costOptimizations: [
      { title: 'Right-size compute', detail: 'Autoscale.', severity: 'low' },
    ],
    missingFeatures: [],
    recommendations: [],
    clientReadinessIssues: [
      {
        title: 'Unbounded reporting scope',
        detail: 'Any report the client requests.',
        severity: 'high',
        suggestedResolution: 'add_out_of_scope',
        resolutionHint: 'List custom reports as out of scope.',
      },
      {
        title: 'Ambiguous booking window',
        detail: 'Two readings possible.',
        severity: 'medium',
        suggestedResolution: 'tighten_requirement',
        resolutionHint: 'Tighten FR-1.',
      },
    ],
    consistencyFindings: [],
  } as ReviewReport;
}

interface Harness {
  service: ReviewFixService;
  sessions: InMemoryInterviewSessionRepository;
  reports: InMemoryReviewReportRepository;
  docs: InMemoryRequirementDocumentRepository;
  designs: InMemorySystemDesignRepository;
  mock: MockLlmProvider;
}

async function makeHarness(): Promise<Harness> {
  const sessions = new InMemoryInterviewSessionRepository();
  const docs = new InMemoryRequirementDocumentRepository();
  const designs = new InMemorySystemDesignRepository();
  const reports = new InMemoryReviewReportRepository();
  const mock = new MockLlmProvider();

  await sessions.create(session());
  await docs.upsert(requirements());
  await designs.upsert(systemDesign());
  await reports.upsert(rawReport());

  const service = new ReviewFixService(
    sessions,
    reports,
    docs,
    designs,
    new RequirementsService(sessions, docs, new InMemoryBusinessAnalysisRepository(), new RequirementEngineerAgent(mock)),
    new SystemDesignService(
      sessions,
      docs,
      designs,
      new SystemArchitectAgent(mock),
      new ArchitectExplainerAgent(mock),
    ),
    new PatchAgent(mock),
  );
  return { service, sessions, reports, docs, designs, mock };
}

/** The patch a conforming model would return for the security NFR finding. */
function nfrPatch() {
  return {
    sections: [
      {
        key: 'requirements.nonFunctional',
        beforeSummary: 'One general NFR.',
        rationale: 'Adds the missing encryption requirement.',
        proposedContent: [
          { id: 'NFR-1', category: 'general', description: 'Fast' },
          {
            id: 'NFR-2',
            category: 'security',
            description: 'Data encrypted in transit and at rest.',
          },
        ],
      },
    ],
  };
}

// ── §1 classification ───────────────────────────────────────────────────────

describe('R11 classification', () => {
  it('maps suggestedResolution onto an action type', async () => {
    const report = normalizeReviewReport(rawReport());
    const [outOfScope, tighten] = report.clientReadinessIssues!;

    // add_out_of_scope → only the client can settle it; no patch target.
    expect(outOfScope.actionType).toBe('needs_client');
    expect(outOfScope.patchTarget).toBeUndefined();

    // tighten_requirement → a patch on the functional requirements.
    expect(tighten.actionType).toBe('patch');
    expect(tighten.patchTarget).toEqual({
      stage: 'requirements',
      sectionHint: 'functional',
    });
  });

  it('backfills a pre-R11 report on READ, so old rows are actionable', async () => {
    const h = await makeHarness();
    // Seeded raw: no ids, no actionType, no status anywhere.
    const stored = await h.reports.findBySessionId(SESSION_ID);

    expect(stored!.securityIssues[0].id).toBe('security:0');
    expect(stored!.securityIssues[0].status).toBe('open');
    // Security defaults to a patch on the security NFRs.
    expect(stored!.securityIssues[0].actionType).toBe('patch');
    expect(stored!.securityIssues[0].patchTarget).toEqual({
      stage: 'requirements',
      sectionHint: 'nonFunctional',
    });
    // Cost findings are advisory — there is no artifact section that states them.
    expect(stored!.costOptimizations[0].actionType).toBe('advisory');
    expect(stored!.costOptimizations[0].patchTarget).toBeUndefined();
  });

  it('degrades a patch aimed at an unpatchable section to advisory', () => {
    const report = normalizeReviewReport({
      ...rawReport(),
      // The model claims the API modules are patchable. They are not.
      securityIssues: [
        {
          title: 'Bad target',
          detail: 'x',
          severity: 'low',
          actionType: 'patch',
          patchTarget: { stage: 'api-design', sectionHint: 'modules' },
        },
      ],
    } as ReviewReport);

    expect(report.securityIssues[0].actionType).toBe('advisory');
    expect(report.securityIssues[0].patchTarget).toBeUndefined();
  });
});

// ── §2a patch contract ──────────────────────────────────────────────────────

describe('R11 patch contract', () => {
  it('rejects an unknown section', () => {
    const result = validateFixProposal(
      { sections: [{ key: 'requirements.nope', proposedContent: [], rationale: 'x' }] },
      ['security:0'],
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('unknown_section');
  });

  it('rejects content that does not match the section shape', () => {
    const result = validateFixProposal(
      {
        sections: [
          {
            key: 'requirements.nonFunctional',
            // Missing `description` — an NFR needs id + category + description.
            proposedContent: [{ id: 'NFR-1', category: 'security' }],
            rationale: 'x',
          },
        ],
      },
      ['security:0'],
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('invalid_content');
  });

  it('leaves the artifact untouched when the model returns junk', async () => {
    const h = await makeHarness();
    const before = await h.docs.findBySessionId(SESSION_ID);
    h.mock.enqueueJson({ nonsense: true });

    await expect(h.service.propose(SESSION_ID, ['security:0'])).rejects.toBeInstanceOf(
      ConflictException,
    );

    // Nothing was written, and — critically — no fallback patch was invented.
    const after = await h.docs.findBySessionId(SESSION_ID);
    expect(after).toEqual(before);
    expect((await h.sessions.findById(SESSION_ID))!.fixLog).toBeNull();
  });

  it('rejects an apply whose content is malformed, without writing', async () => {
    const h = await makeHarness();
    const before = await h.docs.findBySessionId(SESSION_ID);

    await expect(
      h.service.applyPatch(SESSION_ID, {
        findingIds: ['security:0'],
        sections: [
          {
            key: 'requirements.nonFunctional',
            proposedContent: 'not an array',
            rationale: 'x',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await h.docs.findBySessionId(SESSION_ID)).toEqual(before);
  });
});

// ── §2a apply ───────────────────────────────────────────────────────────────

describe('R11 apply', () => {
  it('updates the artifact, logs the fix, and resolves the finding', async () => {
    const h = await makeHarness();
    h.mock.enqueueJson(nfrPatch());

    const proposal = await h.service.propose(SESSION_ID, ['security:0']);
    // The preview's "before" is the real artifact, read server-side.
    expect(proposal.sections[0].currentContent).toEqual(
      requirements().nonFunctional,
    );

    const result = await h.service.applyPatch(SESSION_ID, proposal);

    // 1. the artifact changed
    const doc = await h.docs.findBySessionId(SESSION_ID);
    expect(doc!.nonFunctional).toHaveLength(2);
    expect(doc!.nonFunctional[1].category).toBe('security');
    // 2. the finding moved to resolved
    expect(result.review.securityIssues[0].status).toBe('resolved');
    // 3. the log records it, on the session, readable on its own
    expect(result.fixLog).toHaveLength(1);
    expect(result.fixLog[0]).toMatchObject({
      findingId: 'security:0',
      findingTitle: 'No encryption stated',
      action: 'patch_applied',
      artifactsTouched: ['requirements'],
    });
    expect((await h.sessions.findById(SESSION_ID))!.fixLog).toHaveLength(1);
    expect(result.artifactsTouched).toEqual(['requirements']);
  });

  it('raises the EXISTING staleness flags on the derived stages', async () => {
    const h = await makeHarness();
    const revisionsBefore = {
      requirements: requirements().generatedAt,
      systemDesign: systemDesign().generatedAt,
      databaseDesign: 'db-1',
      apiDesign: 'api-1',
    };
    // A stamp is per-stage (each stage records a different set of upstreams), so
    // each artifact must be stamped as its own stage — comparing a roadmap against
    // a review's stamp would read as stale no matter what, and prove nothing.
    const artifactFor = (stage: Parameters<typeof upstreamStamp>[0]) => ({
      sourceStamp: upstreamStamp(stage, revisionsBefore),
    });
    const derived = ['review', 'roadmap', 'threat-model', 'qa-plan'] as const;
    for (const stage of derived) {
      expect(isStale(stage, artifactFor(stage), revisionsBefore)).toBe(false);
    }

    h.mock.enqueueJson(nfrPatch());
    const proposal = await h.service.propose(SESSION_ID, ['security:0']);
    await h.service.applyPatch(SESSION_ID, proposal);

    // The patch moved requirements.generatedAt, so every stage derived from the
    // requirements is now stale by the existing rule — no new cascade involved.
    const doc = await h.docs.findBySessionId(SESSION_ID);
    expect(doc!.generatedAt).not.toBe(requirements().generatedAt);
    const revisionsAfter = { ...revisionsBefore, requirements: doc!.generatedAt };
    for (const stage of derived) {
      expect(isStale(stage, artifactFor(stage), revisionsAfter)).toBe(true);
    }
    // The cost estimate's figures derive only from the designs, so a
    // requirements-only patch must NOT nag the owner to re-run it.
    expect(isStale('cost-estimate', artifactFor('cost-estimate'), revisionsAfter)).toBe(
      false,
    );
  });

  it('patches the system design through its own service', async () => {
    const h = await makeHarness();
    await h.reports.upsert({
      ...rawReport(),
      scalabilityIssues: [
        {
          title: 'No async processing',
          detail: 'Add a queue.',
          severity: 'medium',
          actionType: 'patch',
          patchTarget: { stage: 'system-design', sectionHint: 'techStack' },
        },
      ],
    } as ReviewReport);
    h.mock.enqueueJson({
      sections: [
        {
          key: 'system-design.techStack',
          beforeSummary: 'NestJS only.',
          rationale: 'Adds a queue for async work.',
          proposedContent: [
            { layer: 'backend', technology: 'NestJS', rationale: 'Modular' },
            { layer: 'queue', technology: 'BullMQ + Redis', rationale: 'Async jobs' },
          ],
        },
      ],
    });

    const proposal = await h.service.propose(SESSION_ID, ['scalability:0']);
    const result = await h.service.applyPatch(SESSION_ID, proposal);

    const design = await h.designs.findBySessionId(SESSION_ID);
    expect(design!.techStack).toHaveLength(2);
    expect(result.artifactsTouched).toEqual(['system-design']);
    // The unpatchable sections survive untouched.
    expect(design!.services).toEqual(systemDesign().services);
  });

  it('refuses an apply whose section belongs to no named finding', async () => {
    const h = await makeHarness();
    // security:0 targets nonFunctional; this rewrites `functional` instead. Left
    // unchecked, the artifact would change while security:0 was logged resolved.
    await expect(
      h.service.applyPatch(SESSION_ID, {
        findingIds: ['security:0'],
        sections: [
          {
            key: 'requirements.functional',
            proposedContent: [
              { id: 'FR-1', title: 'X', description: 'Y', priority: 'must' },
            ],
            rationale: 'unrelated',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const doc = await h.docs.findBySessionId(SESSION_ID);
    expect(doc!.functional).toEqual(requirements().functional);
    expect((await h.sessions.findById(SESSION_ID))!.fixLog).toBeNull();
  });

  it('refuses an apply naming an advisory finding', async () => {
    const h = await makeHarness();
    await expect(
      h.service.applyPatch(SESSION_ID, {
        findingIds: ['cost:0'], // advisory — nothing to patch
        sections: [nfrPatch().sections[0]],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to propose for a finding that is not a patch', async () => {
    const h = await makeHarness();
    // clientReadiness:0 is add_out_of_scope → needs_client, not patchable.
    await expect(
      h.service.propose(SESSION_ID, ['clientReadiness:0']),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// ── §2a batch conflict ──────────────────────────────────────────────────────

describe('R11 batch conflict', () => {
  it('rejects two findings that would rewrite the same section', async () => {
    const h = await makeHarness();
    await h.reports.upsert({
      ...rawReport(),
      securityIssues: [
        { title: 'No encryption stated', detail: 'x', severity: 'high' },
        { title: 'No rate limiting', detail: 'y', severity: 'medium' },
      ],
    } as ReviewReport);

    // Both default to requirements.nonFunctional — each patch is a whole-section
    // replacement, so applying both would let the second erase the first.
    await expect(
      h.service.propose(SESSION_ID, ['security:0', 'security:1']),
    ).rejects.toMatchObject({ response: { code: 'batch_conflict' } });
  });

  it('allows a batch across different sections', async () => {
    const h = await makeHarness();
    h.mock.enqueueJson({
      sections: [
        nfrPatch().sections[0],
        {
          key: 'requirements.functional',
          beforeSummary: 'One FR.',
          rationale: 'Tightens the booking window.',
          proposedContent: [
            {
              id: 'FR-1',
              title: 'Book',
              description: 'Patients book up to 30 days ahead',
              priority: 'must',
            },
          ],
        },
      ],
    });

    // security:0 → nonFunctional, clientReadiness:1 (tighten) → functional.
    const proposal = await h.service.propose(SESSION_ID, [
      'security:0',
      'clientReadiness:1',
    ]);
    expect(proposal.sections).toHaveLength(2);

    const result = await h.service.applyPatch(SESSION_ID, proposal);
    // One approval, both findings resolved, one log entry each.
    expect(result.fixLog).toHaveLength(2);
    expect(result.review.securityIssues[0].status).toBe('resolved');
    expect(result.review.clientReadinessIssues![1].status).toBe('resolved');
  });

  it('rejects a hand-crafted apply carrying two patches for one section', () => {
    const result = validateFixProposal(
      {
        sections: [
          nfrPatch().sections[0],
          { ...nfrPatch().sections[0], rationale: 'again' },
        ],
      },
      ['security:0', 'security:1'],
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('conflict');
  });
});

// ── §2b needs_client conversions ────────────────────────────────────────────

describe('R11 needs_client conversions', () => {
  it('adds a client question to the requirement document, not the session', async () => {
    const h = await makeHarness();

    const result = await h.service.addClientQuestion(
      SESSION_ID,
      'clientReadiness:0',
      'Which reports do you need at launch?',
    );

    const doc = await h.docs.findBySessionId(SESSION_ID);
    expect(doc!.openQuestions).toEqual([
      { slotKey: 'constraints', questionForClient: 'Which reports do you need at launch?' },
    ]);
    // It also lands in the section a client actually reads.
    expect(doc!.assumptionsAndOpenQuestions).toHaveLength(2);
    expect(doc!.assumptionsAndOpenQuestions![1].assumption).toBe(
      'Which reports do you need at launch?',
    );
    // The R6 invariant holds: session.openQuestions stays transcript-derived.
    expect((await h.sessions.findById(SESSION_ID))!.openQuestions).toBeNull();

    expect(result.review.clientReadinessIssues![0].status).toBe('converted');
    expect(result.fixLog[0].action).toBe('added_open_question');
    expect(result.artifactsTouched).toEqual(['requirements']);
  });

  it('adds an out-of-scope line', async () => {
    const h = await makeHarness();

    const result = await h.service.addOutOfScope(
      SESSION_ID,
      'clientReadiness:0',
      'Custom report builder',
      'Not requested in the call',
    );

    const doc = await h.docs.findBySessionId(SESSION_ID);
    expect(doc!.outOfScope).toEqual([
      { item: 'Native apps' },
      { item: 'Custom report builder', reason: 'Not requested in the call' },
    ]);
    expect(result.review.clientReadinessIssues![0].status).toBe('converted');
    expect(result.fixLog[0].action).toBe('added_out_of_scope');
  });

  it('falls back to the finding text when the owner clears the field', async () => {
    const h = await makeHarness();
    await h.service.addClientQuestion(SESSION_ID, 'clientReadiness:0', '   ');
    const doc = await h.docs.findBySessionId(SESSION_ID);
    // Pre-filled from the R10 resolutionHint, which was written to be read.
    expect(doc!.openQuestions![0].questionForClient).toBe(
      'List custom reports as out of scope.',
    );
  });
});

// ── §2c advisory ────────────────────────────────────────────────────────────

describe('R11 advisory', () => {
  it('dismisses with a note and touches no artifact', async () => {
    const h = await makeHarness();
    const before = await h.docs.findBySessionId(SESSION_ID);

    const result = await h.service.resolveAdvisory(
      SESSION_ID,
      'cost:0',
      'dismissed',
      'Already right-sized.',
    );

    expect(result.review.costOptimizations[0].status).toBe('dismissed');
    expect(result.review.costOptimizations[0].statusNote).toBe('Already right-sized.');
    expect(result.artifactsTouched).toEqual([]);
    expect(result.fixLog[0]).toMatchObject({
      action: 'dismissed',
      note: 'Already right-sized.',
      artifactsTouched: [],
    });
    expect(await h.docs.findBySessionId(SESSION_ID)).toEqual(before);
  });

  it('acknowledging resolves the finding', async () => {
    const h = await makeHarness();
    const result = await h.service.resolveAdvisory(SESSION_ID, 'cost:0', 'acknowledged');
    expect(result.review.costOptimizations[0].status).toBe('resolved');
  });
});

// ── §3 the fix log ──────────────────────────────────────────────────────────

describe('R11 fix log', () => {
  it('is append-only across actions', async () => {
    const h = await makeHarness();
    await h.service.resolveAdvisory(SESSION_ID, 'cost:0', 'acknowledged');
    await h.service.addOutOfScope(SESSION_ID, 'clientReadiness:0', 'Custom reports');

    const log = await h.service.fixLog(SESSION_ID);
    expect(log.map((e) => e.action)).toEqual([
      'acknowledged',
      'added_out_of_scope',
    ]);
  });

  it('survives a review re-run, which resets the findings', async () => {
    const h = await makeHarness();
    await h.service.resolveAdvisory(SESSION_ID, 'cost:0', 'dismissed', 'no');

    // A re-run replaces the report wholesale — statuses reset to open.
    await h.reports.upsert({ ...rawReport(), generatedAt: '2026-02-01T00:00:00.000Z' });
    const rerun = await h.reports.findBySessionId(SESSION_ID);
    expect(rerun!.costOptimizations[0].status).toBe('open');

    // The log lives on the session, so it is untouched — and still readable,
    // because it carries the finding's title rather than only its id.
    const log = await h.service.fixLog(SESSION_ID);
    expect(log).toHaveLength(1);
    expect(log[0].findingTitle).toBe('Right-size compute');
  });
});

// ── §4 share-payload isolation ──────────────────────────────────────────────

describe('R11 owner-only isolation', () => {
  it('strips the whole fix workflow from the public share payload', () => {
    const report = normalizeReviewReport(rawReport());
    // Sanity: the owner's copy really does carry the workflow.
    expect(report.securityIssues[0].actionType).toBe('patch');
    expect(report.securityIssues[0].status).toBe('open');

    const shared = redactReviewForShare(report);

    // The R10 deal-risk lens is still gone.
    expect(shared.clientReadinessIssues).toEqual([]);
    expect(shared.consistencyFindings).toEqual([]);
    expect(shared.scores.clientReadiness).toBeUndefined();

    // And the R11 workflow never reaches a client: no ids, action types, patch
    // targets, or statuses on any finding that DOES cross.
    for (const finding of [
      ...shared.securityIssues,
      ...shared.scalabilityIssues,
      ...shared.performanceRisks,
      ...shared.costOptimizations,
    ]) {
      expect(finding.id).toBeUndefined();
      expect(finding.actionType).toBeUndefined();
      expect(finding.patchTarget).toBeUndefined();
      expect(finding.status).toBeUndefined();
      expect(finding.statusNote).toBeUndefined();
      // The finding itself still crosses — the review lives in the appendix.
      expect(finding.title).toBeTruthy();
    }
  });

  it('still hides a dismissed finding\'s note after the owner acted on it', async () => {
    const h = await makeHarness();
    const result = await h.service.resolveAdvisory(
      SESSION_ID,
      'cost:0',
      'dismissed',
      'Client accepted this risk verbally.',
    );

    // The payload IS the boundary: serialize it exactly as the share route would.
    const shared = JSON.stringify(redactReviewForShare(result.review));
    expect(shared).not.toContain('Client accepted this risk verbally');
    expect(shared).not.toContain('dismissed');
  });
});
