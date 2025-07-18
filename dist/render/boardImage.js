"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fenToPng = fenToPng;
// Make canvas dependency optional during build
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ChessImageGenerator = null;
// Try to load the dependency dynamically
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ChessImageGenerator = require('chess-image-generator');
}
catch {
    console.warn('chess-image-generator not available, board image generation will be disabled');
}
const TTL = 60 * 60 * 1000; // 1 hour
const cache = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [fen, { ts }] of cache) {
        if (now - ts > TTL)
            cache.delete(fen);
    }
}, TTL).unref();
async function fenToPng(fen) {
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
