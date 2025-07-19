# MCP Setup Script for Spress Chess (PowerShell)
# This script installs dependencies and tests the MCP servers

Write-Host "🚀 Setting up MCP servers for Spress Chess..." -ForegroundColor Green

# Install chess.js dependency for the custom chess MCP server
Write-Host "📦 Installing chess.js dependency..." -ForegroundColor Yellow
npm install chess.js

# Test the chess MCP server
Write-Host "🧪 Testing Chess MCP Server..." -ForegroundColor Yellow
node test-chess-mcp.js

Write-Host ""
Write-Host "✅ MCP setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Restart Cursor to load the new MCP configuration"
Write-Host "2. Check Cursor's Output panel → MCP logs to ensure all servers are running"
Write-Host "3. Try these commands in Cursor chat:"
Write-Host "   - 'Use the chess server to analyze the starting position'"
Write-Host "   - 'Search the docs for React state management patterns'"
Write-Host "   - 'Find all files that use the chess.js library'"
Write-Host ""
Write-Host "📚 For more information, see README_MCP.md" -ForegroundColor Cyan 