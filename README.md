# Perplexity MCP Server

A custom [Model Context Protocol (MCP)](https://github.com/anthropics/model-context-protocol) implementation that adds Perplexity AI as a tool provider for Claude Desktop.

## Features

- Seamless integration with Claude Desktop through MCP
- Access to Perplexity's powerful AI models
- Support for both single questions and multi-turn conversations
- Customizable model selection

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Claude Desktop](https://claude.ai/desktop) (latest version)
- [Perplexity API key](https://www.perplexity.ai/settings/api)

### Option 1: Clone and Run Locally

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/perplexity-mcp.git
   cd perplexity-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your API key:
   ```
   PERPLEXITY_API_KEY=your_api_key_here
   ```

4. Test the server:
   ```bash
   node server.js
   ```

### Option 2: Install Globally

1. Clone and navigate to the repository as above

2. Install globally:
   ```bash
   npm install -g .
   ```

3. Now you can run the server from anywhere:
   ```bash
   perplexity-mcp
   ```

## Claude Desktop Configuration

Add this configuration to your `claude_desktop_config.json` file:

### Standard Configuration
```json
{
  "mcpServers": {
    "perplexity": {
      "command": "node",
      "args": [
        "/absolute/path/to/perplexity-mcp/server.js"
      ],
      "env": {
        "PERPLEXITY_API_KEY": "your_perplexity_api_key"
      }
    }
  }
}
```

### Global Installation Configuration
```json
{
  "mcpServers": {
    "perplexity": {
      "command": "npx",
      "args": [
        "perplexity-mcp"
      ],
      "env": {
        "PERPLEXITY_API_KEY": "your_perplexity_api_key"
      }
    }
  }
}
```

### NVM Users
If you're using Node Version Manager (NVM), you need absolute paths:
```json
{
  "mcpServers": {
    "perplexity": {
      "command": "/Users/username/.nvm/versions/node/v16.x.x/bin/node",
      "args": [
        "/Users/username/path/to/perplexity-mcp/server.js"
      ],
      "env": {
        "PERPLEXITY_API_KEY": "your_perplexity_api_key"
      }
    }
  }
}
```

## Available Tools

Once configured, Claude will have access to these tools:

1. **perplexity_ask** - Send a single question to Perplexity
   - Parameters: 
     - `query` (required): The question to ask
     - `model` (optional): Model name (default: `llama-3.1-sonar-small-128k-online`)

2. **perplexity_chat** - Have a multi-turn conversation
   - Parameters:
     - `messages` (required): Array of conversation messages
     - `model` (optional): Model name (default: `mixtral-8x7b-instruct`)

## Troubleshooting

- Check logs: `cat ~/.claude/logs/perplexity.log`
- Ensure your API key is valid
- Verify your claude_desktop_config.json format
- Enable verbose logging by adding `"DEBUG": "1"` to the env section

## How It Works

This implementation uses the Model Context Protocol (MCP) created by Anthropic to extend Claude Desktop's capabilities. It:

1. Creates an MCP server that communicates with Claude via stdio
2. Registers Perplexity tools with Claude
3. Proxies requests from Claude to the Perplexity API
4. Returns responses back to Claude for display

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License - see the LICENSE file for details.