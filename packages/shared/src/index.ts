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
