import ChessImageGenerator from 'chess-image-generator';
export async function fenToPng(fen: string): Promise<Buffer> {
  const image = new ChessImageGenerator({ size: 320 });
  image.loadFEN(fen);
  return image.generatePNGBuffer();
}
