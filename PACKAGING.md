# Packaging Guide for Contributors

This document explains how to package and distribute the Perplexity MCP server to others.

## Creating a Distribution Package

### 1. Clean Up the Project

Remove unnecessary files:
- Remove any personal configuration files
- Delete the `.env` file if it contains your API key
- Clean up the `node_modules` directory (it will be reinstalled by users)

### 2. Package the Project

#### Option A: GitHub Repository

1. Create a GitHub repository and push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/Family-IT-Guy/perplexity-mcp.git
   git push -u origin main
   ```

2. In your README.md, provide clone instructions pointing to your repository.

#### Option B: Create a ZIP file

1. Clean the project:
   ```bash
   rm -rf node_modules
   rm -f .env
   ```

2. Create a ZIP archive:
   ```bash
   zip -r perplexity-mcp.zip .
   ```

3. Share this ZIP file with users.

#### Option C: Publish to npm (advanced)

1. Update package.json with appropriate metadata
2. Publish the package:
   ```bash
   npm publish
   ```

## Distribution Checklist

Ensure your package includes:

- [ ] README.md with installation and usage instructions
- [ ] server.js - the main MCP server implementation
- [ ] package.json with correct dependencies
- [ ] CLAUDE.md with detailed configuration instructions
- [ ] Example .env file (without real API keys)
- [ ] License file

## User Setup Instructions

Provide these instructions to your users:

1. Install Node.js (v16 or higher)
2. Get a Perplexity API key from https://www.perplexity.ai/settings/api
3. Install your package using one of these methods:
   - Git clone (if hosted on GitHub)
   - Download and extract ZIP
   - npm install (if published)
4. Run `npm install` to install dependencies
5. Create a `.env` file with their API key
6. Configure Claude Desktop (refer to README.md or CLAUDE.md for details)
7. Test the implementation with Claude Desktop

## Common Issues

Prepare users for these common issues:

1. **API Key Problems**
   - Remind users to keep their API key secure
   - API keys might have rate limits or usage quotas

2. **Node.js Version Issues**
   - Users should check their Node.js version with `node -v`
   - If using NVM, they need absolute paths as described in CLAUDE.md

3. **Permission Problems**
   - Server.js needs executable permission: `chmod +x server.js`

4. **Claude Desktop Configuration**
   - Common configuration issues include missing absolute paths
   - JSON syntax errors in the config file

5. **Error Logs**
   - Instruct users how to check logs: `cat ~/.claude/logs/perplexity.log`
   - Explain how to interpret common error messages
