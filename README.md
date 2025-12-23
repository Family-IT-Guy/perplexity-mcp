# Perplexity Intelligent MCP Server

An intelligent Perplexity research MCP server for Claude Desktop with automatic model selection, multi-model synthesis, and persistent research history.

## Features

- **Intelligent Model Selection**: Auto-picks the right Perplexity model based on your query
- **Research History**: Saves all research to `~/Documents/Perplexity Research/`
- **Multi-Model Synthesis**: Combines multiple models for comprehensive research
- **Search History**: Search past research to avoid duplicate queries
- **Built-in Citations**: Every response includes sources and references

## Quick Setup

### Prerequisites

- Node.js 18+ ([download](https://nodejs.org/))
- Claude Desktop
- Perplexity API key (get one at [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api))

### Configure Claude Desktop

Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "perplexity-research": {
      "command": "npx",
      "args": ["-y", "@familyitguy/perplexity-mcp"],
      "env": {
        "PERPLEXITY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Replace `your-api-key-here` with your Perplexity API key.

### Restart Claude Desktop

Quit completely (Cmd+Q) and reopen. You're done!

## Available Tools

### `research`
Intelligent Perplexity search with auto-logging.

```
Use: "Research the current state of AI in healthcare"
```

### `deep_research`
Multi-model synthesis for comprehensive research.

```
Use: "Do a deep research on renewable energy trends"
```

### `search_research`
Search past research for existing findings.

```
Use: "Search my research for React performance"
```

### `list_research_threads`
List all saved research threads.

### `read_research_thread`
Read a specific past research thread.

### `list_models`
Show available Perplexity models and when to use each.

## Models

| Model | Best For |
|-------|----------|
| sonar | Simple factual lookups, current events |
| sonar-pro | Multi-source research, fact-checking |
| sonar-reasoning-pro | Why/how questions, complex analysis (default) |
| sonar-deep-research | Exhaustive research, comprehensive reports |

## Research Storage

All research is automatically saved to:
```
~/Documents/Perplexity Research/
├── topic-name-2025-01-15.md
├── another-topic-2025-01-16.md
└── ...
```

You can browse your research history in Finder anytime.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PERPLEXITY_API_KEY` | Your Perplexity API key | Required |
| `PERPLEXITY_RESEARCH_DIR` | Custom research directory | `~/Documents/Perplexity Research/` |

## License

MIT
