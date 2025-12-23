export type PerplexityModel = 'sonar' | 'sonar-pro' | 'sonar-reasoning-pro' | 'sonar-deep-research';
export interface PerplexityMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface PerplexityRequest {
    model: PerplexityModel;
    messages: PerplexityMessage[];
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    search_domain_filter?: string[];
    search_recency_filter?: 'day' | 'week' | 'month' | 'year';
    return_citations?: boolean;
    return_images?: boolean;
    return_related_questions?: boolean;
    stream?: boolean;
}
export interface PerplexityUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    citation_tokens?: number;
    num_search_queries?: number;
    reasoning_tokens?: number;
}
export interface PerplexityResponse {
    id: string;
    model: string;
    created: number;
    choices: Array<{
        index: number;
        message: {
            role: 'assistant';
            content: string;
        };
        finish_reason: string;
    }>;
    citations?: string[];
    related_questions?: string[];
    usage: PerplexityUsage;
}
export interface ResearchThread {
    id: string;
    topic: string;
    date: string;
    model: PerplexityModel;
    query: string;
    summary: string;
    filePath: string;
}
export interface ResearchEntry {
    timestamp: string;
    query: string;
    model: PerplexityModel;
    systemPrompt?: string;
    response: string;
    citations: string[];
    usage: PerplexityUsage;
}
export interface ModelRecommendation {
    model: PerplexityModel;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
}
export interface SynthesisResult {
    summary: string;
    findings: Array<{
        model: PerplexityModel;
        content: string;
        citations: string[];
    }>;
    agreements: string[];
    conflicts: string[];
    confidence: 'high' | 'medium-high' | 'medium' | 'low';
    allCitations: string[];
}
//# sourceMappingURL=types.d.ts.map