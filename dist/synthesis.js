"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SynthesisEngine = void 0;
exports.recommendPattern = recommendPattern;
/**
 * Strip <think>...</think> blocks from reasoning model output
 */
function stripThinkingBlocks(content) {
    return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
class SynthesisEngine {
    client;
    constructor(client) {
        this.client = client;
    }
    /**
     * Run multi-model synthesis based on pattern
     */
    async synthesize(query, pattern, systemPrompt) {
        const models = this.getModelsForPattern(pattern);
        const results = [];
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
    getModelsForPattern(pattern) {
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
    combineResults(query, results, pattern) {
        // Collect all unique citations
        const allCitations = this.deduplicateCitations(results.flatMap(r => r.citations));
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
    deduplicateCitations(citations) {
        const seen = new Set();
        return citations.filter(url => {
            if (seen.has(url))
                return false;
            seen.add(url);
            return true;
        });
    }
    /**
     * Analyze consistency across model results
     */
    analyzeConsistency(results) {
        // This is a simplified analysis
        // A more sophisticated version would do semantic comparison
        const agreements = [];
        const conflicts = [];
        if (results.length < 2) {
            return { agreements: [], conflicts: [], confidence: 'medium' };
        }
        // Check for overlapping citations (indicates agreement on sources)
        const citationSets = results.map(r => new Set(r.citations));
        const commonCitations = results[0].citations.filter(url => citationSets.every(set => set.has(url)));
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
        let confidence = 'medium';
        if (commonCitations.length > 3 && conflicts.length === 0) {
            confidence = 'high';
        }
        else if (commonCitations.length > 1) {
            confidence = 'medium-high';
        }
        else if (conflicts.length > 1) {
            confidence = 'low';
        }
        return { agreements, conflicts, confidence };
    }
    /**
     * Generate a synthesis summary
     */
    generateSummary(query, results, pattern, confidence) {
        const modelNames = results.map(r => r.model).join(' → ');
        const totalCitations = new Set(results.flatMap(r => r.citations)).size;
        let patternDesc;
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
    formatSynthesis(result) {
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
        }
        else {
            output += `- *Cross-model agreement analysis pending deeper semantic comparison*\n`;
        }
        output += `
### Areas of Conflict
`;
        if (result.conflicts.length > 0) {
            result.conflicts.forEach(c => {
                output += `- ⚠️ ${c}\n`;
            });
        }
        else {
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
            }
            catch {
                output += `[${i + 1}] ${url}\n\n`;
            }
        });
        return output;
    }
    /**
     * Get human-readable label for model
     */
    getModelLabel(model) {
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
exports.SynthesisEngine = SynthesisEngine;
/**
 * Recommend a synthesis pattern based on query
 */
function recommendPattern(query) {
    const queryLower = query.toLowerCase();
    // TruthTracer for fact-checking
    if (queryLower.includes('fact check') ||
        queryLower.includes('is it true') ||
        queryLower.includes('verify') ||
        queryLower.includes('due diligence')) {
        return 'truthtracer';
    }
    // Deep research for comprehensive queries
    if (queryLower.includes('comprehensive') ||
        queryLower.includes('exhaustive') ||
        queryLower.includes('deep dive')) {
        return 'quick-deep';
    }
    // Fact + reasoning for most analytical queries
    if (queryLower.includes('why') ||
        queryLower.includes('how') ||
        queryLower.includes('compare') ||
        queryLower.includes('evaluate')) {
        return 'fact-reasoning';
    }
    // Default to multi-perspective
    return 'multi-perspective';
}
//# sourceMappingURL=synthesis.js.map