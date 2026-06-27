import type {
  ApiDesign,
  ApiEndpoint,
  SchemaField,
} from '@archivato/shared';
import { DownloadButton } from './DownloadButton';

const METHOD_COLORS: Record<string, string> = {
  GET: '#4ade80',
  POST: '#6d8bff',
  PUT: '#fbbf24',
  PATCH: '#c084fc',
  DELETE: '#f87171',
};

export function ApiDesignView({ design }: { design: ApiDesign }) {
  const endpointCount = design.modules.reduce(
    (n, m) => n + m.endpoints.length,
    0,
  );
  return (
    <div>
      <div className="view-header">
        <p className="subtitle">
          {design.modules.length} modules · {endpointCount} endpoints · generated{' '}
          {new Date(design.generatedAt).toLocaleString()}
        </p>
        <DownloadButton
          filename={`api-design-${design.sessionId}.json`}
          data={design}
          label="Download API design"
        />
      </div>

      {design.modules.map((module) => (
        <div className="summary-section" key={module.name}>
          <h4>
            {module.name} <span className="mono">{module.basePath}</span>
          </h4>
          <div className="endpoint-list">
            {module.endpoints.map((ep, i) => (
              <EndpointRow key={i} endpoint={ep} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: ApiEndpoint }) {
  return (
    <div className="endpoint">
      <div className="endpoint-head">
        <span
          className="method-badge"
          style={{
            color: METHOD_COLORS[endpoint.method] ?? 'var(--text)',
            borderColor: METHOD_COLORS[endpoint.method] ?? 'var(--border)',
          }}
        >
          {endpoint.method}
        </span>
        <span className="mono endpoint-path">{endpoint.path}</span>
        <span className="status-codes">
          {endpoint.statusCodes.map((c) => (
            <span className="pill" key={c}>
              {c}
            </span>
          ))}
        </span>
      </div>
      <div className="subtitle endpoint-summary">{endpoint.summary}</div>
      <div className="schema-row">
        <SchemaList label="Request" fields={endpoint.requestSchema} />
        <SchemaList label="Response" fields={endpoint.responseSchema} />
      </div>
    </div>
  );
}

function SchemaList({
  label,
  fields,
}: {
  label: string;
  fields: SchemaField[];
}) {
  return (
    <div className="schema-col">
      <div className="schema-label">{label}</div>
      {fields.length ? (
        <ul className="clean">
          {fields.map((f) => (
            <li key={f.name}>
              <span className="mono">{f.name}</span>{' '}
              <span className="subtitle">{f.type}</span>
              {f.required && <span className="req-star"> *</span>}
            </li>
          ))}
        </ul>
      ) : (
        <span className="subtitle">—</span>
      )}
    </div>
  );
}
