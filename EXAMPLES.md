# Usage Examples

This document provides examples of how to use the Perplexity MCP tools with Claude Desktop.

## perplexity_ask

The `perplexity_ask` tool allows you to send a single question to Perplexity AI and get a response.

### Basic Example

In Claude Desktop, try prompts like:

```
Please use Perplexity to answer: What is the current population of Tokyo?
```

Claude will respond with something like:

```
I'll use Perplexity to look that up for you.

According to Perplexity, the current population of Tokyo is approximately 14 million in the city proper, while the greater Tokyo metropolitan area has around 37 million inhabitants, making it the most populous metropolitan area in the world.
```

### With Custom Model

You can specify a different model:

```
Please use Perplexity with the model "llama-3.1-8b-instant" to answer: What are the main features of TypeScript?
```

## perplexity_chat

The `perplexity_chat` tool allows for multi-turn conversations with Perplexity AI.

### Basic Conversation

Ask Claude to start a conversation with Perplexity:

```
Please use Perplexity to have a 3-turn conversation about quantum computing. 
First, ask what quantum computing is. 
Then ask about quantum supremacy. 
Finally, ask about practical applications today.
```

Claude will use the chat API to maintain context across multiple turns.

### With System Prompt

For more control over the conversation, you can have Claude use a system prompt:

```
Please use Perplexity chat with a system prompt instructing it to explain concepts to a high school student, and then ask about nuclear fusion.
```

Claude might construct a messages array like:
```json
[
  {
    "role": "system",
    "content": "You are an educational assistant explaining complex topics to high school students. Use simple language and relevant analogies."
  },
  {
    "role": "user",
    "content": "What is nuclear fusion and how does it work?"
  }
]
```

## Advanced Usage

### Combining with Other Claude Capabilities

You can have Claude process or analyze Perplexity's responses:

```
Please use Perplexity to research the latest developments in renewable energy, then create a summary table of the key points.
```

### Comparing Different Models

You can compare responses from different models:

```
Please use Perplexity to answer "What is the future of artificial intelligence?" twice - once with the default model and once with "llama-3.1-70b-versatile". Then compare and contrast the responses.
```

## Tips for Best Results

1. **Be specific in your queries** - The more specific your request, the better the response.

2. **Use appropriate models** for your needs:
   - `llama-3.1-sonar-small-128k-online` - Great for factual questions requiring web search
   - `mixtral-8x7b-instruct` - Good for general-purpose chat
   - `llama-3.1-70b-versatile` - Stronger reasoning capabilities
   - `llama-3.1-8b-instant` - Faster responses

3. **For complex topics**, breaking down into multiple questions often yields better results than a single complex query.

4. **For web research**, the `perplexity_ask` tool with the default model generally works best as it includes online search capability.