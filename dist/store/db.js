"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUser = exports.registerUser = exports.updateLastDm = exports.deleteGame = exports.getGame = exports.updateGame = exports.insertGame = exports.userRegistry = exports.games = void 0;
exports.getOrCreateSession = getOrCreateSession;
// Fallback in-memory storage until better-sqlite3 is working
const games = new Map();
exports.games = games;
const userRegistry = {};
exports.userRegistry = userRegistry;
// Mock database functions for now
exports.insertGame = {
    run: (id, fen, pgn, turn, whiteId, blackId, mode, chatId) => {
        const existingGame = games.get(id);
        if (existingGame) {
            // Update existing game
            existingGame.fen = fen;
            existingGame.pgn = pgn;
            existingGame.lastMoveAt = Date.now();
        }
        else {
            // Create new game with proper structure
            const gameSession = {
                id,
                chatId,
                fen,
                mode: mode,
                lastMoveAt: Date.now(),
                pgn,
                players: {
                    w: {
                        id: whiteId,
                        username: userRegistry[whiteId]?.username,
                        dmChatId: userRegistry[whiteId]?.dmChatId,
                        color: 'w'
                    },
                    b: {
                        id: blackId,
                        username: userRegistry[blackId]?.username,
                        dmChatId: userRegistry[blackId]?.dmChatId,
                        color: 'b'
                    }
                }
            };
            games.set(id, gameSession);
        }
    }
};
exports.updateGame = {
    run: (fen, pgn, turn, lastDm, id) => {
        const game = games.get(id);
        if (game) {
            game.fen = fen;
            game.pgn = pgn;
            game.lastMoveAt = Date.now();
        }
    }
};
exports.getGame = {
    get: (id) => games.get(id) || null
};
exports.deleteGame = {
    run: (id) => games.delete(id)
};
exports.updateLastDm = {
    run: (lastDm, id) => {
        const game = games.get(id);
        if (game) {
            game.lastMoveAt = lastDm;
        }
    }
};
// User registry functions
const registerUser = (userId, dmChatId, username) => {
    // Only update dmChatId if it's a private chat (individual DM)
    // Group chats have negative IDs, private chats have positive IDs
    if (dmChatId > 0) {
        userRegistry[userId] = { dmChatId, username };
    }
    else {
        // For group chats, only update username if user doesn't exist yet
        if (!userRegistry[userId]) {
            userRegistry[userId] = { dmChatId: 0, username };
        }
        else {
            userRegistry[userId].username = username;
        }
    }
};
exports.registerUser = registerUser;
const getUser = (userId) => {
    return userRegistry[userId] || null;
};
exports.getUser = getUser;
console.log('In-memory database initialized (fallback mode)');
function getOrCreateSession(id, mode) {
    let game = games.get(id);
    if (game)
        return game;
    // Reject obviously bogus ids
    if (!/^[-\w]{8,}$/.test(id))
        throw new Error('invalid session id');
    if (mode === 'solo') {
        game = {
            id,
            mode: 'ai',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            pgn: '',
            chatId: 0, // Will be set when creating
            players: {
                w: { id: 0, username: 'Player', color: 'w' },
                b: { id: -1, username: 'AI', color: 'b', isAI: true }
            },
            winner: null,
            lastMoveAt: Date.now()
        };
    }
    else {
        throw new Error('session not found'); // no silent "demo"
    }
    games.set(id, game);
    return game;
}
