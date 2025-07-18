import path from 'path';
import { GameSession } from '../types';
import Database from 'better-sqlite3';
import fs from 'fs';

// Add import and setup for better-sqlite3 with volume path
const dbPath = fs.existsSync('/data') ? '/data/games.db' : path.join(__dirname, 'games.db');
const db = new Database(dbPath);

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
  INSERT INTO games (id, fen, pgn, turn, lastMoveAt, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?)
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
export const games = new Map<string, GameSession>();

export function insertGame(game: GameSession) {
  const turn = game.fen.split(' ')[1];
  const now = Date.now();
  insertStmt.run(game.id, game.fen, game.pgn, turn, game.lastMoveAt, now, now);
  games.set(game.id, game);
}

export function updateGame(
  fen: string,
  pgn: string,
  turn: string,
  updatedAt: number,
  sessionId: string
) {
  updateStmt.run(fen, pgn, turn, updatedAt, sessionId);
  const game = games.get(sessionId);
  if (game) {
    game.fen = fen;
    game.pgn = pgn;
    game.lastMoveAt = updatedAt;
  }
}

export function deleteGame(sessionId: string) {
  deleteStmt.run(sessionId);
  games.delete(sessionId);
}

export function getGame(sessionId: string) {
  const game = games.get(sessionId);
  if (game) {
    return game;
  }
  const dbGame = getGameStmt.get(sessionId);
  if (dbGame) {
    const newGame: GameSession = {
      id: dbGame.id,
      fen: dbGame.fen,
      pgn: dbGame.pgn,
      mode: 'pvp', // or derive
      chatId: 0, // placeholder
      lastMoveAt: dbGame.lastMoveAt,
      players: { w: { id: dbGame.whiteId || 0, color: 'w' }, b: { id: dbGame.blackId || 0, color: 'b' } },
      // Add other fields as needed
    };
    games.set(sessionId, newGame);
    return newGame;
  }
  return null;
}

export function loadGames() {
  const dbGames = loadGamesStmt.all();
  games.clear();
  
  for (const dbGame of dbGames) {
    const game: GameSession = {
      id: dbGame.id,
      fen: dbGame.fen,
      pgn: dbGame.pgn,
      mode: 'pvp', // Default mode, could be enhanced to store/retrieve actual mode
      chatId: 0, // Placeholder, could be enhanced to store/retrieve actual chatId
      lastMoveAt: dbGame.lastMoveAt,
      players: { w: { id: 0, color: 'w' }, b: { id: 0, color: 'b' } }, // Placeholder players
      // Add other fields as needed
    };
    games.set(dbGame.id, game);
  }
}

export function purgeFinished(daysOld: number) {
  const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  const gamesToDelete: string[] = [];
  
  for (const [id, game] of games.entries()) {
    if (game.lastMoveAt < cutoffTime) {
      gamesToDelete.push(id);
    }
  }
  
  for (const id of gamesToDelete) {
    deleteGame(id);
  }
}
