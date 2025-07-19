#!/usr/bin/env node

/**
 * Custom MCP Server for Chess Operations
 * Provides chess-specific tools for the Spress Chess application
 */

const { Chess } = require('chess.js');
const fs = require('fs').promises;
const path = require('path');

class ChessMCPServer {
  constructor() {
    this.chess = new Chess();
    this.gameHistory = [];
  }

  // Initialize the MCP server
  async initialize() {
    console.log('Chess MCP Server initialized');
    
    // Set up stdin/stdout for MCP communication
    process.stdin.setEncoding('utf8');
    process.stdout.setEncoding('utf8');
    
    // Handle MCP protocol messages
    process.stdin.on('data', async (data) => {
      try {
        const message = JSON.parse(data);
        const response = await this.handleMessage(message);
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (error) {
        console.error('Error handling MCP message:', error);
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          }
        }) + '\n');
      }
    });
  }

  async handleMessage(message) {
    const { method, params, id } = message;

    switch (method) {
      case 'initialize':
        return this.handleInitialize(params, id);
      case 'tools/list':
        return this.handleToolsList(id);
      case 'tools/call':
        return this.handleToolCall(params, id);
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };
    }
  }

  handleInitialize(params, id) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'chess-mcp-server',
          version: '1.0.0'
        }
      }
    };
  }

  handleToolsList(id) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'analyze_position',
            description: 'Analyze a chess position and provide insights',
            inputSchema: {
              type: 'object',
              properties: {
                fen: {
                  type: 'string',
                  description: 'FEN string of the position to analyze'
                }
              },
              required: ['fen']
            }
          },
          {
            name: 'validate_move',
            description: 'Validate if a move is legal in a given position',
            inputSchema: {
              type: 'object',
              properties: {
                fen: {
                  type: 'string',
                  description: 'FEN string of the current position'
                },
                move: {
                  type: 'string',
                  description: 'Move in algebraic notation (e.g., e4, Nf3)'
                }
              },
              required: ['fen', 'move']
            }
          },
          {
            name: 'get_game_insights',
            description: 'Get insights about a chess game from move history',
            inputSchema: {
              type: 'object',
              properties: {
                moves: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of moves in algebraic notation'
                }
              },
              required: ['moves']
            }
          },
          {
            name: 'calculate_elo_change',
            description: 'Calculate ELO rating change for a game result',
            inputSchema: {
              type: 'object',
              properties: {
                playerRating: {
                  type: 'number',
                  description: 'Current player rating'
                },
                opponentRating: {
                  type: 'number',
                  description: 'Opponent rating'
                },
                result: {
                  type: 'string',
                  enum: ['win', 'loss', 'draw'],
                  description: 'Game result'
                },
                kFactor: {
                  type: 'number',
                  default: 32,
                  description: 'K-factor for rating calculation'
                }
              },
              required: ['playerRating', 'opponentRating', 'result']
            }
          },
          {
            name: 'get_opening_suggestions',
            description: 'Get opening suggestions based on current position',
            inputSchema: {
              type: 'object',
              properties: {
                fen: {
                  type: 'string',
                  description: 'FEN string of the current position'
                },
                moveNumber: {
                  type: 'number',
                  description: 'Current move number'
                }
              },
              required: ['fen']
            }
          }
        ]
      }
    };
  }

  async handleToolCall(params, id) {
    const { name, arguments: args } = params;

    try {
      let result;
      switch (name) {
        case 'analyze_position':
          result = await this.analyzePosition(args.fen);
          break;
        case 'validate_move':
          result = await this.validateMove(args.fen, args.move);
          break;
        case 'get_game_insights':
          result = await this.getGameInsights(args.moves);
          break;
        case 'calculate_elo_change':
          result = await this.calculateEloChange(args);
          break;
        case 'get_opening_suggestions':
          result = await this.getOpeningSuggestions(args.fen, args.moveNumber);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error.message
        }
      };
    }
  }

  async analyzePosition(fen) {
    const chess = new Chess(fen);
    
    const analysis = {
      position: fen,
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      isStalemate: chess.isStalemate(),
      isGameOver: chess.isGameOver(),
      turn: chess.turn(),
      moveNumber: chess.moveNumber(),
      legalMoves: chess.moves(),
      materialCount: this.calculateMaterialCount(chess),
      positionEvaluation: this.evaluatePosition(chess)
    };

    return analysis;
  }

  async validateMove(fen, move) {
    const chess = new Chess(fen);
    
    try {
      const result = chess.move(move);
      return {
        isValid: true,
        move: result,
        newFen: chess.fen(),
        isCheck: chess.isCheck(),
        isCheckmate: chess.isCheckmate(),
        isDraw: chess.isDraw()
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        legalMoves: chess.moves()
      };
    }
  }

  async getGameInsights(moves) {
    const chess = new Chess();
    const insights = {
      totalMoves: moves.length,
      opening: this.identifyOpening(moves),
      tactics: this.analyzeTactics(moves),
      timeControl: this.estimateTimeControl(moves),
      complexity: this.assessComplexity(moves)
    };

    return insights;
  }

  async calculateEloChange({ playerRating, opponentRating, result, kFactor = 32 }) {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    
    let actualScore;
    switch (result) {
      case 'win':
        actualScore = 1;
        break;
      case 'loss':
        actualScore = 0;
        break;
      case 'draw':
        actualScore = 0.5;
        break;
      default:
        throw new Error('Invalid result. Must be win, loss, or draw.');
    }

    const ratingChange = Math.round(kFactor * (actualScore - expectedScore));
    
    return {
      playerRating,
      opponentRating,
      result,
      expectedScore: Math.round(expectedScore * 100) / 100,
      actualScore,
      ratingChange,
      newRating: playerRating + ratingChange
    };
  }

  async getOpeningSuggestions(fen, moveNumber = 1) {
    // Common opening moves database
    const openings = {
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': [
        { move: 'e4', name: 'King\'s Pawn Opening', description: 'Controls center, opens lines for bishop and queen' },
        { move: 'd4', name: 'Queen\'s Pawn Opening', description: 'Controls center, prepares for queen-side development' },
        { move: 'Nf3', name: 'Reti Opening', description: 'Flexible development, doesn\'t commit to pawn structure' },
        { move: 'c4', name: 'English Opening', description: 'Controls d5 square, prepares for fianchetto' }
      ]
    };

    const suggestions = openings[fen] || [
      { move: 'N/A', name: 'Position not in database', description: 'Consider standard development principles' }
    ];

    return {
      position: fen,
      moveNumber,
      suggestions,
      principles: [
        'Control the center',
        'Develop pieces early',
        'Castle for king safety',
        'Connect rooks',
        'Avoid moving the same piece twice in opening'
      ]
    };
  }

  calculateMaterialCount(chess) {
    const fen = chess.fen().split(' ')[0];
    const pieces = {
      'P': 0, 'N': 0, 'B': 0, 'R': 0, 'Q': 0, 'K': 0,
      'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0, 'k': 0
    };

    for (const char of fen) {
      if (pieces.hasOwnProperty(char)) {
        pieces[char]++;
      }
    }

    return {
      white: {
        pawns: pieces['P'],
        knights: pieces['N'],
        bishops: pieces['B'],
        rooks: pieces['R'],
        queens: pieces['Q'],
        kings: pieces['K'],
        total: pieces['P'] + pieces['N'] + pieces['B'] + pieces['R'] + pieces['Q'] + pieces['K']
      },
      black: {
        pawns: pieces['p'],
        knights: pieces['n'],
        bishops: pieces['b'],
        rooks: pieces['r'],
        queens: pieces['q'],
        kings: pieces['k'],
        total: pieces['p'] + pieces['n'] + pieces['b'] + pieces['r'] + pieces['q'] + pieces['k']
      }
    };
  }

  evaluatePosition(chess) {
    // Simple material-based evaluation
    const material = this.calculateMaterialCount(chess);
    const materialAdvantage = material.white.total - material.black.total;
    
    let evaluation = 'equal';
    if (materialAdvantage > 2) evaluation = 'white advantage';
    else if (materialAdvantage < -2) evaluation = 'black advantage';
    else if (materialAdvantage > 0) evaluation = 'slight white advantage';
    else if (materialAdvantage < 0) evaluation = 'slight black advantage';

    return {
      materialAdvantage,
      evaluation,
      details: {
        pawnAdvantage: material.white.pawns - material.black.pawns,
        pieceAdvantage: (material.white.total - material.white.pawns) - (material.black.total - material.black.pawns)
      }
    };
  }

  identifyOpening(moves) {
    if (moves.length === 0) return 'Starting position';
    
    const firstMoves = moves.slice(0, Math.min(4, moves.length)).join(' ');
    
    const openingMap = {
      'e4 e5': 'Open Game',
      'e4 c5': 'Sicilian Defense',
      'e4 e6': 'French Defense',
      'e4 c6': 'Caro-Kann Defense',
      'd4 d5': 'Closed Game',
      'd4 Nf6': 'Indian Defense',
      'Nf3 d5': 'Reti Opening',
      'c4 e5': 'English Opening'
    };

    return openingMap[firstMoves] || 'Unknown opening';
  }

  analyzeTactics(moves) {
    return {
      captures: moves.filter(move => move.includes('x')).length,
      checks: moves.filter(move => move.includes('+')).length,
      castles: moves.filter(move => move.includes('O-O')).length,
      enPassant: moves.filter(move => move.includes('e.p.')).length
    };
  }

  estimateTimeControl(moves) {
    const avgMovesPerMinute = 2; // Conservative estimate
    const estimatedMinutes = Math.ceil(moves.length / avgMovesPerMinute);
    
    if (estimatedMinutes < 5) return 'Blitz';
    if (estimatedMinutes < 15) return 'Rapid';
    return 'Classical';
  }

  assessComplexity(moves) {
    const captures = moves.filter(move => move.includes('x')).length;
    const checks = moves.filter(move => move.includes('+')).length;
    const complexity = captures + checks * 0.5;
    
    if (complexity < 2) return 'Quiet';
    if (complexity < 5) return 'Moderate';
    return 'Tactical';
  }
}

// Start the server
const server = new ChessMCPServer();
server.initialize().catch(console.error); 