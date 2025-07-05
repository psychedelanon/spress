import ChessImageGenerator from 'chess-image-generator';

const TTL = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, { buf: Buffer; ts: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [fen, { ts }] of cache) {
    if (now - ts > TTL) cache.delete(fen);
  }
}, TTL).unref();

export async function fenToPng(fen: string): Promise<Buffer> {
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
