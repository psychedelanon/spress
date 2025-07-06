// Make canvas dependency optional during build
let ChessImageGenerator: any = null;

// Try to load the dependency dynamically
try {
  ChessImageGenerator = require('chess-image-generator');
} catch (error) {
  console.warn('chess-image-generator not available, board image generation will be disabled');
}

const TTL = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, { buf: Buffer; ts: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [fen, { ts }] of cache) {
    if (now - ts > TTL) cache.delete(fen);
  }
}, TTL).unref();

export async function fenToPng(fen: string): Promise<Buffer> {
  // If chess-image-generator is not available, throw an error
  if (!ChessImageGenerator) {
    throw new Error('Board image generation is not available - chess-image-generator dependency missing');
  }

  const cached = cache.get(fen);
  if (cached && Date.now() - cached.ts < TTL) {
    return cached.buf;
  }
  
  const image = new ChessImageGenerator({ size: 320 });
  await image.loadFEN(fen);
  const buf = await image.generatePNGBuffer();
  cache.set(fen, { buf, ts: Date.now() });
  return buf;
}
