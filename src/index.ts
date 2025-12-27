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
import { PerplexityModel, SynthesisResult } from './types.js';

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
        domain_filter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter results by domain (max 10). Prefix with - to exclude. Examples: ["docs.python.org", "github.com"] or ["-reddit.com", "-quora.com"]',
        },
        return_related_questions: {
          type: 'boolean',
          description: 'Include suggested follow-up questions in response. Default: false',
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

        // Build search options
        const searchOptions: Record<string, unknown> = {
          messages: [{ role: 'system', content: SYSTEM_PROMPTS[context] }],
        };
        if (recency) {
          searchOptions.search_recency_filter = recency;
        }
        if (domainFilter && domainFilter.length > 0) {
          searchOptions.search_domain_filter = domainFilter;
        }
        if (returnRelatedQuestions) {
          searchOptions.return_related_questions = true;
        }

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

        // Auto-select pattern if not specified
        let patternRationale: string;
        if (!pattern) {
          pattern = recommendPattern(query);
          patternRationale = `auto-selected ${pattern} pattern based on query analysis`;
        } else {
          patternRationale = `user-specified ${pattern} pattern`;
        }

        // Execute synthesis with error handling
        let result;
        try {
          result = await synthesizer.synthesize(query, pattern);
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

      case 'list_models': {
        const modelGuide = `## Perplexity Sonar Models

### sonar
**Best for**: Simple factual lookups, current events, definitions
- "What is the current Bitcoin price?"
- "Who won the game last night?"
- "What is quantum entanglement?"

### sonar-pro
**Best for**: Multi-source research, fact-checking, technical docs
- "Compare React vs Vue for enterprise apps"
- "What are the key findings from recent climate reports?"
- 2x more citations than sonar

### sonar-reasoning-pro (DEFAULT)
**Best for**: Why/how questions, complex analysis, debugging, trade-offs
- "Why did the 2008 financial crisis happen?"
- "Evaluate microservices vs monolith for a small team"
- Shows reasoning process for transparency

### sonar-deep-research
**Best for**: Exhaustive research, reports, due diligence
- "Comprehensive analysis of the EV market through 2030"
- Runs ~30 searches, processes hundreds of sources
- 128K token context

---

**Selection guidance**:
- Default to sonar-reasoning-pro unless query is trivially simple
- Use sonar-deep-research for comprehensive reports
- For critical decisions, use deep_research with multi-model synthesis`;

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
