// Fallback in-memory storage until better-sqlite3 is working
const games = new Map<string, any>();

// Mock database functions for now
export const insertGame = {
  run: (id: string, fen: string, pgn: string, turn: string, whiteId: number, blackId: number, mode: string) => {
    games.set(id, { id, fen, pgn, turn, white_id: whiteId, black_id: blackId, mode, last_dm: 0 });
  }
};

export const updateGame = {
  run: (fen: string, pgn: string, turn: string, lastDm: number, id: string) => {
    const game = games.get(id);
    if (game) {
      game.fen = fen;
      game.pgn = pgn;
      game.turn = turn;
      game.last_dm = lastDm;
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
      game.last_dm = lastDm;
    }
  }
};

console.log('In-memory database initialized (fallback mode)'); 