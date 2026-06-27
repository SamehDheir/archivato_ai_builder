import type { RequirementDocument } from '@archivato/shared';
import { DownloadButton } from './DownloadButton';

const PRIORITY_COLORS: Record<string, string> = {
  must: '#f87171',
  should: '#fbbf24',
  could: '#9aa3b2',
};

export function RequirementDocumentView({
  doc,
}: {
  doc: RequirementDocument;
}) {
  return (
    <div>
      <div className="view-header">
        <p className="subtitle">
          Generated {new Date(doc.generatedAt).toLocaleString()}
        </p>
        <DownloadButton
          filename={`requirements-${doc.sessionId}.json`}
          data={doc}
          label="Download requirements"
        />
      </div>

      <div className="summary-section">
        <h4>Functional requirements</h4>
        {doc.functional.length ? (
          <table className="req-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Requirement</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {doc.functional.map((fr) => (
                <tr key={fr.id}>
                  <td className="mono">{fr.id}</td>
                  <td>
                    <strong>{fr.title}</strong>
                    {fr.description && fr.description !== fr.title && (
                      <div className="subtitle">{fr.description}</div>
                    )}
                  </td>
                  <td>
                    <span
                      className="pill"
                      style={{ color: PRIORITY_COLORS[fr.priority] }}
                    >
                      {fr.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="subtitle">—</span>
        )}
      </div>

      <div className="summary-section">
        <h4>Non-functional requirements</h4>
        <ul className="clean">
          {doc.nonFunctional.map((nfr) => (
            <li key={nfr.id}>
              <span className="mono">{nfr.id}</span>{' '}
              <span className="pill">{nfr.category}</span> {nfr.description}
            </li>
          ))}
        </ul>
      </div>

      <div className="summary-section">
        <h4>User roles</h4>
        {doc.roles.length ? (
          <ul className="clean">
            {doc.roles.map((role) => (
              <li key={role.name}>
                <strong>{role.name}</strong> — {role.description}
                {role.permissions.length > 0 && (
                  <span className="subtitle">
                    {' '}
                    [{role.permissions.join(', ')}]
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="subtitle">—</span>
        )}
      </div>

      <ListSection title="Business rules" items={doc.businessRules.map((b) => `${b.id}: ${b.description}`)} />
      <ListSection title="Constraints" items={doc.constraints} />
      <ListSection title="Assumptions" items={doc.assumptions} />
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="summary-section">
      <h4>{title}</h4>
      {items.length ? (
        <ul className="clean">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <span className="subtitle">—</span>
      )}
    </div>
  );
}
