import { Chess } from 'chess.js';

// Placeholder AI engine - will be implemented later
let engine: any = null;

// Piece values for evaluation
const PIECE_VALUES = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,  // Black pieces
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0   // White pieces
};

// Position value tables (simplified)
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

// Evaluate board position
function evaluatePosition(chess: Chess): number {
  const board = chess.board();
  let score = 0;

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (!piece) continue;

      const pieceValue = PIECE_VALUES[piece.type as keyof typeof PIECE_VALUES];
      const isWhite = piece.color === 'w';
      const position = i * 8 + j;
      
      let positionalValue = 0;
      if (piece.type === 'p') {
        positionalValue = PAWN_TABLE[isWhite ? position : 63 - position];
      } else if (piece.type === 'n') {
        positionalValue = KNIGHT_TABLE[isWhite ? position : 63 - position];
      }

      const totalValue = (pieceValue * 100 + positionalValue) * (isWhite ? 1 : -1);
      score += totalValue;
    }
  }

  // Add bonuses for tactical advantages
  if (chess.inCheck()) {
    score += chess.turn() === 'w' ? -50 : 50; // Being in check is bad
  }

  // Mobility bonus (more moves = better position)
  const moves = chess.moves();
  score += moves.length * (chess.turn() === 'w' ? 1 : -1);

  return score;
}

// Simple minimax search
function minimax(chess: Chess, depth: number, maximizingPlayer: boolean, alpha: number = -Infinity, beta: number = Infinity): number {
  if (depth === 0 || chess.isGameOver()) {
    return evaluatePosition(chess);
  }

  const moves = chess.moves();
  
  if (maximizingPlayer) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const evaluation = minimax(chess, depth - 1, false, alpha, beta);
      chess.undo();
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // Alpha-beta pruning
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const evaluation = minimax(chess, depth - 1, true, alpha, beta);
      chess.undo();
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break; // Alpha-beta pruning
    }
    return minEval;
  }
}

// Initialize AI engine
export async function initAI() {
  console.log('🤖 AI engine initialized with basic evaluation');
  return Promise.resolve(true);
}

// Get best move from AI for given position
export async function bestMove(fen: string, depth: number = 3): Promise<string> {
  const chess = new Chess(fen);
  const moves = chess.moves();
  
  if (moves.length === 0) {
    throw new Error('No legal moves available');
  }

  // Simple opening book
  if (chess.history().length < 6) {
    const openingMoves = ['e2e4', 'd2d4', 'g1f3', 'c2c4'];
    const availableOpening = openingMoves.find(move => {
      try {
        const testMove = chess.move(move);
        if (testMove) {
          chess.undo();
          return true;
        }
      } catch {
        return false;
      }
      return false;
    });
    
    if (availableOpening) {
      console.log(`🎯 AI chose opening move: ${availableOpening}`);
      return availableOpening;
    }
  }

  let bestMove = moves[0];
  let bestValue = chess.turn() === 'w' ? -Infinity : Infinity;

  console.log(`🤖 AI thinking... evaluating ${moves.length} moves at depth ${depth}`);

  for (const move of moves) {
    const moveObj = chess.move(move);
    if (!moveObj) continue;

    const boardValue = minimax(chess, depth - 1, chess.turn() === 'w', -Infinity, Infinity);
    
    chess.undo();

    if (chess.turn() === 'b') { // AI is black, wants to minimize
      if (boardValue < bestValue) {
        bestValue = boardValue;
        bestMove = move;
      }
    } else { // AI is white, wants to maximize
      if (boardValue > bestValue) {
        bestValue = boardValue;
        bestMove = move;
      }
    }
  }

  console.log(`🎯 AI chose move: ${bestMove} (eval: ${bestValue})`);
  return bestMove;
} 