import {
  canShareProject,
  clientLinkState,
  projectProgress,
  shouldWatermarkShare,
  type ProjectArtifacts,
  type ProjectOverview,
} from '@archivato/shared';
import { ProjectsService } from './projects.service';
import { InterviewService } from '../interview/interview.service';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { RequirementsService } from '../requirements/requirements.service';
import { InMemoryRequirementDocumentRepository } from '../requirements/in-memory-requirement-document.repository';
import { SystemDesignService } from '../system-design/system-design.service';
import { InMemorySystemDesignRepository } from '../system-design/in-memory-system-design.repository';
import { DatabaseDesignService } from '../database-design/database-design.service';
import { InMemoryDatabaseDesignRepository } from '../database-design/in-memory-database-design.repository';
import { InMemoryApiDesignRepository } from '../api-design/in-memory-api-design.repository';
import { InMemoryReviewReportRepository } from '../review/in-memory-review-report.repository';
import { InMemoryShareLinkRepository } from '../share/in-memory-share-link.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { InMemoryBusinessAnalysisRepository } from '../business-analysis/in-memory-business-analysis.repository';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { ArchitectExplainerAgent } from '../llm/agents/architect-explainer.agent';
import { DatabaseDesignerAgent } from '../llm/agents/database-designer.agent';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from '../interview/question-plan';

const IDEA = { idea: 'A clinic system with appointments, billing and reports' };
const USER = 'user-1';

function makeHarness() {
  const sessions = new InMemoryInterviewSessionRepository();
  const docs = new InMemoryRequirementDocumentRepository();
  const systems = new InMemorySystemDesignRepository();
  const databases = new InMemoryDatabaseDesignRepository();
  const apis = new InMemoryApiDesignRepository();
  const reviews = new InMemoryReviewReportRepository();
  const links = new InMemoryShareLinkRepository();
  const mock = new MockLlmProvider();

  const interview = new InterviewService(
    sessions,
    new ProductAnalystAgent(mock),
    new InterviewerAgent(mock),
    // The quota is only enforced for owned sessions in `start`; a stub keeps this
    // spec about the read model rather than about billing.
    { getProjectQuota: async () => 99 } as never,
  );
  const requirements = new RequirementsService(
    sessions,
    docs,
    new InMemoryBusinessAnalysisRepository(),
    new RequirementEngineerAgent(mock),
  );
  const systemDesign = new SystemDesignService(
    sessions,
    docs,
    systems,
    new SystemArchitectAgent(mock),
    new ArchitectExplainerAgent(mock),
  );
  const databaseDesign = new DatabaseDesignService(
    sessions,
    docs,
    systems,
    databases,
    new DatabaseDesignerAgent(mock),
  );

  const projects = new ProjectsService(
    sessions,
    docs,
    systems,
    databases,
    apis,
    reviews,
    links,
  );

  return {
    interview,
    requirements,
    systemDesign,
    databaseDesign,
    links,
    projects,
  };
}

type Harness = ReturnType<typeof makeHarness>;

async function confirmedSession(h: Harness, clientName?: string) {
  const { sessionId } = await h.interview.start(IDEA, USER, clientName ?? null);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await h.interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    await h.interview.answer(sessionId, 'appointments billing reports');
  }
  await h.interview.confirm(sessionId);
  return sessionId;
}

describe('ProjectsService (dashboard read model)', () => {
  it('reports an untouched scoping as all-unbuilt', async () => {
    const h = makeHarness();
    await h.interview.start(IDEA, USER);

    const [project] = await h.projects.list(USER);

    expect(project.artifacts).toEqual({
      requirements: false,
      systemDesign: false,
      databaseDesign: false,
      apiDesign: false,
      review: false,
    });
    expect(project.shared).toBe(false);
  });

  // Progress is read off the artifacts themselves, so it tracks what was actually
  // generated — including a design that later gets rewound by a version restore.
  it('tracks progress as artifacts are generated', async () => {
    const h = makeHarness();
    const sessionId = await confirmedSession(h);

    await h.requirements.generate(sessionId);
    await h.systemDesign.generate(sessionId);

    const [project] = await h.projects.list(USER);
    expect(project.artifacts).toMatchObject({
      requirements: true,
      systemDesign: true,
      databaseDesign: false,
    });

    const progress = projectProgress(project.status, project.artifacts);
    expect(progress.completed).toBe(3); // interview + requirements + system
    expect(progress.nextStep).toBe('databaseDesign');
  });

  it('surfaces the client a scoping was created for', async () => {
    const h = makeHarness();
    await h.interview.start(IDEA, USER, 'Acme Clinics');

    const [project] = await h.projects.list(USER);
    expect(project.clientName).toBe('Acme Clinics');
    // …and it stays out of the idea the agents read.
    expect(project.idea).toBe(IDEA.idea);
  });

  it('flags a scoping that has been sent to the client', async () => {
    const h = makeHarness();
    const sessionId = await confirmedSession(h);

    expect((await h.projects.list(USER))[0].shared).toBe(false);

    await h.links.createIfAbsent({
      sessionId,
      token: 'tok_abc',
      viewCount: 0,
      lastViewedAt: null,
      createdAt: new Date(),
    });

    const [project] = await h.projects.list(USER);
    expect(project.shared).toBe(true);
    // The token itself must never ride out on the list — it's a bearer credential.
    expect(JSON.stringify(project)).not.toContain('tok_abc');
  });

  it('never lists another user’s scopings', async () => {
    const h = makeHarness();
    await h.interview.start(IDEA, USER);
    await h.interview.start(IDEA, 'someone-else');

    expect(await h.projects.list(USER)).toHaveLength(1);
  });
});

// ── The pure derivations (@archivato/shared) ────────────────────────────────

const NOTHING: ProjectArtifacts = {
  requirements: false,
  systemDesign: false,
  databaseDesign: false,
  apiDesign: false,
  review: false,
};

const overview = (
  artifacts: Partial<ProjectArtifacts>,
  shared = false,
): ProjectOverview => ({
  sessionId: 's1',
  idea: 'idea',
  status: 'confirmed',
  completeness: 1,
  updatedAt: new Date().toISOString(),
  artifacts: { ...NOTHING, ...artifacts },
  shared,
  lastViewedAt: null,
});

describe('projectProgress', () => {
  it('counts an unconfirmed interview as no progress at all', () => {
    const progress = projectProgress('collecting', NOTHING);
    expect(progress.completed).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.nextStep).toBe('interview');
  });

  it('counts the confirmed interview as the first completed step', () => {
    const progress = projectProgress('confirmed', NOTHING);
    expect(progress.completed).toBe(1);
    expect(progress.nextStep).toBe('requirements');
  });

  it('reports a fully generated project as complete', () => {
    const progress = projectProgress('confirmed', {
      requirements: true,
      systemDesign: true,
      databaseDesign: true,
      apiDesign: true,
      review: true,
    });
    expect(progress.completed).toBe(6);
    expect(progress.percent).toBe(100);
    expect(progress.nextStep).toBeNull();
  });

  // A free owner tops out at the database design (the API design is Pro). That's a
  // partially-complete rail, not a broken one — and the share link is already live.
  it('handles the free tier’s ceiling', () => {
    const artifacts = {
      requirements: true,
      systemDesign: true,
      databaseDesign: true,
    };
    const progress = projectProgress('confirmed', { ...NOTHING, ...artifacts });
    expect(progress.completed).toBe(4);
    expect(progress.nextStep).toBe('apiDesign');
    expect(canShareProject({ ...NOTHING, ...artifacts })).toBe(true);
  });
});

describe('clientLinkState', () => {
  it('locks the copy action until the design is shareable', () => {
    expect(clientLinkState(overview({ requirements: true }))).toBe('locked');
    expect(clientLinkState(overview({ systemDesign: true }))).toBe('locked');
  });

  it('is ready once the database design exists (the API’s own share floor)', () => {
    expect(clientLinkState(overview({ databaseDesign: true }))).toBe('ready');
  });

  it('reports a scoping with a live link as sent', () => {
    expect(clientLinkState(overview({ databaseDesign: true }, true))).toBe('sent');
  });

  // A link that already exists keeps working even if the design is rewound below
  // the share floor — the owner sent it, so the card must keep saying so.
  it('still reports sent when a shared design regressed', () => {
    expect(clientLinkState(overview({}, true))).toBe('sent');
  });
});

// Sharing is free on every plan; what Pro buys is the absence of our name on a
// document the owner hands to their own client.
describe('shouldWatermarkShare', () => {
  it('watermarks a free owner’s proposal', () => {
    expect(shouldWatermarkShare('free')).toBe(true);
  });

  it('leaves a Pro owner’s proposal unbranded', () => {
    expect(shouldWatermarkShare('pro')).toBe(false);
  });
});
