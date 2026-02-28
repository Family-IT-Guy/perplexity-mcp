import { PerplexityModel, PerplexityResponse, SearchOptions } from './types.js';
export declare const SYSTEM_PROMPTS: {
    general: string;
    technical: string;
    academic: string;
    factCheck: string;
    business: string;
    rca: string;
};
export declare class PerplexityClient {
    private apiKey;
    constructor(apiKey?: string);
    search(query: string, model?: PerplexityModel, options?: SearchOptions): Promise<PerplexityResponse>;
    /**
     * Submit async deep research request (for long-running queries)
     * Returns a task ID for polling
     */
    submitAsyncResearch(query: string, options?: SearchOptions): Promise<string>;
    /**
     * Poll async research task for results
     */
    checkAsyncResearch(taskId: string): Promise<{
        status: string;
        response?: PerplexityResponse;
        error_message?: string;
    }>;
    /**
     * Select the appropriate model based on query characteristics
     */
    analyzeQueryForModel(query: string): {
        recommended: PerplexityModel;
        reason: string;
    };
    /**
     * Auto-detect search_mode from query content
     * Matches skill logic: studies/papers → academic, companies/filings → sec, else web
     */
    searchModeForQuery(query: string): 'web' | 'academic' | 'sec';
    /**
     * Auto-detect whether to return images from query content
     * Matches skill logic: visual topics → true, else false
     */
    shouldReturnImages(query: string): boolean;
    /**
     * Format response content with citations
     * Uses search_results (rich) when available, falls back to citations (URLs only)
     */
    formatResponseWithCitations(response: PerplexityResponse): string;
}
export declare class PerplexityAPIError extends Error {
    status: number;
    constructor(status: number, message: string);
    get isRateLimited(): boolean;
    get isUnauthorized(): boolean;
    get isServerError(): boolean;
    getSuggestedAction(): string;
}
//# sourceMappingURL=perplexity.d.ts.map