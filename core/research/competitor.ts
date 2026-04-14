/**
 * Competitive Analysis Engine.
 * Stores and retrieves competitor profiles for project decision-making.
 * Actual research is done by skills (using /research, /crawl, agent-browser).
 * This module provides the data structure and persistence layer.
 */

import fs from 'fs';
import path from 'path';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

export interface CompetitorProfile {
  name: string;
  url: string;
  description: string;
  features: string[];
  pricing: string;
  techStack: string[];
  strengths: string[];
  weaknesses: string[];
  addedAt: string;
}

export interface CompetitiveAnalysis {
  schemaVersion: number;
  project: string;
  domain: string;
  analyzedAt: string;
  competitors: CompetitorProfile[];
  opportunities: string[];
  threats: string[];
  differentiators: string[];
}

function analysisPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'research', 'competitive-analysis.json');
}

/**
 * Read existing competitive analysis.
 */
export function readAnalysis(projectDir: string): CompetitiveAnalysis | null {
  const { data } = readJSON<CompetitiveAnalysis>(analysisPath(projectDir));
  return data;
}

/**
 * Save competitive analysis.
 */
export function saveAnalysis(projectDir: string, analysis: CompetitiveAnalysis): void {
  const dir = path.dirname(analysisPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(analysisPath(projectDir), analysis);
}

/**
 * Initialize a new competitive analysis for a project.
 */
export function initAnalysis(projectDir: string, project: string, domain: string): CompetitiveAnalysis {
  const analysis: CompetitiveAnalysis = {
    schemaVersion: 1,
    project,
    domain,
    analyzedAt: new Date().toISOString(),
    competitors: [],
    opportunities: [],
    threats: [],
    differentiators: [],
  };
  saveAnalysis(projectDir, analysis);
  return analysis;
}

/**
 * Add a competitor profile.
 */
export function addCompetitor(projectDir: string, competitor: Omit<CompetitorProfile, 'addedAt'>): CompetitiveAnalysis {
  const analysis = readAnalysis(projectDir);
  if (!analysis) throw new Error('No competitive analysis found. Run: research init <project> <domain>');

  // Avoid duplicates by name
  if (analysis.competitors.some(c => c.name.toLowerCase() === competitor.name.toLowerCase())) {
    // Update existing
    const idx = analysis.competitors.findIndex(c => c.name.toLowerCase() === competitor.name.toLowerCase());
    analysis.competitors[idx] = { ...competitor, addedAt: new Date().toISOString() };
  } else {
    analysis.competitors.push({ ...competitor, addedAt: new Date().toISOString() });
  }

  analysis.analyzedAt = new Date().toISOString();
  saveAnalysis(projectDir, analysis);
  return analysis;
}

/**
 * Generate a summary report from the analysis.
 */
export function generateReport(projectDir: string): string {
  const analysis = readAnalysis(projectDir);
  if (!analysis) return 'No competitive analysis found.';

  const lines: string[] = [
    `# Competitive Analysis: ${analysis.project}`,
    `Domain: ${analysis.domain}`,
    `Analyzed: ${analysis.analyzedAt}`,
    `Competitors: ${analysis.competitors.length}`,
    '',
  ];

  for (const c of analysis.competitors) {
    lines.push(`## ${c.name}`);
    lines.push(`URL: ${c.url}`);
    lines.push(`Description: ${c.description}`);
    if (c.features.length) lines.push(`Features: ${c.features.join(', ')}`);
    if (c.pricing) lines.push(`Pricing: ${c.pricing}`);
    if (c.techStack.length) lines.push(`Tech: ${c.techStack.join(', ')}`);
    if (c.strengths.length) lines.push(`Strengths: ${c.strengths.join(', ')}`);
    if (c.weaknesses.length) lines.push(`Weaknesses: ${c.weaknesses.join(', ')}`);
    lines.push('');
  }

  if (analysis.opportunities.length) {
    lines.push('## Opportunities');
    analysis.opportunities.forEach(o => lines.push(`- ${o}`));
    lines.push('');
  }
  if (analysis.threats.length) {
    lines.push('## Threats');
    analysis.threats.forEach(t => lines.push(`- ${t}`));
    lines.push('');
  }
  if (analysis.differentiators.length) {
    lines.push('## Our Differentiators');
    analysis.differentiators.forEach(d => lines.push(`- ${d}`));
  }

  return lines.join('\n');
}
