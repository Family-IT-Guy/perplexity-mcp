#!/usr/bin/env node
// Simple Perplexity MCP Server
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import dotenv from 'dotenv';
import fetch from 'isomorphic-fetch';

console.error("Starting Perplexity MCP Server...");

// Load API key from .env file or environment
dotenv.config();
const API_KEY = process.env.PERPLEXITY_API_KEY;

if (!API_KEY) {
  console.error('Error: PERPLEXITY_API_KEY environment variable is required');
  process.exit(1);
}

console.error("API key found, initializing server...");

// Create MCP server
const server = new Server({
  name: "perplexity-mcp-server",
  version: "0.1.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Define tools
const tools = [
  {
    name: 'perplexity_ask',
    description: 'Send a simple query to Perplexity AI',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question to ask' },
        model: { type: 'string', description: 'Optional model name' }
      },
      required: ['query']
    }
  },
  {
    name: 'perplexity_chat',
    description: 'Have a multi-turn conversation with Perplexity AI',
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['system', 'user', 'assistant'] },
              content: { type: 'string' }
            }
          }
        },
        model: { type: 'string', description: 'Optional model name' }
      },
      required: ['messages']
    }
  }
];

// List available tools
console.error("Setting up listTools handler...");
server.setRequestHandler(
  ListToolsRequestSchema, 
  async () => {
    console.error("Listing tools...");
    return {
      tools: tools.map(({ name, description, inputSchema }) => ({
        name, description, inputSchema
      }))
    };
  }
);

// Handle tool calls
console.error("Setting up callTool handler...");
server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    console.error(`Got tool call request: ${JSON.stringify(request.params)}`);
    try {
      const { name, arguments: args } = request.params;
      
      if (name === 'perplexity_ask') {
        console.error(`Running perplexity_ask with query: ${args.query}`);
        const messages = [{ role: 'user', content: args.query }];
        const model = args.model || 'llama-3.1-sonar-small-128k-online';
        
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
          },
          body: JSON.stringify({ model, messages })
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.error("Got response from Perplexity API");
        return {
          content: [{ 
            type: 'text', 
            text: data.choices[0].message.content 
          }]
        };
      }
      
      else if (name === 'perplexity_chat') {
        console.error(`Running perplexity_chat with ${args.messages?.length || 0} messages`);
        const model = args.model || 'mixtral-8x7b-instruct';
        
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
          },
          body: JSON.stringify({ 
            model, 
            messages: args.messages 
          })
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.error("Got response from Perplexity API");
        return {
          content: [{ 
            type: 'text', 
            text: data.choices[0].message.content 
          }]
        };
      }
      
      else {
        console.error(`Unknown tool: ${name}`);
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
      }
    } 
    catch (error) {
      console.error(`Error in tool call: ${error.message}`);
      return {
        content: [{ 
          type: 'text', 
          text: `Error: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Set up error handling
server.onerror = (error) => {
  console.error("[Error]", error);
};

// Start the server
console.error("Connecting server transport...");
const transport = new StdioServerTransport();
server.connect(transport).catch(error => {
  console.error("Failed to connect transport:", error);
});
console.error("Perplexity MCP Server running...");