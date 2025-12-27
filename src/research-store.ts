import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PerplexityModel,
  PerplexityResponse,
  ResearchThread,
  ResearchEntry,
} from './types.js';

// Default to ~/Documents/Perplexity Research/ for visibility
const DEFAULT_RESEARCH_DIR = path.join(
  os.homedir(),
  'Documents',
  'Perplexity Research'
);

// Pricing per 1M tokens (as of Dec 2024)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'sonar': { input: 1.0, output: 1.0 },
  'sonar-pro': { input: 3.0, output: 15.0 },
  'sonar-reasoning': { input: 1.0, output: 5.0 },
  'sonar-reasoning-pro': { input: 2.0, output: 8.0 },
  'sonar-deep-research': { input: 2.0, output: 8.0 },
};

/**
 * Strip <think>...</think> blocks from reasoning model output
 */
function stripThinkingBlocks(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/**
 * Calculate cost from token usage
 */
function calculateCost(
  model: PerplexityModel,
  promptTokens: number,
  completionTokens: number
): string {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['sonar'];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;
  return `$${totalCost.toFixed(4)}`;
}

/**
 * Format timestamp with both UTC and local timezone
 */
function formatDualTimestamp(): string {
  const now = new Date();
  const utc = now.toISOString();

  // Get local timezone name
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return `${utc} (${tzName} ${localTime})`;
}

/**
 * Extract domain from URL for citation formatting
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Format citations with domain extraction
 */
function formatCitations(citations: string[]): string {
  if (!citations || citations.length === 0) {
    return '*No citations provided*';
  }

  return citations
    .map((url, i) => {
      const domain = extractDomain(url);
      return `[${i + 1}] ${domain}\n    ${url}`;
    })
    .join('\n\n');
}

export class ResearchStore {
  private researchDir: string;
  private rawDir: string;

  constructor(customDir?: string) {
    this.researchDir =
      customDir ||
      process.env.PERPLEXITY_RESEARCH_DIR ||
      DEFAULT_RESEARCH_DIR;
    this.rawDir = path.join(this.researchDir, 'raw');
    this.ensureDirectoriesExist();
  }

  private ensureDirectoriesExist(): void {
    if (!fs.existsSync(this.researchDir)) {
      fs.mkdirSync(this.researchDir, { recursive: true });
    }
    if (!fs.existsSync(this.rawDir)) {
      fs.mkdirSync(this.rawDir, { recursive: true });
    }
  }

  /**
   * Generate timestamp string for filenames: YYYYMMDD_HHMMSS
   */
  private generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  /**
   * Save raw API response to raw/ directory BEFORE processing
   * This is insurance against truncation and enables re-processing
   */
  private saveRawResponse(
    topic: string,
    response: PerplexityResponse,
    model: PerplexityModel
  ): string {
    const timestamp = this.generateTimestamp();
    const sanitizedTopic = topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
    const filename = `${timestamp}_${sanitizedTopic}.json`;
    const filePath = path.join(this.rawDir, filename);

    const rawData = {
      saved_at: new Date().toISOString(),
      model,
      topic,
      response,
    };

    fs.writeFileSync(filePath, JSON.stringify(rawData, null, 2));
    return filename; // Return just filename for relative reference
  }

  /**
   * Count existing queries in a thread file
   */
  private countQueriesInThread(filePath: string): number {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(/^## Query \d+:/gm);
    return matches ? matches.length : 0;
  }

  /**
   * Generate a filename from topic and date
   */
  private generateFilename(topic: string): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const sanitizedTopic = topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    return `${sanitizedTopic}-${date}.md`;
  }

  /**
   * Extract topic from query for filename
   */
  private extractTopic(query: string): string {
    // Take first 50 chars, remove question marks and common prefixes
    return query
      .replace(/^(what|how|why|when|where|who|is|are|can|does|do)\s+/i, '')
      .replace(/\?/g, '')
      .trim()
      .substring(0, 50);
  }

  /**
   * Save research results to a markdown file with raw JSON backup
   *
   * Architecture:
   * 1. Save complete API response to raw/ (insurance against truncation)
   * 2. Append formatted entry to thread file with reference to raw
   * 3. Update running synthesis section
   */
  async saveResearch(
    query: string,
    response: PerplexityResponse,
    model: PerplexityModel,
    systemPrompt?: string,
    modelRationale?: string,
    approvedPlan?: string
  ): Promise<string> {
    // Step 1: Save raw response FIRST (file-first architecture)
    const rawFilename = this.saveRawResponse(query, response, model);

    const filename = this.generateFilename(query);
    const filePath = path.join(this.researchDir, filename);

    const timestamp = formatDualTimestamp();
    const rawContent = response.choices[0]?.message?.content || '';
    const content = stripThinkingBlocks(rawContent);
    const citations = response.citations || [];
    const relatedQuestions = response.related_questions || [];
    const usage = response.usage;
    const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

    // Determine query number for multi-query format
    const queryNum = this.countQueriesInThread(filePath) + 1;
    const queryTitle = query.length > 60 ? query.substring(0, 60) + '...' : query;

    // Format the research entry (matches skill output format)
    let entry = `## Query ${queryNum}: ${queryTitle}
**Timestamp**: ${timestamp}
**Raw**: [raw/${rawFilename}](raw/${rawFilename})
**Model**: ${model}${modelRationale ? ` (${modelRationale})` : ''} | **Tokens**: ${usage.total_tokens.toLocaleString()}${usage.num_search_queries ? ` | **Searches**: ${usage.num_search_queries}` : ''}

`;

    // Include approved plan if provided (audit trail)
    if (approvedPlan) {
      entry += `### Approved Plan
${approvedPlan}

`;
    }

    entry += `### Findings

${content}

### Citations

${formatCitations(citations)}
`;

    if (relatedQuestions.length > 0) {
      entry += `
### Related Questions

${relatedQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
`;
    }

    entry += `
### Cost
${cost}

---

`;

    // Append to file if exists, otherwise create with header
    if (fs.existsSync(filePath)) {
      // Read existing content to update synthesis section
      let existingContent = fs.readFileSync(filePath, 'utf-8');

      // Remove existing synthesis section if present (we'll regenerate it)
      const synthesisMarker = '## Synthesis';
      const synthesisIndex = existingContent.indexOf(synthesisMarker);
      if (synthesisIndex !== -1) {
        existingContent = existingContent.substring(0, synthesisIndex).trimEnd() + '\n\n';
      }

      // Append new entry and updated synthesis
      const updatedContent = existingContent + entry + this.generateSynthesisSection(queryNum);
      fs.writeFileSync(filePath, updatedContent);
    } else {
      // Create new file with header
      const title = query.length > 80 ? query.substring(0, 80) + '...' : query;
      const header = `# ${title}

Research thread for this topic.
${systemPrompt ? `\nContext: ${systemPrompt}` : ''}

---

${entry}${this.generateSynthesisSection(queryNum)}`;
      fs.writeFileSync(filePath, header);
    }

    return filePath;
  }

  /**
   * Generate the running synthesis section template
   */
  private generateSynthesisSection(queryCount: number): string {
    const today = new Date().toISOString().split('T')[0];
    return `## Synthesis (Updated: ${today})

*${queryCount} ${queryCount === 1 ? 'query' : 'queries'} in this thread*

### Key Conclusions
- *(Update after reviewing findings)*

### Open Questions
- *(What remains unresolved)*

### Confidence Assessment
- High confidence: *(topics)*
- Needs verification: *(topics)*
`;
  }

  /**
   * List all research threads with metadata
   * Note: Only lists .md files in root, ignores raw/ subdirectory
   */
  listThreads(): ResearchThread[] {
    this.ensureDirectoriesExist();
    const entries = fs.readdirSync(this.researchDir, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => e.name);

    return files.map(filename => {
      const filePath = path.join(this.researchDir, filename);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Extract topic from first header
      // Formats: "# Topic" (v3), "# Topic Research" (v2), "# Research Thread: topic" (v1)
      let topic: string;
      const v3Match = content.match(/^# (.+?)(?:\n|$)/m);
      const v2Match = content.match(/^# (.+) Research$/m);
      const v1Match = content.match(/^# Research Thread: (.+)$/m);
      if (v2Match) {
        topic = v2Match[1];
      } else if (v1Match) {
        topic = v1Match[1];
      } else if (v3Match) {
        topic = v3Match[1];
      } else {
        topic = filename.replace('.md', '');
      }

      // Extract first query as summary
      // Formats: "## Query N: description" (v3), "## Query\n..." (v2), "## Research: ..." (v1)
      let summary: string = '';
      const v3QueryMatch = content.match(/^## Query \d+: (.+)$/m);
      const v2QueryMatch = content.match(/^## Query\n(.+)$/m);
      const v1QueryMatch = content.match(/^## Research: (.+)$/m);
      if (v3QueryMatch) {
        summary = v3QueryMatch[1];
      } else if (v2QueryMatch) {
        summary = v2QueryMatch[1];
      } else if (v1QueryMatch) {
        summary = v1QueryMatch[1];
      }

      // Extract model from first entry
      // Formats: "**Model**: model" (v3/v2), "## Model Used\n..." (v2 alt)
      let model: PerplexityModel = 'sonar-reasoning-pro';
      const modelMatch = content.match(/\*\*Model\*\*: (\S+)/);
      const altModelMatch = content.match(/^## Model Used\n(\S+)/m);
      if (modelMatch) {
        model = modelMatch[1] as PerplexityModel;
      } else if (altModelMatch) {
        model = altModelMatch[1] as PerplexityModel;
      }

      return {
        id: filename.replace('.md', ''),
        topic,
        date: stats.mtime.toISOString().split('T')[0],
        model,
        query: summary,
        summary: summary.substring(0, 100) + (summary.length > 100 ? '...' : ''),
        filePath,
      };
    }).sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
  }

  /**
   * Read a specific research thread
   */
  readThread(topicOrId: string): string | null {
    this.ensureDirectoriesExist();

    // Try exact match first
    let filePath = path.join(this.researchDir, `${topicOrId}.md`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }

    // Try finding by topic in filename
    const files = fs.readdirSync(this.researchDir);
    const match = files.find(f =>
      f.toLowerCase().includes(topicOrId.toLowerCase()) && f.endsWith('.md')
    );

    if (match) {
      filePath = path.join(this.researchDir, match);
      return fs.readFileSync(filePath, 'utf-8');
    }

    return null;
  }

  /**
   * Search across all research files (excludes raw/ directory)
   */
  searchResearch(keywords: string): Array<{
    file: string;
    topic: string;
    matches: string[];
  }> {
    this.ensureDirectoriesExist();
    const entries = fs.readdirSync(this.researchDir, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => e.name);
    const results: Array<{ file: string; topic: string; matches: string[] }> = [];
    const searchTerms = keywords.toLowerCase().split(/\s+/);

    for (const filename of files) {
      const filePath = path.join(this.researchDir, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentLower = content.toLowerCase();

      // Check if all search terms are present
      const allTermsPresent = searchTerms.every(term => contentLower.includes(term));
      if (!allTermsPresent) continue;

      // Extract topic (handle all format versions)
      let topic = filename;
      const v3Match = content.match(/^# (.+?)(?:\n|$)/m);
      const v2Match = content.match(/^# (.+) Research$/m);
      const v1Match = content.match(/^# Research Thread: (.+)$/m);
      if (v2Match) {
        topic = v2Match[1];
      } else if (v1Match) {
        topic = v1Match[1];
      } else if (v3Match) {
        topic = v3Match[1];
      }

      // Find matching lines (context around matches)
      const lines = content.split('\n');
      const matchingLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        if (searchTerms.some(term => lineLower.includes(term))) {
          // Include surrounding context
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length, i + 2);
          const context = lines.slice(start, end).join('\n').trim();
          if (context && !matchingLines.includes(context)) {
            matchingLines.push(context);
          }
        }
      }

      if (matchingLines.length > 0) {
        results.push({
          file: filename,
          topic,
          matches: matchingLines.slice(0, 5), // Limit to 5 matches per file
        });
      }
    }

    return results;
  }

  /**
   * Get the research directory path
   */
  getResearchDir(): string {
    return this.researchDir;
  }

  /**
   * Get the raw responses directory path
   */
  getRawDir(): string {
    return this.rawDir;
  }

  /**
   * List raw response files
   */
  listRawFiles(): Array<{ filename: string; timestamp: string; topic: string }> {
    this.ensureDirectoriesExist();
    if (!fs.existsSync(this.rawDir)) return [];

    const files = fs.readdirSync(this.rawDir).filter(f => f.endsWith('.json'));
    return files.map(filename => {
      // Parse filename: YYYYMMDD_HHMMSS_topic.json
      const match = filename.match(/^(\d{8}_\d{6})_(.+)\.json$/);
      if (match) {
        return {
          filename,
          timestamp: match[1],
          topic: match[2].replace(/-/g, ' '),
        };
      }
      return { filename, timestamp: '', topic: filename };
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Read a raw response file
   */
  readRawFile(filename: string): object | null {
    const filePath = path.join(this.rawDir, filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }
}
