#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { PerplexityClient, SYSTEM_PROMPTS } from './perplexity.js';
import { ResearchStore } from './research-store.js';
import { SynthesisEngine, recommendPattern } from './synthesis.js';
import { PerplexityModel, SearchOptions, SynthesisResult } from './types.js';

// Initialize components
let client: PerplexityClient;
let store: ResearchStore;
let synthesizer: SynthesisEngine;

try {
  client = new PerplexityClient();
  store = new ResearchStore();
  synthesizer = new SynthesisEngine(client);
} catch (error) {
  console.error('Failed to initialize:', error);
  process.exit(1);
}

// Define tools
const TOOLS: Tool[] = [
  {
    name: 'research',
    description: `Intelligent Perplexity search with auto-logging.

**MANDATORY WORKFLOW - DO NOT SKIP THESE STEPS:**

## Step 1: Check Existing Research
BEFORE calling this tool, use search_research() to check for existing research on this topic.
Build on prior findings and avoid duplicate queries.

## Step 2: Present Research Plan
BEFORE calling this tool, present a Research Plan to the user:

\`\`\`
## Research Plan

**Objective**: [Restate the specific question being answered in precise terms]
**Scope**: [What's in] | [What's explicitly out]
**Methodology**: [Model selected] because [rationale] | Sources: [prioritization]
**Expected Output**: [Brief answer / Detailed report / Comparative analysis]

### Alternatives to Consider
- [Alternative framing 1] — might be better if [condition]
- [Alternative framing 2] — worth considering because [reason]

### Questions Before Proceeding
- [Clarifying question if ambiguity exists]
- [Assumption being made that user might want to challenge]

### Potential Blind Spots
- [What this approach might miss]
- [Bias in source prioritization]

Awaiting your approval before proceeding.
\`\`\`

## Step 3: Wait for Approval
DO NOT call this tool until user explicitly approves the plan.

## Step 4: Execute with Plan
After approval, call this tool with the approved_plan parameter containing your plan.

## Step 5: For Follow-ups
For follow-up queries within established scope, use brief checkpoint:
"Follow-up within established scope: [sub-question] using same methodology. Proceed?"

**MODEL SELECTION** (if not specified, will auto-select):
- Simple factual lookup (what is X?) → sonar
- Analysis, reasoning, most queries → sonar-reasoning-pro (default)
- Exhaustive research, comprehensive reports → sonar-deep-research
- RCA/debugging → sonar-reasoning-pro (mandatory for causal reasoning)

**WHEN PRESENTING RESULTS**, include:
- Confidence level (High/Medium/Low) based on source agreement
- Note any conflicts between sources
- Distinguish verified facts from inferences

Results saved with raw JSON backup:
- Thread file: ~/Documents/Perplexity Research/[topic].md
- Raw response: ~/Documents/Perplexity Research/raw/[timestamp]_[topic].json`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The research question or topic to investigate',
        },
        approved_plan: {
          type: 'string',
          description: 'The research plan that was approved by the user. Required for audit trail.',
        },
        model: {
          type: 'string',
          enum: ['sonar', 'sonar-pro', 'sonar-reasoning-pro', 'sonar-deep-research'],
          description: 'Perplexity model to use. If not specified, auto-selects based on query.',
        },
        context: {
          type: 'string',
          enum: ['general', 'technical', 'academic', 'factCheck', 'business', 'rca'],
          description: 'Context for system prompt selection. Use "rca" for debugging/troubleshooting. Default: general',
        },
        recency: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year'],
          description: 'Filter results by recency. Optional.',
        },
        search_context_size: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Web search context breadth. "high" gives the model more source material for better quality. Default: "high". Cost: $6/$10/$14 per 1K requests for low/med/high.',
        },
        search_mode: {
          type: 'string',
          enum: ['web', 'academic', 'sec'],
          description: 'Search mode. Auto-detected if omitted: studies/papers → academic, companies/filings → sec, else web.',
        },
        domain_filter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter results by domain (max 20). Prefix with - to exclude. Examples: ["docs.python.org", "github.com"] or ["-reddit.com", "-quora.com"]',
        },
        return_images: {
          type: 'boolean',
          description: 'Include images in results. Auto-detected if omitted: true for visual/product topics, false otherwise.',
        },
        return_related_questions: {
          type: 'boolean',
          description: 'Include suggested follow-up questions in response. Default: false',
        },
        search_after_date: {
          type: 'string',
          description: 'Only include results published after this date. Format: MM/DD/YYYY',
        },
        search_before_date: {
          type: 'string',
          description: 'Only include results published before this date. Format: MM/DD/YYYY',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'deep_research',
    description: `Multi-model synthesis for comprehensive research.

**MANDATORY WORKFLOW - DO NOT SKIP:**

## Step 1: Check Existing Research
Use search_research() first to check for existing research on this topic.

## Step 2: Present Research Plan
BEFORE calling this tool, present a plan explaining:
- Why multi-model synthesis is warranted
- Which pattern you'll use and why
- Expected time (30-120 seconds for deep research)
- What each model phase will investigate

## Step 3: Wait for Approval
DO NOT call until user approves. Multi-model queries are expensive and time-consuming.

## Step 4: Execute with Plan
After approval, call with approved_plan parameter.

**PATTERNS:**
- fact-reasoning: Factual research (sonar-pro) → Reasoning analysis (sonar-reasoning-pro)
  Use when: Need verified facts + causal explanation
- quick-deep: Quick overview (sonar) → Deep research (sonar-deep-research)
  Use when: Initial assessment then comprehensive dive
- truthtracer: Full verification (sonar-pro → sonar-reasoning-pro → sonar-deep-research)
  Use when: High-stakes decisions, fact-checking, due diligence
- multi-perspective: Multiple analytical angles
  Use when: Controversial topics, trade-off analysis

**OUTPUT STRUCTURE:**
Results will include:
- Summary of key findings
- Findings by approach (what each model found)
- Areas of agreement (high confidence)
- Areas of conflict (flagged for user)
- Confidence assessment
- Combined citations

Results saved with raw JSON backup:
- Thread file: ~/Documents/Perplexity Research/[topic].md
- Raw response: ~/Documents/Perplexity Research/raw/[timestamp]_[topic].json`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The research question requiring comprehensive analysis',
        },
        approved_plan: {
          type: 'string',
          description: 'The research plan approved by the user. Required for audit trail.',
        },
        pattern: {
          type: 'string',
          enum: ['fact-reasoning', 'quick-deep', 'truthtracer', 'multi-perspective'],
          description: 'Synthesis pattern. If not specified, auto-selects based on query.',
        },
        search_context_size: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Web search context breadth. Default: "high".',
        },
        search_mode: {
          type: 'string',
          enum: ['web', 'academic', 'sec'],
          description: 'Search mode. Auto-detected if omitted.',
        },
        return_images: {
          type: 'boolean',
          description: 'Include images in results. Auto-detected if omitted.',
        },
        search_after_date: {
          type: 'string',
          description: 'Only results after this date. Format: MM/DD/YYYY',
        },
        search_before_date: {
          type: 'string',
          description: 'Only results before this date. Format: MM/DD/YYYY',
        },
        domain_filter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter results by domain (max 20). Prefix with - to exclude.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_research',
    description: `Search past research for existing findings.

CALL THIS BEFORE making new queries to avoid duplicate work and build on prior findings.
Searches across all thread files in ~/Documents/Perplexity Research/ (excludes raw/ directory).`,
    inputSchema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'string',
          description: 'Keywords to search for in past research',
        },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'list_research_threads',
    description: `List all saved research threads with dates and summaries.

Shows what research has been done previously.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_research_thread',
    description: `Read the full content of a past research thread.

Use after list_research_threads to read specific research.`,
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topic or ID of the research thread to read',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'async_deep_research',
    description: `Submit a long-running deep research query asynchronously.

Use this for exhaustive research that may take 60-120+ seconds. Returns a task ID immediately.
Follow up with check_async_research to poll for results.

**MANDATORY WORKFLOW:**
1. Present research plan and get user approval first
2. Submit with this tool (returns task ID)
3. Poll with check_async_research until COMPLETED
4. Results are automatically saved when complete

Always uses sonar-deep-research model with high reasoning effort.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The research question requiring exhaustive investigation',
        },
        approved_plan: {
          type: 'string',
          description: 'The research plan approved by the user. Required for audit trail.',
        },
        context: {
          type: 'string',
          enum: ['general', 'technical', 'academic', 'factCheck', 'business', 'rca'],
          description: 'Context for system prompt selection. Default: general',
        },
        search_context_size: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Web search context breadth. Default: "high".',
        },
        search_mode: {
          type: 'string',
          enum: ['web', 'academic', 'sec'],
          description: 'Search mode. Auto-detected if omitted.',
        },
        reasoning_effort: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Reasoning thoroughness. Default: "high".',
        },
        search_after_date: {
          type: 'string',
          description: 'Only results after this date. Format: MM/DD/YYYY',
        },
        search_before_date: {
          type: 'string',
          description: 'Only results before this date. Format: MM/DD/YYYY',
        },
        domain_filter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter results by domain (max 20). Prefix with - to exclude.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_async_research',
    description: `Check the status of an async deep research task.

Poll this tool after submitting with async_deep_research.
Status progression: CREATED → IN_PROGRESS → COMPLETED (or FAILED).
When COMPLETED, results are automatically saved to the research directory.`,
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID returned by async_deep_research',
        },
        query: {
          type: 'string',
          description: 'The original query (needed for saving results when complete)',
        },
        approved_plan: {
          type: 'string',
          description: 'The original approved plan (needed for saving results when complete)',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'list_models',
    description: `Show available Perplexity models and when to use each.

Provides guidance on model selection for different query types.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Create and configure server
const server = new Server(
  {
    name: 'perplexity-intelligent-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'research': {
        const query = args?.query as string;
        const approvedPlan = args?.approved_plan as string | undefined;
        let model = args?.model as PerplexityModel | undefined;
        const context = (args?.context as keyof typeof SYSTEM_PROMPTS) || 'general';
        const recency = args?.recency as 'day' | 'week' | 'month' | 'year' | undefined;
        const domainFilter = args?.domain_filter as string[] | undefined;
        const returnRelatedQuestions = args?.return_related_questions as boolean | undefined;
        const searchContextSize = args?.search_context_size as 'low' | 'medium' | 'high' | undefined;
        const searchMode = args?.search_mode as 'web' | 'academic' | 'sec' | undefined;
        const returnImages = args?.return_images as boolean | undefined;
        const searchAfterDate = args?.search_after_date as string | undefined;
        const searchBeforeDate = args?.search_before_date as string | undefined;

        // Force sonar-reasoning-pro for RCA context
        if (context === 'rca' && !model) {
          model = 'sonar-reasoning-pro';
        }

        // Auto-select model if not specified, capture rationale
        let modelRationale: string | undefined;
        if (!model) {
          const recommendation = client.analyzeQueryForModel(query);
          model = recommendation.recommended;
          modelRationale = recommendation.reason;
        } else if (context === 'rca') {
          modelRationale = 'RCA/debugging requires reasoning model';
        } else {
          modelRationale = 'user-specified';
        }

        // Build search options with auto-detection
        const searchOptions: SearchOptions = {
          systemPrompt: SYSTEM_PROMPTS[context],
          searchContextSize: searchContextSize || 'high',
          searchMode: searchMode || client.searchModeForQuery(query),
          returnImages: returnImages !== undefined ? returnImages : client.shouldReturnImages(query),
          returnRelatedQuestions: returnRelatedQuestions || false,
        };
        if (recency) searchOptions.recency = recency;
        if (domainFilter?.length) searchOptions.domainFilter = domainFilter;
        if (searchAfterDate) searchOptions.searchAfterDate = searchAfterDate;
        if (searchBeforeDate) searchOptions.searchBeforeDate = searchBeforeDate;

        // Execute search with error handling
        let response;
        try {
          response = await client.search(query, model, searchOptions);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Suggest alternative model
          const alternativeModel = model === 'sonar-reasoning-pro' ? 'sonar-pro' : 'sonar-reasoning-pro';

          return {
            content: [
              {
                type: 'text',
                text: `**API call failed**: ${errorMessage}

**Options:**
1. **Retry** with same model (${model})
2. **Try alternative model**: ${alternativeModel}
3. **Reformulate query** - simplify or clarify the question
4. **Abort** - cancel this research

What would you like to do?`,
              },
            ],
            isError: true,
          };
        }

        // Save to research store with rationale and approved plan
        const filePath = await store.saveResearch(
          query,
          response,
          model,
          SYSTEM_PROMPTS[context],
          modelRationale,
          approvedPlan
        );

        // Format response
        const formatted = client.formatResponseWithCitations(response);

        return {
          content: [
            {
              type: 'text',
              text: `${formatted}\n\n---\n*Saved to: ${filePath}*`,
            },
          ],
        };
      }

      case 'deep_research': {
        const query = args?.query as string;
        const approvedPlan = args?.approved_plan as string | undefined;
        let pattern = args?.pattern as Parameters<typeof synthesizer.synthesize>[1] | undefined;
        const drSearchContextSize = args?.search_context_size as 'low' | 'medium' | 'high' | undefined;
        const drSearchMode = args?.search_mode as 'web' | 'academic' | 'sec' | undefined;
        const drReturnImages = args?.return_images as boolean | undefined;
        const drSearchAfterDate = args?.search_after_date as string | undefined;
        const drSearchBeforeDate = args?.search_before_date as string | undefined;
        const drDomainFilter = args?.domain_filter as string[] | undefined;

        // Auto-select pattern if not specified
        let patternRationale: string;
        if (!pattern) {
          pattern = recommendPattern(query);
          patternRationale = `auto-selected ${pattern} pattern based on query analysis`;
        } else {
          patternRationale = `user-specified ${pattern} pattern`;
        }

        // Build search options for synthesis (passed to each model call)
        const drSearchOptions: SearchOptions = {
          searchContextSize: drSearchContextSize || 'high',
          searchMode: drSearchMode || client.searchModeForQuery(query),
          returnImages: drReturnImages !== undefined ? drReturnImages : client.shouldReturnImages(query),
        };
        if (drSearchAfterDate) drSearchOptions.searchAfterDate = drSearchAfterDate;
        if (drSearchBeforeDate) drSearchOptions.searchBeforeDate = drSearchBeforeDate;
        if (drDomainFilter?.length) drSearchOptions.domainFilter = drDomainFilter;

        // Execute synthesis with error handling
        let result;
        try {
          result = await synthesizer.synthesize(query, pattern, drSearchOptions);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          return {
            content: [
              {
                type: 'text',
                text: `**Deep research failed**: ${errorMessage}

**Options:**
1. **Retry** with same pattern (${pattern})
2. **Try simpler pattern**: ${pattern === 'truthtracer' ? 'fact-reasoning' : 'quick-deep'}
3. **Use single model** instead via research tool
4. **Abort** - cancel this research

What would you like to do?`,
              },
            ],
            isError: true,
          };
        }

        // Save synthesis to research store
        // Create a synthetic response for storage
        const syntheticResponse = {
          id: 'synthesis',
          model: 'multi-model',
          created: Date.now(),
          choices: [{ index: 0, message: { role: 'assistant' as const, content: result.summary }, finish_reason: 'stop' }],
          citations: result.allCitations,
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
        const filePath = await store.saveResearch(
          `[Deep Research] ${query}`,
          syntheticResponse,
          'sonar-deep-research',
          `Multi-model synthesis (${pattern})`,
          patternRationale,
          approvedPlan
        );

        // Format response
        const formatted = synthesizer.formatSynthesis(result);

        return {
          content: [
            {
              type: 'text',
              text: `${formatted}\n\n---\n*Saved to: ${filePath}*`,
            },
          ],
        };
      }

      case 'search_research': {
        const keywords = args?.keywords as string;
        const results = store.searchResearch(keywords);

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No existing research found for "${keywords}". You may proceed with a new query.`,
              },
            ],
          };
        }

        let output = `## Found ${results.length} research thread(s) matching "${keywords}"\n\n`;
        results.forEach((r, i) => {
          output += `### ${i + 1}. ${r.topic}\n*File: ${r.file}*\n\n`;
          r.matches.forEach(match => {
            output += `> ${match.substring(0, 200)}${match.length > 200 ? '...' : ''}\n\n`;
          });
        });

        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'list_research_threads': {
        const threads = store.listThreads();

        if (threads.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No research threads found.\nResearch directory: ${store.getResearchDir()}`,
              },
            ],
          };
        }

        let output = `## Research Threads (${threads.length})\n\n`;
        output += `*Directory: ${store.getResearchDir()}*\n\n`;
        output += '| Date | Topic | Model | Summary |\n';
        output += '|------|-------|-------|----------|\n';
        threads.forEach(t => {
          output += `| ${t.date} | ${t.topic} | ${t.model} | ${t.summary} |\n`;
        });

        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'read_research_thread': {
        const topic = args?.topic as string;
        const content = store.readThread(topic);

        if (!content) {
          return {
            content: [
              {
                type: 'text',
                text: `Research thread "${topic}" not found. Use list_research_threads to see available threads.`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text', text: content }],
        };
      }

      case 'async_deep_research': {
        const asyncQuery = args?.query as string;
        const asyncApprovedPlan = args?.approved_plan as string | undefined;
        const asyncContext = (args?.context as keyof typeof SYSTEM_PROMPTS) || 'general';
        const asyncSearchContextSize = args?.search_context_size as 'low' | 'medium' | 'high' | undefined;
        const asyncSearchMode = args?.search_mode as 'web' | 'academic' | 'sec' | undefined;
        const asyncReasoningEffort = args?.reasoning_effort as 'low' | 'medium' | 'high' | undefined;
        const asyncSearchAfterDate = args?.search_after_date as string | undefined;
        const asyncSearchBeforeDate = args?.search_before_date as string | undefined;
        const asyncDomainFilter = args?.domain_filter as string[] | undefined;

        const asyncSearchOptions: SearchOptions = {
          systemPrompt: SYSTEM_PROMPTS[asyncContext],
          searchContextSize: asyncSearchContextSize || 'high',
          searchMode: asyncSearchMode || client.searchModeForQuery(asyncQuery),
          reasoningEffort: asyncReasoningEffort || 'high',
        };
        if (asyncSearchAfterDate) asyncSearchOptions.searchAfterDate = asyncSearchAfterDate;
        if (asyncSearchBeforeDate) asyncSearchOptions.searchBeforeDate = asyncSearchBeforeDate;
        if (asyncDomainFilter?.length) asyncSearchOptions.domainFilter = asyncDomainFilter;

        try {
          const taskId = await client.submitAsyncResearch(asyncQuery, asyncSearchOptions);

          return {
            content: [
              {
                type: 'text',
                text: `**Async deep research submitted.**

**Task ID**: \`${taskId}\`
**Status**: CREATED
**Query**: ${asyncQuery}
${asyncApprovedPlan ? `**Plan**: Approved and logged` : ''}

Use \`check_async_research\` with this task ID to poll for results.
Deep research typically takes 60-120 seconds.`,
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: 'text',
                text: `**Async deep research failed to submit**: ${errorMessage}

**Options:**
1. **Retry** submission
2. **Use sync deep_research** instead (blocks until complete)
3. **Abort**

What would you like to do?`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'check_async_research': {
        const taskId = args?.task_id as string;
        const checkQuery = args?.query as string | undefined;
        const checkApprovedPlan = args?.approved_plan as string | undefined;

        try {
          const result = await client.checkAsyncResearch(taskId);

          if (result.status === 'COMPLETED' && result.response) {
            // Save results
            let filePath: string | undefined;
            if (checkQuery) {
              filePath = await store.saveResearch(
                checkQuery,
                result.response,
                'sonar-deep-research',
                undefined,
                'async deep research',
                checkApprovedPlan
              );
            }

            const formatted = client.formatResponseWithCitations(result.response);
            return {
              content: [
                {
                  type: 'text',
                  text: `**Async research complete.**\n\n${formatted}${filePath ? `\n\n---\n*Saved to: ${filePath}*` : ''}`,
                },
              ],
            };
          }

          if (result.status === 'FAILED') {
            return {
              content: [
                {
                  type: 'text',
                  text: `**Async research FAILED.**\n\nTask ID: \`${taskId}\`\nError: ${result.error_message || 'Unknown error'}\n\n**Options:**\n1. **Retry** with async_deep_research\n2. **Use sync** deep_research instead\n3. **Abort**`,
                },
              ],
              isError: true,
            };
          }

          // Still in progress
          return {
            content: [
              {
                type: 'text',
                text: `**Status**: ${result.status}\n**Task ID**: \`${taskId}\`\n\nStill processing. Poll again in 10-15 seconds.`,
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: 'text',
                text: `**Error checking async research**: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'list_models': {
        const modelGuide = `## Perplexity Sonar Models — Selection Guide

**Binary decision:**

| Question | Model |
|----------|-------|
| Is this exhaustive, report-style research? | sonar-deep-research |
| Everything else | sonar-reasoning-pro |

---

### sonar-reasoning-pro (DEFAULT)
**Best for**: Analysis, reasoning, debugging, comparisons, most queries
- Shows reasoning process (think traces) for transparency
- Mandatory for RCA/debugging (causal reasoning required)
- $2/1M input, $8/1M output, + search context cost

### sonar-deep-research
**Best for**: Exhaustive research, comprehensive reports, due diligence
- Runs ~30 searches, processes hundreds of sources
- 128K token context
- Use async_deep_research for queries that may take >60 seconds
- $2/1M input, $8/1M output, + reasoning/citation/search costs

### sonar-pro
**Best for**: Multi-source research when reasoning traces aren't needed
- 2x more citations than sonar
- Good for fact-checking and technical docs

### sonar
**Best for**: Simple factual lookups, current events, definitions
- Fastest and cheapest
- Limited depth

---

**Search context size**: All tools default to \`"high"\` for maximum source material.
Cost: $6/$10/$14 per 1K requests for low/medium/high.

**Search modes**: Auto-detected per query:
- \`web\` — default for most queries
- \`academic\` — studies, papers, scientific claims
- \`sec\` — companies, filings, financial data`;

        return {
          content: [{ type: 'text', text: modelGuide }],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Perplexity Intelligent MCP server running');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
