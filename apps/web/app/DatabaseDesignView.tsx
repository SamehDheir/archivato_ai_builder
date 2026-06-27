import type { DatabaseDesign, EntityColumn } from '@archivato/shared';
import { DownloadButton } from './DownloadButton';

export function DatabaseDesignView({ design }: { design: DatabaseDesign }) {
  return (
    <div>
      <div className="view-header">
        <p className="subtitle">
          {design.databaseType} · generated{' '}
          {new Date(design.generatedAt).toLocaleString()}
        </p>
        <DownloadButton
          filename={`database-design-${design.sessionId}.json`}
          data={design}
          label="Download schema"
        />
      </div>

      <div className="summary-section">
        <h4>Entities</h4>
        <div className="entity-grid">
          {design.entities.map((entity) => (
            <div className="entity-card" key={entity.name}>
              <div className="entity-name mono">{entity.name}</div>
              <div className="subtitle">{entity.description}</div>
              <ul className="col-list">
                {entity.columns.map((col) => (
                  <li className="col-row" key={col.name}>
                    <span className="col-name mono">{col.name}</span>
                    <span className="col-type subtitle">{col.type}</span>
                    <span className="col-badges">{columnBadges(col)}</span>
                  </li>
                ))}
              </ul>
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
