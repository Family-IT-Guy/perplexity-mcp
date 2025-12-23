import {
  PerplexityModel,
  PerplexityRequest,
  PerplexityResponse,
  PerplexityUsage,
} from './types.js';

const API_ENDPOINT = 'https://api.perplexity.ai/chat/completions';

// System prompts for different contexts
export const SYSTEM_PROMPTS = {
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

export class PerplexityClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.PERPLEXITY_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('PERPLEXITY_API_KEY is required. Set it as an environment variable.');
    }
  }

  async search(
    query: string,
    model: PerplexityModel = 'sonar-reasoning-pro',
    options: Partial<PerplexityRequest> = {}
  ): Promise<PerplexityResponse> {
    const systemPrompt = options.messages?.[0]?.role === 'system'
      ? options.messages[0].content
      : SYSTEM_PROMPTS.general;

    // Build request - don't spread options.messages to avoid overwriting
    const { messages: _ignoredMessages, ...restOptions } = options;
    const request: PerplexityRequest = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      max_tokens: restOptions.max_tokens || 4000,
      temperature: restOptions.temperature ?? 0.2,
      return_citations: restOptions.return_citations ?? true,
      ...restOptions,
    };

    let response: Response;
    try {
      response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      throw new Error(`Network error calling Perplexity API: ${errorMsg}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new PerplexityAPIError(
        response.status,
        `Perplexity API error (${response.status}): ${errorText}`
      );
    }

    return response.json() as Promise<PerplexityResponse>;
  }

  /**
   * Select the appropriate model based on query characteristics
   */
  analyzeQueryForModel(query: string): {
    recommended: PerplexityModel;
    reason: string;
  } {
    const queryLower = query.toLowerCase();
    const wordCount = query.split(/\s+/).length;

    // Deep research indicators
    if (
      queryLower.includes('comprehensive') ||
      queryLower.includes('exhaustive') ||
      queryLower.includes('deep dive') ||
      queryLower.includes('research report') ||
      queryLower.includes('due diligence') ||
      queryLower.includes('market analysis')
    ) {
      return {
        recommended: 'sonar-deep-research',
        reason: 'Query requests comprehensive/exhaustive research',
      };
    }

    // Reasoning indicators
    if (
      queryLower.includes('why') ||
      queryLower.includes('how does') ||
      queryLower.includes('explain') ||
      queryLower.includes('analyze') ||
      queryLower.includes('compare') ||
      queryLower.includes('evaluate') ||
      queryLower.includes('trade-off') ||
      queryLower.includes('pros and cons') ||
      queryLower.includes('debug') ||
      queryLower.includes('troubleshoot') ||
      queryLower.includes('root cause')
    ) {
      return {
        recommended: 'sonar-reasoning-pro',
        reason: 'Query requires reasoning, analysis, or causal explanation',
      };
    }

    // Simple factual lookup indicators
    if (
      wordCount < 10 &&
      (queryLower.includes('what is') ||
        queryLower.includes('who is') ||
        queryLower.includes('when did') ||
        queryLower.includes('where is') ||
        queryLower.startsWith('define ') ||
        queryLower.includes('current price') ||
        queryLower.includes('latest'))
    ) {
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
   * Format response content with citations
   */
  formatResponseWithCitations(response: PerplexityResponse): string {
    let content = response.choices[0]?.message?.content || '';
    const citations = response.citations || [];
    const relatedQuestions = response.related_questions || [];
    const usage = response.usage;

    // Strip <think>...</think> blocks from reasoning models
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    let formatted = content;

    if (citations.length > 0) {
      formatted += '\n\n---\n\n## Sources\n\n';
      citations.forEach((url, index) => {
        try {
          const domain = new URL(url).hostname;
          formatted += `[${index + 1}] ${domain}\n    ${url}\n`;
        } catch {
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

    formatted += `\n---\n\n*Model: ${response.model} | Tokens: ${usage.total_tokens}*`;

    if (usage.num_search_queries) {
      formatted += ` | *Searches: ${usage.num_search_queries}*`;
    }

    return formatted;
  }
}

export class PerplexityAPIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'PerplexityAPIError';
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  getSuggestedAction(): string {
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
