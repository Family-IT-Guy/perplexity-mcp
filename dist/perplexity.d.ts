import { PerplexityModel, PerplexityRequest, PerplexityResponse } from './types.js';
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
    search(query: string, model?: PerplexityModel, options?: Partial<PerplexityRequest>): Promise<PerplexityResponse>;
    /**
     * Select the appropriate model based on query characteristics
     */
    analyzeQueryForModel(query: string): {
        recommended: PerplexityModel;
        reason: string;
    };
    /**
     * Format response content with citations
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