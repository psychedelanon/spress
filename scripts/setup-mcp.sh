#!/bin/bash

# MCP Setup Script for Spress Chess
# This script installs dependencies and tests the MCP servers

echo "🚀 Setting up MCP servers for Spress Chess..."

# Install chess.js dependency for the custom chess MCP server
echo "📦 Installing chess.js dependency..."
npm install chess.js

# Test the chess MCP server
echo "🧪 Testing Chess MCP Server..."
node test-chess-mcp.js

echo ""
echo "✅ MCP setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Restart Cursor to load the new MCP configuration"
echo "2. Check Cursor's Output panel → MCP logs to ensure all servers are running"
echo "3. Try these commands in Cursor chat:"
echo "   - 'Use the chess server to analyze the starting position'"
echo "   - 'Search the docs for React state management patterns'"
echo "   - 'Find all files that use the chess.js library'"
echo ""
echo "📚 For more information, see README_MCP.md" 