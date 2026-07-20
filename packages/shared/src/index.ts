/**
 * @archivato/shared
 *
 * Cross-cutting domain types shared between the NestJS API (apps/api) and the
 * Next.js web client (apps/web). Keep this package free of runtime dependencies
 * so it can be imported from anywhere (browser or server).
 *
 * Each pipeline stage's detailed artifact shape is fleshed out in its own slice;
 * for now we define the stable scaffolding (stages, agent roles, envelopes).
 */

export * from './pipeline';
export * from './agents';
export * from './interview';
export * from './projects';
export * from './text';
export * from './prompt-safety';
export * from './effort';
export * from './requirements';
export * from './system-design';
export * from './decision-explanation';
export * from './database-design';
export * from './api-design';
export * from './api-design.coverage';
export * from './api-design.rest';
export * from './mock-response';
export * from './business-analysis';
export * from './freshness';
export * from './generation';
export * from './extended-artifacts';
export * from './review';
export * from './review.fix';
export * from './threat-model';
export * from './qa-plan';
export * from './product-vision';
export * from './roadmap';
export * from './region';
export * from './cost-estimate';
export * from './export';
export * from './share';
export * from './proposal';
export * from './scaffold';
export * from './scaffold.frontend';
export * from './scaffold.deploy';
export * from './scaffold.compose';
export * from './auth';
export * from './permissions';
export * from './billing';
export * from './admin';
export * from './funnel';
export * from './llm-usage';
export * from './chat';
export * from './support';
export * from './kb';
export * from './jobs';
export * from './versions';
export * from './diagrams';
export * from './mermaid.builders';
export * from './drawio.builders';
export * from './yaml';
export * from './sql';
export * from './postman';
export * from './waitlist';
export * from './streaming';
export * from './notifications';
