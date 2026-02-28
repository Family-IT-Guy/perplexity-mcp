import { PerplexityModel, PerplexityResponse, ResearchThread } from './types.js';
export declare class ResearchStore {
    private researchDir;
    private rawDir;
    constructor(customDir?: string);
    private ensureDirectoriesExist;
    /**
     * Generate timestamp string for filenames: YYYYMMDD_HHMMSS
     */
    private generateTimestamp;
    /**
     * Save raw API response to raw/ directory BEFORE processing
     * This is insurance against truncation and enables re-processing
     */
    private saveRawResponse;
    /**
     * Count existing queries in a thread file
     */
    private countQueriesInThread;
    /**
     * Generate a filename from topic and date
     */
    private generateFilename;
    /**
     * Extract topic from query for filename
     */
    private extractTopic;
    /**
     * Save research results to a markdown file with raw JSON backup
     *
     * Architecture:
     * 1. Save complete API response to raw/ (insurance against truncation)
     * 2. Append formatted entry to thread file with reference to raw
     * 3. Update running synthesis section
     */
    saveResearch(query: string, response: PerplexityResponse, model: PerplexityModel, systemPrompt?: string, modelRationale?: string, approvedPlan?: string): Promise<string>;
    /**
     * Generate the running synthesis section template
     */
    private generateSynthesisSection;
    /**
     * List all research threads with metadata
     * Note: Only lists .md files in root, ignores raw/ subdirectory
     */
    listThreads(): ResearchThread[];
    /**
     * Read a specific research thread
     */
    readThread(topicOrId: string): string | null;
    /**
     * Search across all research files (excludes raw/ directory)
     */
    searchResearch(keywords: string): Array<{
        file: string;
        topic: string;
        matches: string[];
    }>;
    /**
     * Get the research directory path
     */
    getResearchDir(): string;
    /**
     * Get the raw responses directory path
     */
    getRawDir(): string;
    /**
     * List raw response files
     */
    listRawFiles(): Array<{
        filename: string;
        timestamp: string;
        topic: string;
    }>;
    /**
     * Read a raw response file
     */
    readRawFile(filename: string): object | null;
}
//# sourceMappingURL=research-store.d.ts.map