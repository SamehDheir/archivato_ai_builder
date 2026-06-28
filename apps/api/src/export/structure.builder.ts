import type {
  ProjectFile,
  ProjectStructure,
  SystemDesign,
} from '@archivato/shared';

/**
 * Generates a GitHub-ready project structure (spec Step 7) from the system
 * design: one module per service plus shared/middleware/config/utils scaffolding.
 * Pure and dependency-free.
 */
export function buildProjectStructure(
  sessionId: string,
  idea: string,
  systemDesign: SystemDesign,
): ProjectStructure {
  const files: ProjectFile[] = [];
  const moduleNames = systemDesign.services.map((s) => moduleName(s.name));

  files.push({
    path: 'README.md',
    contents: `# Generated Project\n\n${idea}\n\nArchitecture: ${systemDesign.architecture}\n`,
  });
  files.push({ path: '.gitignore', contents: 'node_modules/\ndist/\n.env\n' });
  files.push({
    path: 'package.json',
    contents: JSON.stringify(
      { name: 'generated-app', version: '0.1.0', private: true },
      null,
      2,
    ),
  });

  // One folder per service module.
  for (const name of moduleNames) {
    const base = `src/modules/${name}`;
    files.push({ path: `${base}/${name}.module.ts` });
    files.push({ path: `${base}/${name}.controller.ts` });
    files.push({ path: `${base}/${name}.service.ts` });
    files.push({ path: `${base}/dto/.gitkeep` });
  }

  // Cross-cutting folders (spec Step 7).
  files.push({ path: 'src/shared/.gitkeep' });
  files.push({ path: 'src/middleware/.gitkeep' });
  files.push({
    path: 'src/config/index.ts',
    contents: '// Centralized configuration loaded from environment variables.\n',
  });
  files.push({ path: 'src/utils/.gitkeep' });
  files.push({
    path: 'src/main.ts',
    contents: '// Application entry point.\n',
  });

  return {
    sessionId,
    generatedAt: new Date().toISOString(),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function moduleName(serviceName: string): string {
  return serviceName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
