import { Context } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/types';
import { GameSession, Player } from './GameSession';
import { ensureHttps } from '../utils/ensureHttps';
import { boardTextFromFEN } from '../utils/boardText';
import { registerUser, getUser } from '../store/db';
import { insertGame, games, deleteGame } from '../store/games';
import { GameSession as NewGameSession, PlayerInfo } from '../types';
import { getStats, recordResult } from '../store/stats';

// Pending PvP challenges waiting for acceptance
interface PendingChallenge {
  sessionId: string;
  chatId: number;
  challenger: PlayerInfo;
  opponent: {
    id?: number;
    username: string;
  };
  messageId: number;
  telegram: Context['telegram'];
}

const pendingChallenges = new Map<string, PendingChallenge>();

function expireChallenge(id: string) {
  const c = pendingChallenges.get(id);
  if (!c) return;
  c.telegram.editMessageText(c.chatId, c.messageId, undefined, 'Challenge timed out.').catch(() => {});
  pendingChallenges.delete(id);
}

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
  const userId = ctx.from!.id;
  const username = ctx.from!.username || 'Player';
  const chatId = ctx.chat.id;

  if (Array.from(games.values()).some(g => !g.winner && g.chatId === chatId && (g.players.w.id === userId || g.players.b.id === userId))) {
    return ctx.reply('Finish or /resign your current game first.');
  }

  if (Array.from(games.values()).some(g => !g.winner && g.chatId === chatId && (g.players.w.id === userId || g.players.b.id === userId))) {
    return ctx.reply('Finish or /resign your current game first.');
  }

  const parts = ('text' in ctx.message ? ctx.message.text.split(' ') : []);
  const arg = parts[1];
  let level: number | null = null;
  if (arg) {
    const a = arg.toLowerCase();
    if (a === 'easy') level = 2;
    else if (a === 'medium' || a === 'med') level = 10;
    else if (a === 'hard') level = 15;
    else if (/^\d+$/.test(a)) level = Math.min(20, Math.max(0, parseInt(a,10)));
  }

  if (level === null) {
    return ctx.reply('Pick AI difficulty', {
      reply_markup: { inline_keyboard: [[
        { text: 'Easy', callback_data: 'solo_easy' },
        { text: 'Med', callback_data: 'solo_med' },
        { text: 'Hard', callback_data: 'solo_hard' }
      ]] }
    });
  }
  
  // Register user for DM capability
  registerUser(userId, chatId, username);

  const sessionId = `solo-${userId}-${Date.now()}`;
  
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
        id: userId,
        username,
        dmChatId: chatId,
        color: 'w'
      },
      b: {
        id: -1,
        username: 'AI',
        color: 'b',
        isAI: true
      }
    }
  };
  gameSession.aiLevel = level;
  
  games.set(sessionId, gameSession);

  // Persist to database
  insertGame(gameSession);

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
  const userId = ctx.from!.id;
  const username = ctx.from!.username || 'Player';
  const chatId = ctx.chat.id;

  const args = ('text' in ctx.message ? ctx.message.text : '').split(' ');
  if (args.length < 2 || !args[1].startsWith('@')) {
    return ctx.reply('Usage: /new @username\nExample: /new @alice');
  }

  const opponentUsername = args[1].substring(1);

  // Determine opponent user ID if command was a reply
  let opponentId: number | undefined;
  if ('reply_to_message' in ctx.message && ctx.message.reply_to_message?.from) {
    opponentId = ctx.message.reply_to_message.from.id;
  }

  registerUser(userId, chatId, username);

  const sessionId = generateSessionId(userId, opponentId || Date.now());

  const message = await ctx.reply(`@${opponentUsername}, you have been challenged to a game!`, {
    reply_markup: {
      inline_keyboard: [[{ text: 'Accept challenge', callback_data: `accept_${sessionId}` }]]
    }
  });

  pendingChallenges.set(sessionId, {
    sessionId,
    chatId,
    challenger: { id: userId, username, dmChatId: chatId, color: 'w' },
    opponent: { id: opponentId, username: opponentUsername },
    messageId: message.message_id,
    telegram: ctx.telegram
  });

  setTimeout(() => expireChallenge(sessionId), 5 * 60 * 1000);
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
    if (game.chatId === ctx.chat.id && (game.players.w.id === userId || game.players.b.id === userId)) {
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

  const result: 'white' | 'black' | 'draw' = isWhite ? 'black' : 'white';
  recordResult(userGame.players.w.id, userGame.players.b.id, result, userGame.mode);

  // Remove from active games
  games.delete(userGame.id);
  deleteGame(userGame.id);

  ctx.reply(`🏳️ You resigned as ${playerColor}. ${winner} wins!`);
}

// Handle callback queries (inline button presses)
export async function handleCallbackQuery(ctx: Context) {
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
    
    const boardText = `Current Position:\n${boardTextFromFEN(game.fen)}`;

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

  } else if (data.startsWith('accept_')) {
    const sessionId = data.replace('accept_', '');
    const challenge = pendingChallenges.get(sessionId);
    if (!challenge) {
      ctx.answerCbQuery('Challenge not found');
      return;
    }

    if (!ctx.from) return;

    // Verify correct opponent (if username known)
    if (challenge.opponent.id && challenge.opponent.id !== ctx.from.id) {
      ctx.answerCbQuery('This challenge is not for you');
      return;
    }

    challenge.opponent.id = ctx.from.id;
    challenge.opponent.username = ctx.from.username || challenge.opponent.username;

    registerUser(ctx.from.id, ctx.chat?.id || challenge.chatId, ctx.from.username);

    const gameSession: NewGameSession = {
      id: sessionId,
      chatId: challenge.chatId,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'pvp',
      lastMoveAt: Date.now(),
      pgn: '',
      players: {
        w: challenge.challenger,
        b: {
          id: challenge.opponent.id!,
          username: challenge.opponent.username,
          dmChatId: ctx.chat?.id,
          color: 'b'
        }
      }
    };

    games.set(sessionId, gameSession);
    insertGame(gameSession);

    pendingChallenges.delete(sessionId);

    const base = ensureHttps(process.env.PUBLIC_URL || 'localhost:3000');
    const whiteUrl = `${base}/webapp/?session=${sessionId}&color=w`;
    const blackUrl = `${base}/webapp/?session=${sessionId}&color=b`;

    await ctx.editMessageText?.('Challenge accepted! Game starting...').catch(() => {});
    await ctx.telegram.sendMessage(challenge.chatId,
      `Game started between @${challenge.challenger.username} (White) and @${challenge.opponent.username} (Black). White to move`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '♟️ Play (White)', web_app: { url: whiteUrl } },
              { text: '♟️ Play (Black)', web_app: { url: blackUrl } }
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
        }
      }
    );

    // Send DM to both players with their board links
    const boardText = boardTextFromFEN(gameSession.fen);
    if (challenge.challenger.dmChatId) {
      await ctx.telegram.sendMessage(challenge.challenger.dmChatId,
        `Game vs @${challenge.opponent.username} started. You are White.\n${boardText}`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Open board', web_app: { url: whiteUrl } }]] } }
      ).catch(() => {});
    }
    if (gameSession.players.b.dmChatId && gameSession.players.b.dmChatId !== challenge.chatId) {
      await ctx.telegram.sendMessage(gameSession.players.b.dmChatId!,
        `Game vs @${challenge.challenger.username} started. You are Black.\n${boardText}`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Open board', web_app: { url: blackUrl } }]] } }
      ).catch(() => {});
    }
    ctx.answerCbQuery('Challenge accepted');

  } else if (data === 'solo_easy' || data === 'solo_med' || data === 'solo_hard') {
    const level = data === 'solo_easy' ? 2 : data === 'solo_med' ? 10 : 15;
    await handleSoloGame(Object.assign(ctx, { message: { text: `/solo ${level}` } }) as any);
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

export function handleStats(ctx: Context) {
  if (!ctx.from) return;
  const s = getStats(ctx.from.id);
  const msg =
    `🏅 Your Stats:\n` +
    `PvP - ${s.pvpWins}W/${s.pvpLosses}L/${s.pvpDraws}D\n` +
    `Solo - ${s.soloWins}W/${s.soloLosses}L/${s.soloDraws}D`;
  ctx.reply(msg);
}

export function handleLeaderboard(ctx: Context) {
  const statsMod = require('../store/stats') as typeof import('../store/stats');
  const all = Object.entries(statsMod.getAllStats());
  const top = all
    .map(([id, s]) => ({ id: Number(id), wins: s.pvpWins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 10);
  if (top.length === 0) return ctx.reply('No games played yet');
  const lines = top.map((e, i) => {
    const user = getUser(e.id);
    const name = user?.username ? '@' + user.username : e.id.toString();
    return `${String(i + 1).padStart(2, ' ')}. ${name.padEnd(10)} ${e.wins}`;
  });
  ctx.reply(`🏆 Leaderboard\n<pre>${lines.join('\n')}</pre>`, { parse_mode: 'HTML' });
}

// Export bot configuration function
export function configureTelegramBot() {
} 