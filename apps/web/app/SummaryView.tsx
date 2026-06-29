import type { RequirementsSummary } from '@archivato/shared';

/** Renders the lightweight requirements preview produced at the interview gate. */
export function SummaryView({ summary }: { summary: RequirementsSummary }) {
  const sections: [string, string[] | string][] = [
    ['Goal', summary.goal],
    ['Users', summary.users],
    ['Features', summary.features],
    ['Business rules', summary.businessRules],
    ['Constraints', summary.constraints],
    ['Assumptions', summary.assumptions],
  ];
  return (
    <div className="space-y-3">
      {sections.map(([heading, value]) => (
        <div key={heading}>
          <h4 className="mb-1 text-sm font-semibold">{heading}</h4>
          {Array.isArray(value) ? (
            value.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {value.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )
          ) : (
            <div className="text-sm">{value}</div>
          )}
        </div>
      ))}
    </div>
  );
}
