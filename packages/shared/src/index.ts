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
export * from './requirements';
export * from './system-design';
export * from './database-design';
export * from './api-design';
export * from './mock-response';
export * from './review';
export * from './product-vision';
export * from './roadmap';
export * from './cost-estimate';
export * from './export';
export * from './auth';
export * from './permissions';
export * from './billing';
export * from './admin';
export * from './chat';
export * from './support';
export * from './jobs';
export * from './versions';
export * from './diagrams';
export * from './mermaid.builders';
export * from './drawio.builders';
export * from './waitlist';
