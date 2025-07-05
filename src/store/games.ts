import Database from 'better-sqlite3';
import path from 'path';
import { GameSession, PlayerInfo } from '../types';

const dbPath = path.join(__dirname, 'games.db');
const db = new Database(dbPath);

db.exec(`CREATE TABLE IF NOT EXISTS games (
  sessionId TEXT PRIMARY KEY,
  fen TEXT,
  pgn TEXT,
  turn CHAR(1),
  whiteId INTEGER,
  blackId INTEGER,
  mode TEXT,
  chatId INTEGER,
  updatedAt INTEGER
);`);

export const games = new Map<string, GameSession>();

export function loadGames() {
  const rows = db.prepare('SELECT * FROM games').all();
  rows.forEach(row => {
    games.set(row.sessionId, {
      id: row.sessionId,
      chatId: row.chatId,
      fen: row.fen,
      mode: row.mode as 'pvp' | 'ai',
      lastMoveAt: row.updatedAt,
      pgn: row.pgn,
      players: {
        w: { id: row.whiteId, color: 'w' } as PlayerInfo,
        b: { id: row.blackId, color: 'b' } as PlayerInfo
      }
    });
  });
}

const insertStmt = db.prepare(`INSERT OR REPLACE INTO games
  (sessionId, fen, pgn, turn, whiteId, blackId, mode, chatId, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

export function insertGame(game: GameSession) {
  const turn = game.fen.split(' ')[1];
  insertStmt.run(
    game.id,
    game.fen,
    game.pgn || '',
    turn,
    game.players.w.id,
    game.players.b.id,
    game.mode,
    game.chatId,
    game.lastMoveAt
  );
}

const updateStmt = db.prepare(
  'UPDATE games SET fen=?, pgn=?, turn=?, updatedAt=? WHERE sessionId=?'
);

export function updateGame(
  fen: string,
  pgn: string,
  turn: string,
  updatedAt: number,
  sessionId: string
) {
  updateStmt.run(fen, pgn, turn, updatedAt, sessionId);
}

const deleteStmt = db.prepare('DELETE FROM games WHERE sessionId=?');
export function deleteGame(sessionId: string) {
  deleteStmt.run(sessionId);
  games.delete(sessionId);
}

export function getGame(sessionId: string) {
  return games.get(sessionId);
}

export function purgeFinished(days: number) {
  const cutoff = Date.now() - days * 86400 * 1000;
  db.prepare('DELETE FROM games WHERE updatedAt < ?').run(cutoff);
}
