export interface PlayerInfo {
  id: number;            // Telegram user ID
  username?: string;     // @handle (optional)
  dmChatId?: number;     // DM chat with the bot, if known
  color: 'w' | 'b';
  isAI?: boolean;        // True for AI players
}

export interface GameSession {
  id: string;
  chatId: number;        // chat where the game was created
  players: { w: PlayerInfo; b: PlayerInfo };
  fen: string;
  mode: 'pvp' | 'ai';
  lastMoveAt: number;
  pgn?: string;
  winner?: string;
  aiLevel?: number;
}

// User registry for tracking DM chat IDs
export interface UserRegistry {
  [userId: number]: {
    dmChatId: number;
    username?: string;
  };
} 