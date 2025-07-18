"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameSession = void 0;
const chess_js_1 = require("chess.js");
class GameSession {
    chess;
    sessionId;
    players;
    createdAt;
    lastMoveSan;
    lastMoveAt;
    isGameOver = false;
    winner;
    gameEndReason;
    mode = 'human';
    constructor(sessionId, whitePlayer, blackPlayer) {
        this.chess = new chess_js_1.Chess();
        this.sessionId = sessionId;
        this.players = [whitePlayer, blackPlayer];
        this.createdAt = new Date();
        // Ensure players are correctly assigned colors
        this.players[0].isWhite = true;
        this.players[1].isWhite = false;
    }
    /**
     * Get the current FEN position
     */
    getFen() {
        return this.chess.fen();
    }
    /**
     * Get the current PGN
     */
    getPgn() {
        return this.chess.pgn();
    }
    /**
     * Get whose turn it is
     */
    getCurrentPlayer() {
        const isWhiteTurn = this.chess.turn() === 'w';
        return this.players.find(p => p.isWhite === isWhiteTurn);
    }
    /**
     * Check if a player is allowed to move
     */
    canPlayerMove(playerId) {
        if (this.isGameOver)
            return false;
        const currentPlayer = this.getCurrentPlayer();
        return currentPlayer.id === playerId;
    }
    /**
     * Apply a move to the game
     */
    applyMove(move, playerId) {
        try {
            // Check if game is already over
            if (this.isGameOver) {
                return {
                    ok: false,
                    error: 'Game is already over'
                };
            }
            // Check if it's the player's turn (if playerId provided)
            if (playerId && !this.canPlayerMove(playerId)) {
                return {
                    ok: false,
                    error: 'Not your turn'
                };
            }
            // Attempt the move
            const moveResult = this.chess.move(move);
            if (!moveResult) {
                return {
                    ok: false,
                    error: 'Invalid move'
                };
            }
            // Update last move info
            this.lastMoveSan = moveResult.san;
            this.lastMoveAt = new Date();
            // Check game state
            const isCheckmate = this.chess.isCheckmate();
            const isCheck = this.chess.inCheck();
            const isStalemate = this.chess.isStalemate();
            const isDraw = this.chess.isDraw();
            const isGameOver = isCheckmate || isStalemate || isDraw;
            // Update game over state
            if (isGameOver) {
                this.isGameOver = true;
                if (isCheckmate) {
                    // The player who just moved wins
                    const winnerColor = this.chess.turn() === 'w' ? false : true; // Opposite of current turn
                    this.winner = this.players.find(p => p.isWhite === winnerColor);
                    this.gameEndReason = 'checkmate';
                }
                else if (isStalemate) {
                    this.gameEndReason = 'stalemate';
                }
                else if (isDraw) {
                    this.gameEndReason = 'draw';
                }
            }
            return {
                ok: true,
                san: moveResult.san,
                fen: this.chess.fen(),
                pgn: this.chess.pgn(),
                isCheckmate,
                isCheck,
                isStalemate,
                isDraw,
                isGameOver
            };
        }
        catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Resign the game
     */
    resign(playerId) {
        if (this.isGameOver) {
            return {
                ok: false,
                error: 'Game is already over'
            };
        }
        const resigningPlayer = this.players.find(p => p.id === playerId);
        if (!resigningPlayer) {
            return {
                ok: false,
                error: 'Player not found'
            };
        }
        this.isGameOver = true;
        this.winner = this.players.find(p => p.id !== playerId);
        this.gameEndReason = 'resignation';
        return {
            ok: true,
            fen: this.chess.fen(),
            pgn: this.chess.pgn(),
            isGameOver: true
        };
    }
    /**
     * Get game status message
     */
    getStatusMessage() {
        if (this.isGameOver) {
            if (this.gameEndReason === 'checkmate') {
                return `Game Over - ${this.winner?.username} wins by checkmate! 🏆`;
            }
            else if (this.gameEndReason === 'resignation') {
                return `Game Over - ${this.winner?.username} wins by resignation! 🏆`;
            }
            else if (this.gameEndReason === 'stalemate') {
                return `Game Over - Draw by stalemate 🤝`;
            }
            else if (this.gameEndReason === 'draw') {
                return `Game Over - Draw 🤝`;
            }
        }
        const currentPlayer = this.getCurrentPlayer();
        const checkStatus = this.chess.inCheck() ? ' (Check!)' : '';
        return `${currentPlayer.username}'s turn${checkStatus}`;
    }
    /**
     * Get a simple board representation for chat
     */
    getSimpleBoardText() {
        const board = this.chess.board();
        let result = '```\n';
        result += '  a b c d e f g h\n';
        for (let rank = 7; rank >= 0; rank--) {
            result += `${rank + 1} `;
            for (let file = 0; file < 8; file++) {
                const piece = board[rank][file];
                if (piece) {
                    const symbol = piece.color === 'w' ?
                        piece.type.toUpperCase() :
                        piece.type.toLowerCase();
                    result += `${symbol} `;
                }
                else {
                    result += '. ';
                }
            }
            result += `${rank + 1}\n`;
        }
        result += '  a b c d e f g h\n';
        result += '```';
        return result;
    }
    /**
     * Get move history for display
     */
    getMoveHistory() {
        const history = this.chess.history({ verbose: true });
        if (history.length === 0)
            return 'No moves yet';
        let result = '';
        for (let i = 0; i < history.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            const whiteMove = history[i]?.san || '';
            const blackMove = history[i + 1]?.san || '';
            result += `${moveNum}. ${whiteMove} ${blackMove}\n`;
        }
        return result.trim();
    }
}
exports.GameSession = GameSession;
