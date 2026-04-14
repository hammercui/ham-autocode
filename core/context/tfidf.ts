// core/context/tfidf.ts
import fs from 'fs';
import path from 'path';

interface TFIDFDocument {
  id: string; // file path
  terms: Map<string, number>; // term -> count
  totalTerms: number;
}

interface SearchResult {
  file: string;
  score: number;
  preview: string; // most relevant lines
}

/**
 * Simple tokenizer: split into alphanumeric words, lowercase
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) || [];
}

/**
 * Build TF-IDF index (in-memory, not persisted -- rebuilt each search since files change)
 */
function buildIndex(
  projectDir: string,
  extensions: string[] = ['.ts', '.tsx', '.js', '.jsx', '.md'],
): TFIDFDocument[] {
  const docs: TFIDFDocument[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
          continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            const relPath = path.relative(projectDir, full).replace(/\\/g, '/');
            const tokens = tokenize(content);
            const terms = new Map<string, number>();
            for (const token of tokens) {
              terms.set(token, (terms.get(token) || 0) + 1);
            }
            docs.push({ id: relPath, terms, totalTerms: tokens.length });
          } catch {
            /* skip unreadable files */
          }
        }
      }
    } catch {
      /* skip inaccessible directories */
    }
  };
  walk(projectDir, 0);

  return docs;
}

/**
 * Compute IDF (inverse document frequency)
 */
function computeIDF(docs: TFIDFDocument[], term: string): number {
  const docCount = docs.filter((d) => d.terms.has(term)).length;
  if (docCount === 0) return 0;
  return Math.log(docs.length / docCount);
}

/**
 * Search for most relevant files by query using TF-IDF similarity.
 * @param projectDir - project root directory
 * @param query - task description or search terms
 * @param topK - return top K results
 */
export function searchFiles(projectDir: string, query: string, topK: number = 10): SearchResult[] {
  const docs = buildIndex(projectDir);
  if (docs.length === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // Compute TF-IDF similarity for each document against the query
  const scores: { file: string; score: number }[] = [];

  for (const doc of docs) {
    let score = 0;
    for (const term of queryTerms) {
      const tf = (doc.terms.get(term) || 0) / (doc.totalTerms || 1);
      const idf = computeIDF(docs, term);
      score += tf * idf;
    }
    if (score > 0) {
      scores.push({ file: doc.id, score });
    }
  }

  // Sort and take top-K
  scores.sort((a, b) => b.score - a.score);
  const topResults = scores.slice(0, topK);

  // Generate preview for each result (lines containing query terms)
  return topResults.map((r) => {
    let preview = '';
    try {
      const content = fs.readFileSync(path.resolve(projectDir, r.file), 'utf8');
      const lines = content.split('\n');
      const matchingLines: string[] = [];
      for (let i = 0; i < lines.length && matchingLines.length < 5; i++) {
        const lineLower = lines[i].toLowerCase();
        if (queryTerms.some((t) => lineLower.includes(t))) {
          matchingLines.push(`${i + 1}: ${lines[i].trim().substring(0, 100)}`);
        }
      }
      preview = matchingLines.join('\n');
    } catch {
      /* skip */
    }
    return { file: r.file, score: Math.round(r.score * 10000) / 10000, preview };
  });
}
