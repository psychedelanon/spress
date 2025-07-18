"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.games = void 0;
exports.insertGame = insertGame;
exports.updateGame = updateGame;
exports.deleteGame = deleteGame;
exports.getGame = getGame;
exports.loadGames = loadGames;
exports.purgeFinished = purgeFinished;
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
// Add import and setup for better-sqlite3 with volume path
const dbPath = fs_1.default.existsSync('/data') ? '/data/games.db' : path_1.default.join(__dirname, 'games.db');
const db = new better_sqlite3_1.default(dbPath);
// Restore original table creation and statements
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    fen TEXT NOT NULL,
    pgn TEXT NOT NULL,
    turn TEXT NOT NULL,
    lastMoveAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  )
`);
// In insertGame, updateGame, etc., use the prepared statements
const insertStmt = db.prepare(`
  INSERT INTO games (id, fen, pgn, turn, lastMoveAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const updateStmt = db.prepare(`
  UPDATE games SET fen = ?, pgn = ?, turn = ?, lastMoveAt = ?, updatedAt = ? WHERE id = ?
`);
const deleteStmt = db.prepare(`
  DELETE FROM games WHERE id = ?
`);
const loadGamesStmt = db.prepare(`
  SELECT * FROM games
`);
const getGameStmt = db.prepare(`
  SELECT * FROM games WHERE id = ?
`);
// Keep the in-memory games Map for caching, sync with DB on operations
exports.games = new Map();
function insertGame(game) {
    const turn = game.fen.split(' ')[1];
    const now = Date.now();
    insertStmt.run(game.id, game.fen, game.pgn, turn, game.lastMoveAt, now);
    exports.games.set(game.id, game);
}
function updateGame(fen, pgn, turn, updatedAt, sessionId) {
    updateStmt.run(fen, pgn, turn, updatedAt, sessionId);
    const game = exports.games.get(sessionId);
    if (game) {
        game.fen = fen;
        game.pgn = pgn;
        game.lastMoveAt = updatedAt;
    }
}
function deleteGame(sessionId) {
    deleteStmt.run(sessionId);
    exports.games.delete(sessionId);
}
function getGame(sessionId) {
    const game = exports.games.get(sessionId);
    if (game) {
        return game;
    }
    const dbGame = getGameStmt.get(sessionId);
    if (dbGame) {
        const newGame = {
            id: dbGame.id,
            fen: dbGame.fen,
            pgn: dbGame.pgn,
            mode: 'pvp', // or derive
            chatId: 0, // placeholder
            lastMoveAt: dbGame.lastMoveAt,
            players: { w: { id: dbGame.whiteId || 0, color: 'w' }, b: { id: dbGame.blackId || 0, color: 'b' } },
            // Add other fields as needed
        };
        exports.games.set(sessionId, newGame);
        return newGame;
    }
    return null;
}
function loadGames() {
    const dbGames = loadGamesStmt.all();
    exports.games.clear();
    for (const dbGame of dbGames) {
        const game = {
            id: dbGame.id,
            fen: dbGame.fen,
            pgn: dbGame.pgn,
            mode: 'pvp', // Default mode, could be enhanced to store/retrieve actual mode
            chatId: 0, // Placeholder, could be enhanced to store/retrieve actual chatId
            lastMoveAt: dbGame.lastMoveAt,
            players: { w: { id: 0, color: 'w' }, b: { id: 0, color: 'b' } }, // Placeholder players
            // Add other fields as needed
        };
        exports.games.set(dbGame.id, game);
    }
}
function purgeFinished(daysOld) {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const gamesToDelete = [];
    for (const [id, game] of exports.games.entries()) {
        if (game.lastMoveAt < cutoffTime) {
            gamesToDelete.push(id);
        }
    }
    for (const id of gamesToDelete) {
        deleteGame(id);
    }
}
