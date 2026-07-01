import {
  Compass,
  Gauge,
  ListChecks,
  Rocket,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import type { ProductVision } from '@archivato/shared';
import { DownloadButton } from './DownloadButton';
import { Section } from './RequirementDocumentView';

/** Read-only presentation of the Product Vision (Product Manager stage). */
export function ProductVisionView({ vision }: { vision: ProductVision }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> Product Vision
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Generated {new Date(vision.generatedAt).toLocaleString()}
          </p>
        </div>
        <DownloadButton
          filename={`product-vision-${vision.sessionId}.json`}
          data={vision}
          label="Download vision"
        />
      </div>

      {/* North-star vision */}
      <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <Compass className="h-3.5 w-3.5" /> North star
        </div>
        <p className="text-sm leading-relaxed">{vision.vision}</p>
      </div>

      <Section title="Goals" icon={Target} count={vision.goals.length}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {vision.goals.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </Section>

      {/* MVP vs. roadmap side by side */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-success/40 bg-success/5 p-3">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-success">
            <Rocket className="h-4 w-4" /> MVP
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-normal">
              {vision.mvp.length}
            </span>
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {vision.mvp.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border p-3">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-muted-foreground" /> Future roadmap
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {vision.futureFeatures.length}
            </span>
          </h4>
          {vision.futureFeatures.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {vision.futureFeatures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      </div>

      <Section
        title="Success metrics"
        icon={Gauge}
        count={vision.successMetrics.length}
      >
        <div className="space-y-2">
          {vision.successMetrics.map((m, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{m.name}</span>
                <span className="text-sm text-primary">{m.target}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{m.rationale}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Personas" icon={Users} count={vision.personas.length}>
        <div className="grid gap-3 sm:grid-cols-2">
          {vision.personas.map((p, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <p className="font-semibold">{p.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {p.description}
              </p>
              {p.goals.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Goals
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                    {p.goals.map((g, j) => (
                      <li key={j}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
              {p.painPoints.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pain points
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                    {p.painPoints.map((pp, j) => (
                      <li key={j}>{pp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
