import type { ProjectScale } from '@archivato/shared';

/**
 * Curated starter ideas shown above the "new project" idea box. Tapping one
 * prefills the idea/industry/scale (still fully editable) so a first-time user
 * never faces a blank textarea — the single biggest drop-off point between
 * sign-up and the first generated artifact. The label/idea/industry copy is
 * i18n'd (`dashboard.starters.items.<id>.*`); only the scale (an enum, not
 * translated) lives here.
 */
export interface StarterIdea {
  /** Stable id → i18n key + React key. */
  id: string;
  scale: ProjectScale;
}

export const STARTER_IDEAS: StarterIdea[] = [
  { id: 'booking', scale: 'mvp' },
  { id: 'marketplace', scale: 'startup' },
  { id: 'saas', scale: 'startup' },
  { id: 'internal', scale: 'mvp' },
  { id: 'mobile', scale: 'startup' },
];
