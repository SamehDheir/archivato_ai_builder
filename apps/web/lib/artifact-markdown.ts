import type { RequirementDocument, SystemDesign } from '@archivato/shared';

/**
 * Client-side Markdown renderers for individual pipeline artifacts. These mirror
 * the server's whole-system exporter (`apps/api/src/export/markdown.builder.ts`)
 * but run entirely in the browser, so the per-stage download stays free and
 * instant (no Pro-gated Export endpoint involved).
 */

/** Escape a value for use inside a Markdown table cell (pipes + newlines). */
function cell(text: string): string {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

const ARCH_LABEL: Record<string, string> = {
  monolith: 'Monolith',
  modular_monolith: 'Modular Monolith',
  microservices: 'Microservices',
};

export function requirementsToMarkdown(doc: RequirementDocument): string {
  const out: string[] = [];
  const h = (level: number, text: string) =>
    out.push(`${'#'.repeat(level)} ${text}`, '');
  const li = (text: string) => out.push(`- ${text}`);
  const blank = () => out.push('');

  h(1, 'Requirement Document');
  out.push(`_Generated ${new Date(doc.generatedAt).toLocaleString()}_`, '');

  h(2, 'Functional requirements');
  if (doc.functional.length) {
    for (const fr of doc.functional) {
      const detail =
        fr.description && fr.description !== fr.title
          ? `: ${fr.description}`
          : '';
      li(`**${fr.id}** (${fr.priority}) — ${fr.title}${detail}`);
    }
  } else {
    li('_None_');
  }
  blank();

  h(2, 'Non-functional requirements');
  if (doc.nonFunctional.length) {
    for (const nfr of doc.nonFunctional) {
      li(`**${nfr.id}** [${nfr.category}] — ${nfr.description}`);
    }
  } else {
    li('_None_');
  }
  blank();

  h(2, 'User roles');
  if (doc.roles.length) {
    for (const role of doc.roles) {
      const perms = role.permissions.length
        ? ` (${role.permissions.join(', ')})`
        : '';
      li(`**${role.name}** — ${role.description}${perms}`);
    }
  } else {
    li('_None_');
  }
  blank();

  if (doc.businessRules.length) {
    h(2, 'Business rules');
    for (const br of doc.businessRules) li(`**${br.id}** — ${br.description}`);
    blank();
  }
  if (doc.constraints.length) {
    h(2, 'Constraints');
    for (const c of doc.constraints) li(c);
    blank();
  }
  if (doc.assumptions.length) {
    h(2, 'Assumptions');
    for (const a of doc.assumptions) li(a);
    blank();
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function systemDesignToMarkdown(design: SystemDesign): string {
  const out: string[] = [];
  const h = (level: number, text: string) =>
    out.push(`${'#'.repeat(level)} ${text}`, '');
  const li = (text: string) => out.push(`- ${text}`);
  const blank = () => out.push('');

  h(1, 'System Design');
  out.push(`_Generated ${new Date(design.generatedAt).toLocaleString()}_`, '');

  h(2, 'Architecture');
  out.push(
    `**${ARCH_LABEL[design.architecture] ?? design.architecture}** — ${design.architectureRationale}`,
    '',
  );

  h(2, 'Tech stack');
  if (design.techStack.length) {
    out.push('| Layer | Technology | Rationale |', '| --- | --- | --- |');
    for (const t of design.techStack) {
      out.push(`| ${cell(t.layer)} | ${cell(t.technology)} | ${cell(t.rationale)} |`);
    }
  } else {
    li('_None_');
  }
  blank();

  h(2, 'Services');
  if (design.services.length) {
    for (const svc of design.services) {
      const deps = svc.dependencies.length
        ? ` (depends on: ${svc.dependencies.join(', ')})`
        : '';
      li(`**${svc.name}** — ${svc.responsibility}${deps}`);
    }
  } else {
    li('_None_');
  }
  blank();

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
