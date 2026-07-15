import type {
  ExportBundle,
  RequirementAssumption,
  RequirementDocument,
} from '@archivato/shared';

/**
 * Renders the full pipeline as a single Markdown document. Pure and
 * dependency-free so it works offline and is trivially testable.
 */
export function buildMarkdown(bundle: ExportBundle): string {
  const out: string[] = [];
  const h = (level: number, text: string) =>
    out.push(`${'#'.repeat(level)} ${text}`, '');
  const p = (text: string) => out.push(text, '');
  const li = (text: string) => out.push(`- ${text}`);
  const blank = () => out.push('');

  h(1, 'Archivato — System Design');
  p(`_Generated ${new Date(bundle.generatedAt).toLocaleString()}_`);
  p(`**Idea:** ${bundle.idea.idea}`);
  if (bundle.idea.industry) p(`**Industry:** ${bundle.idea.industry}`);
  if (bundle.idea.scale) p(`**Scale:** ${bundle.idea.scale}`);

  // ── Requirements ──
  const r = bundle.requirements;
  h(2, 'Requirements');
  if (r.executiveSummary) {
    h(3, 'Executive summary');
    p(r.executiveSummary);
  }
  h(3, 'Functional');
  for (const fr of r.functional) {
    li(`**${fr.id}** (${fr.priority}) — ${fr.title}: ${fr.description}`);
  }
  blank();
  h(3, 'Roles');
  for (const role of r.roles) {
    li(`**${role.name}** — ${role.description}${role.permissions.length ? ` (${role.permissions.join(', ')})` : ''}`);
  }
  blank();
  if (r.outOfScope?.length) {
    h(3, 'Out of scope');
    for (const o of r.outOfScope) li(o.reason ? `${o.item} — ${o.reason}` : o.item);
    blank();
  }
  const assumptionItems = mergeAssumptionItems(r);
  if (assumptionItems.length) {
    h(3, 'Assumptions & open questions');
    for (const a of assumptionItems) {
      li(a.impactIfWrong ? `${a.assumption} _(if wrong: ${a.impactIfWrong})_` : a.assumption);
    }
    blank();
  }
  h(3, 'Non-functional');
  for (const nfr of r.nonFunctional) li(`**${nfr.id}** [${nfr.category}] — ${nfr.description}`);
  blank();
  if (r.businessRules.length) {
    h(3, 'Business rules');
    for (const br of r.businessRules) li(`**${br.id}** — ${br.description}`);
    blank();
  }
  if (r.constraints.length) {
    h(3, 'Constraints');
    for (const c of r.constraints) li(c);
    blank();
  }

  // ── System design ──
  const s = bundle.systemDesign;
  h(2, 'System Design');
  p(`**Architecture:** ${s.architecture} — ${s.architectureRationale}`);
  h(3, 'Tech stack');
  out.push('| Layer | Technology | Rationale |', '| --- | --- | --- |');
  for (const t of s.techStack) out.push(`| ${t.layer} | ${t.technology} | ${t.rationale} |`);
  blank();
  h(3, 'Services');
  for (const svc of s.services) {
    li(`**${svc.name}** — ${svc.responsibility}${svc.dependencies.length ? ` (depends on: ${svc.dependencies.join(', ')})` : ''}`);
  }
  blank();

  // ── Database design ──
  const d = bundle.databaseDesign;
  h(2, 'Database Design');
  p(`**Database:** ${d.databaseType}`);
  for (const entity of d.entities) {
    h(3, entity.name);
    p(entity.description);
    out.push('| Column | Type | Constraints |', '| --- | --- | --- |');
    for (const col of entity.columns) {
      const flags: string[] = [];
      if (col.primaryKey) flags.push('PK');
      if (col.references) flags.push(`FK → ${col.references.entity}.${col.references.column}`);
      if (col.unique) flags.push('unique');
      if (!col.nullable) flags.push('not null');
      out.push(`| ${col.name} | ${col.type} | ${flags.join(', ') || '—'} |`);
    }
    blank();
  }
  if (d.relations.length) {
    h(3, 'Relations');
    for (const rel of d.relations) li(`${rel.from} **${rel.type}** ${rel.to}${rel.description ? ` — ${rel.description}` : ''}`);
    blank();
  }

  // ── API design ──
  h(2, 'API Design');
  for (const mod of bundle.apiDesign.modules) {
    h(3, `${mod.name} (${mod.basePath})`);
    for (const ep of mod.endpoints) {
      out.push(`- \`${ep.method} ${ep.path}\` — ${ep.summary} _(status: ${ep.statusCodes.join(', ')})_`);
    }
    blank();
  }

  // ── Review ──
  if (bundle.review) {
    const rev = bundle.review;
    h(2, 'AI Review');
    p(`**Overall score:** ${rev.overallScore ?? rev.scalabilityScore}/100`);
    if (rev.scores) {
      p(
        `**Security:** ${rev.scores.security}/100 · ` +
          `**Scalability:** ${rev.scores.scalability}/100 · ` +
          `**Performance:** ${rev.scores.performance}/100 · ` +
          `**Cost:** ${rev.scores.cost}/100`,
      );
    }
    p(rev.summary);
    const findingSections: [string, typeof rev.securityIssues][] = [
      ['Security issues', rev.securityIssues ?? []],
      ['Scalability problems', rev.scalabilityIssues ?? []],
      ['Performance risks', rev.performanceRisks ?? []],
      ['Cost optimization', rev.costOptimizations ?? []],
    ];
    for (const [title, findings] of findingSections) {
      if (findings.length) {
        h(3, title);
        for (const f of findings) li(`[${f.severity}] **${f.title}** — ${f.detail}`);
        blank();
      }
    }
    if (rev.missingFeatures?.length) {
      h(3, 'Missing requirements');
      for (const m of rev.missingFeatures) li(m);
      blank();
    }
    if (rev.recommendations?.length) {
      h(3, 'Suggestions');
      for (const rec of rev.recommendations) li(rec);
      blank();
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * The requirement document's assumptions for export: the structured R7 list plus
 * any legacy flat assumption / interview open question it doesn't already cover —
 * so nothing is silently dropped when the two lists diverge on the LLM path.
 */
function mergeAssumptionItems(r: RequirementDocument): RequirementAssumption[] {
  const structured = r.assumptionsAndOpenQuestions ?? [];
  const seen = structured.map((a) => a.assumption.toLowerCase());
  const covered = (text: string) =>
    seen.some((s) => s.includes(text.toLowerCase()));
  const flat = r.assumptions
    .filter((a) => !covered(a))
    .map((assumption) => ({ assumption, impactIfWrong: '' }));
  const fromOpenQuestions = structured.length
    ? []
    : (r.openQuestions ?? []).map((q) => ({
        assumption: q.questionForClient,
        impactIfWrong: '',
      }));
  return [...structured, ...flat, ...fromOpenQuestions];
}
