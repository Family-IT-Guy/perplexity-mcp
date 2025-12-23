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

  constructor(customDir?: string) {
    this.researchDir =
      customDir ||
      process.env.PERPLEXITY_RESEARCH_DIR ||
      DEFAULT_RESEARCH_DIR;
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.researchDir)) {
      fs.mkdirSync(this.researchDir, { recursive: true });
    }
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
   * Save research results to a markdown file
   */
  async saveResearch(
    query: string,
    response: PerplexityResponse,
    model: PerplexityModel,
    systemPrompt?: string,
    modelRationale?: string,
    approvedPlan?: string
  ): Promise<string> {
    const filename = this.generateFilename(query);
    const filePath = path.join(this.researchDir, filename);

    const timestamp = formatDualTimestamp();
    const rawContent = response.choices[0]?.message?.content || '';
    const content = stripThinkingBlocks(rawContent);
    const citations = response.citations || [];
    const relatedQuestions = response.related_questions || [];
    const usage = response.usage;
    const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

    // Format the research entry (matches skill output format)
    let entry = '';

    // Include approved plan if provided (audit trail of intent vs outcome)
    if (approvedPlan) {
      entry += `
## Approved Research Plan

${approvedPlan}

---

`;
    }

    entry += `## Query
${query}

## Timestamp
${timestamp}

## Model Used
${model}${modelRationale ? ` (${modelRationale})` : ''}

## Findings

${content}

## Citations

${formatCitations(citations)}
`;

    if (relatedQuestions.length > 0) {
      entry += `
## Related Questions

${relatedQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
`;
    }

    entry += `
## Cost
${cost} (${usage.total_tokens} tokens)${usage.num_search_queries ? ` | ${usage.num_search_queries} searches` : ''}

---

`;

    // Append to file if exists, otherwise create with header
    if (fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, entry);
    } else {
      // Use the query as a descriptive title
      const title = query.length > 80 ? query.substring(0, 80) + '...' : query;
      const header = `# ${title} Research

Created: ${timestamp}
${systemPrompt ? `\nContext: ${systemPrompt}\n` : ''}
---
${entry}`;
      fs.writeFileSync(filePath, header);
    }

    return filePath;
  }

  /**
   * List all research threads with metadata
   */
  listThreads(): ResearchThread[] {
    this.ensureDirectoryExists();
    const files = fs.readdirSync(this.researchDir).filter(f => f.endsWith('.md'));

    return files.map(filename => {
      const filePath = path.join(this.researchDir, filename);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Extract topic from first header (new format: "# Topic Research" or old: "# Research Thread: topic")
      let topic: string;
      const newFormatMatch = content.match(/^# (.+) Research$/m);
      const oldFormatMatch = content.match(/^# Research Thread: (.+)$/m);
      if (newFormatMatch) {
        topic = newFormatMatch[1];
      } else if (oldFormatMatch) {
        topic = oldFormatMatch[1];
      } else {
        topic = filename.replace('.md', '');
      }

      // Extract first query as summary (new format: "## Query\n..." or old: "## Research: ...")
      let summary: string = '';
      const newQueryMatch = content.match(/^## Query\n(.+)$/m);
      const oldQueryMatch = content.match(/^## Research: (.+)$/m);
      if (newQueryMatch) {
        summary = newQueryMatch[1];
      } else if (oldQueryMatch) {
        summary = oldQueryMatch[1];
      }

      // Extract model from first entry (new format: "## Model Used\n..." or old: "**Model**: ...")
      let model: PerplexityModel = 'sonar-reasoning-pro';
      const newModelMatch = content.match(/^## Model Used\n(\S+)/m);
      const oldModelMatch = content.match(/\*\*Model\*\*: (\S+)/);
      if (newModelMatch) {
        model = newModelMatch[1] as PerplexityModel;
      } else if (oldModelMatch) {
        model = oldModelMatch[1] as PerplexityModel;
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
    this.ensureDirectoryExists();

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
   * Search across all research files
   */
  searchResearch(keywords: string): Array<{
    file: string;
    topic: string;
    matches: string[];
  }> {
    this.ensureDirectoryExists();
    const files = fs.readdirSync(this.researchDir).filter(f => f.endsWith('.md'));
    const results: Array<{ file: string; topic: string; matches: string[] }> = [];
    const searchTerms = keywords.toLowerCase().split(/\s+/);

    for (const filename of files) {
      const filePath = path.join(this.researchDir, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentLower = content.toLowerCase();

      // Check if all search terms are present
      const allTermsPresent = searchTerms.every(term => contentLower.includes(term));
      if (!allTermsPresent) continue;

      // Extract topic
      const topicMatch = content.match(/^# Research Thread: (.+)$/m);
      const topic = topicMatch ? topicMatch[1] : filename;

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
}
