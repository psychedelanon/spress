import { Context } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/types';
import { GameSession, Player } from './GameSession';
import { ensureHttps } from '../utils/ensureHttps';
import { insertGame, games, registerUser, getUser } from '../store/db';
import { GameSession as NewGameSession, PlayerInfo } from '../types';

// Helper function to generate session ID
function generateSessionId(player1Id: number, player2Id: number): string {
  const sortedIds = [player1Id, player2Id].sort();
  return `game_${sortedIds[0]}_${sortedIds[1]}_${Date.now()}`;
}

// Helper function to create inline keyboard with Mini App button
function createGameKeyboard(sessionId: string, playerColor: 'w' | 'b'): InlineKeyboardMarkup {
  const base = ensureHttps(process.env.PUBLIC_URL || 'localhost:3000');
  const url = `${base}/webapp/?session=${sessionId}&color=${playerColor}`;
  
  return {
    inline_keyboard: [
      [
        { text: '♟️ Launch SPRESS Board', web_app: { url } }
      ],
      [
        { text: '📋 Show Board', callback_data: `show_board_${sessionId}` },
        { text: '📜 Show Moves', callback_data: `show_moves_${sessionId}` }
      ],
      [
        { text: '🏳️ Resign', callback_data: `resign_${sessionId}` }
      ],
      [
        { text: 'ℹ️ How to Play', callback_data: `help_${sessionId}` }
      ]
    ]
  };
}

// /solo command handler
export async function handleSoloGame(ctx: Context) {
  const challenger = ctx.from;
  const chatId = ctx.chat?.id;
  
  if (!challenger || !chatId) {
    ctx.reply('Error: Could not identify player or chat');
    return;
  }

  // Register user for DM capability
  registerUser(challenger.id, chatId, challenger.username);

  const sessionId = `solo_${Date.now()}_${challenger.id}`;
  
  // Create new game session with proper structure
  const gameSession: NewGameSession = {
    id: sessionId,
    chatId,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    mode: 'ai',
    lastMoveAt: Date.now(),
    pgn: '',
    players: {
      w: {
        id: challenger.id,
        username: challenger.username,
        dmChatId: chatId,
        color: 'w'
      },
      b: {
        id: 0, // AI opponent
        username: 'AI',
        color: 'b'
      }
    }
  };
  
  games.set(sessionId, gameSession);

  // Persist to database
  insertGame.run(
    sessionId,
    gameSession.fen,
    gameSession.pgn || '',
    'w', // White always starts
    challenger.id,
    0, // AI opponent
    'ai',
    chatId
  );

  const base = ensureHttps(process.env.PUBLIC_URL || 'localhost:3000');
  const url = `${base}/webapp/?session=${sessionId}&color=w`;
  
  await ctx.reply('🤖 Solo Mode - You vs AI', {
    reply_markup: {
      inline_keyboard: [[{
        text: '🤖 Play Solo',
        web_app: { url }
      }]]
    }
  });
}

// /new command handler
export async function handleNewGame(ctx: Context) {
  const message = ctx.message;
  const chatId = ctx.chat?.id;
  
  if (!message || !('text' in message) || !chatId) return;

  const text = message.text;
  const match = text.match(/^\/new\s+@?(\w+)/);
  
  if (!match) {
    ctx.reply('Usage: /new @username\nExample: /new @johndoe');
    return;
  }

  const opponentUsername = match[1];
  const challenger = ctx.from;

  if (!challenger) {
    ctx.reply('Error: Could not identify challenger');
    return;
  }

  // Register challenger for DM capability
  registerUser(challenger.id, chatId, challenger.username);

  // For demo purposes, we'll create a mock opponent
  // In a real implementation, you'd need to resolve the username to a user ID
  const mockOpponent = {
    id: Math.floor(Math.random() * 1000000) + 1000000, // Random ID for demo
    username: opponentUsername,
    first_name: opponentUsername
  };

  const sessionId = generateSessionId(challenger.id, mockOpponent.id);
  
  // Create new game session with proper structure
  const gameSession: NewGameSession = {
    id: sessionId,
    chatId,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    mode: 'pvp',
    lastMoveAt: Date.now(),
    pgn: '',
    players: {
      w: {
        id: challenger.id,
        username: challenger.username,
        dmChatId: chatId,
        color: 'w'
      },
      b: {
        id: mockOpponent.id,
        username: mockOpponent.username,
        color: 'b'
        // dmChatId will be filled when opponent first talks to bot
      }
    }
  };
  
  games.set(sessionId, gameSession);

  // Persist to database
  insertGame.run(
    sessionId,
    gameSession.fen,
    gameSession.pgn || '',
    'w', // White always starts
    challenger.id,
    mockOpponent.id,
    'pvp',
    chatId
  );

  const colorInfo = 'You are White ⚪';
  const gameInfo = `
🆕 New game started!
${colorInfo}
Opponent: @${opponentUsername}

White to move

Use the Mini App for the best experience!
  `.trim();

  await ctx.reply(gameInfo, {
    reply_markup: createGameKeyboard(sessionId, 'w'),
    parse_mode: 'HTML'
  });

  // Send launch buttons for each player
  const base = ensureHttps(process.env.PUBLIC_URL || 'localhost:3000');
  const whiteUrl = `${base}/webapp/?session=${sessionId}&color=w`;
  const blackUrl = `${base}/webapp/?session=${sessionId}&color=b`;

  // Send to challenger (always White)
  await ctx.reply('Launch SPRESS board', {
    reply_markup: {
      inline_keyboard: [[{ 
        text: '♟️ Play (White)', 
        web_app: { url: whiteUrl } 
      }]]
    }
  });

  // Note: In a real implementation, you'd send the other button to the actual opponent
}

// Handle text messages - block chess moves, redirect to board
export function handleMove(ctx: Context) {
  const message = ctx.message;
  if (!message || !('text' in message) || !ctx.from) return;

  const text = message.text;
  
  // Allow commands to pass through
  if (text.startsWith('/')) return;
  
  // Register user for DM capability
  if (ctx.chat) {
    registerUser(ctx.from.id, ctx.chat.id, ctx.from.username);
  }
  
  // Block all other text and redirect to board
  return ctx.reply('♟️ Please open the SPRESS board and move pieces there ↗️');
}

// /resign command handler
export function handleResign(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;

  // Find active game for this user
  let userGame: NewGameSession | undefined;
  for (const game of games.values()) {
    if (game.players.w.id === userId || game.players.b.id === userId) {
      userGame = game;
      break;
    }
  }

  if (!userGame) {
    ctx.reply('❌ You have no active game to resign from.');
    return;
  }

  // Determine winner
  const isWhite = userGame.players.w.id === userId;
  const winner = isWhite ? 'Black' : 'White';
  const playerColor = isWhite ? 'White' : 'Black';

  // Mark game as finished
  userGame.winner = winner;
  
  // Remove from active games
  games.delete(userGame.id);

  ctx.reply(`🏳️ You resigned as ${playerColor}. ${winner} wins!`);
}

// Handle callback queries (inline button presses)
export function handleCallbackQuery(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !('data' in callbackQuery)) return;

  const data = callbackQuery.data;
  
  if (data.startsWith('show_board_')) {
    const sessionId = data.replace('show_board_', '');
    const game = games.get(sessionId);
    
    if (!game) {
      ctx.answerCbQuery('Game not found');
      return;
    }
    
    // Simple ASCII board representation
    const boardText = `
Current Position:
\`\`\`
♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜
♟ ♟ ♟ ♟ ♟ ♟ ♟ ♟
. . . . . . . .
. . . . . . . .
. . . . . . . .
. . . . . . . .
♙ ♙ ♙ ♙ ♙ ♙ ♙ ♙
♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖
\`\`\`
    `;
    
    ctx.answerCbQuery();
    ctx.reply(boardText, { parse_mode: 'Markdown' });
    
  } else if (data.startsWith('show_moves_')) {
    const sessionId = data.replace('show_moves_', '');
    const game = games.get(sessionId);
    
    if (!game) {
      ctx.answerCbQuery('Game not found');
      return;
    }
    
    const moves = game.pgn || 'No moves yet';
    ctx.answerCbQuery();
    ctx.reply(`📜 Game moves:\n\`${moves}\``, { parse_mode: 'Markdown' });
    
  } else if (data.startsWith('resign_')) {
    handleResign(ctx);
    ctx.answerCbQuery();
    
  } else if (data.startsWith('help_')) {
    ctx.answerCbQuery();
    ctx.reply(
      'ℹ️ How to Play SPRESS Chess:\n\n' +
      '1. Tap "♟️ Launch SPRESS Board" to open the interactive board\n' +
      '2. Tap a piece to select it, then tap where you want to move\n' +
      '3. Or drag pieces directly to move them\n' +
      '4. The game updates in real-time for both players\n' +
      '5. Use /resign to give up the game\n\n' +
      'Good luck! ♟️'
    );
  }
} 