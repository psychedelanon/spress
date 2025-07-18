"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boardTextFromFEN = boardTextFromFEN;
const chess_js_1 = require("chess.js");
/**
 * Convert FEN string to a simple ASCII board for Telegram messages.
 */
function boardTextFromFEN(fen) {
    const chess = new chess_js_1.Chess(fen);
    const board = chess.board();
    let txt = '```\n  a b c d e f g h\n';
    for (let r = 7; r >= 0; r--) {
        txt += (r + 1) + ' ';
        for (let f = 0; f < 8; f++) {
            const piece = board[r][f];
            if (piece) {
                txt += piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
            }
            else {
                txt += '.';
            }
            txt += ' ';
        }
        txt += (r + 1) + '\n';
    }
    txt += '  a b c d e f g h\n```';
    return txt;
}
