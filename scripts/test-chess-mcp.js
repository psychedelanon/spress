#!/usr/bin/env node

/**
 * Test script for Chess MCP Server
 * Verifies that the server responds correctly to MCP protocol messages
 */

const { spawn } = require('child_process');
const path = require('path');

async function testChessMCPServer() {
  console.log('🧪 Testing Chess MCP Server...\n');

  const serverPath = path.join(__dirname, 'chess-mcp-server.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  let errorOutput = '';

  server.stdout.on('data', (data) => {
    output += data.toString();
  });

  server.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  // Test messages
  const testMessages = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'analyze_position',
        arguments: {
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        }
      }
    }
  ];

  // Send test messages
  for (const message of testMessages) {
    server.stdin.write(JSON.stringify(message) + '\n');
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between messages
  }

  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Close the server
  server.stdin.end();
  server.kill();

  // Parse and display results
  const responses = output.trim().split('\n').filter(line => line.trim());
  
  console.log('📤 Sent messages:');
  testMessages.forEach((msg, i) => {
    console.log(`${i + 1}. ${msg.method}`);
  });

  console.log('\n📥 Received responses:');
  responses.forEach((response, i) => {
    try {
      const parsed = JSON.parse(response);
      console.log(`${i + 1}. ${parsed.method || 'response'} - ${parsed.result ? '✅ Success' : '❌ Error'}`);
      
      if (parsed.result && parsed.result.tools) {
        console.log(`   Available tools: ${parsed.result.tools.map(t => t.name).join(', ')}`);
      }
    } catch (e) {
      console.log(`${i + 1}. Invalid JSON response`);
    }
  });

  if (errorOutput) {
    console.log('\n❌ Errors:');
    console.log(errorOutput);
  }

  console.log('\n🎯 Test completed!');
  console.log('If you see "Success" responses above, the Chess MCP Server is working correctly.');
}

testChessMCPServer().catch(console.error); 