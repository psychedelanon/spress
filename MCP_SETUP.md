# MCP (Model Context Protocol) Setup Guide

This guide explains the MCP servers configured for the Spress Chess application and how to use them effectively.

## 🚀 Configured MCP Servers

### 1. Sequential Thinking Server
- **Purpose**: Enables dynamic, reflective problem-solving through thought sequences
- **Usage**: The AI can break complex tasks into steps, plan solutions, and iterate
- **Example**: "Plan a new chess feature, implement it step by step, then test"

### 2. Git Server
- **Purpose**: Repository awareness and version control operations
- **Capabilities**: 
  - Search code across the repository
  - View git history and diffs
  - Run git operations from the IDE
- **Example**: "Find all files that use chess.js", "Show recent changes to the game logic"

### 3. Filesystem Server
- **Purpose**: Safe file I/O operations within the project
- **Capabilities**:
  - Read and write files safely
  - Navigate project structure
  - Search for specific content
- **Example**: "Create a new component", "Update the database schema"

### 4. Memory Server
- **Purpose**: Persistent context across development sessions
- **Location**: `.cursor/memory/`
- **Capabilities**:
  - Store important decisions and patterns
  - Remember previous solutions
  - Maintain coding style consistency
- **Example**: "Remember how we implemented the ELO rating system"

### 5. Docs Server
- **Purpose**: Access to up-to-date documentation
- **Sources**:
  - React documentation
  - TypeScript documentation
  - Chess.js library docs
  - Socket.io documentation
  - Telegraf.js documentation
- **Example**: "Show me the latest React hooks API", "How do I use chess.js move validation?"

### 6. Database Server
- **Purpose**: SQLite database operations
- **Database**: `./data/chess.db`
- **Capabilities**:
  - Query game data
  - View schema information
  - Execute read-only operations
- **Example**: "Show me the top 10 players by rating", "What's the average game duration?"

## 🎯 How to Use MCP Servers

### In Cursor Chat
1. **Automatic Usage**: The AI will automatically use relevant MCP tools when needed
2. **Explicit Requests**: You can ask the AI to use specific tools:
   - "Use the git server to find all chess-related files"
   - "Search the docs for React state management patterns"
   - "Query the database for player statistics"

### Available Tools
When MCP servers are active, you'll see these tools in the chat sidebar:
- `sequential_think` - Break down complex problems
- `git_search` - Search repository content
- `read_file` / `write_file` - File operations
- `memory_store` / `memory_retrieve` - Persistent memory
- `docs_search` - Documentation lookup
- `sqlite_query` - Database operations

## 🔧 Custom MCP Tools for Chess

### Chess-Specific Memory Patterns
Store these patterns in memory for consistent development:

```json
{
  "chess_patterns": {
    "game_state_management": "Use chess.js for game logic, store in Zustand for React state",
    "move_validation": "Always validate moves with chess.js before applying",
    "rating_calculation": "ELO rating updates use the standard formula with K=32",
    "telegram_integration": "Use Telegraf.js for bot commands, maintain session state"
  }
}
```

### Database Schema Awareness
The AI can query your chess database to understand:
- Player profiles and ratings
- Game history and statistics
- Tournament data
- Performance metrics

## 🛠️ Troubleshooting

### Server Not Responding
1. Check Cursor's Output panel → MCP logs
2. Verify the server packages are available via npx
3. Restart Cursor to reload MCP configuration

### Memory Issues
- Memory files are stored in `.cursor/memory/`
- Clear memory by deleting files in this directory
- Memory is project-specific

### Database Access
- Ensure the database file exists at `./data/chess.db`
- The AI can only perform read operations for safety
- Schema changes should be done manually

## 📈 Best Practices

### 1. Leverage Sequential Thinking
For complex features, ask the AI to:
1. Plan the implementation
2. Break it into steps
3. Execute each step
4. Verify the result

### 2. Use Memory for Consistency
Store important decisions about:
- Code architecture patterns
- API design choices
- Testing strategies
- Performance optimizations

### 3. Combine Multiple Servers
- Use docs server for API references
- Use git server to understand existing code
- Use memory server to maintain consistency
- Use database server to understand data flow

### 4. Project-Specific Context
The AI now has access to:
- Your chess game logic and rules
- Telegram bot integration patterns
- React component structure
- Database schema and relationships

## 🎮 Chess-Specific MCP Workflows

### Adding New Features
1. **Plan**: Use sequential thinking to break down the feature
2. **Research**: Use docs server for library references
3. **Implement**: Use filesystem server to create/modify files
4. **Test**: Use git server to understand existing tests
5. **Document**: Store patterns in memory for future reference

### Debugging Issues
1. **Analyze**: Use git server to understand recent changes
2. **Investigate**: Use database server to check data integrity
3. **Research**: Use docs server for error patterns
4. **Fix**: Use filesystem server to apply changes
5. **Verify**: Use sequential thinking to test the fix

### Performance Optimization
1. **Profile**: Use database server to analyze usage patterns
2. **Research**: Use docs server for optimization techniques
3. **Implement**: Use filesystem server to apply optimizations
4. **Monitor**: Use memory server to track performance metrics

## 🔄 Updating MCP Configuration

To add new MCP servers or modify existing ones:

1. Edit `.cursor/mcp.json`
2. Add new server configuration
3. Restart Cursor
4. Test the new server functionality

Example adding a new server:
```json
{
  "mcpServers": {
    "new-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-new-server"],
      "env": {
        "CUSTOM_VAR": "value"
      }
    }
  }
}
```

## 📚 Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Cursor MCP Guide](https://cursor.sh/docs/mcp)
- [Anthropic MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Community MCP Servers](https://github.com/modelcontextprotocol/servers-community)

---

This MCP setup transforms your development experience by giving the AI comprehensive context about your chess application, enabling more intelligent and consistent assistance across all aspects of development. 