import { Context } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/types';
import { GameSession, Player } from './GameSession';
import { ensureHttps } from '../utils/ensureHttps';
import { insertGame } from '../store/db';

// Store active games
const activeGames = new Map<string, GameSession>();

// Helper function to generate session ID
function generateSessionId(player1Id: number, player2Id: number): string {
  const sortedIds = [player1Id, player2Id].sort();
  return `game_${sortedIds[0]}_${sortedIds[1]}_${Date.now()}`;
}

// Helper function to create player object
function createPlayer(user: any, isWhite: boolean): Player {
  return {
    id: user.id,
    username: user.username || user.first_name,
    firstName: user.first_name,
    isWhite
  };
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
  if (!challenger) {
    ctx.reply('Error: Could not identify player');
    return;
  }

  const sessionId = `solo_${Date.now()}_${challenger.id}`;
  
  // Create solo game session (will be handled differently in wsHub)
  const whitePlayer = createPlayer(challenger, true);
  const blackPlayer = createPlayer({ id: 0, username: 'AI', first_name: 'AI' }, false);
  const game = new GameSession(sessionId, whitePlayer, blackPlayer);
  game.mode = 'ai'; // Add mode property
  
  activeGames.set(sessionId, game);

  // Persist to database
  insertGame.run(
    sessionId,
    game.getFen(),
    game.getPgn(),
    'w', // White always starts
    challenger.id,
    0, // AI opponent
    'ai'
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
  if (!message || !('text' in message)) return;

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

  // For demo purposes, we'll create a mock opponent
  // In a real implementation, you'd need to resolve the username to a user ID
  const mockOpponent = {
    id: Math.floor(Math.random() * 1000000) + 1000000, // Random ID for demo
    username: opponentUsername,
    first_name: opponentUsername
  };

  // Command sender is always White (plays first)
  const whitePlayer = createPlayer(challenger, true);
  const blackPlayer = createPlayer(mockOpponent, false);

  const sessionId = generateSessionId(challenger.id, mockOpponent.id);
  const game = new GameSession(sessionId, whitePlayer, blackPlayer);
  
  activeGames.set(sessionId, game);

  // Persist to database
  insertGame.run(
    sessionId,
    game.getFen(),
    game.getPgn(),
    'w', // White always starts
    challenger.id,
    mockOpponent.id,
    'human'
  );

  const colorInfo = 'You are White ⚪';
  const gameInfo = `
🆕 New game started!
${colorInfo}
Opponent: @${opponentUsername}

${game.getStatusMessage()}

${game.getSimpleBoardText()}

Use the Mini App for the best experience, or send moves in algebraic notation (e.g., e4, Nf3, O-O).
  `.trim();

  ctx.reply(gameInfo, {
    reply_markup: createGameKeyboard(sessionId, 'w'),
    parse_mode: 'HTML'
  });

  // Send separate launch buttons for each player
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
  
  // Block all other text and redirect to board
  return ctx.reply('♟️ Please open the SPRESS board and move pieces there ↗️');
}

// /resign command handler
export function handleResign(ctx: Context) {
  if (!ctx.from) return;

  const userId = ctx.from.id;

  // Find active game for this user
  let userGame: GameSession | undefined;
  for (const game of activeGames.values()) {
    if (game.players.some(p => p.id === userId)) {
      userGame = game;
      break;
    }
  }

  if (!userGame) {
    ctx.reply('No active game found.');
    return;
  }

  const result = userGame.resign(userId);
  
  if (!result.ok) {
    ctx.reply(`❌ ${result.error}`);
    return;
  }

  // Game state will be handled by WebSocket hub

  ctx.reply(`🏳️ ${ctx.from.first_name} resigned.\n\n${userGame.getStatusMessage()}`);

  // Clean up game
  setTimeout(() => {
    activeGames.delete(userGame!.sessionId);
  }, 10000);
}

// Callback query handlers
export function handleCallbackQuery(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !('data' in callbackQuery) || !ctx.from) return;

  const data = callbackQuery.data;
  const userId = ctx.from.id;

  if (data.startsWith('show_board_')) {
    const sessionId = data.replace('show_board_', '');
    const game = activeGames.get(sessionId);
    
    if (!game) {
      ctx.answerCbQuery('Game not found');
      return;
    }

    ctx.answerCbQuery();
    ctx.reply(`Current position:\n\n${game.getSimpleBoardText()}\n\n${game.getStatusMessage()}`);
  }
  else if (data.startsWith('show_moves_')) {
    const sessionId = data.replace('show_moves_', '');
    const game = activeGames.get(sessionId);
    
    if (!game) {
      ctx.answerCbQuery('Game not found');
      return;
    }

    ctx.answerCbQuery();
    ctx.reply(`Move history:\n\n${game.getMoveHistory()}`);
  }
  else if (data.startsWith('resign_')) {
    const sessionId = data.replace('resign_', '');
    const game = activeGames.get(sessionId);
    
    if (!game) {
      ctx.answerCbQuery('Game not found');
      return;
    }

    if (!game.players.some(p => p.id === userId)) {
      ctx.answerCbQuery('You are not a player in this game');
      return;
    }

    const result = game.resign(userId);
    
    if (!result.ok) {
      ctx.answerCbQuery(result.error || 'Could not resign');
      return;
    }

    // Game state will be handled by WebSocket hub

    ctx.answerCbQuery('Game resigned');
    ctx.editMessageText(`🏳️ ${ctx.from.first_name} resigned.\n\n${game.getStatusMessage()}`);

    // Clean up game
    setTimeout(() => {
      activeGames.delete(game.sessionId);
    }, 10000);
  }
  else if (data.startsWith('help_')) {
    ctx.answerCbQuery();
    ctx.reply(
      `🏁 How to Play Chess:\n\n` +
      `📝 Send moves in algebraic notation:\n` +
      `• e4, e5 (pawn moves)\n` +
      `• Nf3, Nc6 (knight moves)\n` +
      `• Bb5, Bc5 (bishop moves)\n` +
      `• Qd1, Qd8 (queen moves)\n` +
      `• Kh1, Kg8 (king moves)\n` +
      `• O-O (kingside castle)\n` +
      `• O-O-O (queenside castle)\n\n` +
      `🎯 Examples:\n` +
      `• "e4" - Move pawn to e4\n` +
      `• "Nf3" - Move knight to f3\n` +
      `• "Qxf7+" - Queen captures on f7 with check\n\n` +
      `⚡ The board updates automatically after each move!`
    );
  }
}

// Export active games for external access
export { activeGames }; 