import { GameSession, UserRegistry } from '../types';

// Fallback in-memory storage until better-sqlite3 is working
const games = new Map<string, GameSession>();
const userRegistry: UserRegistry = {};

// Export games and user registry for access from other modules
export { games, userRegistry };

// Mock database functions for now
export const insertGame = {
  run: (id: string, fen: string, pgn: string, turn: string, whiteId: number, blackId: number, mode: string, chatId: number) => {
    const existingGame = games.get(id);
    if (existingGame) {
      // Update existing game
      existingGame.fen = fen;
      existingGame.pgn = pgn;
      existingGame.lastMoveAt = Date.now();
    } else {
      // Create new game with proper structure
      const gameSession: GameSession = {
        id,
        chatId,
        fen,
        mode: mode as 'pvp' | 'ai',
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

export const updateGame = {
  run: (fen: string, pgn: string, turn: string, lastDm: number, id: string) => {
    const game = games.get(id);
    if (game) {
      game.fen = fen;
      game.pgn = pgn;
      game.lastMoveAt = Date.now();
    }
  }
};

export const getGame = {
  get: (id: string) => games.get(id) || null
};

export const deleteGame = {
  run: (id: string) => games.delete(id)
};

export const updateLastDm = {
  run: (lastDm: number, id: string) => {
    const game = games.get(id);
    if (game) {
      game.lastMoveAt = lastDm;
    }
  }
};

// User registry functions
export const registerUser = (userId: number, dmChatId: number, username?: string) => {
  userRegistry[userId] = { dmChatId, username };
};

export const getUser = (userId: number) => {
  return userRegistry[userId] || null;
};

console.log('In-memory database initialized (fallback mode)');

export function getOrCreateSession(id: string, mode: 'solo' | 'pvp'): GameSession {
  let game = games.get(id);
  if (game) return game;

  // Reject obviously bogus ids
  if (!/^[-\w]{8,}$/.test(id)) throw new Error('invalid session id');

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
  } else {
    throw new Error('session not found'); // no silent "demo"
  }
  
  games.set(id, game);
  return game;
} 