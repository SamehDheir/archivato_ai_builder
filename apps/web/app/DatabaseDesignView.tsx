import type { DatabaseDesign, EntityColumn } from '@archivato/shared';

export function DatabaseDesignView({ design }: { design: DatabaseDesign }) {
  return (
    <div>
      <p className="subtitle">
        {design.databaseType} · generated{' '}
        {new Date(design.generatedAt).toLocaleString()}
      </p>

      <div className="summary-section">
        <h4>Entities</h4>
        <div className="service-grid">
          {design.entities.map((entity) => (
            <div className="entity-card" key={entity.name}>
              <div className="entity-name mono">{entity.name}</div>
              <div className="subtitle">{entity.description}</div>
              <table className="col-table">
                <tbody>
                  {entity.columns.map((col) => (
                    <tr key={col.name}>
                      <td className="mono">{col.name}</td>
                      <td className="subtitle">{col.type}</td>
                      <td>{columnBadges(col)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      <div className="summary-section">
        <h4>Relations</h4>
        {design.relations.length ? (
          <ul className="clean">
            {design.relations.map((r, i) => (
              <li key={i}>
                <span className="mono">{r.from}</span>{' '}
                <span className="pill">{r.type}</span>{' '}
                <span className="mono">{r.to}</span>
                {r.description && (
                  <span className="subtitle"> — {r.description}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="subtitle">—</span>
        )}
      </div>
    </div>
  );
}

function columnBadges(col: EntityColumn) {
  const badges: string[] = [];
  if (col.primaryKey) badges.push('PK');
  if (col.references) badges.push(`FK → ${col.references.entity}`);
  if (col.unique) badges.push('unique');
  if (!col.nullable && !col.primaryKey) badges.push('not null');
  return badges.map((b) => (
    <span
      className="pill"
      key={b}
      style={
        b === 'PK'
          ? { color: '#fbbf24' }
          : b.startsWith('FK')
            ? { color: '#6d8bff' }
            : undefined
      }
    >
      {b}
    </span>
  ));
}
