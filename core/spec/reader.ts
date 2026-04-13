// core/spec/reader.ts — OpenSpec directory reader
import fs from 'fs';
import path from 'path';

export interface SpecRequirement {
  name: string;
  scenarios: string[];  // GIVEN/WHEN/THEN scenarios
}

export interface SpecContent {
  domain: string;
  purpose: string;
  requirements: SpecRequirement[];
  raw: string;
}

export interface ChangeArtifacts {
  name: string;
  proposal?: string;    // proposal.md content
  design?: string;      // design.md content
  tasks?: string;       // tasks.md content
  specs: string[];      // delta spec file paths
  files: string[];      // files extracted from design.md/tasks.md
}

export interface OpenSpecProject {
  hasOpenSpec: boolean;
  specsDir: string;
  changesDir: string;
  specs: { domain: string; path: string; requirementCount: number }[];
  changes: { name: string; path: string; artifacts: string[] }[];
}

/**
 * Detect OpenSpec directory state in a project
 */
export function detectOpenSpec(projectDir: string): OpenSpecProject {
  const openspecDir = path.join(projectDir, 'openspec');
  const specsDir = path.join(openspecDir, 'specs');
  const changesDir = path.join(openspecDir, 'changes');

  if (!fs.existsSync(openspecDir)) {
    return { hasOpenSpec: false, specsDir, changesDir, specs: [], changes: [] };
  }

  const specs: OpenSpecProject['specs'] = [];
  if (fs.existsSync(specsDir)) {
    try {
      const entries = fs.readdirSync(specsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const specFile = path.join(specsDir, entry.name, 'spec.md');
          if (fs.existsSync(specFile)) {
            const content = fs.readFileSync(specFile, 'utf8');
            const reqCount = (content.match(/### Requirement:/g) || []).length;
            specs.push({ domain: entry.name, path: specFile, requirementCount: reqCount });
          }
        }
      }
    } catch { /* ignore read errors */ }
  }

  const changes: OpenSpecProject['changes'] = [];
  if (fs.existsSync(changesDir)) {
    try {
      const entries = fs.readdirSync(changesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const changeDir = path.join(changesDir, entry.name);
          const artifacts = fs.readdirSync(changeDir).filter(f => f.endsWith('.md'));
          changes.push({ name: entry.name, path: changeDir, artifacts });
        }
      }
    } catch { /* ignore read errors */ }
  }

  return { hasOpenSpec: true, specsDir, changesDir, specs, changes };
}

/**
 * Read spec content for a given domain
 */
export function readSpec(projectDir: string, domain: string): SpecContent | null {
  const specFile = path.join(projectDir, 'openspec', 'specs', domain, 'spec.md');
  if (!fs.existsSync(specFile)) return null;

  const raw = fs.readFileSync(specFile, 'utf8');

  // Extract purpose
  const purposeMatch = raw.match(/## Purpose\s*\n([\s\S]*?)(?=\n## |\n---|$)/);
  const purpose = purposeMatch ? purposeMatch[1].trim() : '';

  // Extract requirements and scenarios
  const requirements: SpecRequirement[] = [];
  const reqRegex = /### Requirement:\s*(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = reqRegex.exec(raw)) !== null) {
    const reqName = match[1].trim();
    const reqStart = match.index + match[0].length;
    const nextReq = raw.indexOf('### Requirement:', reqStart);
    const section = raw.slice(reqStart, nextReq > -1 ? nextReq : undefined);

    // Extract GIVEN/WHEN/THEN scenarios
    const scenarios: string[] = [];
    const scenarioRegex = /#### Scenario:\s*(.+)/g;
    let sm: RegExpExecArray | null;
    while ((sm = scenarioRegex.exec(section)) !== null) {
      scenarios.push(sm[1].trim());
    }
    requirements.push({ name: reqName, scenarios });
  }

  return { domain, purpose, requirements, raw };
}

/**
 * Read change artifacts for a given change name
 */
export function readChangeArtifacts(projectDir: string, changeName: string): ChangeArtifacts | null {
  const changeDir = path.join(projectDir, 'openspec', 'changes', changeName);
  if (!fs.existsSync(changeDir)) return null;

  const readFile = (name: string): string | undefined => {
    const p = path.join(changeDir, name);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined;
  };

  const proposal = readFile('proposal.md');
  const design = readFile('design.md');
  const tasks = readFile('tasks.md');

  // Find delta spec files
  const specsDirPath = path.join(changeDir, 'specs');
  const specs: string[] = [];
  if (fs.existsSync(specsDirPath)) {
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else if (entry.name.endsWith('.md')) specs.push(path.join(dir, entry.name));
      }
    };
    walk(specsDirPath);
  }

  // Extract file paths from design.md and tasks.md
  const files: string[] = [];
  const fileRegex = /[`"]([^\s`"]+\.[a-zA-Z]+)[`"]/g;
  for (const content of [design, tasks]) {
    if (!content) continue;
    let fm: RegExpExecArray | null;
    while ((fm = fileRegex.exec(content)) !== null) {
      if (!files.includes(fm[1])) files.push(fm[1]);
    }
  }

  return { name: changeName, proposal, design, tasks, specs, files };
}
