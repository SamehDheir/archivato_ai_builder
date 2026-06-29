import type { RequirementDocument } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DownloadButton } from './DownloadButton';

const PRIORITY_VARIANT: Record<
  string,
  'destructive' | 'warning' | 'secondary'
> = {
  must: 'destructive',
  should: 'warning',
  could: 'secondary',
};

export function RequirementDocumentView({ doc }: { doc: RequirementDocument }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Generated {new Date(doc.generatedAt).toLocaleString()}
        </p>
        <DownloadButton
          filename={`requirements-${doc.sessionId}.json`}
          data={doc}
          label="Download requirements"
        />
      </div>

      <Section title="Functional requirements">
        {doc.functional.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead className="w-24">Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.functional.map((fr) => (
                <TableRow key={fr.id}>
                  <TableCell className="font-mono text-xs">{fr.id}</TableCell>
                  <TableCell>
                    <span className="font-medium">{fr.title}</span>
                    {fr.description && fr.description !== fr.title && (
                      <div className="text-sm text-muted-foreground">
                        {fr.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={PRIORITY_VARIANT[fr.priority] ?? 'secondary'}>
                      {fr.priority}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="Non-functional requirements">
        <ul className="space-y-1.5">
          {doc.nonFunctional.map((nfr) => (
            <li key={nfr.id} className="text-sm">
              <span className="font-mono text-xs">{nfr.id}</span>{' '}
              <Badge variant="secondary">{nfr.category}</Badge> {nfr.description}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="User roles">
        {doc.roles.length ? (
          <ul className="space-y-1.5 text-sm">
            {doc.roles.map((role) => (
              <li key={role.name}>
                <span className="font-medium">{role.name}</span> —{' '}
                {role.description}
                {role.permissions.length > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    [{role.permissions.join(', ')}]
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      <ListSection
        title="Business rules"
        items={doc.businessRules.map((b) => `${b.id}: ${b.description}`)}
      />
      <ListSection title="Constraints" items={doc.constraints} />
      <ListSection title="Assumptions" items={doc.assumptions} />
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {children}
    </div>
  );
}

export function Empty() {
  return <span className="text-sm text-muted-foreground">—</span>;
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <Section title={title}>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <Empty />
      )}
    </Section>
  );
}
