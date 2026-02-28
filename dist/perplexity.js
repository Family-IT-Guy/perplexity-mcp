"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerplexityAPIError = exports.PerplexityClient = exports.SYSTEM_PROMPTS = void 0;
const API_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const ASYNC_API_ENDPOINT = 'https://api.perplexity.ai/async/chat/completions';
// System prompts for different contexts
exports.SYSTEM_PROMPTS = {
    general: 'You are a research assistant. Provide comprehensive, well-cited answers. Be thorough but concise.',
    technical: 'Prioritize official documentation, GitHub repositories, and high-quality technical sources. Include code examples when relevant. Note version compatibility.',
    academic: 'Prioritize peer-reviewed sources and reputable publications. Note methodology limitations. Highlight conflicting findings.',
    factCheck: 'Cross-reference claims against multiple independent sources. Distinguish verified facts from disputed claims. Rate confidence levels.',
    business: 'Prioritize authoritative sources (SEC filings, official reports). Include quantitative data. Note potential biases.',
    rca: `You are a root cause analysis expert. Follow systematic debugging methodology:
1. Gather symptoms and error messages precisely
2. Generate multiple hypotheses for potential causes
3. For each hypothesis, identify evidence that would confirm or refute it
4. Prioritize hypotheses by likelihood and ease of verification
5. Document what was ruled out and why
6. Trace causal chains back to root cause, not just proximate cause
7. Distinguish between correlation and causation
8. Note environmental factors that may affect reproducibility
Preserve the investigation path - future sessions benefit from seeing the reasoning chain, not just conclusions.`,
};
class PerplexityClient {
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey || process.env.PERPLEXITY_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('PERPLEXITY_API_KEY is required. Set it as an environment variable.');
        }
    }
    async search(query, model = 'sonar-reasoning-pro', options = {}) {
        const systemPrompt = options.systemPrompt || exports.SYSTEM_PROMPTS.general;
        // Build request with proper web_search_options nesting
        // CRITICAL: search_context_size MUST be inside web_search_options, not top-level
        const request = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query },
            ],
            web_search_options: {
                search_context_size: options.searchContextSize || 'high',
            },
            temperature: 0.2,
            return_citations: true,
            stream: false,
        };
        // Search mode (web/academic/sec)
        if (options.searchMode) {
            request.search_mode = options.searchMode;
        }
        // Date filters
        if (options.searchAfterDate) {
            request.search_after_date_filter = options.searchAfterDate;
        }
        if (options.searchBeforeDate) {
            request.search_before_date_filter = options.searchBeforeDate;
        }
        // Domain filter
        if (options.domainFilter && options.domainFilter.length > 0) {
            request.search_domain_filter = options.domainFilter;
        }
        // Recency filter
        if (options.recency) {
            request.search_recency_filter = options.recency;
        }
        // Images
        if (options.returnImages !== undefined) {
            request.return_images = options.returnImages;
        }
        // Related questions
        if (options.returnRelatedQuestions) {
            request.return_related_questions = true;
        }
        // Reasoning effort (deep research)
        if (options.reasoningEffort) {
            request.reasoning_effort = options.reasoningEffort;
        }
        let response;
        try {
            response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });
        }
        catch (fetchError) {
            const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
            throw new Error(`Network error calling Perplexity API: ${errorMsg}`);
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new PerplexityAPIError(response.status, `Perplexity API error (${response.status}): ${errorText}`);
        }
        return response.json();
    }
    /**
     * Submit async deep research request (for long-running queries)
     * Returns a task ID for polling
     */
    async submitAsyncResearch(query, options = {}) {
        const systemPrompt = options.systemPrompt || exports.SYSTEM_PROMPTS.general;
        const innerRequest = {
            model: 'sonar-deep-research',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query },
            ],
            web_search_options: {
                search_context_size: options.searchContextSize || 'high',
            },
            reasoning_effort: options.reasoningEffort || 'high',
            temperature: 0.2,
            stream: false,
            return_citations: true,
        };
        if (options.searchMode)
            innerRequest.search_mode = options.searchMode;
        if (options.searchAfterDate)
            innerRequest.search_after_date_filter = options.searchAfterDate;
        if (options.searchBeforeDate)
            innerRequest.search_before_date_filter = options.searchBeforeDate;
        if (options.domainFilter?.length)
            innerRequest.search_domain_filter = options.domainFilter;
        if (options.returnRelatedQuestions)
            innerRequest.return_related_questions = true;
        if (options.returnImages !== undefined)
            innerRequest.return_images = options.returnImages;
        let response;
        try {
            response = await fetch(ASYNC_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ request: innerRequest }),
            });
        }
        catch (fetchError) {
            const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
            throw new Error(`Network error submitting async research: ${errorMsg}`);
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new PerplexityAPIError(response.status, `Perplexity async API error (${response.status}): ${errorText}`);
        }
        const result = await response.json();
        return result.id;
    }
    /**
     * Poll async research task for results
     */
    async checkAsyncResearch(taskId) {
        let response;
        try {
            response = await fetch(`${ASYNC_API_ENDPOINT}/${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });
        }
        catch (fetchError) {
            const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
            throw new Error(`Network error checking async research: ${errorMsg}`);
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new PerplexityAPIError(response.status, `Perplexity async poll error (${response.status}): ${errorText}`);
        }
        return response.json();
    }
    /**
     * Select the appropriate model based on query characteristics
     */
    analyzeQueryForModel(query) {
        const queryLower = query.toLowerCase();
        const wordCount = query.split(/\s+/).length;
        // Deep research indicators
        if (queryLower.includes('comprehensive') ||
            queryLower.includes('exhaustive') ||
            queryLower.includes('deep dive') ||
            queryLower.includes('research report') ||
            queryLower.includes('due diligence') ||
            queryLower.includes('market analysis')) {
            return {
                recommended: 'sonar-deep-research',
                reason: 'Query requests comprehensive/exhaustive research',
            };
        }
        // Reasoning indicators
        if (queryLower.includes('why') ||
            queryLower.includes('how does') ||
            queryLower.includes('explain') ||
            queryLower.includes('analyze') ||
            queryLower.includes('compare') ||
            queryLower.includes('evaluate') ||
            queryLower.includes('trade-off') ||
            queryLower.includes('pros and cons') ||
            queryLower.includes('debug') ||
            queryLower.includes('troubleshoot') ||
            queryLower.includes('root cause')) {
            return {
                recommended: 'sonar-reasoning-pro',
                reason: 'Query requires reasoning, analysis, or causal explanation',
            };
        }
        // Simple factual lookup indicators
        if (wordCount < 10 &&
            (queryLower.includes('what is') ||
                queryLower.includes('who is') ||
                queryLower.includes('when did') ||
                queryLower.includes('where is') ||
                queryLower.startsWith('define ') ||
                queryLower.includes('current price') ||
                queryLower.includes('latest'))) {
            return {
                recommended: 'sonar',
                reason: 'Simple factual lookup query',
            };
        }
        // Default to reasoning-pro for most queries
        return {
            recommended: 'sonar-reasoning-pro',
            reason: 'Default model for comprehensive analysis with reasoning traces',
        };
    }
    /**
     * Auto-detect search_mode from query content
     * Matches skill logic: studies/papers → academic, companies/filings → sec, else web
     */
    searchModeForQuery(query) {
        const q = query.toLowerCase();
        if (q.includes('studies') || q.includes('papers') || q.includes('peer-reviewed') ||
            q.includes('peer reviewed') || q.includes('scientific') || q.includes('journal') ||
            q.includes('research paper') || q.includes('meta-analysis') || q.includes('clinical trial')) {
            return 'academic';
        }
        if (q.includes('companies') || q.includes('filings') || q.includes('earnings') ||
            q.includes('sec ') || q.includes('financial') || q.includes('10-k') ||
            q.includes('10-q') || q.includes('annual report') || q.includes('investor')) {
            return 'sec';
        }
        return 'web';
    }
    /**
     * Auto-detect whether to return images from query content
     * Matches skill logic: visual topics → true, else false
     */
    shouldReturnImages(query) {
        const q = query.toLowerCase();
        return (q.includes('product') || q.includes('visual') || q.includes('design') ||
            q.includes('photo') || q.includes('place') || q.includes('image') ||
            q.includes('screenshot') || q.includes('diagram') || q.includes('infographic'));
    }
    /**
     * Format response content with citations
     * Uses search_results (rich) when available, falls back to citations (URLs only)
     */
    formatResponseWithCitations(response) {
        let content = response.choices[0]?.message?.content || '';
        const searchResults = response.search_results || [];
        const citations = response.citations || [];
        const relatedQuestions = response.related_questions || [];
        const usage = response.usage;
        // Strip <think>...</think> blocks from reasoning models
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        let formatted = content;
        // Prefer search_results (title + URL + date) over bare citation URLs
        if (searchResults.length > 0) {
            formatted += '\n\n---\n\n## Sources\n\n';
            searchResults.forEach((result, index) => {
                try {
                    const domain = new URL(result.url).hostname.replace(/^www\./, '');
                    formatted += `[${index + 1}] ${result.title || domain} - ${domain}\n`;
                    formatted += `    ${result.url}`;
                    if (result.date)
                        formatted += ` | Published: ${result.date}`;
                    if (result.last_updated)
                        formatted += ` | Updated: ${result.last_updated}`;
                    formatted += '\n';
                }
                catch {
                    formatted += `[${index + 1}] ${result.title || result.url}\n    ${result.url}\n`;
                }
            });
        }
        else if (citations.length > 0) {
            formatted += '\n\n---\n\n## Sources\n\n';
            citations.forEach((url, index) => {
                try {
                    const domain = new URL(url).hostname.replace(/^www\./, '');
                    formatted += `[${index + 1}] ${domain}\n    ${url}\n`;
                }
                catch {
                    formatted += `[${index + 1}] ${url}\n`;
                }
            });
        }
        if (relatedQuestions.length > 0) {
            formatted += '\n---\n\n## Related Questions\n\n';
            relatedQuestions.forEach((question, index) => {
                formatted += `${index + 1}. ${question}\n`;
            });
        }
        // Cost from API response or token count
        const costStr = usage.cost?.total_cost !== undefined
            ? `$${usage.cost.total_cost.toFixed(4)}`
            : undefined;
        formatted += `\n---\n\n*Model: ${response.model} | Tokens: ${usage.total_tokens}`;
        if (costStr)
            formatted += ` | Cost: ${costStr}`;
        if (usage.num_search_queries)
            formatted += ` | Searches: ${usage.num_search_queries}`;
        formatted += '*';
        return formatted;
    }
}
exports.PerplexityClient = PerplexityClient;
class PerplexityAPIError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'PerplexityAPIError';
    }
    get isRateLimited() {
        return this.status === 429;
    }
    get isUnauthorized() {
        return this.status === 401;
    }
    get isServerError() {
        return this.status >= 500;
    }
    getSuggestedAction() {
        if (this.isUnauthorized) {
            return 'Check your PERPLEXITY_API_KEY - it may be invalid or expired.';
        }
        if (this.isRateLimited) {
            return 'Rate limited. Wait a moment and try again.';
        }
        if (this.isServerError) {
            return 'Perplexity server error. Try again in a few seconds.';
        }
        return 'Check your request parameters and try again.';
    }
}
exports.PerplexityAPIError = PerplexityAPIError;
//# sourceMappingURL=perplexity.js.map