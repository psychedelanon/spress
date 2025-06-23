// Simple AI engine placeholder - replace with actual Stockfish integration
export default async function bestMove(fen: string): Promise<string> {
  // For now, return a random legal move
  // In production, this would use Stockfish WASM at depth 8
  
  // Common opening moves for demo
  const openingMoves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'd7d6'];
  const randomMove = openingMoves[Math.floor(Math.random() * openingMoves.length)];
  
  // Simulate AI thinking time
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return randomMove;
} 