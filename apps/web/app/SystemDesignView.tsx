import type { SystemDesign } from '@archivato/shared';

const ARCH_LABEL: Record<string, string> = {
  monolith: 'Monolith',
  modular_monolith: 'Modular Monolith',
  microservices: 'Microservices',
};

export function SystemDesignView({ design }: { design: SystemDesign }) {
  return (
    <div>
      <p className="subtitle">
        Generated {new Date(design.generatedAt).toLocaleString()}
      </p>

      <div className="summary-section">
        <h4>Architecture</h4>
        <span className="pill">
          {ARCH_LABEL[design.architecture] ?? design.architecture}
        </span>
        <div className="subtitle" style={{ marginTop: 6 }}>
          {design.architectureRationale}
        </div>
      </div>

      <div className="summary-section">
        <h4>Tech stack</h4>
        <table className="req-table">
          <thead>
            <tr>
              <th>Layer</th>
              <th>Technology</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {design.techStack.map((t) => (
              <tr key={t.layer + t.technology}>
                <td className="mono">{t.layer}</td>
                <td>
                  <strong>{t.technology}</strong>
                </td>
                <td className="subtitle">{t.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="summary-section">
        <h4>Services</h4>
        <div className="service-grid">
          {design.services.map((s) => (
            <div className="service-card" key={s.name}>
              <strong>{s.name}</strong>
              <div className="subtitle">{s.responsibility}</div>
              {s.dependencies.length > 0 && (
                <div className="deps">
                  depends on:{' '}
                  {s.dependencies.map((d) => (
                    <span className="pill" key={d}>
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
