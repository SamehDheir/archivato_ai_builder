import { Boxes, Layers, Network } from 'lucide-react';
import type { SystemDesign } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DownloadButton } from '@/components/shared/DownloadButton';
import { Section } from '@/components/design/RequirementDocumentView';

const ARCH_LABEL: Record<string, string> = {
  monolith: 'Monolith',
  modular_monolith: 'Modular Monolith',
  microservices: 'Microservices',
};

export function SystemDesignView({ design }: { design: SystemDesign }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Generated {new Date(design.generatedAt).toLocaleString()}
        </p>
        <DownloadButton
          filename={`system-design-${design.sessionId}.json`}
          data={design}
          label="Download system design"
        />
      </div>

      <Section title="Architecture" icon={Network}>
        <Badge variant="primary">
          {ARCH_LABEL[design.architecture] ?? design.architecture}
        </Badge>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {design.architectureRationale}
        </p>
      </Section>

      <Section title="Tech stack" icon={Layers}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Layer</TableHead>
              <TableHead>Technology</TableHead>
              <TableHead>Why</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {design.techStack.map((t) => (
              <TableRow key={t.layer + t.technology}>
                <TableCell className="font-mono text-xs">{t.layer}</TableCell>
                <TableCell className="font-medium">{t.technology}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t.rationale}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Services" icon={Boxes}>
        <div className="grid gap-3 sm:grid-cols-2">
          {design.services.map((s) => (
            <Card key={s.name}>
              <CardContent className="p-4">
                <div className="font-semibold">{s.name}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.responsibility}
                </p>
                {s.dependencies.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    depends on:
                    {s.dependencies.map((d) => (
                      <Badge variant="secondary" key={d}>
                        {d}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
