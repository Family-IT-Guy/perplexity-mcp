import { PerplexityClient, SYSTEM_PROMPTS } from './perplexity.js';
import {
  PerplexityModel,
  PerplexityResponse,
  SynthesisResult,
} from './types.js';

export type SynthesisPattern =
  | 'fact-reasoning'    // sonar-pro → sonar-reasoning-pro
  | 'quick-deep'        // sonar → sonar-deep-research
  | 'truthtracer'       // sonar-pro → sonar-reasoning-pro → sonar-deep-research
  | 'multi-perspective'; // sonar-pro → sonar-reasoning-pro

interface ModelResult {
  model: PerplexityModel;
  response: PerplexityResponse;
  content: string;
  citations: string[];
}

/**
 * Strip <think>...</think> blocks from reasoning model output
 */
function stripThinkingBlocks(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export class SynthesisEngine {
  private client: PerplexityClient;

  constructor(client: PerplexityClient) {
    this.client = client;
  }

  /**
   * Run multi-model synthesis based on pattern
   */
  async synthesize(
    query: string,
    pattern: SynthesisPattern,
    systemPrompt?: string
  ): Promise<SynthesisResult> {
    const models = this.getModelsForPattern(pattern);
    const results: ModelResult[] = [];

    // Execute models sequentially
    for (const model of models) {
      const response = await this.client.search(query, model, {
        messages: systemPrompt
          ? [{ role: 'system', content: systemPrompt }]
          : undefined,
      });

      // Strip thinking blocks from reasoning models
      const rawContent = response.choices[0]?.message?.content || '';
      const content = stripThinkingBlocks(rawContent);

      results.push({
        model,
        response,
        content,
        citations: response.citations || [],
      });
    }

    return this.combineResults(query, results, pattern);
  }

  /**
   * Get model sequence for a pattern
   */
  private getModelsForPattern(pattern: SynthesisPattern): PerplexityModel[] {
    switch (pattern) {
      case 'fact-reasoning':
        return ['sonar-pro', 'sonar-reasoning-pro'];
      case 'quick-deep':
        return ['sonar', 'sonar-deep-research'];
      case 'truthtracer':
        return ['sonar-pro', 'sonar-reasoning-pro', 'sonar-deep-research'];
      case 'multi-perspective':
        return ['sonar-pro', 'sonar-reasoning-pro'];
      default:
        return ['sonar-reasoning-pro'];
    }
  }

  /**
   * Combine results from multiple models
   */
  private combineResults(
    query: string,
    results: ModelResult[],
    pattern: SynthesisPattern
  ): SynthesisResult {
    // Collect all unique citations
    const allCitations = this.deduplicateCitations(
      results.flatMap(r => r.citations)
    );

    // Build findings array
    const findings = results.map(r => ({
      model: r.model,
      content: r.content,
      citations: r.citations,
    }));

    // Analyze agreement and conflicts (simplified)
    const { agreements, conflicts, confidence } = this.analyzeConsistency(results);

    // Generate synthesis summary
    const summary = this.generateSummary(query, results, pattern, confidence);

    return {
      summary,
      findings,
      agreements,
      conflicts,
      confidence,
      allCitations,
    };
  }

  /**
   * Deduplicate citations while preserving order
   */
  private deduplicateCitations(citations: string[]): string[] {
    const seen = new Set<string>();
    return citations.filter(url => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  /**
   * Analyze consistency across model results
   */
  private analyzeConsistency(results: ModelResult[]): {
    agreements: string[];
    conflicts: string[];
    confidence: SynthesisResult['confidence'];
  } {
    // This is a simplified analysis
    // A more sophisticated version would do semantic comparison
    const agreements: string[] = [];
    const conflicts: string[] = [];

    if (results.length < 2) {
      return { agreements: [], conflicts: [], confidence: 'medium' };
    }

    // Check for overlapping citations (indicates agreement on sources)
    const citationSets = results.map(r => new Set(r.citations));
    const commonCitations = results[0].citations.filter(url =>
      citationSets.every(set => set.has(url))
    );

    if (commonCitations.length > 2) {
      agreements.push(`${commonCitations.length} sources cited by all models`);
    }

    // Check content length variance (large variance might indicate different focus)
    const lengths = results.map(r => r.content.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + Math.pow(b - avgLength, 2), 0) / lengths.length;

    if (Math.sqrt(variance) > avgLength * 0.5) {
      conflicts.push('Significant variance in response depth between models');
    }

    // Determine confidence based on consistency indicators
    let confidence: SynthesisResult['confidence'] = 'medium';
    if (commonCitations.length > 3 && conflicts.length === 0) {
      confidence = 'high';
    } else if (commonCitations.length > 1) {
      confidence = 'medium-high';
    } else if (conflicts.length > 1) {
      confidence = 'low';
    }

    return { agreements, conflicts, confidence };
  }

  /**
   * Generate a synthesis summary
   */
  private generateSummary(
    query: string,
    results: ModelResult[],
    pattern: SynthesisPattern,
    confidence: SynthesisResult['confidence']
  ): string {
    const modelNames = results.map(r => r.model).join(' → ');
    const totalCitations = new Set(results.flatMap(r => r.citations)).size;

    let patternDesc: string;
    switch (pattern) {
      case 'fact-reasoning':
        patternDesc = 'Factual research followed by reasoning analysis';
        break;
      case 'quick-deep':
        patternDesc = 'Quick assessment followed by deep research';
        break;
      case 'truthtracer':
        patternDesc = 'Comprehensive fact-check with reasoning verification';
        break;
      case 'multi-perspective':
        patternDesc = 'Multi-perspective analysis';
        break;
      default:
        patternDesc = 'Multi-model synthesis';
    }

    return `## Synthesis Summary

**Query**: ${query}
**Pattern**: ${patternDesc}
**Models**: ${modelNames}
**Total Sources**: ${totalCitations}
**Confidence**: ${confidence}

---

${results.map((r, i) => `### ${i + 1}. ${r.model}

${r.content.substring(0, 500)}${r.content.length > 500 ? '...' : ''}

*[${r.citations.length} citations]*
`).join('\n')}`;
  }

  /**
   * Format synthesis result as markdown (matches skill output structure)
   */
  formatSynthesis(result: SynthesisResult): string {
    let output = `## Summary

${result.summary}

---

## Findings by Approach

`;

    // Add findings from each model
    result.findings.forEach((finding, i) => {
      const modelLabel = this.getModelLabel(finding.model);
      output += `### ${modelLabel} (${finding.model})

${finding.content}

*Sources: ${finding.citations.length} citations*

`;
    });

    output += `---

## Synthesis

### Areas of Agreement
`;
    if (result.agreements.length > 0) {
      result.agreements.forEach(a => {
        output += `- ✓ ${a}\n`;
      });
    } else {
      output += `- *Cross-model agreement analysis pending deeper semantic comparison*\n`;
    }

    output += `
### Areas of Conflict
`;
    if (result.conflicts.length > 0) {
      result.conflicts.forEach(c => {
        output += `- ⚠️ ${c}\n`;
      });
    } else {
      output += `- *No significant conflicts detected*\n`;
    }

    output += `
### Confidence Assessment
- **Overall Confidence**: ${result.confidence}
`;
    switch (result.confidence) {
      case 'high':
        output += `- *Strong source agreement and consistent findings across models*\n`;
        break;
      case 'medium-high':
        output += `- *Good source overlap with minor variations in depth*\n`;
        break;
      case 'medium':
        output += `- *Moderate agreement; consider additional verification for critical decisions*\n`;
        break;
      case 'low':
        output += `- *Significant variance between models; findings should be verified independently*\n`;
        break;
    }

    output += `
---

## Citations

`;
    result.allCitations.forEach((url, i) => {
      try {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        output += `[${i + 1}] ${domain}\n    ${url}\n\n`;
      } catch {
        output += `[${i + 1}] ${url}\n\n`;
      }
    });

    return output;
  }

  /**
   * Get human-readable label for model
   */
  private getModelLabel(model: PerplexityModel): string {
    switch (model) {
      case 'sonar':
        return 'Quick Factual Research';
      case 'sonar-pro':
        return 'Multi-Source Research';
      case 'sonar-reasoning-pro':
        return 'Reasoning Analysis';
      case 'sonar-deep-research':
        return 'Deep Investigation';
      default:
        return model;
    }
  }
}

/**
 * Recommend a synthesis pattern based on query
 */
export function recommendPattern(query: string): SynthesisPattern {
  const queryLower = query.toLowerCase();

  // TruthTracer for fact-checking
  if (
    queryLower.includes('fact check') ||
    queryLower.includes('is it true') ||
    queryLower.includes('verify') ||
    queryLower.includes('due diligence')
  ) {
    return 'truthtracer';
  }

  // Deep research for comprehensive queries
  if (
    queryLower.includes('comprehensive') ||
    queryLower.includes('exhaustive') ||
    queryLower.includes('deep dive')
  ) {
    return 'quick-deep';
  }

  // Fact + reasoning for most analytical queries
  if (
    queryLower.includes('why') ||
    queryLower.includes('how') ||
    queryLower.includes('compare') ||
    queryLower.includes('evaluate')
  ) {
    return 'fact-reasoning';
  }

  // Default to multi-perspective
  return 'multi-perspective';
}
