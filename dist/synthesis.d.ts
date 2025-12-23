import { PerplexityClient } from './perplexity.js';
import { SynthesisResult } from './types.js';
export type SynthesisPattern = 'fact-reasoning' | 'quick-deep' | 'truthtracer' | 'multi-perspective';
export declare class SynthesisEngine {
    private client;
    constructor(client: PerplexityClient);
    /**
     * Run multi-model synthesis based on pattern
     */
    synthesize(query: string, pattern: SynthesisPattern, systemPrompt?: string): Promise<SynthesisResult>;
    /**
     * Get model sequence for a pattern
     */
    private getModelsForPattern;
    /**
     * Combine results from multiple models
     */
    private combineResults;
    /**
     * Deduplicate citations while preserving order
     */
    private deduplicateCitations;
    /**
     * Analyze consistency across model results
     */
    private analyzeConsistency;
    /**
     * Generate a synthesis summary
     */
    private generateSummary;
    /**
     * Format synthesis result as markdown (matches skill output structure)
     */
    formatSynthesis(result: SynthesisResult): string;
    /**
     * Get human-readable label for model
     */
    private getModelLabel;
}
/**
 * Recommend a synthesis pattern based on query
 */
export declare function recommendPattern(query: string): SynthesisPattern;
//# sourceMappingURL=synthesis.d.ts.map