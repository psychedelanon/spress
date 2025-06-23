// Placeholder AI engine - will be implemented later
let engine: any = null;

// Initialize Stockfish engine
export async function initAI() {
  // Placeholder - return mock engine
  return Promise.resolve(null);
}

// Get best move from AI for given position
export async function bestMove(fen: string, depth: number = 8): Promise<string> {
  // Return a simple random move as placeholder
  const moves = ['e2e4', 'e7e5', 'd2d4', 'd7d5', 'g1f3', 'b8c6'];
  const randomMove = moves[Math.floor(Math.random() * moves.length)];
  return Promise.resolve(randomMove);
} 