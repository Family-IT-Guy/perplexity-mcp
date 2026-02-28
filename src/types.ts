// Perplexity API types

export type PerplexityModel =
  | 'sonar'
  | 'sonar-pro'
  | 'sonar-reasoning-pro'
  | 'sonar-deep-research';

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
  web_search_options?: { search_context_size?: 'low' | 'medium' | 'high' };
  search_mode?: 'web' | 'academic' | 'sec';
  search_domain_filter?: string[];
  search_recency_filter?: 'day' | 'week' | 'month' | 'year';
  search_after_date_filter?: string;   // MM/DD/YYYY
  search_before_date_filter?: string;  // MM/DD/YYYY
  return_citations?: boolean;
  return_images?: boolean;
  return_related_questions?: boolean;
  reasoning_effort?: 'low' | 'medium' | 'high';
  stream?: boolean;
}

export interface PerplexityCost {
  input_tokens_cost: number;
  output_tokens_cost: number;
  request_cost: number;
  total_cost: number;
  reasoning_tokens_cost?: number;
  citation_tokens_cost?: number;
  search_queries_cost?: number;
}

export interface PerplexityUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  search_context_size?: string;
  cost?: PerplexityCost;
  // Deep research additional fields
  citation_tokens?: number;
  num_search_queries?: number;
  reasoning_tokens?: number;
}

export interface PerplexitySearchResult {
  title: string;
  url: string;
  date?: string;
  last_updated?: string;
  snippet?: string;
  source?: string;
}

export interface PerplexityImage {
  image_url: string;
  origin_url?: string;
  height?: number;
  width?: number;
  title?: string;
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
  search_results?: PerplexitySearchResult[];
  images?: PerplexityImage[];
  related_questions?: string[];
  usage: PerplexityUsage;
}

// Research storage types

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

// Search options passed through the system
export interface SearchOptions {
  systemPrompt?: string;
  searchContextSize?: 'low' | 'medium' | 'high';
  searchMode?: 'web' | 'academic' | 'sec';
  searchAfterDate?: string;
  searchBeforeDate?: string;
  domainFilter?: string[];
  recency?: 'day' | 'week' | 'month' | 'year';
  returnImages?: boolean;
  returnRelatedQuestions?: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

// Model selection types

export interface ModelRecommendation {
  model: PerplexityModel;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

// Multi-model synthesis types

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
