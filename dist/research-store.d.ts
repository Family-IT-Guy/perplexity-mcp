import { PerplexityModel, PerplexityResponse, ResearchThread } from './types.js';
export declare class ResearchStore {
    private researchDir;
    constructor(customDir?: string);
    private ensureDirectoryExists;
    /**
     * Generate a filename from topic and date
     */
    private generateFilename;
    /**
     * Extract topic from query for filename
     */
    private extractTopic;
    /**
     * Save research results to a markdown file
     */
    saveResearch(query: string, response: PerplexityResponse, model: PerplexityModel, systemPrompt?: string, modelRationale?: string, approvedPlan?: string): Promise<string>;
    /**
     * List all research threads with metadata
     */
    listThreads(): ResearchThread[];
    /**
     * Read a specific research thread
     */
    readThread(topicOrId: string): string | null;
    /**
     * Search across all research files
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
}
//# sourceMappingURL=research-store.d.ts.map