import type { RequirementDocument } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
      {/* Document header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">
            Requirement Document
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {doc.functional.length} functional · {doc.nonFunctional.length}{' '}
            non-functional · {doc.roles.length} roles · generated{' '}
            {new Date(doc.generatedAt).toLocaleString()}
          </p>
        </div>
        <DownloadButton
          filename={`requirements-${doc.sessionId}.json`}
          data={doc}
          label="Download requirements"
        />
      </div>

      <Separator className="mt-3" />

      <Section title="Functional requirements" count={doc.functional.length}>
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
                  <TableCell className="align-top font-mono text-xs text-muted-foreground">
                    {fr.id}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{fr.title}</div>
                    {fr.description && fr.description !== fr.title && (
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {fr.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
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

      <Section
        title="Non-functional requirements"
        count={doc.nonFunctional.length}
      >
        {doc.nonFunctional.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead className="w-36">Category</TableHead>
                <TableHead>Requirement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.nonFunctional.map((nfr) => (
                <TableRow key={nfr.id}>
                  <TableCell className="align-top font-mono text-xs text-muted-foreground">
                    {nfr.id}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="secondary">{nfr.category}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{nfr.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="User roles" count={doc.roles.length}>
        {doc.roles.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {doc.roles.map((role) => (
              <Card key={role.name}>
                <CardContent className="p-4">
                  <div className="font-semibold">{role.name}</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {role.description}
                  </p>
                  {role.permissions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {role.permissions.map((p) => (
                        <Badge variant="secondary" key={p}>
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="Business rules" count={doc.businessRules.length}>
        {doc.businessRules.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>Rule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.businessRules.map((br) => (
                <TableRow key={br.id}>
                  <TableCell className="align-top font-mono text-xs text-muted-foreground">
                    {br.id}
                  </TableCell>
                  <TableCell className="text-sm">{br.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty />
        )}
      </Section>

      <ListSection
        title="Constraints"
        count={doc.constraints.length}
        items={doc.constraints}
      />
      <ListSection
        title="Assumptions"
        count={doc.assumptions.length}
        items={doc.assumptions}
      />
    </div>
  );
}

export function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {title}
        {typeof count === 'number' && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {count}
          </span>
        )}
      </h4>
      {children}
    </div>
  );
}

export function Empty() {
  return <span className="text-sm text-muted-foreground">—</span>;
}

function ListSection({
  title,
  count,
  items,
}: {
  title: string;
  count?: number;
  items: string[];
}) {
  return (
    <Section title={title} count={count}>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm marker:text-muted-foreground">
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
