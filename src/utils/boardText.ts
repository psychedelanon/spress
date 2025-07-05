import { Chess } from 'chess.js';

/**
 * Convert FEN string to a simple ASCII board for Telegram messages.
 */
export function boardTextFromFEN(fen: string): string {
  const chess = new Chess(fen);
  const board = chess.board();
  let txt = '```\n  a b c d e f g h\n';
  for (let r = 7; r >= 0; r--) {
    txt += (r + 1) + ' ';
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece) {
        txt += piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
      } else {
        txt += '.';
      }
      txt += ' ';
    }
    txt += (r + 1) + '\n';
  }
  txt += '  a b c d e f g h\n```';
  return txt;
}
