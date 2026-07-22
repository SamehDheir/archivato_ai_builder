import {
  buildEffortEstimate,
  type ApiDesign,
  type DatabaseDesign,
  type RequirementDocument,
  type ServiceModule,
  type SystemDesign,
} from '@archivato/shared';
import { RoadmapPlannerAgent, type RoadmapContext } from './roadmap-planner.agent';
import { MockLlmProvider } from '../mock-llm.provider';

const NOW = new Date().toISOString();

function svc(name: string, complexity?: ServiceModule['complexity']): ServiceModule {
  return { name, responsibility: `${name}.`, dependencies: [], complexity };
}

const requirements: RequirementDocument = {
  sessionId: 's',
  generatedAt: NOW,
  functional: [{ id: 'FR-1', title: 'Book a slot', description: '', priority: 'must' }],
  nonFunctional: [],
  roles: [{ name: 'Customer', description: '', permissions: [] }],
  businessRules: [],
  constraints: [],
  assumptions: [],
};

const systemDesign: SystemDesign = {
  sessionId: 's',
  generatedAt: NOW,
  architecture: 'modular_monolith',
  architectureRationale: '',
  techStack: [],
  services: [svc('Booking', 'L'), svc('Catalog', 'M')],
};

const databaseDesign = {
  sessionId: 's',
  generatedAt: NOW,
  databaseType: 'PostgreSQL',
  entities: [{ name: 'booking' }],
  relations: [],
} as unknown as DatabaseDesign;

const apiDesign = {
  sessionId: 's',
  generatedAt: NOW,
  modules: [{ name: 'Booking', endpoints: [{ method: 'GET' }] }],
} as unknown as ApiDesign;

function ctx(overrides: Partial<RoadmapContext> = {}): RoadmapContext {
  return {
    idea: 'A home-services booking app',
    intent: null,
    requirements,
    systemDesign,
    databaseDesign,
    apiDesign,
    effort: buildEffortEstimate(systemDesign),
    ...overrides,
  };
}

describe('RoadmapPlannerAgent — malformed model output', () => {
  it('survives (and recovers) an alternative roadmap wrapped in an object', async () => {
    // The production crash: `TypeError: (raw ?? []).map is not a function`.
    // `isValid` gates on `phases` and never inspects `alternativeRoadmaps`, so
    // this branch reached `.map` unchecked — and the prompt's
    // `withinDeadline: phases[]` came back as `{ phases: [...] }`, an object
    // that is truthy and therefore survived `?? []`.
    const phase = (name: string) => ({
      name,
      goal: 'g',
      dependsOn: [],
      moduleNames: ['Booking'],
      milestones: [{ title: 'M', tasks: [{ title: 't' }] }],
    });
    const mock = new MockLlmProvider();
    mock.enqueueJson({
      summary: 'plan',
      phases: [phase('Core')],
      alternativeRoadmaps: {
        withinDeadline: { phases: [phase('Lean')] },
        fullScope: { phases: [phase('Full')] },
        excludedFromDeadline: ['Reporting'],
      },
    });

    const roadmap = await new RoadmapPlannerAgent(mock).generate('s', {
      ...ctx(),
      requestDualRoadmap: true,
    });

    // It does not throw, and the alternative is kept rather than dropped.
    expect(roadmap.alternativeRoadmaps?.withinDeadline[0].name).toBe('Lean');
    expect(roadmap.alternativeRoadmaps?.fullScope[0].name).toBe('Full');
  });

  it('falls back when a phase list itself is mistyped', async () => {
    // Here `isValid` is the one that catches it, and the deterministic build
    // takes over — a complete roadmap beats a half-parsed one.
    const mock = new MockLlmProvider();
    mock.enqueueJson({ summary: 'plan', phases: { name: 'Core' } });

    const roadmap = await new RoadmapPlannerAgent(mock).generate('s', ctx());
    expect(roadmap.phases.length).toBeGreaterThan(0);
    expect(roadmap.generation?.mode).toBe('fallback');
  });

  it('reads a bare string task as its title', async () => {
    // Observed in a real rejected completion: tasks mixing {title} objects with
    // bare strings. Reading `.title` off a string rendered the task blank.
    const mock = new MockLlmProvider();
    mock.enqueueJson({
      summary: 'plan',
      phases: [
        {
          name: 'Core',
          goal: 'g',
          dependsOn: [],
          milestones: [
            { title: 'M', tasks: [{ title: 'Support tag filter' }, 'Add pagination'] },
          ],
        },
      ],
    });

    const roadmap = await new RoadmapPlannerAgent(mock).generate('s', ctx());
    expect(roadmap.phases[0].milestones[0].tasks.map((t) => t.title)).toEqual([
      'Support tag filter',
      'Add pagination',
    ]);
  });
});

describe('RoadmapPlannerAgent (R10)', () => {
  it('computes phase week numbers in code and ignores any the LLM emits', async () => {
    const mock = new MockLlmProvider();
    mock.enqueueJson({
      summary: 'plan',
      phases: [
        {
          name: 'Core',
          goal: 'g',
          dependsOn: [],
          moduleNames: ['Booking', 'Catalog'],
          // The model must never set the numbers — these are bogus and ignored.
          weeksMin: 999,
          weeksMax: 999,
          effort: '~50 wks',
          milestones: [{ title: 'M', tasks: [{ title: 't' }] }],
        },
      ],
    });
    const agent = new RoadmapPlannerAgent(mock);

    const roadmap = await agent.generate('s', ctx());
    const p = roadmap.phases[0];
    expect(p.weeksMin).toBeLessThan(50); // computed from the effort estimate
    expect(p.weeksMin).toBeGreaterThan(0);
    // The total also comes from the effort estimate, never the LLM.
    expect(roadmap.totalEstimate).toMatch(/wks/);
    expect(roadmap.totalEstimate).not.toContain('999');
  });

  it('always flags phase 1 as the MVP and backfills its statement from the R8 phased MVP', async () => {
    const mock = new MockLlmProvider();
    mock.enqueueJson({
      summary: 'plan',
      phases: [
        // No isMvp / mvpStatement from the model — both are enforced/backfilled.
        { name: 'Core', goal: 'g', dependsOn: [], moduleNames: ['Booking'], milestones: [{ title: 'M', tasks: [{ title: 't' }] }] },
        { name: 'More', goal: 'g', dependsOn: ['Core'], moduleNames: ['Catalog'], milestones: [{ title: 'M', tasks: [{ title: 't' }] }] },
      ],
    });
    const agent = new RoadmapPlannerAgent(mock);

    const roadmap = await agent.generate(
      's',
      ctx({
        systemDesign: {
          ...systemDesign,
          phasedArchitecture: {
            mvp: 'Launch booking for one metro',
            growthPath: '',
            migrationNotes: '',
          },
        },
      }),
    );
    expect(roadmap.phases[0].isMvp).toBe(true);
    expect(roadmap.phases[0].mvpStatement).toBe('Launch booking for one metro');
    expect(roadmap.phases[1].isMvp).toBe(false);
  });

  it('produces a dual roadmap when one is requested and the model returns both halves', async () => {
    const mock = new MockLlmProvider();
    mock.enqueueJson({
      summary: 'plan',
      phases: [
        { name: 'Core', goal: 'g', dependsOn: [], moduleNames: ['Booking', 'Catalog'], milestones: [{ title: 'M', tasks: [{ title: 't' }] }] },
      ],
      alternativeRoadmaps: {
        withinDeadline: [
          { name: 'MVP', goal: 'g', dependsOn: [], moduleNames: ['Booking'], milestones: [{ title: 'M', tasks: [{ title: 't' }] }] },
        ],
        fullScope: [
          { name: 'Everything', goal: 'g', dependsOn: [], moduleNames: ['Booking', 'Catalog'], milestones: [{ title: 'M', tasks: [{ title: 't' }] }] },
        ],
        excludedFromDeadline: ['Catalog browsing'],
      },
    });
    const agent = new RoadmapPlannerAgent(mock);

    const roadmap = await agent.generate('s', ctx({ requestDualRoadmap: true }));
    expect(roadmap.alternativeRoadmaps).toBeDefined();
    expect(roadmap.alternativeRoadmaps!.excludedFromDeadline).toEqual(['Catalog browsing']);
    // The dual-roadmap phases are effort-grounded too (numbers computed in code).
    expect(roadmap.alternativeRoadmaps!.withinDeadline[0].weeksMin).toBeGreaterThan(0);
    expect(roadmap.alternativeRoadmaps!.fullScope[0].weeksMax).toBeGreaterThan(0);
  });

  it('drops the dual roadmap when it was not requested', async () => {
    const mock = new MockLlmProvider();
    mock.enqueueJson({
      summary: 'plan',
      phases: [{ name: 'Core', goal: 'g', dependsOn: [], moduleNames: ['Booking'], milestones: [{ title: 'M', tasks: [{ title: 't' }] }] }],
      alternativeRoadmaps: {
        withinDeadline: [{ name: 'X', goal: '', dependsOn: [], milestones: [] }],
        fullScope: [{ name: 'Y', goal: '', dependsOn: [], milestones: [] }],
        excludedFromDeadline: [],
      },
    });
    const agent = new RoadmapPlannerAgent(mock);

    const roadmap = await agent.generate('s', ctx({ requestDualRoadmap: false }));
    expect(roadmap.alternativeRoadmaps).toBeUndefined();
  });

  it('omits week numbers when no effort estimate is available (regression)', async () => {
    const mock = new MockLlmProvider();
    mock.enqueueJson({
      summary: 'plan',
      phases: [{ name: 'Core', goal: 'g', dependsOn: [], moduleNames: ['Booking'], milestones: [{ title: 'M', tasks: [{ title: 't' }] }] }],
    });
    const agent = new RoadmapPlannerAgent(mock);

    const roadmap = await agent.generate('s', ctx({ effort: null }));
    expect(roadmap.phases[0].weeksMin).toBeUndefined();
    expect(roadmap.phases[0].weeksMax).toBeUndefined();
  });
});
