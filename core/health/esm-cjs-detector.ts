/**
 * ESM/CJS Compatibility Detector.
 * Scans TypeScript/JavaScript files for module system incompatibilities
 * in projects that use both ESM and CJS (e.g., Electron apps).
 *
 * Detects:
 * - import.meta usage in CJS-targeted files
 * - __dirname/__filename usage in ESM-targeted files
 * - require() usage in ESM-targeted files
 * - Mixed module patterns
 */

import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────

export interface ESMCJSReport {
  configs: TsConfigInfo[];
  issues: CompatIssue[];
  summary: string;
  issueCount: number;
}

export interface TsConfigInfo {
  file: string;
  module: string;        // "commonjs", "esnext", "nodenext", etc.
  target: string;
  isESM: boolean;
  includes: string[];    // file globs covered
}

export interface CompatIssue {
  file: string;
  line: number;
  issue: string;
  severity: 'error' | 'warning';
  fix: string;
  configTarget: string;  // which tsconfig targets this file
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Parse tsconfig to extract module/target settings and include patterns.
 */
function parseTsConfig(configPath: string): TsConfigInfo | null {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    // Remove comments (JSON with comments support)
    const cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const config = JSON.parse(cleaned);

    const compilerOptions = config.compilerOptions || {};
    const module = (compilerOptions.module || 'commonjs').toLowerCase();
    const target = (compilerOptions.target || 'es5').toLowerCase();
    const includes = config.include || ['**/*.ts'];

    const esmModules = ['esnext', 'es2015', 'es2020', 'es2022', 'nodenext', 'node16'];
    const isESM = esmModules.includes(module);

    return {
      file: path.basename(configPath),
      module,
      target,
      isESM,
      includes,
    };
  } catch {
    return null;
  }
}

/**
 * Determine which tsconfig targets a given file.
 * Simple heuristic: match against include patterns.
 */
function matchConfig(filePath: string, configs: TsConfigInfo[]): TsConfigInfo | null {
  // If only one config, it targets everything
  if (configs.length === 1) return configs[0];

  // Try to match by include patterns
  for (const config of configs) {
    for (const pattern of config.includes) {
      // Simple pattern matching (not full glob)
      if (pattern.includes('**')) {
        const prefix = pattern.split('**')[0];
        if (filePath.startsWith(prefix) || !prefix) return config;
      }
      if (filePath.includes(pattern.replace('*', ''))) return config;
    }
  }

  // Default to first config
  return configs[0];
}

/**
 * Scan a file for module system patterns.
 */
function scanFile(filePath: string, content: string, config: TsConfigInfo): CompatIssue[] {
  const issues: CompatIssue[] = [];
  const lines = content.split('\n');
  const relPath = filePath;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Check import.meta in CJS context
    if (!config.isESM && /import\.meta\.\w+/.test(line)) {
      const match = line.match(/import\.meta\.(\w+)/);
      issues.push({
        file: relPath,
        line: lineNum,
        issue: `import.meta.${match?.[1] || 'url'} used in CJS module (${config.file}: module=${config.module})`,
        severity: 'error',
        fix: match?.[1] === 'url'
          ? 'Use path.resolve(__dirname, ...) or require("url").pathToFileURL(__filename)'
          : 'Use CJS equivalent or conditional check',
        configTarget: config.file,
      });
    }

    // Check __dirname/__filename in ESM context
    if (config.isESM && /\b__dirname\b/.test(line) && !line.includes('const __dirname')) {
      issues.push({
        file: relPath,
        line: lineNum,
        issue: `__dirname used in ESM module (${config.file}: module=${config.module})`,
        severity: 'error',
        fix: 'Use path.dirname(fileURLToPath(import.meta.url)) or define const __dirname = ...',
        configTarget: config.file,
      });
    }

    if (config.isESM && /\b__filename\b/.test(line) && !line.includes('const __filename')) {
      issues.push({
        file: relPath,
        line: lineNum,
        issue: `__filename used in ESM module (${config.file}: module=${config.module})`,
        severity: 'error',
        fix: 'Use fileURLToPath(import.meta.url) or define const __filename = ...',
        configTarget: config.file,
      });
    }

    // Check require() in strict ESM context
    if (config.isESM && /\brequire\s*\(/.test(line) && !line.includes('createRequire')) {
      issues.push({
        file: relPath,
        line: lineNum,
        issue: `require() used in ESM module (${config.file}: module=${config.module})`,
        severity: 'warning',
        fix: 'Use import statement or createRequire(import.meta.url)',
        configTarget: config.file,
      });
    }

    // Check dynamic import in CJS that might cause issues
    if (!config.isESM && /\bimport\s*\(/.test(line)) {
      // Dynamic import is valid in CJS but may cause issues with some bundlers
      issues.push({
        file: relPath,
        line: lineNum,
        issue: `Dynamic import() in CJS module — verify bundler support`,
        severity: 'warning',
        fix: 'Use require() for synchronous loading, or ensure bundler handles dynamic import',
        configTarget: config.file,
      });
    }
  }

  return issues;
}

// ─── Recursive File Scanner ─────────────────────────────────────

function collectSourceFiles(dir: string, maxDepth = 5): string[] {
  const files: string[] = [];
  const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

  function walk(currentDir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (extensions.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  walk(dir, 0);
  return files;
}

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Detect ESM/CJS compatibility issues in a project.
 */
export function detectESMCJS(projectDir: string): ESMCJSReport {
  // Find all tsconfig files
  const entries = fs.readdirSync(projectDir);
  const tsconfigFiles = entries.filter(f =>
    f.startsWith('tsconfig') && f.endsWith('.json')
  );

  if (tsconfigFiles.length === 0) {
    return {
      configs: [],
      issues: [],
      summary: 'No tsconfig found — skipping ESM/CJS detection',
      issueCount: 0,
    };
  }

  // Parse configs
  const configs: TsConfigInfo[] = [];
  for (const f of tsconfigFiles) {
    const info = parseTsConfig(path.join(projectDir, f));
    if (info) configs.push(info);
  }

  // Check if project uses both ESM and CJS
  const hasESM = configs.some(c => c.isESM);
  const hasCJS = configs.some(c => !c.isESM);
  const isDualMode = hasESM && hasCJS;

  if (!isDualMode && configs.length <= 1) {
    return {
      configs,
      issues: [],
      summary: `Single module mode: ${configs[0]?.module || 'unknown'} — no dual-mode conflicts possible`,
      issueCount: 0,
    };
  }

  // Scan source files
  const sourceFiles = collectSourceFiles(projectDir);
  const allIssues: CompatIssue[] = [];

  for (const filePath of sourceFiles) {
    const relPath = path.relative(projectDir, filePath);
    const config = matchConfig(relPath, configs);
    if (!config) continue;

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch { continue; }

    const issues = scanFile(relPath, content, config);
    allIssues.push(...issues);
  }

  // Summary
  const errors = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');

  const summaryLines = [
    `ESM/CJS Compatibility: ${configs.length} tsconfig(s), ${sourceFiles.length} source files scanned`,
    configs.map(c => `  ${c.file}: module=${c.module}, isESM=${c.isESM}`).join('\n'),
  ];

  if (allIssues.length === 0) {
    summaryLines.push('No compatibility issues found');
  } else {
    summaryLines.push(`${errors.length} error(s), ${warnings.length} warning(s):`);
    for (const issue of allIssues.slice(0, 20)) {
      summaryLines.push(`  [${issue.severity.toUpperCase()}] ${issue.file}:${issue.line} — ${issue.issue}`);
      summaryLines.push(`    Fix: ${issue.fix}`);
    }
    if (allIssues.length > 20) {
      summaryLines.push(`  ... and ${allIssues.length - 20} more`);
    }
  }

  return {
    configs,
    issues: allIssues,
    summary: summaryLines.join('\n'),
    issueCount: allIssues.length,
  };
}
